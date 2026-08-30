package game

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"slices"
	"sort"
	"time"

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
	Progress     progression.Progress    `json:"progress"`
	CampaignRun  *gameRun.GameRun        `json:"campaign_run"`
	DailyRun     *gameRun.GameRun        `json:"daily_run"`
	DailyResult  *gameRun.DailyResult    `json:"daily_result"`
	PendingScene *gamecontent.StoryScene `json:"pending_scene"`
}

type StartInput struct {
	Mode           gameRun.Mode
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
	campaignRun, err := service.runs.GetActive(ctx, currentPlayer.ID, gameRun.CampaignMode)
	if err != nil {
		return Snapshot{}, err
	}
	dailyRun, err := service.runs.GetActive(ctx, currentPlayer.ID, gameRun.DailyMode)
	if err != nil {
		return Snapshot{}, err
	}
	dailyResult, err := service.runs.GetDailyResult(ctx, currentPlayer.ID, time.Now().UTC().Format("2006-01-02"))
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{
		Progress: currentProgress, CampaignRun: campaignRun, DailyRun: dailyRun, DailyResult: dailyResult,
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
	mode := input.Mode
	if mode == "" {
		mode = gameRun.CampaignMode
	}
	if mode != gameRun.CampaignMode && mode != gameRun.DailyMode {
		return gameRun.GameRun{}, false, gameRun.ErrInvalidCommand
	}
	if mode == gameRun.CampaignMode && story.PendingScene(currentProgress, service.catalog) != nil {
		return gameRun.GameRun{}, false, ErrStoryRequired
	}
	var dailyDate *string
	if mode == gameRun.DailyMode {
		if !currentProgress.DailyUnlocked {
			return gameRun.GameRun{}, false, gameRun.ErrContentLocked
		}
		now := time.Now().UTC()
		date := now.Format("2006-01-02")
		dailyDate = &date
		chapters := append([]gamecontent.Chapter(nil), service.catalog.Chapters...)
		sort.Slice(chapters, func(i, j int) bool { return chapters[i].Order < chapters[j].Order })
		playable := chapters[:min(7, len(chapters))]
		day := int(now.Unix() / 86400)
		chapter := playable[day%len(playable)]
		input.ChapterSlug, input.CharacterSlug, input.NoiseLevel = chapter.Slug, chapter.CharacterSlug, 0
	} else {
		allowedNoise := 0
		for _, chapter := range currentProgress.Chapters {
			if chapter.ChapterSlug == input.ChapterSlug {
				allowedNoise = chapter.HighestNoise
			}
		}
		if input.NoiseLevel < 0 || input.NoiseLevel > allowedNoise || !campaignChapterPlayable(currentProgress, input.ChapterSlug) || !progression.HasUnlock(currentProgress, "character", input.CharacterSlug) {
			return gameRun.GameRun{}, false, gameRun.ErrContentLocked
		}
	}
	var seed string
	if dailyDate != nil {
		seed = "xuhuan-daily:" + *dailyDate
	} else {
		seed, err = newSeed()
		if err != nil {
			return gameRun.GameRun{}, false, err
		}
	}
	companionSlugs, supportAlignment := finaleSupport(currentProgress, input.ChapterSlug, input.CharacterSlug, service.catalog)
	unlockedModules, unlockedPlugins := progression.RewardUnlocks(currentProgress, service.catalog, input.CharacterSlug)
	gameplayProjection := story.ProjectGameplay(currentProgress, service.catalog, input.ChapterSlug)
	state, err := gameRun.NewState(gameRun.StartInput{
		ChapterSlug: input.ChapterSlug, CharacterSlug: input.CharacterSlug,
		NoiseLevel: input.NoiseLevel, Seed: seed,
		EmergencyReconnectAvailable: !currentProgress.StoryFlags["emergency-reconnect-used"],
		TutorialCompleted:           currentProgress.StoryFlags["action-tutorial-completed"],
		CompanionSlugs:              companionSlugs,
		SupportAlignment:            supportAlignment,
		UnlockedModuleSlugs:         unlockedModules,
		UnlockedPluginSlugs:         unlockedPlugins,
		StarterModuleSlug:           progression.StarterModule(currentProgress, service.catalog, input.CharacterSlug),
		NarrativeModifier: gameRun.NarrativeModifier{
			RewardBias: gameplayProjection.RewardBias, BossVariant: gameplayProjection.BossVariant,
			SourceSceneSlug: gameplayProjection.SourceSceneSlug, SourceChoiceTag: gameplayProjection.SourceChoiceTag,
		},
		ChoiceTags: gameplayProjection.ChoiceTags,
		Mode:       mode, DailyDate: dailyDate,
	}, service.catalog)
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	hash, err := hashRequest(struct {
		Mode          gameRun.Mode `json:"mode"`
		ChapterSlug   string       `json:"chapter_slug"`
		CharacterSlug string       `json:"character_slug"`
		NoiseLevel    int          `json:"noise_level"`
		DailyDate     *string      `json:"daily_date,omitempty"`
	}{mode, input.ChapterSlug, input.CharacterSlug, input.NoiseLevel, dailyDate})
	if err != nil {
		return gameRun.GameRun{}, false, err
	}
	return service.runs.Create(ctx, gameRun.CreateInput{
		PlayerID: currentPlayer.ID, ContentVersion: gamecontent.CurrentVersion,
		Seed: seed, State: state, IdempotencyKey: input.IdempotencyKey, RequestHash: hash,
		Mode: mode, DailyDate: dailyDate,
	})
}

func finaleSupport(progress progression.Progress, chapterSlug, leadCharacter string, catalog *gamecontent.Catalog) ([]string, string) {
	chapter, ok := catalog.Chapter(chapterSlug)
	if !ok || !chapter.Finale {
		return nil, ""
	}
	companions := make([]string, 0, 6)
	for _, character := range catalog.Characters {
		if character.Slug != leadCharacter && progression.HasUnlock(progress, "character", character.Slug) {
			companions = append(companions, character.Slug)
		}
	}
	return companions, story.Ending(progress)
}

func campaignChapterPlayable(progress progression.Progress, slug string) bool {
	if slug == progress.CurrentChapter {
		return true
	}
	for _, chapter := range progress.Chapters {
		if chapter.ChapterSlug == slug && chapter.Clears > 0 {
			return true
		}
	}
	return false
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
	var gameplayProjection *story.GameplayProjection
	if input.Command.Type != gameRun.AbandonRun {
		// Only gate a command that has not already advanced the Run. A retry of
		// the command which created the pending scene must still reach the Run
		// repository so its idempotent response can be replayed.
		currentRun, getErr := service.runs.Get(ctx, currentPlayer.ID, input.RunID)
		if getErr != nil {
			return gameRun.CommandResponse{}, false, getErr
		}
		if currentRun.Version == input.ExpectedVersion {
			currentProgress, progressErr := service.progress.GetOrCreate(ctx, currentPlayer.ID)
			if progressErr != nil {
				return gameRun.CommandResponse{}, false, progressErr
			}
			if story.PendingScene(currentProgress, service.catalog) != nil {
				return gameRun.CommandResponse{}, false, ErrStoryRequired
			}
			projected := story.ProjectGameplay(currentProgress, service.catalog, currentRun.State.ChapterSlug)
			gameplayProjection = &projected
		}
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
		if gameplayProjection != nil {
			current.State.NarrativeModifier = gameRun.NarrativeModifier{
				RewardBias: gameplayProjection.RewardBias, BossVariant: gameplayProjection.BossVariant,
				SourceSceneSlug: gameplayProjection.SourceSceneSlug, SourceChoiceTag: gameplayProjection.SourceChoiceTag,
			}
			current.State.ChoiceTags = mergeRunChoiceTags(current.State.ChoiceTags, gameplayProjection.ChoiceTags, catalog)
		}
		return gameRun.Apply(current.State, current.Seed, command, catalog)
	})
}

