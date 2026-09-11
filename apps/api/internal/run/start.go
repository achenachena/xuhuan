package run

import (
	"crypto/rand"
	"encoding/hex"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	"sort"
	"time"
)

type CampaignStartInput struct {
	Mode           Mode
	ChapterSlug    string
	CharacterSlug  string
	CompanionSlug  string
	EncoreLevel    int
	IdempotencyKey string
}

// PrepareRun shares eligibility, seeds and initial state between server saves and
// browser-local campaigns. It does not authenticate players or persist anything.
func PrepareRun(progress progression.Progress, input CampaignStartInput, catalog *gamecontent.V4Catalog) (CreateInput, error) {
	mode := input.Mode
	if mode == "" {
		mode = CampaignMode
	}
	var dailyDate *string
	if mode == DailyMode {
		if !progress.DailyUnlocked {
			return CreateInput{}, ErrContentLocked
		}
		date := time.Now().UTC().Format("2006-01-02")
		dailyDate = &date
		rotation := catalog.Daily.RotationCharacters
		input.CharacterSlug = rotation[dayIndex(date)%len(rotation)]
		input.ChapterSlug = chapterForCharacter(catalog, input.CharacterSlug)
		input.EncoreLevel = 0
		input.CompanionSlug = ""
	} else if mode == CampaignMode {
		chapter, exists := catalog.Chapter(input.ChapterSlug)
		if !exists || !campaignChapterPlayable(progress, input.ChapterSlug) || !progression.HasUnlock(progress, progression.CharacterUnlock, input.CharacterSlug) {
			return CreateInput{}, ErrContentLocked
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
			return CreateInput{}, ErrContentLocked
		}
		if input.EncoreLevel < 0 || input.EncoreLevel > allowedEncore {
			return CreateInput{}, ErrContentLocked
		}
		if input.CompanionSlug != "" && !progression.HasUnlock(progress, progression.CompanionUnlock, input.CompanionSlug) {
			return CreateInput{}, ErrContentLocked
		}
	} else {
		return CreateInput{}, ErrInvalidCommand
	}
	seed := "xuhuan-daily:" + valueOrEmpty(dailyDate)
	if dailyDate == nil {
		var err error
		seed, err = newSeed()
		if err != nil {
			return CreateInput{}, err
		}
	}
	companions := []string{}
	if input.CompanionSlug != "" {
		companions = append(companions, input.CompanionSlug)
	}
	state, err := NewState(StartInput{
		ChapterSlug: input.ChapterSlug, CharacterSlug: input.CharacterSlug, EncoreLevel: input.EncoreLevel,
		Seed: seed, CompanionSlugs: companions, SelectedChoices: latestChoiceIDs(progress), Mode: mode, DailyDate: dailyDate,
	}, catalog)
	if err != nil {
		return CreateInput{}, err
	}
	request := StartRequest{Mode: mode, ChapterSlug: input.ChapterSlug, CharacterSlug: input.CharacterSlug, CompanionSlug: input.CompanionSlug, EncoreLevel: input.EncoreLevel, DailyDate: dailyDate}
	return CreateInput{
		ContentVersion: gamecontent.V4Version, Seed: seed, State: state,
		Request: request, Mode: mode, DailyDate: dailyDate,
	}, nil
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

func newSeed() (string, error) {
	// This value only seeds deterministic encounter randomness. It is neither a
	// credential nor a request fingerprint and is safe to persist with the Run.
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}
