package game

import (
	"bytes"
	"context"
	"slices"
	"testing"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
)

type fixedPlayerService struct{}

func (fixedPlayerService) GetOrCreate(context.Context, auth.User) (player.Player, error) {
	return player.Player{ID: "00000000-0000-0000-0000-000000000001"}, nil
}

type replayingProgressRepository struct {
	progress progression.Progress
	stored   *progression.ChooseInput
	result   progression.Progress
}

func (repository *replayingProgressRepository) GetOrCreate(context.Context, string) (progression.Progress, error) {
	return repository.progress, nil
}

func (repository *replayingProgressRepository) Choose(_ context.Context, input progression.ChooseInput) (progression.Progress, bool, error) {
	if repository.stored != nil && repository.stored.IdempotencyKey == input.IdempotencyKey {
		if !bytes.Equal(repository.stored.RequestHash[:], input.RequestHash[:]) {
			return progression.Progress{}, false, progression.ErrIdempotencyConflict
		}
		return repository.result, true, nil
	}
	repository.progress.Version++
	revision := 1
	for _, choice := range repository.progress.Choices {
		if choice.SceneSlug == input.Scene.Slug && choice.Revision >= revision {
			revision = choice.Revision + 1
		}
	}
	repository.progress.Choices = append(repository.progress.Choices, progression.Choice{
		SceneSlug: input.Scene.Slug, OptionSlug: input.Option.Slug, ChoiceTag: input.Option.Tag, Revision: revision,
	})
	repository.stored = &input
	repository.result = repository.progress
	return repository.result, false, nil
}

type unusedRunRepository struct{}

func (unusedRunRepository) Create(context.Context, gameRun.CreateInput) (gameRun.GameRun, bool, error) {
	panic("unexpected Create call")
}
func (unusedRunRepository) Get(context.Context, string, string) (gameRun.GameRun, error) {
	panic("unexpected Get call")
}
func (unusedRunRepository) GetActive(context.Context, string, gameRun.Mode) (*gameRun.GameRun, error) {
	panic("unexpected GetActive call")
}
func (unusedRunRepository) GetDailyResult(context.Context, string, string) (*gameRun.DailyResult, error) {
	panic("unexpected GetDailyResult call")
}
func (unusedRunRepository) GetPublicDailyResult(context.Context, string) (gameRun.DailyResult, error) {
	panic("unexpected GetPublicDailyResult call")
}
func (unusedRunRepository) Apply(context.Context, gameRun.ApplyInput, gameRun.Resolver) (gameRun.CommandResponse, bool, error) {
	panic("unexpected Apply call")
}

type capturingRunRepository struct {
	unusedRunRepository
	createdInput gameRun.CreateInput
	active       gameRun.GameRun
}

func (repository *capturingRunRepository) Create(_ context.Context, input gameRun.CreateInput) (gameRun.GameRun, bool, error) {
	repository.createdInput = input
	return gameRun.GameRun{ID: "10000000-0000-4000-8000-000000000001", PlayerID: input.PlayerID, ContentVersion: input.ContentVersion, Seed: input.Seed, State: input.State, Status: gameRun.Active, Version: 1}, false, nil
}

func (repository *capturingRunRepository) Get(context.Context, string, string) (gameRun.GameRun, error) {
	return repository.active, nil
}

func (repository *capturingRunRepository) Apply(_ context.Context, input gameRun.ApplyInput, resolver gameRun.Resolver) (gameRun.CommandResponse, bool, error) {
	resolution, outcome, err := resolver(repository.active, input.Command)
	if err != nil {
		return gameRun.CommandResponse{}, false, err
	}
	repository.active.State = resolution.State
	repository.active.Outcome = outcome
	repository.active.Version++
	return gameRun.CommandResponse{Run: repository.active, Events: resolution.Events}, false, nil
}

