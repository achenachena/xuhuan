package progression

import (
	"context"
	"errors"
	"time"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

var (
	ErrVersionConflict     = errors.New("progression: expected version conflict")
	ErrChoiceAlreadyMade   = errors.New("progression: story choice already made")
	ErrIdempotencyConflict = errors.New("progression: idempotency key reused with different request")
	ErrSceneNotPending     = errors.New("progression: story scene is not pending")
)

type Unlock struct {
	Type        string    `json:"type"`
	ContentSlug string    `json:"content_slug"`
	CreatedAt   time.Time `json:"created_at"`
}

type Choice struct {
	SceneSlug    string    `json:"scene_slug"`
	OptionSlug   string    `json:"option_slug"`
	ChoiceTag    string    `json:"choice_tag"`
	Revision     int       `json:"revision"`
	Trust        int       `json:"trust"`
	Authenticity int       `json:"authenticity"`
	Retention    int       `json:"retention"`
	CreatedAt    time.Time `json:"created_at"`
}

type ChapterProgress struct {
	ChapterSlug  string    `json:"chapter_slug"`
	HighestNoise int       `json:"highest_noise_level"`
	Clears       int       `json:"clears"`
	BestScore    int       `json:"best_score"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Progress struct {
	PlayerID       string            `json:"-"`
	CurrentChapter string            `json:"current_chapter_slug"`
	HighestNoise   int               `json:"highest_noise_level"`
	StoryVersion   int               `json:"story_version"`
	StoryFlags     map[string]bool   `json:"story_flags"`
	Version        int64             `json:"version"`
	Unlocks        []Unlock          `json:"unlocks"`
	Choices        []Choice          `json:"choices"`
	Chapters       []ChapterProgress `json:"chapters"`
	Trust          int               `json:"trust"`
	Authenticity   int               `json:"authenticity"`
	Retention      int               `json:"retention"`
	Ending         string            `json:"ending,omitempty"`
	DailyUnlocked  bool              `json:"daily_unlocked"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
}

type ChooseInput struct {
	PlayerID        string
	Scene           gamecontent.StoryScene
	Option          gamecontent.StoryOption
	ExpectedVersion int64
	IdempotencyKey  string
	RequestHash     [32]byte
}

type Repository interface {
	GetOrCreate(context.Context, string) (Progress, error)
	Choose(context.Context, ChooseInput) (Progress, bool, error)
}

func HasUnlock(progress Progress, unlockType, slug string) bool {
	for _, unlock := range progress.Unlocks {
		if unlock.Type == unlockType && unlock.ContentSlug == slug {
			return true
		}
	}
	return false
}
