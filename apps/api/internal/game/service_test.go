package game

import (
	"bytes"
	"context"
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
	repository.progress.Choices = append(repository.progress.Choices, progression.Choice{
		SceneSlug: input.Scene.Slug, OptionSlug: input.Option.Slug, ChoiceTag: input.Option.Tag,
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
func (unusedRunRepository) GetActive(context.Context, string) (*gameRun.GameRun, error) {
	panic("unexpected GetActive call")
}
func (unusedRunRepository) Apply(context.Context, gameRun.ApplyInput, gameRun.Resolver) (gameRun.CommandResponse, bool, error) {
	panic("unexpected Apply call")
}

func TestChooseStoryReplaysAfterPendingSceneAdvances(t *testing.T) {
	repository := &replayingProgressRepository{progress: progression.Progress{
		PlayerID: "00000000-0000-0000-0000-000000000001", StoryFlags: map[string]bool{}, Version: 1,
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