func TestChooseStoryReplaysAfterPendingSceneAdvances(t *testing.T) {
	repository := &replayingProgressRepository{progress: progression.Progress{
		PlayerID: "00000000-0000-0000-0000-000000000001", CurrentChapter: "seventh-dock", StoryFlags: map[string]bool{}, Version: 1,
	}}
	service := NewService(fixedPlayerService{}, repository, unusedRunRepository{}, gamecontent.MustLoad(gamecontent.CurrentVersion))
	input := StoryChoiceInput{
		SceneSlug: "prologue-last-viewer", OptionSlug: "stay-online",
		ExpectedVersion: 1, IdempotencyKey: "same-story-request",
	}

	first, replayed, err := service.ChooseStory(context.Background(), auth.User{ID: 1}, input)
	if err != nil {
		t.Fatal(err)
	}
	if replayed {
		t.Fatal("first choice was reported as replayed")
	}
	second, replayed, err := service.ChooseStory(context.Background(), auth.User{ID: 1}, input)
	if err != nil {
		t.Fatal(err)
	}
	if !replayed {
		t.Fatal("second choice was not replayed")
	}
	if second.Version != first.Version || len(second.Choices) != 1 {
		t.Fatalf("replayed progress = %#v, want original result %#v", second, first)
	}
}

func TestStoryRevisionRequiresTheSceneToBePending(t *testing.T) {
	repository := &replayingProgressRepository{progress: progression.Progress{
		PlayerID: "00000000-0000-0000-0000-000000000001", CurrentChapter: "seventh-dock", StoryFlags: map[string]bool{}, Version: 2,
		Choices:  []progression.Choice{{SceneSlug: "nana-midpoint", Revision: 1}},
		Chapters: []progression.ChapterProgress{{ChapterSlug: "seventh-dock", Clears: 1}},
	}}
	service := NewService(fixedPlayerService{}, repository, unusedRunRepository{}, gamecontent.MustLoad(gamecontent.CurrentVersion))
	_, _, err := service.ChooseStory(context.Background(), auth.User{ID: 1}, StoryChoiceInput{
		SceneSlug: "nana-midpoint", OptionSlug: "follow-signal", ExpectedVersion: 2, IdempotencyKey: "unprompted-revision",
	})
	if err != progression.ErrSceneNotPending {
		t.Fatalf("unprompted revision error=%v", err)
	}
}

func TestPendingReplayCheckpointCreatesTheNextRevision(t *testing.T) {
	repository := &replayingProgressRepository{progress: progression.Progress{
		PlayerID: "00000000-0000-0000-0000-000000000001", CurrentChapter: "seventh-dock",
		StoryFlags: map[string]bool{"scene:nana-midpoint:pending": true}, Version: 4,
		Choices: []progression.Choice{
			{SceneSlug: "prologue-last-viewer", Revision: 1},
			{SceneSlug: "nana-prelude", Revision: 1},
			{SceneSlug: "nana-midpoint", Revision: 1},
		},
		Chapters: []progression.ChapterProgress{{ChapterSlug: "seventh-dock", Clears: 1}},
	}}
	service := NewService(fixedPlayerService{}, repository, unusedRunRepository{}, gamecontent.MustLoad(gamecontent.CurrentVersion))
	result, replayed, err := service.ChooseStory(context.Background(), auth.User{ID: 1}, StoryChoiceInput{
		SceneSlug: "nana-midpoint", OptionSlug: "keep-all", ExpectedVersion: 4, IdempotencyKey: "pending-revision-0001",
	})
	if err != nil || replayed || result.Choices[len(result.Choices)-1].Revision != 2 {
		t.Fatalf("result=%#v replayed=%v error=%v", result, replayed, err)
	}
}

func TestFinaleSupportUsesUnlockedCastAndStoryProjection(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	progress := progression.Progress{Authenticity: 6, Retention: 1}
	for _, character := range catalog.Characters {
		progress.Unlocks = append(progress.Unlocks, progression.Unlock{Type: "character", ContentSlug: character.Slug})
	}
	companions, alignment := finaleSupport(progress, "zero-channel", "nana7mi", catalog)
	if alignment != "authentic" || len(companions) != 6 {
		t.Fatalf("companions=%v alignment=%q", companions, alignment)
	}
	for _, slug := range companions {
		if slug == "nana7mi" {
			t.Fatal("the lead character was included as their own companion")
		}
	}
	if companions, alignment := finaleSupport(progress, "seventh-dock", "nana7mi", catalog); len(companions) != 0 || alignment != "" {
		t.Fatalf("non-finale support=%v/%q", companions, alignment)
	}
}

