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
	"github.com/achenachena/xuhuan/apps/api/internal/battle"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	"github.com/achenachena/xuhuan/apps/api/internal/repository"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
	"github.com/achenachena/xuhuan/apps/api/migrations"
	seeddata "github.com/achenachena/xuhuan/apps/api/seed"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestMigrateAndSeedFromEmptySchema(t *testing.T) {
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
			t.Fatalf("Migrate() error = %v", err)
		}
		if err := database.SeedCatalog(ctx, seeddata.Files); err != nil {
			t.Fatalf("SeedCatalog() error = %v", err)
		}
	}

	expectedCounts := map[string]int{
		"schema_migrations":   2,
		"players":             0,
		"characters":          7,
		"encounters":          2,
		"battles":             0,
		"battle_actions":      0,
		"idempotency_records": 0,
		"player_ledger":       0,
		"admin_audit_events":  0,
		"player_progress":     0,
		"player_unlocks":      0,
		"story_choices":       0,
		"runs":                0,
		"run_commands":        0,
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

	var indexes int
	if err := database.pool.QueryRow(ctx, `SELECT count(*) FROM pg_indexes WHERE schemaname = $1 AND indexname IN ('battles_active_player_idx', 'idempotency_records_expiry_idx')`, schema).Scan(&indexes); err != nil {
		t.Fatal(err)
	}
	if indexes != 2 {
		t.Fatalf("required index count = %d", indexes)
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

	catalogRepository := NewCatalogRepository(database)
	characters, err := catalogRepository.ListCharacters(ctx)
	if err != nil || len(characters) != 7 {
		t.Fatalf("ListCharacters() count=%d error=%v", len(characters), err)
	}
	encounters, err := catalogRepository.ListEncounters(ctx)
	if err != nil || len(encounters) != 2 {
		t.Fatalf("ListEncounters() count=%d error=%v", len(encounters), err)
	}
	if _, err := catalogRepository.GetCharacter(ctx, "missing"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("GetCharacter(missing) error=%v", err)
	}

	battleService := battle.NewService(NewBattleRepository(database, nil), playerRepository, catalogRepository)
	user := auth.User{ID: 123456789, Username: "second", FirstName: "开发"}

	started, replayed, err := battleService.Start(ctx, user, battle.StartInput{
		CharacterSlug: "nana7mi", EncounterSlug: "training-drone", IdempotencyKey: "start-battle-0001",
	})
	if err != nil || replayed {
		t.Fatalf("Start() replayed=%t error=%v", replayed, err)
	}
	replayedStart, replayed, err := battleService.Start(ctx, user, battle.StartInput{
		CharacterSlug: "nana7mi", EncounterSlug: "training-drone", IdempotencyKey: "start-battle-0001",
	})
	if err != nil || !replayed || replayedStart.ID != started.ID {
		t.Fatalf("replayed Start()=%#v replayed=%t error=%v", replayedStart, replayed, err)
	}
	if _, _, err := battleService.Start(ctx, user, battle.StartInput{
		CharacterSlug: "nana7mi", EncounterSlug: "echo-warlord", IdempotencyKey: "start-battle-0001",
	}); !errors.Is(err, battle.ErrIdempotencyConflict) {
		t.Fatalf("conflicting Start() error=%v", err)
	}
	if _, err := database.pool.Exec(ctx, `
		UPDATE idempotency_records SET expires_at = now() - interval '1 second'
		WHERE player_id = $1::uuid AND operation = 'create_battle' AND idempotency_key = 'start-battle-0001'`, created.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := battleService.Start(ctx, user, battle.StartInput{
		CharacterSlug: "nana7mi", EncounterSlug: "training-drone", IdempotencyKey: "start-battle-0001",
	}); !errors.Is(err, battle.ErrIdempotencyConflict) {
		t.Fatalf("expired idempotency key error=%v", err)
	}

	var energy, energyLedger, battles int
	if err := database.pool.QueryRow(ctx, "SELECT energy FROM players WHERE id = $1::uuid", created.ID).Scan(&energy); err != nil {
		t.Fatal(err)
	}
	if err := database.pool.QueryRow(ctx, "SELECT count(*) FROM player_ledger WHERE player_id = $1::uuid AND resource_type = 'energy'", created.ID).Scan(&energyLedger); err != nil {
		t.Fatal(err)
	}
	if err := database.pool.QueryRow(ctx, "SELECT count(*) FROM battles WHERE player_id = $1::uuid", created.ID).Scan(&battles); err != nil {
		t.Fatal(err)
	}
	if energy != 110 || energyLedger != 1 || battles != 1 {
		t.Fatalf("after replay: energy=%d energyLedger=%d battles=%d", energy, energyLedger, battles)
	}

	otherUser := auth.User{ID: 987654321, FirstName: "Other"}
	if _, err := battleService.Get(ctx, otherUser, started.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("battle ownership error=%v", err)
	}
	if _, _, err := battleService.Act(ctx, user, battle.ActionInput{
		BattleID: started.ID, Action: battle.LightAttack, ExpectedVersion: 99, IdempotencyKey: "stale-action-0001",
	}); !errors.Is(err, battle.ErrVersionConflict) {
		t.Fatalf("stale action error=%v", err)
	}

	firstAction, replayed, err := battleService.Act(ctx, user, battle.ActionInput{
		BattleID: started.ID, Action: battle.LightAttack, ExpectedVersion: 1, IdempotencyKey: "battle-action-0001",
	})
	if err != nil || replayed || firstAction.Battle.Version != 2 {
		t.Fatalf("first action=%#v replayed=%t error=%v", firstAction, replayed, err)
	}
	replayedAction, replayed, err := battleService.Act(ctx, user, battle.ActionInput{
		BattleID: started.ID, Action: battle.LightAttack, ExpectedVersion: 1, IdempotencyKey: "battle-action-0001",
	})
	if err != nil || !replayed || replayedAction.Battle.Version != firstAction.Battle.Version {
		t.Fatalf("replayed action=%#v replayed=%t error=%v", replayedAction, replayed, err)
	}
	if _, _, err := battleService.Act(ctx, user, battle.ActionInput{
		BattleID: started.ID, Action: battle.HeavyAttack, ExpectedVersion: 1, IdempotencyKey: "battle-action-0001",
	}); !errors.Is(err, battle.ErrIdempotencyConflict) {
		t.Fatalf("conflicting action error=%v", err)
	}

	if _, err := database.pool.Exec(ctx, `UPDATE battles SET state = jsonb_set(state, '{enemy,current_health}', '1'::jsonb) WHERE id = $1::uuid`, started.ID); err != nil {
		t.Fatal(err)
	}
	completed, replayed, err := battleService.Act(ctx, user, battle.ActionInput{
		BattleID: started.ID, Action: battle.LightAttack, ExpectedVersion: 2, IdempotencyKey: "battle-action-final-1",
	})
	if err != nil || replayed || completed.Battle.Status != battle.Completed || completed.Battle.Outcome == nil || *completed.Battle.Outcome != battle.Victory {
		t.Fatalf("completion=%#v replayed=%t error=%v", completed, replayed, err)
	}
	if _, replayed, err := battleService.Act(ctx, user, battle.ActionInput{
		BattleID: started.ID, Action: battle.LightAttack, ExpectedVersion: 2, IdempotencyKey: "battle-action-final-1",
	}); err != nil || !replayed {
		t.Fatalf("completion replayed=%t error=%v", replayed, err)
	}
	if _, _, err := battleService.Act(ctx, user, battle.ActionInput{
		BattleID: started.ID, Action: battle.LightAttack, ExpectedVersion: 3, IdempotencyKey: "after-complete-01",
	}); !errors.Is(err, battle.ErrBattleNotActive) {
		t.Fatalf("post-completion action error=%v", err)
	}

	var experience, credits int64
	var actionCount, rewardLedger int
	if err := database.pool.QueryRow(ctx, "SELECT experience, credits, energy FROM players WHERE id = $1::uuid", created.ID).Scan(&experience, &credits, &energy); err != nil {
		t.Fatal(err)
	}
	if err := database.pool.QueryRow(ctx, "SELECT count(*) FROM battle_actions WHERE battle_id = $1::uuid", started.ID).Scan(&actionCount); err != nil {
		t.Fatal(err)
	}
	if err := database.pool.QueryRow(ctx, "SELECT count(*) FROM player_ledger WHERE source_battle_id = $1::uuid", started.ID).Scan(&rewardLedger); err != nil {
		t.Fatal(err)
	}
	if experience != 36 || credits != 24 || energy != 110 || actionCount != 2 || rewardLedger != 3 {
		t.Fatalf("completed player xp=%d credits=%d energy=%d actions=%d ledger=%d", experience, credits, energy, actionCount, rewardLedger)
	}

	concurrentBattle, _, err := battleService.Start(ctx, user, battle.StartInput{
		CharacterSlug: "nana7mi", EncounterSlug: "training-drone", IdempotencyKey: "start-battle-0002",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `UPDATE battles SET state = jsonb_set(state, '{enemy,current_health}', '1'::jsonb) WHERE id = $1::uuid`, concurrentBattle.ID); err != nil {
		t.Fatal(err)
	}
	concurrentErrors := make([]error, 2)
	var waitGroup sync.WaitGroup
	for index := range 2 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			_, _, concurrentErrors[index] = battleService.Act(context.Background(), user, battle.ActionInput{
				BattleID: concurrentBattle.ID, Action: battle.LightAttack, ExpectedVersion: 1,
				IdempotencyKey: fmt.Sprintf("concurrent-final-%d", index),
			})
		}()
	}
	waitGroup.Wait()
	successes := 0
	conflicts := 0
	for _, err := range concurrentErrors {
		if err == nil {
			successes++
		} else if errors.Is(err, battle.ErrBattleNotActive) || errors.Is(err, battle.ErrVersionConflict) {
			conflicts++
		} else {
			t.Fatalf("unexpected concurrent error=%v", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("concurrent successes=%d conflicts=%d errors=%v", successes, conflicts, concurrentErrors)
	}
	if err := database.pool.QueryRow(ctx, "SELECT count(*) FROM player_ledger WHERE source_battle_id = $1::uuid AND resource_type IN ('experience', 'credits')", concurrentBattle.ID).Scan(&rewardLedger); err != nil {
		t.Fatal(err)
	}
	if rewardLedger != 2 {
		t.Fatalf("concurrent reward ledger count=%d", rewardLedger)
	}

	rollbackBattle, _, err := battleService.Start(ctx, user, battle.StartInput{
		CharacterSlug: "nana7mi", EncounterSlug: "training-drone", IdempotencyKey: "start-battle-0003",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `UPDATE battles SET state = jsonb_set(state, '{enemy,current_health}', '1'::jsonb) WHERE id = $1::uuid`, rollbackBattle.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		INSERT INTO player_ledger (player_id, resource_type, delta, reason, source_battle_id, idempotency_key)
		VALUES ($1::uuid, 'experience', 1, 'battle_victory', $2::uuid, 'rollback-blocker')`, created.ID, rollbackBattle.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := battleService.Act(ctx, user, battle.ActionInput{
		BattleID: rollbackBattle.ID, Action: battle.LightAttack, ExpectedVersion: 1, IdempotencyKey: "rollback-final-01",
	}); err == nil {
		t.Fatal("completion with conflicting ledger unexpectedly succeeded")
	}
	var rollbackStatus string
	var rollbackVersion int64
	if err := database.pool.QueryRow(ctx, "SELECT status, version FROM battles WHERE id = $1::uuid", rollbackBattle.ID).Scan(&rollbackStatus, &rollbackVersion); err != nil {
		t.Fatal(err)
	}
	if err := database.pool.QueryRow(ctx, "SELECT count(*) FROM battle_actions WHERE battle_id = $1::uuid", rollbackBattle.ID).Scan(&actionCount); err != nil {
		t.Fatal(err)
	}
	if rollbackStatus != "active" || rollbackVersion != 1 || actionCount != 0 {
		t.Fatalf("rollback status=%s version=%d actions=%d", rollbackStatus, rollbackVersion, actionCount)
	}

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
	resolve := func(current gameRun.GameRun, command gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		return gameRun.Apply(current.State, current.Seed, command, catalog)
	}
	commandHash := sha256.Sum256([]byte("choose-l1-a"))
	firstCommand, replayed, err := runRepository.Apply(ctx, gameRun.ApplyInput{
		PlayerID: created.ID, RunID: createdRun.ID, Command: gameRun.Command{Type: gameRun.ChooseNode, NodeID: "l1-a"},
		ExpectedVersion: 1, IdempotencyKey: "run-command-0001", RequestHash: commandHash,
	}, resolve)
	if err != nil || replayed || firstCommand.Run.Version != 2 || firstCommand.Run.State.Phase != gameRun.CombatPhase {
		t.Fatalf("first run command=%#v replayed=%t error=%v", firstCommand, replayed, err)
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
				PlayerID: created.ID, RunID: createdRun.ID, Command: gameRun.Command{Type: gameRun.EndTurn},
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
		PlayerID: created.ID, RunID: createdRun.ID, Command: gameRun.Command{Type: gameRun.EndTurn},
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
