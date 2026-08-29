package postgres

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/achenachena/xuhuan/apps/api/migrations"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestMigrationTimeoutsLeaveAReleaseBoundaryMargin(t *testing.T) {
	t.Parallel()

	if migrationLockTimeout <= 0 || migrationLockTimeout >= migrationStatementTimeout {
		t.Fatalf("lock timeout %s must be positive and shorter than statement timeout %s", migrationLockTimeout, migrationStatementTimeout)
	}
	if migrationStatementTimeout >= migrationExecutionTimeout {
		t.Fatalf("statement timeout %s must be shorter than execution timeout %s", migrationStatementTimeout, migrationExecutionTimeout)
	}
	if migrationRollbackTimeout <= 0 || migrationRollbackTimeout >= migrationLockTimeout {
		t.Fatalf("rollback timeout %s must be positive and shorter than lock timeout %s", migrationRollbackTimeout, migrationLockTimeout)
	}

	parent, parentCancel := context.WithTimeout(context.Background(), time.Second)
	defer parentCancel()
	bounded, cancel := boundedMigrationContext(parent)
	defer cancel()
	deadline, ok := bounded.Deadline()
	if !ok || time.Until(deadline) > 2*time.Second {
		t.Fatalf("migration context extended the caller deadline: deadline=%v ok=%t", deadline, ok)
	}
}

func TestReadMigrationsSortsAndValidates(t *testing.T) {
	t.Parallel()

	files := fstest.MapFS{
		"002_second.sql": {Data: []byte("SELECT 2")},
		"001_first.sql":  {Data: []byte("SELECT 1")},
	}
	migrations, err := readMigrations(files)
	if err != nil {
		t.Fatalf("readMigrations() error = %v", err)
	}
	if migrations[0].version != 1 || migrations[1].version != 2 {
		t.Fatalf("migrations = %#v", migrations)
	}
}

func TestMigrateToRejectsUnknownTargetBeforeConnecting(t *testing.T) {
	t.Parallel()
	database := &Database{}
	err := database.MigrateTo(context.Background(), fstest.MapFS{"001_first.sql": {Data: []byte("SELECT 1")}}, 2)
	if err == nil || !strings.Contains(err.Error(), "target 2") {
		t.Fatalf("error=%v", err)
	}
}

func TestActionV3MigrationPreservesIdentityAndRemovesLegacyOnlyAfterValidation(t *testing.T) {
	t.Parallel()
	prepare, err := migrations.Files.ReadFile("005_action_v3_prepare.sql")
	if err != nil {
		t.Fatal(err)
	}
	contract, err := migrations.Files.ReadFile("006_remove_action_v2.sql")
	if err != nil {
		t.Fatal(err)
	}
	prepareSQL, contractSQL := string(prepare), string(contract)
	if strings.Contains(prepareSQL, "TRUNCATE TABLE players") || strings.Contains(prepareSQL, "DROP TABLE IF EXISTS player_progress") {
		t.Fatal("prepare migration must preserve identity and the short rollback schema")
	}
	for _, table := range []string{"run_commands", "runs", "story_choices", "player_unlocks", "player_progress"} {
		if !strings.Contains(prepareSQL, table) {
			t.Fatalf("prepare migration does not reset %s", table)
		}
	}
	if !strings.Contains(prepareSQL, "pg_trigger_depth() > 1") {
		t.Fatal("prepare migration must allow immutable history to leave through a player/run cascade")
	}
	if !strings.Contains(contractSQL, "DROP TABLE IF EXISTS player_progress") {
		t.Fatal("contract migration does not remove the Action V2 progression table")
	}
}

func TestReadMigrationsRejectsDuplicateVersions(t *testing.T) {
	t.Parallel()

	_, err := readMigrations(fstest.MapFS{
		"001_first.sql":  {Data: []byte("SELECT 1")},
		"001_second.sql": {Data: []byte("SELECT 2")},
	})
	if err == nil {
		t.Fatal("readMigrations() error = nil")
	}
}

func TestMigrationTransactionAppliesTimeoutsAndRollsBackFailedDDL(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	admin, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()

	schema := fmt.Sprintf("xuhuan_migration_bounds_%d", time.Now().UnixNano())
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanupContext, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		_, _ = admin.Exec(cleanupContext, "DROP SCHEMA "+identifier+" CASCADE")
	}()

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema + ",public"
	database, err := OpenConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	files := fstest.MapFS{
		"001_timeout_probe.sql": {Data: []byte(`
			CREATE TABLE migration_timeout_probe AS
			SELECT
				extract(epoch FROM current_setting('lock_timeout')::interval)::integer AS lock_seconds,
				extract(epoch FROM current_setting('statement_timeout')::interval)::integer AS statement_seconds
		`)},
		"002_failed_ddl.sql": {Data: []byte(`
			CREATE TABLE migration_rollback_probe (id integer);
			SELECT 1 / 0
		`)},
	}
	if err := database.MigrateTo(ctx, files, 1); err != nil {
		t.Fatalf("apply timeout probe migration: %v", err)
	}
	var lockSeconds, statementSeconds int
	if err := database.pool.QueryRow(ctx, "SELECT lock_seconds, statement_seconds FROM migration_timeout_probe").Scan(&lockSeconds, &statementSeconds); err != nil {
		t.Fatal(err)
	}
	if lockSeconds != int(migrationLockTimeout/time.Second) || statementSeconds != int(migrationStatementTimeout/time.Second) {
		t.Fatalf("database migration timeouts = %ds/%ds, want %s/%s", lockSeconds, statementSeconds, migrationLockTimeout, migrationStatementTimeout)
	}

	if err := database.MigrateTo(ctx, files, 2); err == nil {
		t.Fatal("failed migration unexpectedly succeeded")
	}
	var failedTable *string
	var failedVersionCount int
	if err := database.pool.QueryRow(ctx, `
		SELECT to_regclass('migration_rollback_probe')::text,
		       (SELECT count(*) FROM schema_migrations WHERE version = 2)
	`).Scan(&failedTable, &failedVersionCount); err != nil {
		t.Fatal(err)
	}
	if failedTable != nil || failedVersionCount != 0 {
		t.Fatalf("failed migration crossed its transaction boundary: table=%v version_count=%d", failedTable, failedVersionCount)
	}
}