func TestStartFreezesUnlockedPoolStarterAndLatestStoryProjection(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	progress := progression.Progress{
		PlayerID: "00000000-0000-0000-0000-000000000001", CurrentChapter: "seventh-dock", Version: 3, StoryFlags: map[string]bool{},
		Choices: []progression.Choice{
			{SceneSlug: "prologue-last-viewer", ChoiceTag: "choose-presence", Revision: 1, Trust: 1, Authenticity: 1},
			{SceneSlug: "nana-midpoint", ChoiceTag: "nana-highlight", Revision: 1, Retention: 2, Authenticity: -1},
		},
	}
	for _, grant := range progression.InitialUnlocks(catalog) {
		progress.Unlocks = append(progress.Unlocks, progression.Unlock{Type: grant.Type, ContentSlug: grant.ContentSlug})
	}
	runs := &capturingRunRepository{}
	service := NewService(fixedPlayerService{}, &replayingProgressRepository{progress: progress}, runs, catalog)
	created, _, err := service.Start(context.Background(), auth.User{ID: 1}, StartInput{
		Mode: gameRun.CampaignMode, ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", IdempotencyKey: "start-v3-pool",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(created.State.RewardPool.ModuleSlugs) != 20 || len(created.State.RewardPool.PluginSlugs) != 8 || len(created.State.Modules) != 1 || created.State.Modules[0].Slug != "route-needle" {
		t.Fatalf("created horizontal pool=%#v starter=%#v", created.State.RewardPool, created.State.Modules)
	}
	if created.State.NarrativeModifier.BossVariant != "retained" || created.State.NarrativeModifier.RewardBias != "surge" {
		t.Fatalf("created narrative modifier=%#v", created.State.NarrativeModifier)
	}
}

func TestCommandRefreshesNarrativeProjectionBeforeAuthoritativeResolution(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	progress := progression.Progress{
		PlayerID: "00000000-0000-0000-0000-000000000001", CurrentChapter: "seventh-dock", Version: 5, StoryFlags: map[string]bool{},
		Choices: []progression.Choice{
			{SceneSlug: "prologue-last-viewer", ChoiceTag: "choose-presence", Revision: 1},
			{SceneSlug: "nana-prelude", ChoiceTag: "choose-presence", Revision: 1},
			{SceneSlug: "nana-midpoint", ChoiceTag: "nana-contradictions", Revision: 2, Trust: 2, Authenticity: 2, Retention: -1},
		},
	}
	runs := &capturingRunRepository{active: gameRun.GameRun{
		ID: "10000000-0000-4000-8000-000000000001", PlayerID: progress.PlayerID, ContentVersion: gamecontent.CurrentVersion,
		Seed: "command-projection", Status: gameRun.Active, Version: 2,
		State: gameRun.State{
			Phase: gameRun.MapPhase, ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Health: 100, MaxHealth: 100,
			NarrativeModifier: gameRun.NarrativeModifier{BossVariant: "retained", RewardBias: "surge"},
			ChoiceTags:        []string{"event:kept-inside-run", "nana-highlight"},
			Map: gameRun.MapState{Nodes: []gameRun.MapNode{
				{ID: "node", Type: gameRun.CombatNode, Status: gameRun.AvailableNode, EncounterSlug: "dock-pursuit"},
			}},
		},
	}}
	service := NewService(fixedPlayerService{}, &replayingProgressRepository{progress: progress}, runs, catalog)
	response, _, err := service.Command(context.Background(), auth.User{ID: 1}, CommandInput{
		RunID: runs.active.ID, Command: gameRun.Command{Type: gameRun.ChooseNode, NodeID: "node"}, ExpectedVersion: 2, IdempotencyKey: "refresh-story-modifier",
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.Run.State.NarrativeModifier.BossVariant != "authentic" || response.Run.State.NarrativeModifier.RewardBias != "glitch" {
		t.Fatalf("refreshed narrative=%#v", response.Run.State.NarrativeModifier)
	}
	if !slices.Contains(response.Run.State.ChoiceTags, "event:kept-inside-run") || !slices.Contains(response.Run.State.ChoiceTags, "nana-contradictions") {
		t.Fatalf("refreshed choice tags=%v", response.Run.State.ChoiceTags)
	}
	if slices.Contains(response.Run.State.ChoiceTags, "nana-highlight") {
		t.Fatalf("superseded story tag survived refresh: %v", response.Run.State.ChoiceTags)
	}
}
