package postgres

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/achenachena/xuhuan/apps/api/migrations"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestMigrationTimeoutsAreNested(t *testing.T) {
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

func TestMigrationPlanHonorsTargetAndCurrentBoundary(t *testing.T) {
	t.Parallel()
	available := []migration{{version: 7, name: "007_prepare.sql"}, {version: 8, name: "008_cleanup.sql"}}

	prepare, err := migrationPlan(available, 7, 6)
	if err != nil || len(prepare) != 1 || prepare[0].version != 7 {
		t.Fatalf("prepare plan=%#v error=%v", prepare, err)
	}
	if _, err := migrationPlan(available, 7, 8); err == nil {
		t.Fatal("backward target unexpectedly accepted")
	}
	if _, err := migrationPlan(available, 9, 6); err == nil {
		t.Fatal("missing target unexpectedly accepted")
	}
	all, err := migrationPlan(available, 0, 8)
	if err != nil || len(all) != 2 {
		t.Fatalf("latest plan=%#v error=%v", all, err)
	}
}

func TestLiveRescueMigrationBoundaryPreservesV4Truth(t *testing.T) {
	t.Parallel()
	prepareBytes, err := migrations.Files.ReadFile("007_live_rescue_prepare.sql")
	if err != nil {
		t.Fatal(err)
	}
	cleanupBytes, err := migrations.Files.ReadFile("008_remove_action_v3.sql")
	if err != nil {
		t.Fatal(err)
	}
	prepare, cleanup := string(prepareBytes), string(cleanupBytes)
	for _, required := range []string{"TRUNCATE TABLE daily_results", "start_request_payload jsonb", "'companion', 'memory_clip'"} {
		if !strings.Contains(prepare, required) {
			t.Fatalf("007 is missing %q", required)
		}
	}
	if strings.Contains(cleanup, "DROP TABLE story_choices") {
		t.Fatal("008 drops append-only V4 story choices")
	}
	for _, required := range []string{"DROP COLUMN request_hash", "DROP COLUMN trust", "DROP COLUMN authenticity", "DROP COLUMN retention", "'character', 'companion', 'memory_clip'"} {
		if !strings.Contains(cleanup, required) {
			t.Fatalf("008 is missing %q", required)
		}
	}
	for _, required := range []string{
		"DELETE FROM runs WHERE content_version <> 'v4'",
		"DELETE FROM player_chapter_progress",
		"DELETE FROM player_unlocks",
		"WITH cleared_v4 AS",
		"content_version = 'v4'",
		"run_mode = 'campaign'",
		"status = 'completed'",
		"outcome = 'cleared'",
		"WHERE ending IN ('authentic', 'balanced', 'retained')",
		"WITH valid_choice(scene_slug, option_slug, choice_tag) AS",
		"DROP TRIGGER story_choices_immutable ON story_choices",
		"CREATE TRIGGER story_choices_immutable",
		"WITH latest_choice AS",
		"story_flags = COALESCE",
	} {
		if !strings.Contains(cleanup, required) {
			t.Fatalf("008 does not guard the compatibility-window boundary: missing %q", required)
		}
	}
	for _, forbidden := range []string{"show_effect", "share_token", "capability_token"} {
		if strings.Contains(cleanup, forbidden) {
			t.Fatalf("008 unexpectedly contains %q", forbidden)
		}
	}
}

func TestMigrationLockUsesExplicitCoordinationKeys(t *testing.T) {
	t.Parallel()

	if migrationLockClassID == 0 || migrationLockObjectID == 0 || migrationLockClassID == migrationLockObjectID {
		t.Fatalf("invalid migration advisory-lock keys %d/%d", migrationLockClassID, migrationLockObjectID)
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
	first := fstest.MapFS{
		"001_timeout_probe.sql": files["001_timeout_probe.sql"],
	}
	if err := database.Migrate(ctx, first); err != nil {
		t.Fatalf("apply timeout probe migration: %v", err)
	}
	var lockSeconds, statementSeconds int
	if err := database.pool.QueryRow(ctx, "SELECT lock_seconds, statement_seconds FROM migration_timeout_probe").Scan(&lockSeconds, &statementSeconds); err != nil {
		t.Fatal(err)
	}
	if lockSeconds != int(migrationLockTimeout/time.Second) || statementSeconds != int(migrationStatementTimeout/time.Second) {
		t.Fatalf("database migration timeouts = %ds/%ds, want %s/%s", lockSeconds, statementSeconds, migrationLockTimeout, migrationStatementTimeout)
	}

	if err := database.Migrate(ctx, files); err == nil {
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

	concurrentFiles := fstest.MapFS{
		"001_timeout_probe.sql": first["001_timeout_probe.sql"],
		"003_concurrent_probe.sql": {Data: []byte(`
			SELECT pg_sleep(0.1);
			CREATE TABLE migration_concurrent_probe (id integer)
		`)},
	}
	start := make(chan struct{})
	errorsByRunner := make([]error, 2)
	var runners sync.WaitGroup
	for index := range errorsByRunner {
		runners.Add(1)
		go func(index int) {
			defer runners.Done()
			<-start
			errorsByRunner[index] = database.Migrate(context.Background(), concurrentFiles)
		}(index)
	}
	close(start)
	runners.Wait()
	for index, migrationErr := range errorsByRunner {
		if migrationErr != nil {
			t.Fatalf("concurrent migration runner %d: %v", index, migrationErr)
		}
	}
	var concurrentVersionCount int
	if err := database.pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations WHERE version=3`).Scan(&concurrentVersionCount); err != nil || concurrentVersionCount != 1 {
		t.Fatalf("concurrent migration records=%d err=%v", concurrentVersionCount, err)
	}
}
