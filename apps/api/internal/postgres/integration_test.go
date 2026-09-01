package postgres

import (
	"context"
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
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
	"github.com/achenachena/xuhuan/apps/api/migrations"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestV4RepositoriesAndPhasedSchema(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	database := openIsolatedIntegrationDatabase(ctx, t, databaseURL)

	if err := database.MigrateTo(ctx, migrations.Files, 8); err != nil {
		t.Fatalf("migrate through cleanup boundary: %v", err)
	}
	assertV4SchemaBoundary(ctx, t, database)

	playerRepository := NewPlayerRepository(database)
	createdPlayer, err := playerRepository.GetOrCreate(ctx, auth.User{ID: 987654321, LanguageCode: "en"})
	if err != nil {
		t.Fatal(err)
	}
	progressRepository := NewProgressionRepository(database)
	initialProgress, err := progressRepository.GetOrCreate(ctx, createdPlayer.ID)
	if err != nil || initialProgress.Version != 1 || !progression.HasUnlock(initialProgress, progression.CharacterUnlock, "nana7mi") {
		t.Fatalf("initial progress=%#v err=%v", initialProgress, err)
	}

	runs := NewRunRepository(database)
	campaignInput := integrationCreateInput(createdPlayer.ID, gameRun.CampaignMode, nil, "campaign-start-0001", "campaign-seed-00000001", integrationState("seventh-dock", "nana7mi"))
	campaign, replayed, err := runs.Create(ctx, campaignInput)
	if err != nil || replayed || campaign.Version != 1 {
		t.Fatalf("campaign=%#v replayed=%t err=%v", campaign, replayed, err)
	}
	dailyDate := "2026-08-31"
	dailyInput := integrationCreateInput(createdPlayer.ID, gameRun.DailyMode, &dailyDate, "daily-start-0000001", "daily-seed-20260831", integrationState("seventh-dock", "nana7mi"))
	daily, replayed, err := runs.Create(ctx, dailyInput)
	if err != nil || replayed || daily.Mode != gameRun.DailyMode {
		t.Fatalf("daily=%#v replayed=%t err=%v", daily, replayed, err)
	}
	if _, _, err := runs.Create(ctx, integrationCreateInput(createdPlayer.ID, gameRun.CampaignMode, nil, "campaign-start-0002", "campaign-seed-00000002", integrationState("seventh-dock", "nana7mi"))); !errors.Is(err, gameRun.ErrActiveRunExists) {
		t.Fatalf("second active campaign err=%v", err)
	}
	if _, _, err := runs.Create(ctx, integrationCreateInput(createdPlayer.ID, gameRun.DailyMode, &dailyDate, "daily-start-0000002", "daily-seed-20260832", integrationState("seventh-dock", "nana7mi"))); !errors.Is(err, gameRun.ErrActiveRunExists) {
		t.Fatalf("second active daily err=%v", err)
	}

	replayedCampaign, replayed, err := runs.Create(ctx, campaignInput)
	if err != nil || !replayed || replayedCampaign.ID != campaign.ID {
		t.Fatalf("campaign replay=%#v replayed=%t err=%v", replayedCampaign, replayed, err)
	}
	changedStart := campaignInput
	changedStart.Request.CompanionSlug = "nana7mi-assist"
	if _, _, err := runs.Create(ctx, changedStart); !errors.Is(err, gameRun.ErrIdempotencyConflict) {
		t.Fatalf("changed JSONB start replay err=%v", err)
	}

	showCommand := gameRun.Command{Type: gameRun.ChooseShowOption, OptionID: "double-take"}
	showResponse, replayed, err := runs.Apply(ctx, gameRun.ApplyInput{PlayerID: createdPlayer.ID, RunID: campaign.ID, Command: showCommand, ExpectedVersion: 1, IdempotencyKey: "show-option-0001"}, func(current gameRun.GameRun, _ gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		current.State.ShowEffects = append(current.State.ShowEffects, "double-take")
		return gameRun.Resolution{State: current.State, Events: []gameRun.Event{{Kind: "show_effect_chosen", ShowEffectID: "double-take"}}}, nil, nil
	})
	if err != nil || replayed || showResponse.Run.Version != 2 {
		t.Fatalf("show response=%#v replayed=%t err=%v", showResponse, replayed, err)
	}
	replayedShow, replayed, err := runs.Apply(ctx, gameRun.ApplyInput{PlayerID: createdPlayer.ID, RunID: campaign.ID, Command: showCommand, ExpectedVersion: 1, IdempotencyKey: "show-option-0001"}, nil)
	if err != nil || !replayed || replayedShow.Run.Version != 2 {
		t.Fatalf("show replay=%#v replayed=%t err=%v", replayedShow, replayed, err)
	}
	if _, _, err := runs.Apply(ctx, gameRun.ApplyInput{PlayerID: createdPlayer.ID, RunID: campaign.ID, Command: gameRun.Command{Type: gameRun.ChooseShowOption, OptionID: "clean-cut"}, ExpectedVersion: 1, IdempotencyKey: "show-option-0001"}, nil); !errors.Is(err, gameRun.ErrIdempotencyConflict) {
		t.Fatalf("changed command replay err=%v", err)
	}
	if _, _, err := runs.Apply(ctx, gameRun.ApplyInput{PlayerID: createdPlayer.ID, RunID: campaign.ID, Command: showCommand, ExpectedVersion: 1, IdempotencyKey: "stale-version-001"}, nil); !errors.Is(err, gameRun.ErrVersionConflict) {
		t.Fatalf("stale version err=%v", err)
	}

	replyCommand := gameRun.Command{Type: gameRun.ChooseIntermissionReply, SceneID: "seventh-dock-intermission", OptionID: "keep-seven-second-voice"}
	replyResponse, replayed, err := runs.Apply(ctx, gameRun.ApplyInput{PlayerID: createdPlayer.ID, RunID: campaign.ID, Command: replyCommand, ExpectedVersion: 2, IdempotencyKey: "story-reply-0001"}, func(current gameRun.GameRun, _ gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		current.State.SelectedChoiceIDs = append(current.State.SelectedChoiceIDs, "keep-seven-second-voice")
		return gameRun.Resolution{State: current.State, Events: []gameRun.Event{{Kind: "intermission_replied", SceneID: "seventh-dock-intermission", ChoiceID: "keep-seven-second-voice", ChoiceTag: "kept-withdrawn-voice"}}}, nil, nil
	})
	if err != nil || replayed || replyResponse.Run.Version != 3 {
		t.Fatalf("reply response=%#v replayed=%t err=%v", replyResponse, replayed, err)
	}

	completedState := replyResponse.Run.State
	completedState.Phase, completedState.EncoreLevel, completedState.Score = gameRun.CompletedPhase, 2, 5000
	clearOutcome := gameRun.Cleared
	clearResponse, _, err := runs.Apply(ctx, gameRun.ApplyInput{PlayerID: createdPlayer.ID, RunID: campaign.ID, Command: gameRun.Command{Type: gameRun.CompleteSegment}, ExpectedVersion: 3, IdempotencyKey: "chapter-clear-001"}, func(gameRun.GameRun, gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		return gameRun.Resolution{State: completedState, Events: []gameRun.Event{{Kind: "chapter_cleared", ChapterSlug: "seventh-dock", CompanionID: "nana7mi-assist", NextChapterSlug: "always-cheerful", NextCharacterSlug: "jiaran"}}}, &clearOutcome, nil
	})
	if err != nil || clearResponse.Run.Status != gameRun.Completed {
		t.Fatalf("chapter clear=%#v err=%v", clearResponse, err)
	}
	advanced, err := progressRepository.GetOrCreate(ctx, createdPlayer.ID)
	if err != nil || advanced.CurrentChapter != "always-cheerful" || !progression.HasUnlock(advanced, progression.CompanionUnlock, "nana7mi-assist") || !progression.HasUnlock(advanced, progression.CharacterUnlock, "jiaran") || !progression.HasUnlock(advanced, progression.MemoryClipUnlock, "seventh-dock-memory") {
		t.Fatalf("atomic unlock progress=%#v err=%v", advanced, err)
	}
	var highestEncore int
	if err := database.pool.QueryRow(ctx, `SELECT highest_encore_level FROM player_chapter_progress WHERE player_id=$1::uuid AND chapter_slug='seventh-dock'`, createdPlayer.ID).Scan(&highestEncore); err != nil || highestEncore != 3 {
		t.Fatalf("highest Encore=%d err=%v", highestEncore, err)
	}

	revised, replayed, err := progressRepository.Choose(ctx, progression.ChooseInput{PlayerID: createdPlayer.ID, SceneSlug: "seventh-dock-intermission", OptionSlug: "delete-learned-reply", ChoiceTag: "deleted-learned-reply", ExpectedVersion: advanced.Version, IdempotencyKey: "story-revision-001"})
	if err != nil || replayed || revised.Choices[len(revised.Choices)-1].Revision != 2 {
		t.Fatalf("story revision=%#v replayed=%t err=%v", revised, replayed, err)
	}
	if revised.StoryFlags["kept-withdrawn-voice"] || !revised.StoryFlags["deleted-learned-reply"] || !revised.StoryFlags["seventh-dock-intermission-resolved"] {
		t.Fatalf("latest story revision was not projected: %#v", revised.StoryFlags)
	}
	var choiceRows, firstRevision, latestRevision int
	if err := database.pool.QueryRow(ctx, `
		SELECT count(*),min(revision),max(revision)
		FROM story_choices
		WHERE player_id=$1::uuid AND scene_slug='seventh-dock-intermission'`, createdPlayer.ID).Scan(&choiceRows, &firstRevision, &latestRevision); err != nil {
		t.Fatal(err)
	}
	if choiceRows != 2 || firstRevision != 1 || latestRevision != 2 {
		t.Fatalf("append-only story history rows=%d revisions=%d..%d", choiceRows, firstRevision, latestRevision)
	}

	finaleState := integrationState("zero-channel", "nana7mi")
	finale, _, err := runs.Create(ctx, integrationCreateInput(createdPlayer.ID, gameRun.CampaignMode, nil, "finale-start-0001", "finale-seed-000000001", finaleState))
	if err != nil {
		t.Fatal(err)
	}
	finaleCompleted := finale.State
	finaleCompleted.Phase, finaleCompleted.EndingID, finaleCompleted.Score = gameRun.CompletedPhase, "shared-cut", 9000
	finaleResponse, _, err := runs.Apply(ctx, gameRun.ApplyInput{PlayerID: createdPlayer.ID, RunID: finale.ID, Command: gameRun.Command{Type: gameRun.ChooseIntermissionReply, SceneID: "zero-channel-ending", OptionID: "shared-cut"}, ExpectedVersion: 1, IdempotencyKey: "ending-choice-001"}, func(gameRun.GameRun, gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		return gameRun.Resolution{State: finaleCompleted, Events: []gameRun.Event{
			{Kind: "ending_chosen", SceneID: "zero-channel-ending", ChoiceID: "shared-cut", ChoiceTag: "shared-cut", EndingID: "shared-cut"},
			{Kind: "chapter_cleared", ChapterSlug: "zero-channel", EndingID: "shared-cut"},
		}}, &clearOutcome, nil
	})
	if err != nil || finaleResponse.Run.Status != gameRun.Completed {
		t.Fatalf("explicit ending response=%#v err=%v", finaleResponse, err)
	}
	withEnding, err := progressRepository.GetOrCreate(ctx, createdPlayer.ID)
	if err != nil || withEnding.Ending != "shared-cut" || !withEnding.DailyUnlocked {
		t.Fatalf("explicit ending progress=%#v err=%v", withEnding, err)
	}

	dailyCompleted := daily.State
	dailyCompleted.Phase, dailyCompleted.Score = gameRun.CompletedPhase, 4321
	dailyCompleted.ShowEffects = []string{"double-take", "safety-chat"}
	dailyCompleted.CompanionSlugs = []string{"nana7mi-assist"}
	dailyResponse, _, err := runs.Apply(ctx, gameRun.ApplyInput{PlayerID: createdPlayer.ID, RunID: daily.ID, Command: gameRun.Command{Type: gameRun.CompleteSegment}, ExpectedVersion: 1, IdempotencyKey: "daily-clear-0001"}, func(gameRun.GameRun, gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		return gameRun.Resolution{State: dailyCompleted, Events: []gameRun.Event{{Kind: "chapter_cleared", ChapterSlug: "seventh-dock"}}}, &clearOutcome, nil
	})
	if err != nil || dailyResponse.Run.Status != gameRun.Completed {
		t.Fatalf("daily clear=%#v err=%v", dailyResponse, err)
	}
	dailyResult, err := runs.GetDailyResult(ctx, createdPlayer.ID, dailyDate)
	if err != nil || dailyResult == nil || dailyResult.Score != 4321 || !reflect.DeepEqual(dailyResult.ShowEffects, dailyCompleted.ShowEffects) || !reflect.DeepEqual(dailyResult.CompanionSlugs, dailyCompleted.CompanionSlugs) {
		t.Fatalf("daily result=%#v err=%v", dailyResult, err)
	}
	publicResult, err := runs.GetPublicDailyResult(ctx, daily.ID)
	if err != nil || publicResult.Score != dailyResult.Score {
		t.Fatalf("public daily result=%#v err=%v", publicResult, err)
	}

	concurrent, _, err := runs.Create(ctx, integrationCreateInput(createdPlayer.ID, gameRun.CampaignMode, nil, "concurrent-start-1", "concurrent-seed-00001", integrationState("always-cheerful", "jiaran")))
	if err != nil {
		t.Fatal(err)
	}
	resolver := func(current gameRun.GameRun, _ gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		current.State.Score++
		return gameRun.Resolution{State: current.State, Events: []gameRun.Event{{Kind: "show_choice_ready"}}}, nil, nil
	}
	errorsByCommand := make([]error, 2)
	var wait sync.WaitGroup
	for index := range errorsByCommand {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			_, _, errorsByCommand[index] = runs.Apply(context.Background(), gameRun.ApplyInput{PlayerID: createdPlayer.ID, RunID: concurrent.ID, Command: gameRun.Command{Type: gameRun.ChooseShowOption, OptionID: fmt.Sprintf("option-%d", index)}, ExpectedVersion: 1, IdempotencyKey: fmt.Sprintf("concurrent-command-%d", index)}, resolver)
		}(index)
	}
	wait.Wait()
	successes, conflicts := 0, 0
	for _, commandErr := range errorsByCommand {
		switch {
		case commandErr == nil:
			successes++
		case errors.Is(commandErr, gameRun.ErrVersionConflict):
			conflicts++
		default:
			t.Fatalf("unexpected concurrent error=%v", commandErr)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("concurrent successes=%d conflicts=%d errors=%v", successes, conflicts, errorsByCommand)
	}

	beforeRollback, err := runs.Get(ctx, createdPlayer.ID, concurrent.ID)
	if err != nil {
		t.Fatal(err)
	}
	forcedRollback := errors.New("forced resolver rollback")
	if _, _, err := runs.Apply(ctx, gameRun.ApplyInput{PlayerID: createdPlayer.ID, RunID: concurrent.ID, Command: gameRun.Command{Type: gameRun.AbandonRun}, ExpectedVersion: beforeRollback.Version, IdempotencyKey: "rollback-command-1"}, func(gameRun.GameRun, gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		return gameRun.Resolution{}, nil, forcedRollback
	}); !errors.Is(err, forcedRollback) {
		t.Fatalf("rollback error=%v", err)
	}
	afterRollback, err := runs.Get(ctx, createdPlayer.ID, concurrent.ID)
	if err != nil || beforeRollback.Version != afterRollback.Version || !reflect.DeepEqual(beforeRollback.State, afterRollback.State) {
		t.Fatalf("rollback before=%#v after=%#v err=%v", beforeRollback, afterRollback, err)
	}

	if _, err := database.pool.Exec(ctx, `DELETE FROM players WHERE id=$1::uuid`, createdPlayer.ID); err != nil {
		t.Fatalf("delete synthetic player through immutable-history cascades: %v", err)
	}
	var remaining int
	if err := database.pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM players WHERE id=$1::uuid)
			+ (SELECT count(*) FROM runs WHERE player_id=$1::uuid)
			+ (SELECT count(*) FROM run_commands WHERE player_id=$1::uuid)
			+ (SELECT count(*) FROM story_choices WHERE player_id=$1::uuid)
			+ (SELECT count(*) FROM daily_results WHERE player_id=$1::uuid)`, createdPlayer.ID).Scan(&remaining); err != nil || remaining != 0 {
		t.Fatalf("synthetic player cascade left %d rows err=%v", remaining, err)
	}
}

func TestLiveRescuePrepareResetsGameTruthButPreservesTelegramIdentity(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	database := openIsolatedIntegrationDatabase(ctx, t, databaseURL)
	if err := database.MigrateTo(ctx, migrations.Files, 6); err != nil {
		t.Fatalf("migrate to Action V3 boundary: %v", err)
	}

	var playerID, runID string
	if err := database.pool.QueryRow(ctx, `
		INSERT INTO players(telegram_user_id,language_code) VALUES(2468013579,'zh-CN')
		RETURNING id::text`).Scan(&playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `INSERT INTO player_campaign_progress(player_id,story_version) VALUES($1::uuid,3)`, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		INSERT INTO player_chapter_progress(player_id,chapter_slug,highest_noise_level,clears,best_score)
		VALUES($1::uuid,'seventh-dock',2,1,900)`, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		INSERT INTO player_unlocks(player_id,unlock_type,content_slug)
		VALUES($1::uuid,'character','nana7mi')`, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		INSERT INTO story_choices(
			player_id,scene_slug,option_slug,choice_tag,expected_version,resulting_version,
			idempotency_key,request_hash,result_snapshot,revision,trust,authenticity,retention)
		VALUES($1::uuid,'old-scene','old-option','old-tag',1,2,'old-story-choice',
			decode(repeat('01',32),'hex'),'{}'::jsonb,1,1,1,1)`, playerID); err != nil {
		t.Fatal(err)
	}
	if err := database.pool.QueryRow(ctx, `
		INSERT INTO runs(
			player_id,content_version,chapter_slug,character_slug,noise_level,seed,state,
			status,outcome,start_idempotency_key,start_request_hash,completed_at,run_mode,daily_date)
		VALUES($1::uuid,'v3','seventh-dock','nana7mi',0,'old-daily-seed-0001','{}'::jsonb,
			'completed','cleared','old-daily-start',decode(repeat('02',32),'hex'),now(),'daily','2026-08-31')
		RETURNING id::text`, playerID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		INSERT INTO daily_results(player_id,daily_date,run_id,character_slug,score,build)
		VALUES($1::uuid,'2026-08-31',$2::uuid,'nana7mi',900,'{}'::jsonb)`, playerID, runID); err != nil {
		t.Fatal(err)
	}

	if err := database.MigrateTo(ctx, migrations.Files, 7); err != nil {
		t.Fatalf("apply V4 prepare migration: %v", err)
	}
	if err := database.MigrateTo(ctx, migrations.Files, 7); err != nil {
		t.Fatalf("reapply V4 prepare target: %v", err)
	}
	for _, table := range []string{"daily_results", "run_commands", "runs", "story_choices"} {
		var count int
		if err := database.pool.QueryRow(ctx, "SELECT count(*) FROM "+pgx.Identifier{table}.Sanitize()).Scan(&count); err != nil || count != 0 {
			t.Fatalf("%s count after prepare=%d err=%v", table, count, err)
		}
	}
	var language string
	if err := database.pool.QueryRow(ctx, `SELECT language_code FROM players WHERE id=$1::uuid`, playerID).Scan(&language); err != nil || language != "zh-CN" {
		t.Fatalf("preserved language=%q err=%v", language, err)
	}
	var progressCount, chapterCount, unlockCount int
	if err := database.pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM player_campaign_progress WHERE player_id=$1::uuid),
			(SELECT count(*) FROM player_chapter_progress WHERE player_id=$1::uuid AND chapter_slug='seventh-dock'),
			(SELECT count(*) FROM player_unlocks WHERE player_id=$1::uuid AND unlock_type='character' AND content_slug='nana7mi')`, playerID).Scan(&progressCount, &chapterCount, &unlockCount); err != nil {
		t.Fatal(err)
	}
	if progressCount != 1 || chapterCount != 1 || unlockCount != 1 {
		t.Fatalf("V4 bootstrap progress/chapter/unlock=%d/%d/%d", progressCount, chapterCount, unlockCount)
	}
	var version int
	if err := database.pool.QueryRow(ctx, `SELECT max(version) FROM schema_migrations`).Scan(&version); err != nil || version != 7 {
		t.Fatalf("prepare target version=%d err=%v", version, err)
	}

	// Model a direct request reaching the old Lambda during the brief interval
	// after 007 commits and before the immutable V4 alias is selected. Finalize
	// must discard incompatible V3 rows without touching V4 rows or identity.
	if _, err := database.pool.Exec(ctx, `
		INSERT INTO player_unlocks(player_id,unlock_type,content_slug)
		VALUES
			($1::uuid,'module','late-v3-module'),
			($1::uuid,'character','xingtong'),
			($1::uuid,'companion','lulu-assist'),
			($1::uuid,'memory_clip','late-v3-memory')`, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		UPDATE player_chapter_progress
		SET clears=7,best_score=9999,highest_encore_level=3
		WHERE player_id=$1::uuid AND chapter_slug='seventh-dock'`, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		UPDATE player_campaign_progress SET ending='authentic' WHERE player_id=$1::uuid`, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		INSERT INTO runs(
			player_id,content_version,chapter_slug,character_slug,noise_level,seed,state,
			status,outcome,start_idempotency_key,completed_at,run_mode,encore_level)
		VALUES($1::uuid,'v3','seventh-dock','nana7mi',0,'late-v3-seed-000001','{}'::jsonb,
			'completed','cleared','late-v3-start-0001',now(),'campaign',0)`, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		INSERT INTO runs(
			player_id,content_version,chapter_slug,character_slug,noise_level,seed,state,
			status,start_idempotency_key,run_mode,encore_level,start_request_payload)
		VALUES($1::uuid,'v4','seventh-dock','nana7mi',0,'kept-v4-seed-000001','{}'::jsonb,
			'active','kept-v4-start-0001','campaign',0,'{"mode":"campaign"}'::jsonb)`, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		INSERT INTO runs(
			player_id,content_version,chapter_slug,character_slug,noise_level,seed,state,
			status,outcome,start_idempotency_key,completed_at,run_mode,encore_level,start_request_payload)
		VALUES($1::uuid,'v4','seventh-dock','nana7mi',0,'cleared-v4-seed-0001','{"score":1234}'::jsonb,
			'completed','cleared','cleared-v4-start-01',now(),'campaign',1,'{"mode":"campaign"}'::jsonb)`, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		INSERT INTO story_choices(
			player_id,scene_slug,option_slug,choice_tag,expected_version,resulting_version,
			idempotency_key,result_snapshot,revision)
		VALUES($1::uuid,'seventh-dock-intermission','keep-seven-second-voice','kept-withdrawn-voice',
			1,2,'kept-v4-choice-0001','{}'::jsonb,1)`, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		INSERT INTO story_choices(
			player_id,scene_slug,option_slug,choice_tag,expected_version,resulting_version,
			idempotency_key,result_snapshot,revision)
		VALUES($1::uuid,'nana-midpoint','keep-memory','old-v3-memory',
			2,3,'late-v3-choice-0001','{}'::jsonb,1)`, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.pool.Exec(ctx, `
		UPDATE player_campaign_progress
		SET story_flags='{"old-v3-memory":true,"nana-midpoint-resolved":true,"kept-withdrawn-voice":true,"seventh-dock-intermission-resolved":true}'::jsonb
		WHERE player_id=$1::uuid`, playerID); err != nil {
		t.Fatal(err)
	}

	if err := database.MigrateTo(ctx, migrations.Files, 8); err != nil {
		t.Fatalf("apply V4 cleanup migration after compatibility writes: %v", err)
	}
	if err := database.MigrateTo(ctx, migrations.Files, 8); err != nil {
		t.Fatalf("reapply V4 cleanup target: %v", err)
	}
	assertV4SchemaBoundary(ctx, t, database)
	var lateV3Runs, keptV4Runs, obsoleteUnlocks, pollutedUnlocks, validUnlocks, keptChoices, oldChoices int
	var chapterClears, chapterEncore, chapterBest, nextChapterRows int
	var currentChapter string
	var ending *string
	var storyFlags map[string]bool
	if err := database.pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM runs WHERE player_id=$1::uuid AND content_version='v3'),
			(SELECT count(*) FROM runs WHERE player_id=$1::uuid AND content_version='v4'),
			(SELECT count(*) FROM player_unlocks WHERE player_id=$1::uuid AND unlock_type='module'),
			(SELECT count(*) FROM player_unlocks WHERE player_id=$1::uuid AND content_slug IN ('xingtong','lulu-assist','late-v3-memory')),
			(SELECT count(*) FROM player_unlocks WHERE player_id=$1::uuid AND (unlock_type,content_slug) IN (
				('character','nana7mi'),('character','jiaran'),('companion','nana7mi-assist'),('memory_clip','seventh-dock-memory')
			)),
			(SELECT count(*) FROM story_choices WHERE player_id=$1::uuid AND option_slug='keep-seven-second-voice'),
			(SELECT count(*) FROM story_choices WHERE player_id=$1::uuid AND scene_slug='nana-midpoint'),
			(SELECT clears FROM player_chapter_progress WHERE player_id=$1::uuid AND chapter_slug='seventh-dock'),
			(SELECT highest_encore_level FROM player_chapter_progress WHERE player_id=$1::uuid AND chapter_slug='seventh-dock'),
			(SELECT best_score FROM player_chapter_progress WHERE player_id=$1::uuid AND chapter_slug='seventh-dock'),
			(SELECT count(*) FROM player_chapter_progress WHERE player_id=$1::uuid AND chapter_slug='always-cheerful'),
			(SELECT current_chapter_slug FROM player_campaign_progress WHERE player_id=$1::uuid),
			(SELECT story_flags FROM player_campaign_progress WHERE player_id=$1::uuid),
			(SELECT ending FROM player_campaign_progress WHERE player_id=$1::uuid)`, playerID).Scan(
		&lateV3Runs, &keptV4Runs, &obsoleteUnlocks, &pollutedUnlocks, &validUnlocks,
		&keptChoices, &oldChoices, &chapterClears, &chapterEncore, &chapterBest,
		&nextChapterRows, &currentChapter, &storyFlags, &ending,
	); err != nil {
		t.Fatal(err)
	}
	if lateV3Runs != 0 || keptV4Runs != 2 || obsoleteUnlocks != 0 || pollutedUnlocks != 0 || validUnlocks != 4 || keptChoices != 1 || oldChoices != 0 || ending != nil {
		t.Fatalf("cleanup boundary v3=%d v4=%d obsolete=%d polluted=%d valid=%d choices=%d old_choices=%d ending=%v", lateV3Runs, keptV4Runs, obsoleteUnlocks, pollutedUnlocks, validUnlocks, keptChoices, oldChoices, ending)
	}
	if chapterClears != 1 || chapterEncore != 2 || chapterBest != 1234 || nextChapterRows != 1 || currentChapter != "always-cheerful" {
		t.Fatalf("rebuilt progress clears=%d Encore=%d best=%d next_rows=%d current=%q", chapterClears, chapterEncore, chapterBest, nextChapterRows, currentChapter)
	}
	wantFlags := map[string]bool{"kept-withdrawn-voice": true, "seventh-dock-intermission-resolved": true, "chapter:seventh-dock:cleared": true}
	if !reflect.DeepEqual(storyFlags, wantFlags) {
		t.Fatalf("reprojected story flags=%#v want=%#v", storyFlags, wantFlags)
	}
}

