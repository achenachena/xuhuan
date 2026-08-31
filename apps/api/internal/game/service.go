package game

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sort"
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

type StartInput struct {
	Mode           gameRun.Mode
	ChapterSlug    string
	CharacterSlug  string
	CompanionSlug  string
	EncoreLevel    int
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
	mode := input.Mode
	if mode == "" {
		mode = gameRun.CampaignMode
	}
	var dailyDate *string
	if mode == gameRun.DailyMode {
		if !progress.DailyUnlocked {
			return gameRun.GameRun{}, false, gameRun.ErrContentLocked
		}
		date := time.Now().UTC().Format("2006-01-02")
		dailyDate = &date
		rotation := service.catalog.Daily.RotationCharacters
		input.CharacterSlug = rotation[dayIndex(date)%len(rotation)]
		input.ChapterSlug = chapterForCharacter(service.catalog, input.CharacterSlug)
		input.EncoreLevel = 0
		input.CompanionSlug = ""
	} else if mode == gameRun.CampaignMode {
		chapter, exists := service.catalog.Chapter(input.ChapterSlug)
		if !exists || !campaignChapterPlayable(progress, input.ChapterSlug) || !progression.HasUnlock(progress, progression.CharacterUnlock, input.CharacterSlug) {
			return gameRun.GameRun{}, false, gameRun.ErrContentLocked
		}
		allowedEncore := 0
		clears := 0
		for _, item := range progress.Chapters {
			if item.ChapterSlug == input.ChapterSlug {
				allowedEncore = item.HighestEncore
				clears = item.Clears
			}
		}
		if chapter.ID != "zero-channel" && clears == 0 && chapter.FeaturedCharacter != input.CharacterSlug {
			return gameRun.GameRun{}, false, gameRun.ErrContentLocked
		}
		if input.EncoreLevel < 0 || input.EncoreLevel > allowedEncore {
			return gameRun.GameRun{}, false, gameRun.ErrContentLocked
		}
		if input.CompanionSlug != "" && !progression.HasUnlock(progress, progression.CompanionUnlock, input.CompanionSlug) {
			return gameRun.GameRun{}, false, gameRun.ErrContentLocked
		}
	} else {
		return gameRun.GameRun{}, false, gameRun.ErrInvalidCommand
	}
	seed := "xuhuan-daily:" + valueOrEmpty(dailyDate)
	if dailyDate == nil {
		seed, err = newSeed()
		if err != nil {
			return gameRun.GameRun{}, false, err
		}
	}
	companions := []string{}
	if input.CompanionSlug != "" {
		companions = append(companions, input.CompanionSlug)
	}
	state, err := gameRun.NewState(gameRun.StartInput{
		ChapterSlug: input.ChapterSlug, CharacterSlug: input.CharacterSlug, EncoreLevel: input.EncoreLevel,
		Seed: seed, CompanionSlugs: companions, SelectedChoices: latestChoiceIDs(progress), Mode: mode, DailyDate: dailyDate,
	}, service.catalog)
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	request := gameRun.StartRequest{Mode: mode, ChapterSlug: input.ChapterSlug, CharacterSlug: input.CharacterSlug, CompanionSlug: input.CompanionSlug, EncoreLevel: input.EncoreLevel, DailyDate: dailyDate}
	return service.runs.Create(ctx, gameRun.CreateInput{
		PlayerID: currentPlayer.ID, ContentVersion: gamecontent.V4Version, Seed: seed, State: state,
		IdempotencyKey: input.IdempotencyKey, Request: request, Mode: mode, DailyDate: dailyDate,
	})
}

func campaignChapterPlayable(progress progression.Progress, slug string) bool {
	for _, chapter := range progress.Chapters {
		if chapter.ChapterSlug == slug {
			return true
		}
	}
	return false
}

func latestChoiceIDs(progress progression.Progress) []string {
	latest := make(map[string]progression.Choice)
	for _, choice := range progress.Choices {
		if stored, ok := latest[choice.SceneSlug]; !ok || choice.Revision > stored.Revision {
			latest[choice.SceneSlug] = choice
		}
	}
	result := make([]string, 0, len(latest))
	for _, choice := range latest {
		result = append(result, choice.OptionSlug)
	}
	sort.Strings(result)
	return result
}

func chapterForCharacter(catalog *gamecontent.V4Catalog, character string) string {
	for _, chapter := range catalog.Chapters {
		if chapter.FeaturedCharacter == character {
			return chapter.ID
		}
	}
	return "seventh-dock"
}

func dayIndex(date string) int {
	parsed, err := time.Parse("2006-01-02", date)
	if err != nil {
		return 0
	}
	return int(parsed.Unix() / 86400)
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
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

func newSeed() (string, error) {
	// This value only seeds deterministic encounter randomness. It is neither a
	// credential nor a request fingerprint and is safe to persist with the Run.
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}
