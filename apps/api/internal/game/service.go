package game

import (
	"context"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
)

type PlayerService interface {
	GetOrCreate(context.Context, auth.User) (player.Player, error)
}

type Snapshot struct {
	Progress    progression.Progress `json:"progress"`
	CampaignRun *gameRun.GameRun     `json:"campaign_run"`
	DailyRun    *gameRun.GameRun     `json:"daily_run"`
	DailyResult *gameRun.DailyResult `json:"daily_result"`
}

type StartInput = gameRun.CampaignStartInput

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
	catalog  *gamecontent.V4Catalog
}

func NewService(players PlayerService, progress progression.Repository, runs gameRun.Repository, catalog *gamecontent.V4Catalog) *Service {
	return &Service{players: players, progress: progress, runs: runs, catalog: catalog}
}

func (service *Service) Catalog() *gamecontent.V4Catalog { return service.catalog }

func (service *Service) Get(ctx context.Context, user auth.User) (Snapshot, error) {
	currentPlayer, err := service.players.GetOrCreate(ctx, user)
	if err != nil {
		return Snapshot{}, err
	}
	currentProgress, err := service.progress.GetOrCreate(ctx, currentPlayer.ID)
	if err != nil {
		return Snapshot{}, err
	}
	campaign, err := service.runs.GetActive(ctx, currentPlayer.ID, gameRun.CampaignMode)
	if err != nil {
		return Snapshot{}, err
	}
	daily, err := service.runs.GetActive(ctx, currentPlayer.ID, gameRun.DailyMode)
	if err != nil {
		return Snapshot{}, err
	}
	dailyResult, err := service.runs.GetDailyResult(ctx, currentPlayer.ID, time.Now().UTC().Format("2006-01-02"))
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{Progress: currentProgress, CampaignRun: campaign, DailyRun: daily, DailyResult: dailyResult}, nil
}

func (service *Service) Start(ctx context.Context, user auth.User, input StartInput) (gameRun.GameRun, bool, error) {
	if input.IdempotencyKey == "" {
		return gameRun.GameRun{}, false, gameRun.ErrInvalidCommand
	}
	currentPlayer, err := service.players.GetOrCreate(ctx, user)
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	progress, err := service.progress.GetOrCreate(ctx, currentPlayer.ID)
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	prepared, err := gameRun.PrepareRun(progress, input, service.catalog)
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	prepared.PlayerID = currentPlayer.ID
	prepared.IdempotencyKey = input.IdempotencyKey
	return service.runs.Create(ctx, prepared)
}

func (service *Service) GetRun(ctx context.Context, user auth.User, runID string) (gameRun.GameRun, error) {
	currentPlayer, err := service.players.GetOrCreate(ctx, user)
	if err != nil {
		return gameRun.GameRun{}, err
	}
	return service.runs.Get(ctx, currentPlayer.ID, runID)
}

func (service *Service) GetPublicDailyResult(ctx context.Context, runID string) (gameRun.DailyResult, error) {
	return service.runs.GetPublicDailyResult(ctx, runID)
}

func (service *Service) Command(ctx context.Context, user auth.User, input CommandInput) (gameRun.CommandResponse, bool, error) {
	if input.RunID == "" || input.ExpectedVersion < 1 || input.IdempotencyKey == "" {
		return gameRun.CommandResponse{}, false, gameRun.ErrInvalidCommand
	}
	currentPlayer, err := service.players.GetOrCreate(ctx, user)
	if err != nil {
		return gameRun.CommandResponse{}, false, err
	}
	return service.runs.Apply(ctx, gameRun.ApplyInput{PlayerID: currentPlayer.ID, RunID: input.RunID, Command: input.Command, ExpectedVersion: input.ExpectedVersion, IdempotencyKey: input.IdempotencyKey}, func(current gameRun.GameRun, command gameRun.Command) (gameRun.Resolution, *gameRun.Outcome, error) {
		if current.ContentVersion != gamecontent.V4Version {
			return gameRun.Resolution{}, nil, gameRun.ErrContentLocked
		}
		return gameRun.Apply(current.State, current.Seed, current.Mode, command, service.catalog)
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
	choiceTag, endingID, chapterSlug, ok := service.storyOption(input.SceneSlug, input.OptionSlug)
	if !ok {
		return progression.Progress{}, false, progression.ErrSceneNotFound
	}
	currentProgress, err := service.progress.GetOrCreate(ctx, currentPlayer.ID)
	if err != nil {
		return progression.Progress{}, false, err
	}
	cleared := false
	for _, chapter := range currentProgress.Chapters {
		cleared = cleared || chapter.ChapterSlug == chapterSlug && chapter.Clears > 0
	}
	if !cleared {
		return progression.Progress{}, false, gameRun.ErrContentLocked
	}
	return service.progress.Choose(ctx, progression.ChooseInput{PlayerID: currentPlayer.ID, SceneSlug: input.SceneSlug, OptionSlug: input.OptionSlug, ChoiceTag: choiceTag, EndingID: endingID, ExpectedVersion: input.ExpectedVersion, IdempotencyKey: input.IdempotencyKey})
}

func (service *Service) storyOption(sceneSlug, optionSlug string) (string, string, string, bool) {
	for _, chapter := range service.catalog.Chapters {
		if sceneSlug == chapter.ID+"-intermission" {
			for _, option := range chapter.Story.Intermission.Choices {
				if option.ID == optionSlug {
					return option.Tag, "", chapter.ID, true
				}
			}
		}
		if chapter.ID == "zero-channel" && sceneSlug == "zero-channel-ending" {
			for _, ending := range chapter.Endings {
				if ending.ID == optionSlug {
					return ending.ID, ending.ID, chapter.ID, true
				}
			}
		}
	}
	return "", "", "", false
}