// mergeRunChoiceTags refreshes the persisted story projection without
// discarding choices made at in-Run events. Superseded story revisions must
// not leak into the snapshot because they would make replayed branches appear
// simultaneously active.
func mergeRunChoiceTags(current, projected []string, catalog *gamecontent.Catalog) []string {
	authoredStoryTags := make(map[string]struct{})
	for _, scene := range catalog.Scenes {
		for _, option := range scene.Options {
			authoredStoryTags[option.Tag] = struct{}{}
		}
	}
	merged := make([]string, 0, len(current)+len(projected))
	for _, tag := range current {
		if _, isStoryTag := authoredStoryTags[tag]; tag != "" && !isStoryTag {
			merged = append(merged, tag)
		}
	}
	merged = append(merged, projected...)
	sort.Strings(merged)
	return slices.Compact(merged)
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
	latestRevision := 0
	for _, choice := range currentProgress.Choices {
		if choice.SceneSlug == input.SceneSlug && choice.Revision > latestRevision {
			latestRevision = choice.Revision
		}
	}
	pendingMatches := pending != nil && pending.Slug == input.SceneSlug
	if !pendingMatches && (latestRevision == 0 || input.ExpectedVersion == currentProgress.Version) {
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
	// Idempotency keys are safe to retry only when the same key still names the
	// same command. Persisting this fixed-size fingerprint lets repositories
	// reject accidental key reuse without storing another copy of request data.
	encoded, err := json.Marshal(value)
	if err != nil {
		return [sha256.Size]byte{}, err
	}
	return sha256.Sum256(encoded), nil
}
