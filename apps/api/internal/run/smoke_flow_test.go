//go:build smoke

package run

import (
	"testing"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/shooter"
)

// This follows the same first-option journey as production-smoke.mjs while
// deriving every segment trace from the private Go authority.
func TestReleaseSmokeAutoplayClearsCampaignAndDaily(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	selectedChoices := []string{}
	for _, chapter := range catalog.Chapters {
		characterID := chapter.FeaturedCharacter
		if characterID == "player-choice" {
			characterID = "nana7mi"
		}
		companionSlugs := []string{}
		if chapter.ID == "zero-channel" {
			// Production reaches the finale after all chapter unlocks. Exercise the
			// optional replay companion on the exact release-smoke path as well.
			companionSlugs = []string{"xingtong-assist"}
		}
		state, err := NewState(StartInput{
			ChapterSlug: chapter.ID, CharacterSlug: characterID,
			Seed: "release-smoke:" + chapter.ID, SelectedChoices: selectedChoices,
			Mode: CampaignMode, CompanionSlugs: companionSlugs,
		}, catalog)
		if err != nil {
			t.Fatalf("start %s: %v", chapter.ID, err)
		}
		state, outcome := driveAuthoritySmokeRun(t, state, "release-smoke:"+chapter.ID, CampaignMode, catalog)
		if outcome == nil || *outcome != Cleared {
			t.Fatalf("campaign %s outcome=%v", chapter.ID, outcome)
		}
		selectedChoices = append([]string{}, state.SelectedChoiceIDs...)
	}

	for _, characterID := range catalog.Daily.RotationCharacters {
		chapterID := ""
		for _, chapter := range catalog.Chapters {
			if chapter.FeaturedCharacter == characterID {
				chapterID = chapter.ID
				break
			}
		}
		if chapterID == "" {
			t.Fatalf("daily character %s has no chapter", characterID)
		}
		seed := "xuhuan-daily:smoke:" + characterID
		state, err := NewState(StartInput{
			ChapterSlug: chapterID, CharacterSlug: characterID,
			Seed: seed, SelectedChoices: selectedChoices, Mode: DailyMode,
		}, catalog)
		if err != nil {
			t.Fatalf("start daily %s: %v", characterID, err)
		}
		_, outcome := driveAuthoritySmokeRun(t, state, seed, DailyMode, catalog)
		if outcome == nil || *outcome != Cleared {
			t.Fatalf("daily %s outcome=%v", characterID, outcome)
		}
	}
}

func driveAuthoritySmokeRun(t *testing.T, state State, seed string, mode Mode, catalog *gamecontent.V4Catalog) (State, *Outcome) {
	t.Helper()
	var outcome *Outcome
	for step := 0; step < 24 && outcome == nil; step++ {
		var command Command
		switch state.Phase {
		case SegmentPhase:
			trace, err := shooter.BuildSmokeTrace(state.Segment.RuntimeConfig)
			if err != nil {
				bossID := shooter.BossID("")
				if state.Segment.RuntimeConfig.Boss != nil {
					bossID = state.Segment.RuntimeConfig.Boss.ID
				}
				t.Fatalf("%s segment %d boss=%s effects=%v companions=%v choice=%q trace: %v", state.ChapterSlug, state.SegmentIndex+1, bossID, state.ShowEffects, state.CompanionSlugs, state.Segment.RuntimeConfig.StoryChoiceID, err)
			}
			command = Command{Type: CompleteSegment, Trace: &trace}
		case ShowChoicePhase:
			if len(state.PendingShowOptions) != 2 {
				t.Fatalf("%s gate options=%v", state.ChapterSlug, state.PendingShowOptions)
			}
			command = Command{Type: ChooseShowOption, OptionID: smokePreferredOption(state.PendingShowOptions, smokeShowPreference)}
		case StoryPhase:
			if state.Story == nil || len(state.Story.ChoiceIDs) < 2 {
				t.Fatalf("%s story=%#v", state.ChapterSlug, state.Story)
			}
			command = Command{Type: ChooseIntermissionReply, SceneID: state.Story.SceneID, OptionID: smokePreferredOption(state.Story.ChoiceIDs, smokeStoryPreference)}
		default:
			t.Fatalf("%s unexpected phase %s", state.ChapterSlug, state.Phase)
		}
		resolution, nextOutcome, err := Apply(state, seed, mode, command, catalog)
		if err != nil {
			t.Fatalf("%s phase %s: %v", state.ChapterSlug, state.Phase, err)
		}
		state, outcome = resolution.State, nextOutcome
	}
	return state, outcome
}

var smokeShowPreference = []string{
	"double-take", "headline-break", "wide-angle", "clean-cut",
	"xingtong-assist", "xiangwan-assist", "nana7mi-assist", "bella-assist", "lulu-assist",
	"safety-chat", "snack-drop", "cohost-cue", "instant-replay", "no-dead-air",
	"sticky-comment", "close-call", "still-live", "jiaran-assist", "nailu-assist",
}

var smokeStoryPreference = []string{
	"delete-learned-reply", "join-encore-with-consent", "mark-missing-loss",
	"share-one-overnight", "post-caption-correction", "keep-both-rooms",
	"recreate-photo-later", "publish-seven-approved-notes",
	"open-archive", "shared-cut", "quiet-signoff",
}

func smokePreferredOption(available, preference []string) string {
	for _, preferred := range preference {
		for _, option := range available {
			if option == preferred {
				return option
			}
		}
	}
	return available[0]
}
