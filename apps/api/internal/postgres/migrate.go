package postgres

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	// The migration-level deadline bounds all numbered migrations and commits;
	// the runner adds a wider deadline around connection establishment as well.
	// Database-side limits are deliberately shorter so PostgreSQL reports a
	// failure before the process deadline.
	migrationExecutionTimeout = 5 * time.Minute
	migrationStatementTimeout = 4 * time.Minute
	migrationLockTimeout      = 15 * time.Second
	migrationRollbackTimeout  = 5 * time.Second

	// These two fixed PostgreSQL advisory-lock keys identify only the schema
	// migration critical section. They are coordination constants, not hashes,
	// credentials, tokens, or values derived from player data.
	migrationLockClassID  int32 = 0x58554855 // "XUHU"
	migrationLockObjectID int32 = 0x414E0001 // migration namespace, version 1
)

type migration struct {
	version int64
	name    string
	sql     string
}

func (d *Database) Migrate(ctx context.Context, files fs.FS) error {
	return d.MigrateTo(ctx, files, 0)
}

// MigrateTo applies migrations through target. A zero target means the newest
// available migration. Explicit targets make the prepare/cleanup production
// boundary enforceable instead of relying on a partially copied filesystem.
func (d *Database) MigrateTo(ctx context.Context, files fs.FS, target int64) error {
	ctx, cancel := boundedMigrationContext(ctx)
	defer cancel()

	migrations, err := readMigrations(files)
	if err != nil {
		return err
	}
	if err := d.ensureMigrationTable(ctx); err != nil {
		return err
	}
	var current int64
	if err := d.pool.QueryRow(ctx, `SELECT COALESCE(max(version), 0) FROM schema_migrations`).Scan(&current); err != nil {
		return fmt.Errorf("read current migration version: %w", err)
	}
	migrations, err = migrationPlan(migrations, target, current)
	if err != nil {
		return err
	}

	for _, item := range migrations {
		if err := d.applyMigration(ctx, item); err != nil {
			return err
		}
	}
	if target > 0 {
		// Verify the target while holding the same migration lock used by DDL.
		// This prevents a concurrent broader migration plan from making a
		// targeted prepare command report success at the cleanup boundary.
		if err := d.verifyMigrationTarget(ctx, target); err != nil {
			return err
		}
	}
	return nil
}

func (d *Database) verifyMigrationTarget(ctx context.Context, target int64) error {
	tx, err := d.beginMigrationTransaction(ctx)
	if err != nil {
		return err
	}
	defer rollbackMigration(tx)

	var current int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(max(version), 0) FROM schema_migrations`).Scan(&current); err != nil {
		return fmt.Errorf("verify migration target: %w", err)
	}
	if current != target {
		return fmt.Errorf("migration target %d was superseded by concurrent migration %d", target, current)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migration target verification: %w", err)
	}
	return nil
}

func migrationPlan(available []migration, target, current int64) ([]migration, error) {
	if target < 0 {
		return nil, errors.New("migration target cannot be negative")
	}
	if target > 0 && current > target {
		return nil, fmt.Errorf("database is already at migration %d, cannot target %d", current, target)
	}
	if target == 0 {
		return available, nil
	}
	index := sort.Search(len(available), func(index int) bool { return available[index].version >= target })
	if index >= len(available) || available[index].version != target {
		return nil, fmt.Errorf("migration target %d does not exist", target)
	}
	return available[:index+1], nil
}

func boundedMigrationContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, migrationExecutionTimeout)
}

func (d *Database) ensureMigrationTable(ctx context.Context) error {
	tx, err := d.beginMigrationTransaction(ctx)
	if err != nil {
		return err
	}
	defer rollbackMigration(tx)

	if _, err := tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version bigint PRIMARY KEY,
			name text NOT NULL,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit schema_migrations creation: %w", err)
	}
	return nil
}

func (d *Database) applyMigration(ctx context.Context, item migration) error {
	tx, err := d.beginMigrationTransaction(ctx)
	if err != nil {
		return err
	}
	defer rollbackMigration(tx)

	var appliedName string
	err = tx.QueryRow(ctx, "SELECT name FROM schema_migrations WHERE version = $1", item.version).Scan(&appliedName)
	if err == nil {
		if appliedName != item.name {
			return fmt.Errorf("migration version %d was applied as %q, found %q", item.version, appliedName, item.name)
		}
		return tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	if _, err := tx.Exec(ctx, item.sql); err != nil {
		return fmt.Errorf("apply migration %s: %w", item.name, err)
	}
	if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", item.version, item.name); err != nil {
		return fmt.Errorf("record migration %s: %w", item.name, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migration %s: %w", item.name, err)
	}
	return nil
}

func (d *Database) beginMigrationTransaction(ctx context.Context) (pgx.Tx, error) {
	tx, err := d.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin migration transaction: %w", err)
	}
	rollbackOnFailure := func() {
		rollbackMigration(tx)
	}

	settings := []struct {
		name  string
		value string
	}{
		{name: "lock_timeout", value: postgresTimeoutValue(migrationLockTimeout)},
		{name: "statement_timeout", value: postgresTimeoutValue(migrationStatementTimeout)},
	}
	for _, setting := range settings {
		if _, err := tx.Exec(ctx, "SELECT set_config($1, $2, true)", setting.name, setting.value); err != nil {
			rollbackOnFailure()
			return nil, fmt.Errorf("set migration %s: %w", setting.name, err)
		}
	}

	lockContext, cancel := context.WithTimeout(ctx, migrationLockTimeout)
	defer cancel()
	// The transaction-scoped advisory lock serializes concurrent migration
	// runners. Fixed integer keys keep that coordination explicit and avoid
	// deriving or storing any extra identifier.
	if _, err := tx.Exec(lockContext, "SELECT pg_advisory_xact_lock($1, $2)", migrationLockClassID, migrationLockObjectID); err != nil {
		rollbackOnFailure()
		return nil, fmt.Errorf("lock migrations: %w", err)
	}
	return tx, nil
}

func postgresTimeoutValue(timeout time.Duration) string {
	return strconv.FormatInt(timeout.Milliseconds(), 10) + "ms"
}

func rollbackMigration(tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(context.Background(), migrationRollbackTimeout)
	defer cancel()
	_ = tx.Rollback(ctx)
}

func readMigrations(files fs.FS) ([]migration, error) {
	entries, err := fs.ReadDir(files, ".")
	if err != nil {
		return nil, err
	}
	result := make([]migration, 0)
	seen := make(map[int64]string)
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		prefix, _, ok := strings.Cut(entry.Name(), "_")
		if !ok {
			return nil, fmt.Errorf("migration %q has no numeric prefix", entry.Name())
		}
		version, err := strconv.ParseInt(prefix, 10, 64)
		if err != nil || version <= 0 {
			return nil, fmt.Errorf("migration %q has an invalid version", entry.Name())
		}
		if previous, ok := seen[version]; ok {
			return nil, fmt.Errorf("migrations %q and %q use version %d", previous, entry.Name(), version)
		}
		contents, err := fs.ReadFile(files, entry.Name())
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(string(contents)) == "" {
			return nil, fmt.Errorf("migration %q is empty", entry.Name())
		}
		seen[version] = entry.Name()
		result = append(result, migration{version: version, name: entry.Name(), sql: string(contents)})
	}
	if len(result) == 0 {
		return nil, errors.New("no migrations found")
	}
	sort.Slice(result, func(i, j int) bool { return result[i].version < result[j].version })
	return result, nil
}
