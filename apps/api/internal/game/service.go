package game

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"slices"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
	"github.com/achenachena/xuhuan/apps/api/internal/story"
)

var ErrStoryRequired = errors.New("game: a pending story scene must be resolved")

type PlayerService interface {
	GetOrCreate(context.Context, auth.User) (player.Player, error)
}

type Snapshot struct {
	Player       player.Player           `json:"-"`
	Progress     progression.Progress    `json:"progress"`
	ActiveRun    *gameRun.GameRun        `json:"active_run"`
	PendingScene *gamecontent.StoryScene `json:"pending_scene"`
}

type StartInput struct {
	ChapterSlug    string
	CharacterSlug  string
	NoiseLevel     int
	IdempotencyKey string
}

type CommandInput struct {
	RunID           string
	Command         gameRun.Command
	ExpectedVersion int64
	IdempotencyKey  string
}

type StoryChoiceInput struct {
	SceneSlug       string
	OptionSlug      string
	ExpectedVersion int64
	IdempotencyKey  string
}

type Service struct {
	players  PlayerService
	progress progression.Repository
	runs     gameRun.Repository
	catalog  *gamecontent.Catalog
}

func NewService(players PlayerService, progress progression.Repository, runs gameRun.Repository, catalog *gamecontent.Catalog) *Service {
	return &Service{players: players, progress: progress, runs: runs, catalog: catalog}
}

func (service *Service) Catalog() *gamecontent.Catalog {
	return service.catalog
}

func (service *Service) Get(ctx context.Context, user auth.User) (Snapshot, error) {
	currentPlayer, err := service.players.GetOrCreate(ctx, user)
	if err != nil {
		return Snapshot{}, err
	}
	currentProgress, err := service.progress.GetOrCreate(ctx, currentPlayer.ID)
	if err != nil {
		return Snapshot{}, err
	}
	activeRun, err := service.runs.GetActive(ctx, currentPlayer.ID)
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{
		Player: currentPlayer, Progress: currentProgress, ActiveRun: activeRun,
		PendingScene: story.PendingScene(currentProgress, service.catalog),
	}, nil
}

func (service *Service) Start(ctx context.Context, user auth.User, input StartInput) (gameRun.GameRun, bool, error) {
	if input.IdempotencyKey == "" {
		return gameRun.GameRun{}, false, gameRun.ErrInvalidCommand
	}
	currentPlayer, err := service.players.GetOrCreate(ctx, user)
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	currentProgress, err := service.progress.GetOrCreate(ctx, currentPlayer.ID)
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	if story.PendingScene(currentProgress, service.catalog) != nil {
		return gameRun.GameRun{}, false, ErrStoryRequired
	}
	if input.NoiseLevel < 0 || input.NoiseLevel > currentProgress.HighestNoise ||
		!progression.HasUnlock(currentProgress, "character", input.CharacterSlug) {
		return gameRun.GameRun{}, false, gameRun.ErrContentLocked
	}
	seed, err := newSeed()
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	state, err := gameRun.NewState(gameRun.StartInput{
		ChapterSlug: input.ChapterSlug, CharacterSlug: input.CharacterSlug,
		NoiseLevel: input.NoiseLevel, Seed: seed,
		EmergencyReconnectAvailable: !currentProgress.StoryFlags["emergency-reconnect-used"],
	}, service.catalog)
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	hash, err := hashRequest(struct {
		ChapterSlug   string `json:"chapter_slug"`
		CharacterSlug string `json:"character_slug"`
		NoiseLevel    int    `json:"noise_level"`
	}{input.ChapterSlug, input.CharacterSlug, input.NoiseLevel})
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	return service.runs.Create(ctx, gameRun.CreateInput{
		PlayerID: currentPlayer.ID, ContentVersion: gamecontent.CurrentVersion,
		Seed: seed, State: state, IdempotencyKey: input.IdempotencyKey, RequestHash: hash,
	})
}

