package postgres

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"errors"
	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/battle"
	"github.com/achenachena/xuhuan/apps/api/internal/character"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
	"github.com/achenachena/xuhuan/apps/api/internal/repository"
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
		"schema_migrations":   1,
		"players":             0,
		"characters":          7,
		"encounters":          2,
		"battles":             0,
		"battle_actions":      0,
		"idempotency_records": 0,
		"player_ledger":       0,
		"admin_audit_events":  0,
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

	playerService := player.NewService(playerRepository)
	catalogService := character.NewService(catalogRepository)
	battleService := battle.NewService(NewBattleRepository(database), playerService, catalogService)
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
}
