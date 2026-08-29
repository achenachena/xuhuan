package postgres

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"slices"
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
	// failure before the process deadline and the release workflow can inspect
	// the committed migration boundary safely.
	migrationExecutionTimeout = 5 * time.Minute
	migrationStatementTimeout = 4 * time.Minute
	migrationLockTimeout      = 15 * time.Second
	migrationRollbackTimeout  = 5 * time.Second
)

type migration struct {
	version int64
	name    string
	sql     string
}

func (d *Database) Migrate(ctx context.Context, files fs.FS) error {
	return d.MigrateTo(ctx, files, 0)
}

// MigrateTo applies migrations through targetVersion. A target of zero applies
// every embedded migration. Production uses this boundary to apply an expand
// migration, validate the new release, and only then apply the contract step.
func (d *Database) MigrateTo(ctx context.Context, files fs.FS, targetVersion int64) error {
	ctx, cancel := boundedMigrationContext(ctx)
	defer cancel()

	migrations, err := readMigrations(files)
	if err != nil {
		return err
	}
	if targetVersion < 0 || (targetVersion > 0 && !slices.ContainsFunc(migrations, func(item migration) bool { return item.version == targetVersion })) {
		return fmt.Errorf("migration target %d does not exist", targetVersion)
	}
	if err := d.ensureMigrationTable(ctx); err != nil {
		return err
	}

	for _, item := range migrations {
		if targetVersion > 0 && item.version > targetVersion {
			break
		}
		if err := d.applyMigration(ctx, item); err != nil {
			return err
		}
	}
	return nil
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
	if _, err := tx.Exec(lockContext, "SELECT pg_advisory_xact_lock(hashtext('xuhuan_schema_migrations'))"); err != nil {
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