func (service *Service) GetRun(ctx context.Context, user auth.User, runID string) (gameRun.GameRun, error) {
	currentPlayer, err := service.players.GetOrCreate(ctx, user)
	if err != nil {
		return gameRun.GameRun{}, err
	}
	return service.runs.Get(ctx, currentPlayer.ID, runID)
}

func (service *Service) Command(ctx context.Context, user auth.User, input CommandInput) (gameRun.CommandResponse, bool, error) {
	if input.RunID == "" || input.ExpectedVersion < 1 || input.IdempotencyKey == "" {
		return gameRun.CommandResponse{}, false, gameRun.ErrInvalidCommand
	}
	currentPlayer, err := service.players.GetOrCreate(ctx, user)
	if err != nil {
		return gameRun.CommandResponse{}, false, err
	}
	hash, err := hashRequest(struct {
		Command         gameRun.Command `json:"command"`
		ExpectedVersion int64           `json:"expected_version"`
	}{input.Command, input.ExpectedVersion})
	if err != nil {
		return gameRun.CommandResponse{}, false, err
	}
	return service.runs.Apply(ctx, gameRun.ApplyInput{
		PlayerID: currentPlayer.ID, RunID: input.RunID, Command: input.Command,
		ExpectedVersion: input.ExpectedVersion, IdempotencyKey: input.IdempotencyKey, RequestHash: hash,
	}, func(current gameRun.GameRun, command gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		catalog, err := gamecontent.Load(current.ContentVersion)
		if err != nil {
			return gameRun.Resolution{}, nil, err
		}
		return gameRun.Apply(current.State, current.Seed, command, catalog)
	})
}

func (service *Service) ChooseStory(ctx context.Context, user auth.User, input StoryChoiceInput) (progression.Progress, bool, error) {
	if input.ExpectedVersion < 1 || input.IdempotencyKey == "" {
		return progression.Progress{}, false, gameRun.ErrInvalidCommand
	}
	currentPlayer, err := service.players.GetOrCreate(ctx, user)
	if err != nil {
		return progression.Progress{}, false, err
	}
	currentProgress, err := service.progress.GetOrCreate(ctx, currentPlayer.ID)
	if err != nil {
		return progression.Progress{}, false, err
	}
	scene, sceneExists := service.catalog.Scene(input.SceneSlug)
	if !sceneExists {
		return progression.Progress{}, false, progression.ErrSceneNotPending
	}
	pending := story.PendingScene(currentProgress, service.catalog)
	alreadyChosen := slices.ContainsFunc(currentProgress.Choices, func(choice progression.Choice) bool {
		return choice.SceneSlug == input.SceneSlug
	})
	if !alreadyChosen && (pending == nil || pending.Slug != input.SceneSlug) {
		return progression.Progress{}, false, progression.ErrSceneNotPending
	}
	optionIndex := slices.IndexFunc(scene.Options, func(option gamecontent.StoryOption) bool { return option.Slug == input.OptionSlug })
	if optionIndex < 0 {
		return progression.Progress{}, false, gameRun.ErrInvalidCommand
	}
	option := scene.Options[optionIndex]
	hash, err := hashRequest(struct {
		SceneSlug       string `json:"scene_slug"`
		OptionSlug      string `json:"option_slug"`
		ExpectedVersion int64  `json:"expected_version"`
	}{input.SceneSlug, input.OptionSlug, input.ExpectedVersion})
	if err != nil {
		return progression.Progress{}, false, err
	}
	return service.progress.Choose(ctx, progression.ChooseInput{
		PlayerID: currentPlayer.ID, Scene: scene, Option: option,
		ExpectedVersion: input.ExpectedVersion, IdempotencyKey: input.IdempotencyKey, RequestHash: hash,
	})
}

func newSeed() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func hashRequest(value any) ([sha256.Size]byte, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return [sha256.Size]byte{}, err
	}
	return sha256.Sum256(encoded), nil
}
