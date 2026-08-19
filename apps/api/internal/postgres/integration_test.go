package postgres

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"reflect"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
	"github.com/achenachena/xuhuan/apps/api/migrations"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestMigrateFromEmptySchema(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	admin, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()

	schema := fmt.Sprintf("xuhuan_test_%d", time.Now().UnixNano())
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanupContext, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
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

	stageOneMigrations := fstest.MapFS{}
	for _, name := range []string{"001_initial_schema.sql", "002_story_roguelite.sql"} {
		contents, err := migrations.Files.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		stageOneMigrations[name] = &fstest.MapFile{Data: contents}
	}
	if err := database.Migrate(ctx, stageOneMigrations); err != nil {
		t.Fatalf("apply expand migrations: %v", err)
	}

	const preservedPlayerID = "11111111-1111-4111-8111-111111111111"
	const preservedRunID = "22222222-2222-4222-8222-222222222222"
	fixtureTx, err := database.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	fixtureStatements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO players (id, telegram_user_id, username, language_code) VALUES ($1, 987654321, 'preserved', 'en')`, []any{preservedPlayerID}},
		{`INSERT INTO player_progress (player_id, story_flags, version) VALUES ($1, '{"preserved": true}'::jsonb, 2)`, []any{preservedPlayerID}},
		{`INSERT INTO player_unlocks (player_id, unlock_type, content_slug) VALUES ($1, 'character', 'nana7mi')`, []any{preservedPlayerID}},
		{`INSERT INTO story_choices (
			player_id, scene_slug, option_slug, choice_tag, expected_version,
			resulting_version, idempotency_key, request_hash, result_snapshot
		) VALUES (
			$1, 'prologue-last-viewer', 'answer', 'answered', 1,
			2, 'preserved-story-0001', decode(repeat('ab', 32), 'hex'), '{"version": 2}'::jsonb
		)`, []any{preservedPlayerID}},
		{`INSERT INTO runs (
			id, player_id, content_version, chapter_slug, character_slug, noise_level,
			seed, state, status, outcome, version, start_idempotency_key,
			start_request_hash, completed_at
		) VALUES (
			$2, $1, 'v1', 'seventh-dock', 'nana7mi', 0,
			'preserved-seed-0000001', '{"phase": "completed"}'::jsonb, 'completed', 'cleared', 2,
			'preserved-run-0001', decode(repeat('cd', 32), 'hex'), now()
		)`, []any{preservedPlayerID, preservedRunID}},
		{`INSERT INTO run_commands (
			run_id, player_id, sequence, command_type, expected_version,
			resulting_version, idempotency_key, request_hash, result_snapshot
		) VALUES (
			$2, $1, 1, 'choose_node', 1,
			2, 'preserved-command-0001', decode(repeat('ef', 32), 'hex'), '{"version": 2}'::jsonb
		)`, []any{preservedPlayerID, preservedRunID}},
	}
	for _, statement := range fixtureStatements {
		if _, err := fixtureTx.Exec(ctx, statement.query, statement.args...); err != nil {
			_ = fixtureTx.Rollback(ctx)
			t.Fatalf("insert expand-phase V2 fixtures: %v", err)
		}
	}
	if err := fixtureTx.Commit(ctx); err != nil {
		t.Fatalf("commit expand-phase V2 fixtures: %v", err)
	}

	for range 2 {
		if err := database.Migrate(ctx, migrations.Files); err != nil {
			t.Fatalf("apply contract migrations: %v", err)
		}
	}

	expectedCounts := map[string]int{
		"schema_migrations": 4,
		"players":           0,
		"player_progress":   0,
		"player_unlocks":    0,
		"story_choices":     0,
		"runs":              0,
		"run_commands":      0,
	}
	for table, expected := range expectedCounts {
		var count int
		if err := database.pool.QueryRow(ctx, "SELECT count(*) FROM "+pgx.Identifier{table}.Sanitize()).Scan(&count); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		if count != expected {
			t.Fatalf("%s count = %d, want %d", table, count, expected)
		}
	}

	legacyTables := []string{"characters", "encounters", "battles", "battle_actions", "idempotency_records", "player_ledger", "admin_audit_events"}
	var legacyTableCount int
	if err := database.pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2)`, schema, legacyTables).Scan(&legacyTableCount); err != nil {
		t.Fatal(err)
	}
	if legacyTableCount != 0 {
		t.Fatalf("legacy table count = %d", legacyTableCount)
	}
	legacyColumns := []string{"level", "experience", "credits", "energy", "version"}
	var legacyColumnCount int
	if err := database.pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'players' AND column_name = ANY($2)`, schema, legacyColumns).Scan(&legacyColumnCount); err != nil {
		t.Fatal(err)
	}
	if legacyColumnCount != 0 {
		t.Fatalf("legacy player column count = %d", legacyColumnCount)
	}
	playerRepository := NewPlayerRepository(database)
	created, err := playerRepository.GetOrCreate(ctx, auth.User{ID: 123456789, Username: "first", FirstName: "开发"})
	if err != nil {
		t.Fatal(err)
	}
	updated, err := playerRepository.GetOrCreate(ctx, auth.User{ID: 123456789, Username: "second", FirstName: "开发"})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID != updated.ID || updated.Username == nil || *updated.Username != "second" {
		t.Fatalf("player upsert mismatch: created=%#v updated=%#v", created, updated)
	}

	var waitGroup sync.WaitGroup
	progressRepository := NewProgressionRepository(database)
	progress, err := progressRepository.GetOrCreate(ctx, created.ID)
	if err != nil || progress.Version != 1 || !progression.HasUnlock(progress, "character", "nana7mi") {
		t.Fatalf("initial V2 progress=%#v error=%v", progress, err)
	}
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	prologue, ok := catalog.Scene("prologue-last-viewer")
	if !ok {
		t.Fatal("prologue content is missing")
	}
	choiceHash := sha256.Sum256([]byte("prologue-choice"))
	chosen, replayed, err := progressRepository.Choose(ctx, progression.ChooseInput{
		PlayerID: created.ID, Scene: prologue, Option: prologue.Options[0], ExpectedVersion: 1,
		IdempotencyKey: "story-choice-0001", RequestHash: choiceHash,
	})
	if err != nil || replayed || chosen.Version != 2 || len(chosen.Choices) != 1 {
		t.Fatalf("story choice=%#v replayed=%t error=%v", chosen, replayed, err)
	}
	replayedChoice, replayed, err := progressRepository.Choose(ctx, progression.ChooseInput{
		PlayerID: created.ID, Scene: prologue, Option: prologue.Options[0], ExpectedVersion: 1,
		IdempotencyKey: "story-choice-0001", RequestHash: choiceHash,
	})
	if err != nil || !replayed || replayedChoice.Version != 2 {
		t.Fatalf("story replay=%#v replayed=%t error=%v", replayedChoice, replayed, err)
	}

	runState, err := gameRun.NewState(gameRun.StartInput{
		ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", NoiseLevel: 0,
		Seed: "integration-seed-0000000000000001",
	}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	runRepository := NewRunRepository(database)
	startHash := sha256.Sum256([]byte("start-run"))
	createdRun, replayed, err := runRepository.Create(ctx, gameRun.CreateInput{
		PlayerID: created.ID, ContentVersion: gamecontent.CurrentVersion,
		Seed: "integration-seed-0000000000000001", State: runState,
		IdempotencyKey: "start-run-0001", RequestHash: startHash,
	})
	if err != nil || replayed || createdRun.Version != 1 {
		t.Fatalf("create run=%#v replayed=%t error=%v", createdRun, replayed, err)
	}
	if _, _, err := runRepository.Create(ctx, gameRun.CreateInput{
		PlayerID: created.ID, ContentVersion: gamecontent.CurrentVersion,
		Seed: "integration-seed-0000000000000002", State: runState,
		IdempotencyKey: "start-run-0002", RequestHash: sha256.Sum256([]byte("second-run")),
	}); !errors.Is(err, gameRun.ErrActiveRunExists) {
		t.Fatalf("second active run error=%v", err)
	}
	resolve := func(current gameRun.GameRun, _ gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		current.State.RNGCursor++
		return gameRun.Resolution{State: current.State, Events: []gameRun.Event{{Kind: "repository_test"}}}, nil, nil
	}
	commandHash := sha256.Sum256([]byte("choose-l1-a"))
	firstCommand, replayed, err := runRepository.Apply(ctx, gameRun.ApplyInput{
		PlayerID: created.ID, RunID: createdRun.ID, Command: gameRun.Command{Type: gameRun.ChooseNode, NodeID: "l1-a"},
		ExpectedVersion: 1, IdempotencyKey: "run-command-0001", RequestHash: commandHash,
	}, resolve)
	if err != nil || replayed || firstCommand.Run.Version != 2 || firstCommand.Run.State.Phase != gameRun.EncounterPhase {
		t.Fatalf("first run command=%#v replayed=%t error=%v", firstCommand, replayed, err)
	}
	var storedCommandType, storedNodeID string
	if err := database.pool.QueryRow(ctx, `
		SELECT command_payload->>'type', command_payload->>'node_id'
		FROM run_commands WHERE run_id = $1::uuid AND sequence = 1`, createdRun.ID,
	).Scan(&storedCommandType, &storedNodeID); err != nil {
		t.Fatal(err)
	}
	if storedCommandType != "choose_node" || storedNodeID != "l1-a" {
		t.Fatalf("stored immutable command = %q/%q", storedCommandType, storedNodeID)
	}
	replayedCommand, replayed, err := runRepository.Apply(ctx, gameRun.ApplyInput{
		PlayerID: created.ID, RunID: createdRun.ID, Command: gameRun.Command{Type: gameRun.ChooseNode, NodeID: "l1-a"},
		ExpectedVersion: 1, IdempotencyKey: "run-command-0001", RequestHash: commandHash,
	}, resolve)
	if err != nil || !replayed || replayedCommand.Run.Version != 2 {
		t.Fatalf("run replay=%#v replayed=%t error=%v", replayedCommand, replayed, err)
	}

	concurrentRunErrors := make([]error, 2)
	for index := range 2 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			_, _, concurrentRunErrors[index] = runRepository.Apply(context.Background(), gameRun.ApplyInput{
				PlayerID: created.ID, RunID: createdRun.ID, Command: gameRun.Command{Type: gameRun.ResolveEvent},
				ExpectedVersion: 2, IdempotencyKey: fmt.Sprintf("run-concurrent-%d", index),
				RequestHash: sha256.Sum256([]byte(fmt.Sprintf("end-turn-%d", index))),
			}, resolve)
		}()
	}
	waitGroup.Wait()
	runSuccesses, runConflicts := 0, 0
	for _, concurrentErr := range concurrentRunErrors {
		if concurrentErr == nil {
			runSuccesses++
		} else if errors.Is(concurrentErr, gameRun.ErrVersionConflict) {
			runConflicts++
		} else {
			t.Fatalf("unexpected concurrent run error=%v", concurrentErr)
		}
	}
	if runSuccesses != 1 || runConflicts != 1 {
		t.Fatalf("concurrent run successes=%d conflicts=%d errors=%v", runSuccesses, runConflicts, concurrentRunErrors)
	}

	beforeRollback, err := runRepository.Get(ctx, created.ID, createdRun.ID)
	if err != nil {
		t.Fatal(err)
	}
	rollbackError := errors.New("forced resolver rollback")
	if _, _, err := runRepository.Apply(ctx, gameRun.ApplyInput{
		PlayerID: created.ID, RunID: createdRun.ID, Command: gameRun.Command{Type: gameRun.ResolveEvent},
		ExpectedVersion: beforeRollback.Version, IdempotencyKey: "run-rollback-0001",
		RequestHash: sha256.Sum256([]byte("rollback")),
	}, func(gameRun.GameRun, gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		return gameRun.Resolution{}, nil, rollbackError
	}); !errors.Is(err, rollbackError) {
		t.Fatalf("rollback resolver error=%v", err)
	}
	afterRollback, err := runRepository.Get(ctx, created.ID, createdRun.ID)
	if err != nil || afterRollback.Version != beforeRollback.Version || !reflect.DeepEqual(afterRollback.State, beforeRollback.State) {
		t.Fatalf("run rollback before=%#v after=%#v error=%v", beforeRollback, afterRollback, err)
	}
	activeRun, err := runRepository.GetActive(ctx, created.ID)
	if err != nil || activeRun == nil || activeRun.ID != createdRun.ID || activeRun.Version != beforeRollback.Version {
		t.Fatalf("disconnect recovery run=%#v error=%v", activeRun, err)
	}
}