func integrationCreateInput(playerID string, mode gameRun.Mode, dailyDate *string, key, seed string, state gameRun.State) gameRun.CreateInput {
	request := gameRun.StartRequest{Mode: mode, ChapterSlug: state.ChapterSlug, CharacterSlug: state.CharacterSlug, EncoreLevel: state.EncoreLevel, DailyDate: dailyDate}
	return gameRun.CreateInput{PlayerID: playerID, ContentVersion: gamecontent.V4Version, Seed: seed, State: state, IdempotencyKey: key, Request: request, Mode: mode, DailyDate: dailyDate}
}

func integrationState(chapter, character string) gameRun.State {
	return gameRun.State{
		Phase: gameRun.ShowChoicePhase, ChapterSlug: chapter, CharacterSlug: character, CompanionSlugs: []string{},
		Hearts: 3, MaxHearts: 3, PendingShowOptions: []string{"double-take", "clean-cut"}, ShowEffects: []string{}, SelectedChoiceIDs: []string{},
	}
}

func assertV4SchemaBoundary(ctx context.Context, t *testing.T, database *Database) {
	t.Helper()
	var version int
	if err := database.pool.QueryRow(ctx, `SELECT max(version) FROM schema_migrations`).Scan(&version); err != nil || version != 8 {
		t.Fatalf("migration version=%d err=%v", version, err)
	}
	for table, column := range map[string]string{"runs": "start_request_hash", "run_commands": "request_hash", "story_choices": "request_hash"} {
		var exists bool
		if err := database.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name=$2)`, table, column).Scan(&exists); err != nil || exists {
			t.Fatalf("obsolete column %s.%s exists=%t err=%v", table, column, exists, err)
		}
	}
	var storyTable bool
	if err := database.pool.QueryRow(ctx, `SELECT to_regclass(current_schema()||'.story_choices') IS NOT NULL`).Scan(&storyTable); err != nil || !storyTable {
		t.Fatalf("story_choices preserved=%t err=%v", storyTable, err)
	}
}

func openIsolatedIntegrationDatabase(ctx context.Context, t *testing.T, databaseURL string) *Database {
	t.Helper()
	admin, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("xuhuan_v4_%d", time.Now().UnixNano())
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		admin.Close()
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema + ",public"
	database, err := OpenConfig(ctx, config)
	if err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		database.Close()
		cleanupContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_, _ = admin.Exec(cleanupContext, "DROP SCHEMA "+identifier+" CASCADE")
		admin.Close()
	})
	return database
}
