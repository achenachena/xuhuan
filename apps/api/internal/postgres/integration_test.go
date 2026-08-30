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
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	baseRepository "github.com/achenachena/xuhuan/apps/api/internal/repository"
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

	for range 2 {
		if err := database.Migrate(ctx, migrations.Files); err != nil {
			t.Fatalf("apply current migrations: %v", err)
		}
	}

	expectedCounts := map[string]int{
		"schema_migrations":        6,
		"players":                  0,
		"player_campaign_progress": 0,
		"player_chapter_progress":  0,
		"player_unlocks":           0,
		"story_choices":            0,
		"runs":                     0,
		"run_commands":             0,
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

	assertActionV3PlayerCascade(ctx, t, database)
	playerRepository := NewPlayerRepository(database)
	created, err := playerRepository.GetOrCreate(ctx, auth.User{ID: 123456789, LanguageCode: "en"})
	if err != nil {
		t.Fatal(err)
	}
	updated, err := playerRepository.GetOrCreate(ctx, auth.User{ID: 123456789, LanguageCode: "zh-CN"})
	if err != nil {
		t.Fatal(err)
	}
	var updatedLanguage string
	if queryErr := database.pool.QueryRow(ctx, `SELECT language_code FROM players WHERE id=$1::uuid`, updated.ID).Scan(&updatedLanguage); queryErr != nil {
		t.Fatal(queryErr)
	}
	if created.ID != updated.ID || updatedLanguage != "zh-CN" {
		t.Fatalf("player upsert mismatch: created=%#v updated=%#v language=%q", created, updated, updatedLanguage)
	}

	var waitGroup sync.WaitGroup
	progressRepository := NewProgressionRepository(database)
	progress, err := progressRepository.GetOrCreate(ctx, created.ID)
	if err != nil || progress.Version != 1 || !progression.HasUnlock(progress, "character", "nana7mi") {
		t.Fatalf("initial V3 progress=%#v error=%v", progress, err)
	}
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	initialModules, initialPlugins := progression.RewardUnlocks(progress, catalog, "nana7mi")
	if len(initialModules) != 20 || len(initialPlugins) != 8 || progression.StarterModule(progress, catalog, "nana7mi") != "route-needle" {
		t.Fatalf("initial horizontal unlocks modules=%d plugins=%d starter=%q", len(initialModules), len(initialPlugins), progression.StarterModule(progress, catalog, "nana7mi"))
	}
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
	prelude, ok := catalog.Scene("nana-midpoint")
	if !ok || len(prelude.Options) < 2 {
		t.Fatal("Nana midpoint revision fixture is missing")
	}
	if _, err := database.pool.Exec(ctx, `
		UPDATE player_campaign_progress
		SET story_flags=story_flags || '{"scene:nana-midpoint:pending":true}'::jsonb
		WHERE player_id=$1::uuid`, created.ID); err != nil {
		t.Fatal(err)
	}
	firstPrelude, _, err := progressRepository.Choose(ctx, progression.ChooseInput{
		PlayerID: created.ID, Scene: prelude, Option: prelude.Options[0], ExpectedVersion: chosen.Version,
		IdempotencyKey: "story-prelude-0001", RequestHash: sha256.Sum256([]byte("prelude-first")),
	})
	if err != nil {
		t.Fatal(err)
	}
	if firstPrelude.StoryFlags["scene:nana-midpoint:pending"] {
		t.Fatal("resolved run checkpoint still has its pending flag")
	}
	revisedPrelude, _, err := progressRepository.Choose(ctx, progression.ChooseInput{
		PlayerID: created.ID, Scene: prelude, Option: prelude.Options[1], ExpectedVersion: firstPrelude.Version,
		IdempotencyKey: "story-prelude-0002", RequestHash: sha256.Sum256([]byte("prelude-revision")),
	})
	if err != nil || len(revisedPrelude.Choices) != 3 || revisedPrelude.Choices[2].Revision != 2 {
		t.Fatalf("story revision=%#v error=%v", revisedPrelude, err)
	}
	wantTrust := chosen.Trust + prelude.Options[1].Metrics.Trust
	if revisedPrelude.Trust != wantTrust || revisedPrelude.StoryFlags[prelude.Options[0].Tag] || !revisedPrelude.StoryFlags[prelude.Options[1].Tag] {
		t.Fatalf("revision projection=%#v want trust=%d", revisedPrelude, wantTrust)
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
	dailyDate := "2026-08-29"
	dailyRun, replayed, err := runRepository.Create(ctx, gameRun.CreateInput{
		PlayerID: created.ID, ContentVersion: gamecontent.CurrentVersion,
		Seed: "daily-seed-2026-08-29", State: runState, Mode: gameRun.DailyMode, DailyDate: &dailyDate,
		IdempotencyKey: "start-daily-0001", RequestHash: sha256.Sum256([]byte("start-daily")),
	})
	if err != nil || replayed || dailyRun.Mode != gameRun.DailyMode {
		t.Fatalf("create daily run=%#v replayed=%t error=%v", dailyRun, replayed, err)
	}
	if _, _, err := runRepository.Create(ctx, gameRun.CreateInput{
		PlayerID: created.ID, ContentVersion: gamecontent.CurrentVersion,
		Seed: "daily-seed-2026-08-29-b", State: runState, Mode: gameRun.DailyMode, DailyDate: &dailyDate,
		IdempotencyKey: "start-daily-0002", RequestHash: sha256.Sum256([]byte("second-daily")),
	}); !errors.Is(err, gameRun.ErrActiveRunExists) {
		t.Fatalf("second active daily error=%v", err)
	}
	dailyOutcome := gameRun.Cleared
	dailyState := dailyRun.State
	dailyState.Phase, dailyState.Score = gameRun.CompletedPhase, 4321
	dailyResponse, replayed, err := runRepository.Apply(ctx, gameRun.ApplyInput{
		PlayerID: created.ID, RunID: dailyRun.ID, Command: gameRun.Command{Type: gameRun.CompleteEncounter},
		ExpectedVersion: 1, IdempotencyKey: "finish-daily-0001", RequestHash: sha256.Sum256([]byte("finish-daily")),
	}, func(gameRun.GameRun, gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		return gameRun.Resolution{State: dailyState, Events: []gameRun.Event{{Kind: "chapter_cleared", ChapterSlug: "seventh-dock", NextChapterSlug: "always-cheerful", Trust: 99}}}, &dailyOutcome, nil
	})
	if err != nil || replayed || dailyResponse.Run.Status != gameRun.Completed {
		t.Fatalf("finish daily=%#v replayed=%t error=%v", dailyResponse, replayed, err)
	}
	storedDaily, err := runRepository.GetDailyResult(ctx, created.ID, dailyDate)
	if err != nil || storedDaily == nil || storedDaily.Score != 4321 || storedDaily.Streak != 1 {
		t.Fatalf("stored daily=%#v error=%v", storedDaily, err)
	}
	progressAfterDaily, err := progressRepository.GetOrCreate(ctx, created.ID)
	if err != nil || progressAfterDaily.CurrentChapter != "seventh-dock" || progressAfterDaily.Trust != revisedPrelude.Trust {
		t.Fatalf("daily leaked into campaign progress=%#v error=%v", progressAfterDaily, err)
	}
	lowerDaily, replayed, err := runRepository.Create(ctx, gameRun.CreateInput{
		PlayerID: created.ID, ContentVersion: gamecontent.CurrentVersion,
		Seed: "daily-seed-2026-08-29-low", State: runState, Mode: gameRun.DailyMode, DailyDate: &dailyDate,
		IdempotencyKey: "start-daily-low-0001", RequestHash: sha256.Sum256([]byte("start-daily-low")),
	})
	if err != nil || replayed {
		t.Fatalf("create lower-score daily replay=%t error=%v", replayed, err)
	}
	lowerState := lowerDaily.State
	lowerState.Phase, lowerState.Score = gameRun.CompletedPhase, 12
	if _, replayed, err = runRepository.Apply(ctx, gameRun.ApplyInput{
		PlayerID: created.ID, RunID: lowerDaily.ID, Command: gameRun.Command{Type: gameRun.CompleteEncounter},
		ExpectedVersion: 1, IdempotencyKey: "finish-daily-low-0001", RequestHash: sha256.Sum256([]byte("finish-daily-low")),
	}, func(gameRun.GameRun, gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		return gameRun.Resolution{State: lowerState, Events: []gameRun.Event{{Kind: "chapter_cleared", ChapterSlug: "seventh-dock"}}}, &dailyOutcome, nil
	}); err != nil || replayed {
		t.Fatalf("finish lower-score daily replay=%t error=%v", replayed, err)
	}
	publicResult, err := runRepository.GetPublicDailyResult(ctx, lowerDaily.ID)
	if err != nil || publicResult.Score != 4321 || publicResult.Streak != 1 {
		t.Fatalf("lower replay did not resolve retained best daily result=%#v error=%v", publicResult, err)
	}
	publicResult, err = runRepository.GetPublicDailyResult(ctx, dailyRun.ID)
	if err != nil || publicResult.Score != 4321 {
		t.Fatalf("best daily run did not resolve public result=%#v error=%v", publicResult, err)
	}
	for _, unavailableRunID := range []string{
		createdRun.ID,
		"10000000-0000-4000-8000-000000000099",
	} {
		if _, err := runRepository.GetPublicDailyResult(ctx, unavailableRunID); !errors.Is(err, baseRepository.ErrNotFound) {
			t.Fatalf("unavailable public daily run %q error=%v", unavailableRunID, err)
		}
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
	activeRun, err := runRepository.GetActive(ctx, created.ID, gameRun.CampaignMode)
	if err != nil || activeRun == nil || activeRun.ID != createdRun.ID || activeRun.Version != beforeRollback.Version {
		t.Fatalf("disconnect recovery run=%#v error=%v", activeRun, err)
	}
	clearChapter := func(run gameRun.GameRun, idempotencyKey string) {
		t.Helper()
		completedState := run.State
		completedState.Phase = gameRun.CompletedPhase
		outcome := gameRun.Cleared
		_, _, err := runRepository.Apply(ctx, gameRun.ApplyInput{
			PlayerID: created.ID, RunID: run.ID, Command: gameRun.Command{Type: gameRun.CompleteEncounter},
			ExpectedVersion: run.Version, IdempotencyKey: idempotencyKey,
			RequestHash: sha256.Sum256([]byte(idempotencyKey)),
		}, func(gameRun.GameRun, gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
			return gameRun.Resolution{State: completedState, Events: []gameRun.Event{{
				Kind: "chapter_cleared", ChapterSlug: "seventh-dock", NextChapterSlug: "always-cheerful", NextCharacterSlug: "jiaran",
			}}}, &outcome, nil
		})
		if err != nil {
			t.Fatalf("clear chapter: %v", err)
		}
	}
	clearChapter(afterRollback, "finish-campaign-0001")
	advanced, err := progressRepository.GetOrCreate(ctx, created.ID)
	if err != nil || advanced.CurrentChapter != "always-cheerful" || !progression.HasUnlock(advanced, "character", "jiaran") {
		t.Fatalf("campaign did not advance atomically: progress=%#v error=%v", advanced, err)
	}
	dianaModules, dianaPlugins := progression.RewardUnlocks(advanced, catalog, "jiaran")
	if len(dianaModules) != 20 || len(dianaPlugins) != 8 || progression.StarterModule(advanced, catalog, "jiaran") != "cheer-counter" {
		t.Fatalf("chapter clear did not atomically unlock Diana's pool: modules=%d plugins=%d starter=%q", len(dianaModules), len(dianaPlugins), progression.StarterModule(advanced, catalog, "jiaran"))
	}
	replayRun, _, err := runRepository.Create(ctx, gameRun.CreateInput{
		PlayerID: created.ID, ContentVersion: gamecontent.CurrentVersion,
		Seed: "integration-seed-replay-00000001", State: runState,
		IdempotencyKey: "start-replay-0001", RequestHash: sha256.Sum256([]byte("start-replay")), Mode: gameRun.CampaignMode,
	})
	if err != nil {
		t.Fatal(err)
	}
	clearChapter(replayRun, "finish-replay-0001")
	afterReplay, err := progressRepository.GetOrCreate(ctx, created.ID)
	if err != nil || afterReplay.CurrentChapter != "always-cheerful" {
		t.Fatalf("replaying an old chapter regressed the campaign: progress=%#v error=%v", afterReplay, err)
	}
	endingScene, ok := catalog.Scene("zero-balanced-ending")
	if !ok || len(endingScene.Options) == 0 {
		t.Fatal("balanced ending fixture is missing")
	}
	endingProgress, _, err := progressRepository.Choose(ctx, progression.ChooseInput{
		PlayerID: created.ID, Scene: endingScene, Option: endingScene.Options[0], ExpectedVersion: afterReplay.Version,
		IdempotencyKey: "ending-choice-0001", RequestHash: sha256.Sum256([]byte("ending-choice")),
	})
	if err != nil || !endingProgress.DailyUnlocked || endingProgress.Ending != "balanced" {
		t.Fatalf("daily challenge was not unlocked by the first ending: progress=%#v error=%v", endingProgress, err)
	}
}

func assertActionV3PlayerCascade(ctx context.Context, t *testing.T, database *Database) {
	t.Helper()
	const playerID = "33333333-3333-4333-8333-333333333333"
	const campaignRunID = "44444444-4444-4444-8444-444444444444"
	const dailyRunID = "55555555-5555-4555-8555-555555555555"

	tx, err := database.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	statements := []string{
		`INSERT INTO players (id, telegram_user_id, language_code) VALUES ('` + playerID + `', 987654322, 'en')`,
		`INSERT INTO player_campaign_progress (player_id) VALUES ('` + playerID + `')`,
		`INSERT INTO player_chapter_progress (player_id, chapter_slug, clears) VALUES ('` + playerID + `', 'seventh-dock', 1)`,
		`INSERT INTO player_unlocks (player_id, unlock_type, content_slug) VALUES ('` + playerID + `', 'module', 'route-needle')`,
		`INSERT INTO story_choices (
			player_id, scene_slug, option_slug, choice_tag, expected_version, resulting_version,
			idempotency_key, request_hash, result_snapshot, revision
		) VALUES (
			'` + playerID + `', 'cascade-scene', 'keep', 'kept', 1, 2,
			'cascade-story-0001', decode(repeat('11', 32), 'hex'), '{}'::jsonb, 1
		)`,
		`INSERT INTO runs (
			id, player_id, content_version, chapter_slug, character_slug, noise_level, seed,
			state, status, version, start_idempotency_key, start_request_hash, run_mode
		) VALUES (
			'` + campaignRunID + `', '` + playerID + `', 'v3', 'seventh-dock', 'nana7mi', 0,
			'cascade-campaign-seed', '{}'::jsonb, 'active', 1, 'cascade-campaign-0001',
			decode(repeat('22', 32), 'hex'), 'campaign'
		)`,
		`INSERT INTO runs (
			id, player_id, content_version, chapter_slug, character_slug, noise_level, seed,
			state, status, outcome, version, start_idempotency_key, start_request_hash,
			run_mode, daily_date, completed_at
		) VALUES (
			'` + dailyRunID + `', '` + playerID + `', 'v3', 'seventh-dock', 'nana7mi', 0,
			'cascade-daily-seed-1', '{}'::jsonb, 'completed', 'cleared', 2,
			'cascade-daily-0001', decode(repeat('33', 32), 'hex'), 'daily', DATE '2026-08-29', now()
		)`,
		`INSERT INTO run_commands (
			run_id, player_id, sequence, command_type, expected_version, resulting_version,
			idempotency_key, request_hash, result_snapshot, command_payload
		) VALUES (
			'` + campaignRunID + `', '` + playerID + `', 1, 'choose_node', 1, 2,
			'cascade-command-0001', decode(repeat('44', 32), 'hex'), '{}'::jsonb,
			'{"type":"choose_node","node_id":"l1-a"}'::jsonb
		)`,
		`INSERT INTO daily_results (player_id, daily_date, run_id, character_slug, score, build)
		 VALUES ('` + playerID + `', DATE '2026-08-29', '` + dailyRunID + `', 'nana7mi', 42, '{}'::jsonb)`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement); err != nil {
			_ = tx.Rollback(ctx)
			t.Fatalf("insert V3 cascade fixture: %v", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	if _, err := database.pool.Exec(ctx, `DELETE FROM story_choices WHERE player_id=$1::uuid`, playerID); err == nil {
		t.Fatal("direct story history deletion unexpectedly succeeded")
	}
	if _, err := database.pool.Exec(ctx, `DELETE FROM run_commands WHERE player_id=$1::uuid`, playerID); err == nil {
		t.Fatal("direct command history deletion unexpectedly succeeded")
	}
	if _, err := database.pool.Exec(ctx, `DELETE FROM players WHERE id=$1::uuid`, playerID); err != nil {
		t.Fatalf("cascade-delete synthetic V3 player: %v", err)
	}
	for _, table := range []string{
		"player_campaign_progress", "player_chapter_progress", "player_unlocks", "story_choices",
		"runs", "run_commands", "daily_results",
	} {
		var remaining int
		query := "SELECT count(*) FROM " + pgx.Identifier{table}.Sanitize() + " WHERE player_id=$1::uuid"
		if err := database.pool.QueryRow(ctx, query, playerID).Scan(&remaining); err != nil {
			t.Fatalf("count cascade rows in %s: %v", table, err)
		}
		if remaining != 0 {
			t.Fatalf("cascade left %d rows in %s", remaining, table)
		}
	}
}
