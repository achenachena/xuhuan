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

	"github.com/jackc/pgx/v5"
)

type migration struct {
	version int64
	name    string
	sql     string
}

func (d *Database) Migrate(ctx context.Context, files fs.FS) error {
	migrations, err := readMigrations(files)
	if err != nil {
		return err
	}
	if _, err := d.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version bigint PRIMARY KEY,
			name text NOT NULL,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	for _, item := range migrations {
		if err := d.applyMigration(ctx, item); err != nil {
			return err
		}
	}
	return nil
}

func (d *Database) applyMigration(ctx context.Context, item migration) error {
	tx, err := d.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext('xuhuan_schema_migrations'))"); err != nil {
		return fmt.Errorf("lock migrations: %w", err)
	}
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
