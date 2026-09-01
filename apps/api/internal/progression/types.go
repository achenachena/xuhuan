package progression

import (
	"context"
	"errors"
	"time"
)

var (
	ErrVersionConflict     = errors.New("progression: expected version conflict")
	ErrIdempotencyConflict = errors.New("progression: idempotency key reused with different request")
	ErrSceneNotFound       = errors.New("progression: story scene or option was not found")
)

type Unlock struct {
	Type        string    `json:"type"`
	ContentSlug string    `json:"content_slug"`
	CreatedAt   time.Time `json:"created_at"`
}

type Choice struct {
	SceneSlug  string    `json:"scene_slug"`
	OptionSlug string    `json:"option_slug"`
	ChoiceTag  string    `json:"choice_tag"`
	Revision   int       `json:"revision"`
	CreatedAt  time.Time `json:"created_at"`
}

type ChapterProgress struct {
	ChapterSlug   string    `json:"chapter_slug"`
	HighestEncore int       `json:"highest_encore_level"`
	Clears        int       `json:"clears"`
	BestScore     int       `json:"best_score"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type Progress struct {
	PlayerID       string            `json:"-"`
	CurrentChapter string            `json:"current_chapter_slug"`
	StoryVersion   int               `json:"story_version"`
	StoryFlags     map[string]bool   `json:"story_flags"`
	Version        int64             `json:"version"`
	Unlocks        []Unlock          `json:"unlocks"`
	Choices        []Choice          `json:"choices"`
	Chapters       []ChapterProgress `json:"chapters"`
	Ending         string            `json:"ending,omitempty"`
	DailyUnlocked  bool              `json:"daily_unlocked"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
}

type ChooseInput struct {
	PlayerID        string
	SceneSlug       string
	OptionSlug      string
	ChoiceTag       string
	EndingID        string
	ExpectedVersion int64
	IdempotencyKey  string
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
