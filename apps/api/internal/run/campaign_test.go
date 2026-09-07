package run

import (
	"fmt"
	"reflect"
	"slices"
	"testing"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func TestCampaignWeaponChoicesAlwaysChangeTheFiringShape(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	seen := make(map[string]bool)
	for sample := 0; sample < 128; sample++ {
		state := State{SegmentIndex: 0, ShowEffects: []string{}}
		seed := fmt.Sprintf("visible-weapon:%d", sample)
		options := stagedOptions(state, seed, catalog)
		if len(options) != 2 || options[0] == options[1] || !slices.Equal(options, stagedOptions(state, seed, catalog)) {
			t.Fatalf("seed %q did not yield a stable distinct pair: %v", seed, options)
		}
		for _, id := range options {
			effect, ok := catalog.ShowEffect(id)
			if !ok || !slices.Contains([]string{"twin_shot", "piercing_shot", "spread_shot"}, effect.Behavior) {
				t.Fatalf("first gate offered an invisible damage bonus: %#v", effect)
			}
			seen[id] = true
		}
	}
	if len(seen) != 3 {
		t.Fatalf("weapon pool=%v, want twin, pierce, and spread", seen)
	}
}

func TestSavedFirstGateStillAcceptsPreviouslyOfferedDamageEffects(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	for _, optionID := range []string{"headline-break", "still-live"} {
		t.Run(optionID, func(t *testing.T) {
			state, err := NewState(StartInput{ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Seed: "saved-gate", Mode: CampaignMode}, catalog)
			if err != nil {
				t.Fatal(err)
			}
			state.Phase, state.Segment = ShowChoicePhase, nil
			state.PendingShowOptions = []string{"headline-break", "still-live"}
			resolution, outcome, err := Apply(state, "saved-gate", CampaignMode, Command{Type: ChooseShowOption, OptionID: optionID}, catalog)
			if err != nil || outcome != nil || resolution.State.Phase != SegmentPhase || resolution.State.SegmentIndex != 1 || !slices.Contains(resolution.State.ShowEffects, optionID) {
				t.Fatalf("saved option %q failed: state=%#v outcome=%v err=%v", optionID, resolution.State, outcome, err)
			}
		})
	}
}

func TestEveryCampaignChapterChoiceAndEncoreCompletes(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	for _, chapter := range catalog.Chapters {
		for encore := 0; encore <= 3; encore++ {
			for storyOption := range chapter.Story.Intermission.Choices {
				name := fmt.Sprintf("%s/encore-%d/reply-%d", chapter.ID, encore, storyOption)
				t.Run(name, func(t *testing.T) {
					character := chapter.FeaturedCharacter
					if character == "player-choice" {
						character = catalog.Characters[encore%len(catalog.Characters)].ID
					}
					state, err := NewState(StartInput{ChapterSlug: chapter.ID, CharacterSlug: character, EncoreLevel: encore, Seed: name, Mode: CampaignMode}, catalog)
					if err != nil {
						t.Fatal(err)
					}
					for segment := 0; segment < 4; segment++ {
						if state.Phase != SegmentPhase || state.Segment == nil || state.SegmentIndex != segment || state.Hearts != 2 && segment > 0 {
							t.Fatalf("segment %d state=%#v", segment, state)
						}
						config := state.Segment.RuntimeConfig
						if config.Reversal != nil || config.Kit.MaxHealth != 3 || config.Kit.StartingShield > 1 || string(config.Kit.ID) != character || config.EncoreLevel != encore {
							t.Fatalf("campaign config unexpectedly replaced: %#v", config)
						}
						if segment == 3 && (config.Boss == nil || string(config.Boss.ID) != chapter.Boss.ID || len(config.Boss.Stages) != 3) {
							t.Fatalf("wrong chapter boss: %#v", config.Boss)
						}
						before := cloneState(state)
						resolution, outcome, err := Apply(state, name, CampaignMode, Command{Type: CompleteSegment, SegmentOutcome: successfulSegmentOutcome(2)}, catalog)
						if err != nil || !reflect.DeepEqual(state, before) {
							t.Fatalf("segment %d error=%v or input state mutated", segment, err)
						}
						state = resolution.State
						if segment == 3 {
							if chapter.ID == "zero-channel" {
								if outcome != nil || state.Phase != StoryPhase || state.Story == nil || len(state.Story.ChoiceIDs) != 3 {
									t.Fatalf("finale did not expose three endings: %#v", state)
								}
								for _, ending := range chapter.Endings {
									ended, result, err := Apply(state, name, CampaignMode, Command{Type: ChooseIntermissionReply, SceneID: state.Story.SceneID, OptionID: ending.ID}, catalog)
									if err != nil || result == nil || *result != Cleared || ended.State.Phase != CompletedPhase || ended.State.EndingID != ending.ID {
										t.Fatalf("ending %q state=%#v result=%v err=%v", ending.ID, ended.State, result, err)
									}
								}
							} else {
								if outcome == nil || *outcome != Cleared || state.Phase != CompletedPhase {
									t.Fatalf("chapter did not complete: %#v outcome=%v", state, outcome)
								}
								clear := slices.IndexFunc(resolution.Events, func(event Event) bool { return event.Kind == "chapter_cleared" })
								if clear < 0 || resolution.Events[clear].CompanionID != chapter.UnlockCompanion || resolution.Events[clear].NextChapterSlug != catalog.Chapters[chapter.Order].ID {
									t.Fatalf("chapter unlock event=%#v", resolution.Events)
								}
							}
							continue
						}
						if outcome != nil || state.Phase != ShowChoicePhase || len(state.PendingShowOptions) != 2 {
							t.Fatalf("missing gate after segment %d: %#v", segment, state)
						}
						selected := state.PendingShowOptions[(segment+storyOption)%2]
						resolution, outcome, err = Apply(state, name, CampaignMode, Command{Type: ChooseShowOption, OptionID: selected}, catalog)
						if err != nil || outcome != nil {
							t.Fatalf("gate %d selection failed: %v", segment, err)
						}
						state = resolution.State
						if segment == 1 {
							if state.Phase != StoryPhase || state.Story == nil || len(state.CompanionSlugs) != 1 {
								t.Fatalf("missing companion/intermission: %#v", state)
							}
							choice := chapter.Story.Intermission.Choices[storyOption]
							resolution, outcome, err = Apply(state, name, CampaignMode, Command{Type: ChooseIntermissionReply, SceneID: state.Story.SceneID, OptionID: choice.ID}, catalog)
							if err != nil || outcome != nil || !slices.Contains(resolution.State.SelectedChoiceIDs, choice.ID) {
								t.Fatalf("story choice %q failed: %v", choice.ID, err)
							}
							state = resolution.State
						}
					}
				})
			}
		}
	}
}

func TestDailyRotationCharactersCanFinishEveryAuthoredBoss(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	seenBosses := make(map[string]bool)
	for index, character := range catalog.Daily.RotationCharacters {
		chapterID := ""
		for _, chapter := range catalog.Chapters {
			if chapter.FeaturedCharacter == character {
				chapterID = chapter.ID
				break
			}
		}
		for sample := 0; sample < 24; sample++ {
			seed := fmt.Sprintf("daily-rotation:%d:%d", index, sample)
			state, err := NewState(StartInput{ChapterSlug: chapterID, CharacterSlug: character, Seed: seed, Mode: DailyMode}, catalog)
			if err != nil {
				t.Fatal(err)
			}
			resolution, _, err := Apply(state, seed, DailyMode, Command{Type: CompleteSegment, SegmentOutcome: successfulSegmentOutcome(2)}, catalog)
			if err != nil || len(resolution.State.PendingShowOptions) != 2 {
				t.Fatalf("daily wave/gate %q failed: %v", seed, err)
			}
			state = resolution.State
			resolution, _, err = Apply(state, seed, DailyMode, Command{Type: ChooseShowOption, OptionID: state.PendingShowOptions[sample%2]}, catalog)
			if err != nil || resolution.State.Segment == nil || resolution.State.Segment.RuntimeConfig.Boss == nil {
				t.Fatalf("daily boss start %q failed: %v", seed, err)
			}
			state = resolution.State
			seenBosses[state.Segment.BossID] = true
			resolution, outcome, err := Apply(state, seed, DailyMode, Command{Type: CompleteSegment, SegmentOutcome: successfulSegmentOutcome(1)}, catalog)
			if err != nil || outcome == nil || *outcome != Cleared || resolution.State.Phase != CompletedPhase || resolution.State.Story != nil || resolution.State.EndingID != "" {
				t.Fatalf("daily %q stuck at chapter story: %#v outcome=%v err=%v", seed, resolution.State, outcome, err)
			}
		}
	}
	if len(seenBosses) != len(catalog.Daily.BossIDs) {
		t.Fatalf("daily Boss coverage=%v, want every authored Boss", seenBosses)
	}
}
