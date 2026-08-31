package game

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
)

func TestStartEnforcesFirstClearAndAllowsUnlockedReplayCompanion(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	base := progression.Progress{
		PlayerID: "10000000-0000-4000-8000-000000000001", CurrentChapter: "seventh-dock", StoryVersion: 4, Version: 1,
		StoryFlags: map[string]bool{}, Unlocks: []progression.Unlock{{Type: progression.CharacterUnlock, ContentSlug: "nana7mi"}},
		Chapters: []progression.ChapterProgress{{ChapterSlug: "seventh-dock", HighestEncore: 0, Clears: 0}}, Choices: []progression.Choice{},
	}
	service, runs := testGameService(catalog, base)
	user := auth.User{ID: 42, LanguageCode: "en"}
	if _, _, err := service.Start(context.Background(), user, StartInput{Mode: gameRun.CampaignMode, ChapterSlug: "seventh-dock", CharacterSlug: "jiaran", IdempotencyKey: "first-wrong-character"}); !errors.Is(err, gameRun.ErrContentLocked) {
		t.Fatalf("wrong first-clear character error=%v", err)
	}
	if _, _, err := service.Start(context.Background(), user, StartInput{Mode: gameRun.CampaignMode, ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", IdempotencyKey: "first-featured-character"}); err != nil {
		t.Fatalf("featured first-clear error=%v", err)
	}
	if len(runs.created.State.CompanionSlugs) != 0 {
		t.Fatalf("first clear companions=%v", runs.created.State.CompanionSlugs)
	}

	replay := base
	replay.Unlocks = []progression.Unlock{
		{Type: progression.CharacterUnlock, ContentSlug: "nana7mi"},
		{Type: progression.CharacterUnlock, ContentSlug: "jiaran"},
		{Type: progression.CompanionUnlock, ContentSlug: "nana7mi-assist"},
	}
	replay.Chapters = []progression.ChapterProgress{{ChapterSlug: "seventh-dock", HighestEncore: 2, Clears: 1}}
	replay.Choices = []progression.Choice{
		{SceneSlug: "seventh-dock-intermission", OptionSlug: "keep-seven-second-voice", Revision: 1},
		{SceneSlug: "seventh-dock-intermission", OptionSlug: "delete-learned-reply", Revision: 2},
		{SceneSlug: "always-cheerful-intermission", OptionSlug: "join-encore-with-consent", Revision: 1},
	}
	service, runs = testGameService(catalog, replay)
	_, _, err := service.Start(context.Background(), user, StartInput{Mode: gameRun.CampaignMode, ChapterSlug: "seventh-dock", CharacterSlug: "jiaran", CompanionSlug: "nana7mi-assist", EncoreLevel: 2, IdempotencyKey: "replay-with-companion"})
	if err != nil {
		t.Fatalf("unlocked replay error=%v", err)
	}
	if runs.created.Request.CompanionSlug != "nana7mi-assist" || len(runs.created.State.CompanionSlugs) != 1 || runs.created.State.CompanionSlugs[0] != "nana7mi-assist" || runs.created.State.EncoreLevel != 2 {
		t.Fatalf("captured replay=%#v", runs.created)
	}
	if slices.Contains(runs.created.State.SelectedChoiceIDs, "keep-seven-second-voice") || !slices.Contains(runs.created.State.SelectedChoiceIDs, "delete-learned-reply") || !slices.Contains(runs.created.State.SelectedChoiceIDs, "join-encore-with-consent") {
		t.Fatalf("run did not receive latest story projection: %v", runs.created.State.SelectedChoiceIDs)
	}
	if _, _, err := service.Start(context.Background(), user, StartInput{Mode: gameRun.CampaignMode, ChapterSlug: "seventh-dock", CharacterSlug: "jiaran", CompanionSlug: "lulu-assist", IdempotencyKey: "locked-companion"}); !errors.Is(err, gameRun.ErrContentLocked) {
		t.Fatalf("locked companion error=%v", err)
	}
}

func TestDailyStartIsServerSelectedAndHasNoInitialCompanion(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	progress := progression.Progress{PlayerID: "10000000-0000-4000-8000-000000000002", StoryVersion: 4, Version: 1, DailyUnlocked: true, StoryFlags: map[string]bool{}, Unlocks: []progression.Unlock{}, Chapters: []progression.ChapterProgress{}, Choices: []progression.Choice{}}
	service, runs := testGameService(catalog, progress)
	_, _, err := service.Start(context.Background(), auth.User{ID: 43}, StartInput{Mode: gameRun.DailyMode, CompanionSlug: "nana7mi-assist", IdempotencyKey: "daily-server-selected"})
	if err != nil {
		t.Fatal(err)
	}
	if runs.created.Mode != gameRun.DailyMode || runs.created.Request.CompanionSlug != "" || len(runs.created.State.CompanionSlugs) != 0 || runs.created.DailyDate == nil {
		t.Fatalf("daily create=%#v", runs.created)
	}
}

type fakePlayerService struct{ value player.Player }

func (service fakePlayerService) GetOrCreate(context.Context, auth.User) (player.Player, error) {
	return service.value, nil
}

type fakeProgressRepository struct{ value progression.Progress }

func (repository *fakeProgressRepository) GetOrCreate(context.Context, string) (progression.Progress, error) {
	return repository.value, nil
}
func (repository *fakeProgressRepository) Choose(context.Context, progression.ChooseInput) (progression.Progress, bool, error) {
	return repository.value, false, nil
}

type fakeRunRepository struct{ created gameRun.CreateInput }

func (repository *fakeRunRepository) Create(_ context.Context, input gameRun.CreateInput) (gameRun.GameRun, bool, error) {
	repository.created = input
	return gameRun.GameRun{ID: "20000000-0000-4000-8000-000000000001", PlayerID: input.PlayerID, ContentVersion: input.ContentVersion, Mode: input.Mode, DailyDate: input.DailyDate, Seed: input.Seed, State: input.State, Status: gameRun.Active, Version: 1}, false, nil
}
func (*fakeRunRepository) Get(context.Context, string, string) (gameRun.GameRun, error) {
	return gameRun.GameRun{}, nil
}
func (*fakeRunRepository) GetActive(context.Context, string, gameRun.Mode) (*gameRun.GameRun, error) {
	return nil, nil
}
func (*fakeRunRepository) Apply(context.Context, gameRun.ApplyInput, gameRun.Resolver) (gameRun.CommandResponse, bool, error) {
	return gameRun.CommandResponse{}, false, nil
}
func (*fakeRunRepository) GetDailyResult(context.Context, string, string) (*gameRun.DailyResult, error) {
	return nil, nil
}
func (*fakeRunRepository) GetPublicDailyResult(context.Context, string) (gameRun.DailyResult, error) {
	return gameRun.DailyResult{}, nil
}

func testGameService(catalog *gamecontent.V4Catalog, value progression.Progress) (*Service, *fakeRunRepository) {
	runs := &fakeRunRepository{}
	return NewService(fakePlayerService{value: player.Player{ID: value.PlayerID}}, &fakeProgressRepository{value: value}, runs, catalog), runs
}
