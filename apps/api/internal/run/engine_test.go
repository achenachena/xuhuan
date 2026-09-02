package run

import (
	"errors"
	"slices"
	"testing"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/shooter"
)

func TestCampaignFlowUsesThreeGatesIntermissionAndExplicitBossClear(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	state, err := NewState(StartInput{ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Seed: "campaign-flow-seed", Mode: CampaignMode}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	seed := "campaign-flow-seed"
	showChoices := 0

	for segmentIndex := 0; segmentIndex < 3; segmentIndex++ {
		resolution, outcome, err := Apply(state, seed, CampaignMode, Command{Type: CompleteSegment, SegmentOutcome: successfulSegmentOutcome(state.Hearts)}, catalog)
		if err != nil || outcome != nil || resolution.State.Phase != ShowChoicePhase || len(resolution.State.PendingShowOptions) != 2 {
			t.Fatalf("segment %d completion state=%#v outcome=%v err=%v", segmentIndex, resolution.State, outcome, err)
		}
		state = resolution.State
		showChoices++
		option := state.PendingShowOptions[0]
		resolution, outcome, err = Apply(state, seed, CampaignMode, Command{Type: ChooseShowOption, OptionID: option}, catalog)
		if err != nil || outcome != nil {
			t.Fatalf("segment %d show choice outcome=%v err=%v", segmentIndex, outcome, err)
		}
		state = resolution.State
		if segmentIndex == 1 {
			if state.Phase != StoryPhase || state.Story == nil || len(state.Story.ChoiceIDs) != 2 {
				t.Fatalf("intermission state=%#v", state)
			}
			resolution, outcome, err = Apply(state, seed, CampaignMode, Command{Type: ChooseIntermissionReply, SceneID: state.Story.SceneID, OptionID: state.Story.ChoiceIDs[0]}, catalog)
			if err != nil || outcome != nil || resolution.State.Phase != SegmentPhase || resolution.State.SegmentIndex != 2 {
				t.Fatalf("intermission resolution=%#v outcome=%v err=%v", resolution, outcome, err)
			}
			state = resolution.State
		}
	}

	if showChoices != 3 || state.Phase != SegmentPhase || state.SegmentIndex != 3 || state.Segment == nil || state.Segment.BossID != "optimal-nana" {
		t.Fatalf("boss gate state=%#v show_choices=%d", state, showChoices)
	}
	resolution, outcome, err := Apply(state, seed, CampaignMode, Command{Type: CompleteSegment, SegmentOutcome: successfulSegmentOutcome(state.Hearts)}, catalog)
	if err != nil || outcome == nil || *outcome != Cleared || resolution.State.Phase != CompletedPhase || !slices.ContainsFunc(resolution.Events, func(event Event) bool { return event.Kind == "chapter_cleared" }) {
		t.Fatalf("boss resolution=%#v outcome=%v err=%v", resolution, outcome, err)
	}
}

func TestDailyIsOneSegmentOneShowChoiceThenBoss(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	state, err := NewState(StartInput{ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Seed: "daily-flow-seed", Mode: DailyMode}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if state.Segment == nil || state.Segment.DurationTicks != catalog.Daily.SegmentDurationTicks || state.Segment.RuntimeConfig.DurationTicks != catalog.Daily.SegmentDurationTicks {
		t.Fatalf("daily act duration=%#v, want %d ticks", state.Segment, catalog.Daily.SegmentDurationTicks)
	}
	resolution, outcome, err := Apply(state, "daily-flow-seed", DailyMode, Command{Type: CompleteSegment, SegmentOutcome: successfulSegmentOutcome(state.Hearts)}, catalog)
	if err != nil || outcome != nil || resolution.State.Phase != ShowChoicePhase {
		t.Fatalf("daily segment resolution=%#v outcome=%v err=%v", resolution, outcome, err)
	}
	state = resolution.State
	resolution, outcome, err = Apply(state, "daily-flow-seed", DailyMode, Command{Type: ChooseShowOption, OptionID: state.PendingShowOptions[0]}, catalog)
	if err != nil || outcome != nil || resolution.State.SegmentIndex != 1 || resolution.State.Segment == nil || resolution.State.Segment.BossID == "" {
		t.Fatalf("daily gate resolution=%#v outcome=%v err=%v", resolution, outcome, err)
	}
	state = resolution.State
	boss, ok := catalog.Boss(state.Segment.BossID)
	if !ok || state.Segment.DurationTicks != boss.DurationTicks || state.Segment.RuntimeConfig.DurationTicks != boss.DurationTicks || boss.DurationTicks != 1800 {
		t.Fatalf("daily Boss duration=%#v boss=%#v, want authored 1800 ticks", state.Segment, boss)
	}
	resolution, outcome, err = Apply(state, "daily-flow-seed", DailyMode, Command{Type: CompleteSegment, SegmentOutcome: successfulSegmentOutcome(state.Hearts)}, catalog)
	if err != nil || outcome == nil || *outcome != Cleared || resolution.State.Phase != CompletedPhase {
		t.Fatalf("daily boss resolution=%#v outcome=%v err=%v", resolution, outcome, err)
	}
}

func TestCompleteSegmentValidatesBoundedOutcomeAndHandlesFailure(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	state, err := NewState(StartInput{ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Seed: "outcome-failure-seed", Mode: CampaignMode}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	bad := &SegmentOutcome{Won: true, Health: 4, Score: 1}
	if _, _, err := Apply(state, "outcome-failure-seed", CampaignMode, Command{Type: CompleteSegment, SegmentOutcome: bad}, catalog); !errors.Is(err, ErrInvalidCommand) {
		t.Fatalf("invalid outcome error=%v", err)
	}
	resolution, outcome, err := Apply(state, "outcome-failure-seed", CampaignMode, Command{Type: CompleteSegment, SegmentOutcome: &SegmentOutcome{Won: false, Health: 0, Score: 50}}, catalog)
	if err != nil || outcome == nil || *outcome != Failed || resolution.State.Phase != CompletedPhase {
		t.Fatalf("failed segment resolution=%#v outcome=%v err=%v", resolution, outcome, err)
	}
}

func TestFinaleRequiresExplicitEndingChoice(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	state := State{
		Phase: StoryPhase, ChapterSlug: "zero-channel", CharacterSlug: "nana7mi", CompanionSlugs: []string{},
		Hearts: 3, MaxHearts: 3, PendingShowOptions: []string{}, ShowEffects: []string{}, SelectedChoiceIDs: []string{},
		Story: &StoryState{SceneID: "zero-channel-ending", ChoiceIDs: []string{"open-archive", "shared-cut", "quiet-signoff"}},
	}
	resolution, outcome, err := Apply(state, "ending-seed", CampaignMode, Command{Type: ChooseIntermissionReply, SceneID: "zero-channel-ending", OptionID: "shared-cut"}, catalog)
	if err != nil || outcome == nil || *outcome != Cleared || resolution.State.EndingID != "shared-cut" || resolution.State.Phase != CompletedPhase {
		t.Fatalf("ending resolution=%#v outcome=%v err=%v", resolution, outcome, err)
	}
	if _, _, err := Apply(state, "ending-seed", CampaignMode, Command{Type: ChooseIntermissionReply, SceneID: "zero-channel-ending", OptionID: "not-an-ending"}, catalog); !errors.Is(err, ErrInvalidCommand) {
		t.Fatalf("unknown ending error=%v", err)
	}
}

func TestEveryIntermissionChoiceReachesTwoOptionThirdGateAndRevisesScene(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	for _, chapter := range catalog.Chapters {
		chapter := chapter
		for selectedIndex, selected := range chapter.Story.Intermission.Choices {
			selectedIndex, selected := selectedIndex, selected
			t.Run(chapter.ID+"/"+selected.ID, func(t *testing.T) {
				characterID := chapter.FeaturedCharacter
				if characterID == "player-choice" {
					characterID = "nana7mi"
				}
				prior := chapter.Story.Intermission.Choices[(selectedIndex+1)%len(chapter.Story.Intermission.Choices)].ID
				state := State{
					Phase: StoryPhase, ChapterSlug: chapter.ID, CharacterSlug: characterID,
					CompanionSlugs: []string{}, EncoreLevel: 0, Hearts: 3, MaxHearts: 3, SegmentIndex: 1,
					PendingShowOptions: []string{}, ShowEffects: []string{"double-take"}, SelectedChoiceIDs: []string{prior},
					Story: &StoryState{SceneID: chapter.ID + "-intermission", ChoiceIDs: []string{chapter.Story.Intermission.Choices[0].ID, chapter.Story.Intermission.Choices[1].ID}},
				}
				resolution, outcome, err := Apply(state, "choice-matrix:"+chapter.ID, CampaignMode, Command{Type: ChooseIntermissionReply, SceneID: state.Story.SceneID, OptionID: selected.ID}, catalog)
				if err != nil || outcome != nil || resolution.State.Segment == nil || resolution.State.SegmentIndex != 2 {
					t.Fatalf("intermission resolution=%#v outcome=%v err=%v", resolution, outcome, err)
				}
				state = resolution.State
				if slices.Contains(state.SelectedChoiceIDs, prior) || !slices.Contains(state.SelectedChoiceIDs, selected.ID) || state.Segment.RuntimeConfig.StoryChoiceID != selected.ID {
					t.Fatalf("choice revision/projected runtime=%#v", state)
				}
				resolution, outcome, err = Apply(state, "choice-matrix:"+chapter.ID, CampaignMode, Command{Type: CompleteSegment, SegmentOutcome: successfulSegmentOutcome(state.Hearts)}, catalog)
				if err != nil || outcome != nil || resolution.State.Phase != ShowChoicePhase || len(resolution.State.PendingShowOptions) != 2 || resolution.State.PendingShowOptions[0] == resolution.State.PendingShowOptions[1] {
					t.Fatalf("third gate options=%#v outcome=%v err=%v", resolution.State.PendingShowOptions, outcome, err)
				}
				state = resolution.State
				resolution, outcome, err = Apply(state, "choice-matrix:"+chapter.ID, CampaignMode, Command{Type: ChooseShowOption, OptionID: state.PendingShowOptions[0]}, catalog)
				if err != nil || outcome != nil || resolution.State.Segment == nil || resolution.State.SegmentIndex != 3 || resolution.State.Segment.BossID == "" || resolution.State.Segment.RuntimeConfig.StoryChoiceID != selected.ID {
					t.Fatalf("Boss start=%#v outcome=%v err=%v", resolution.State, outcome, err)
				}
			})
		}
	}
}

func TestEndingChoiceRevisionReplacesPriorEnding(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	state := State{
		Phase: StoryPhase, ChapterSlug: "zero-channel", CharacterSlug: "nana7mi", CompanionSlugs: []string{},
		Hearts: 3, MaxHearts: 3, PendingShowOptions: []string{}, ShowEffects: []string{}, SelectedChoiceIDs: []string{"open-archive", "keep-seven-second-voice"},
		Story: &StoryState{SceneID: "zero-channel-ending", ChoiceIDs: []string{"open-archive", "shared-cut", "quiet-signoff"}},
	}
	resolution, outcome, err := Apply(state, "ending-revision", CampaignMode, Command{Type: ChooseIntermissionReply, SceneID: state.Story.SceneID, OptionID: "quiet-signoff"}, catalog)
	if err != nil || outcome == nil || slices.Contains(resolution.State.SelectedChoiceIDs, "open-archive") || !slices.Contains(resolution.State.SelectedChoiceIDs, "quiet-signoff") || !slices.Contains(resolution.State.SelectedChoiceIDs, "keep-seven-second-voice") {
		t.Fatalf("ending revision=%#v outcome=%v err=%v", resolution.State.SelectedChoiceIDs, outcome, err)
	}
}

func TestEncoreProjectsAuthoredSpecialChargePenalty(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	chapter, ok := catalog.Chapter("always-cheerful")
	if !ok || len(chapter.Encore) != 1 || len(chapter.Waves) == 0 {
		t.Fatal("missing authored always-cheerful Encore fixture")
	}
	state := State{
		ChapterSlug: chapter.ID, CharacterSlug: chapter.FeaturedCharacter,
		Hearts: 3, MaxHearts: 3, EncoreLevel: 1,
		CompanionSlugs: []string{}, ShowEffects: []string{}, SelectedChoiceIDs: []string{},
	}
	config, err := buildShooterConfig(state, catalog, "encore-penalty", chapter.Segments[0].DurationTicks, chapter.Waves[0], nil, false)
	if err != nil {
		t.Fatal(err)
	}
	want := chapter.Encore[0].SpecialChargePenaltyPercent
	if want <= 0 || config.SpecialChargePenaltyPercent != want {
		t.Fatalf("runtime penalty=%d, want authored positive penalty %d", config.SpecialChargePenaltyPercent, want)
	}
}

func TestSeventhDockTutorialBoostOnlyAppliesBeforeFirstIntermissionChoice(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	chapter, ok := catalog.Chapter("seventh-dock")
	if !ok || len(chapter.Waves) == 0 || len(chapter.Story.Intermission.Choices) == 0 {
		t.Fatal("missing Seventh Dock tutorial fixtures")
	}
	base := State{
		ChapterSlug: chapter.ID, CharacterSlug: chapter.FeaturedCharacter,
		Hearts: 3, MaxHearts: 3, SegmentIndex: 0,
		CompanionSlugs: []string{}, ShowEffects: []string{}, SelectedChoiceIDs: []string{},
	}
	firstPlay, err := buildShooterConfig(base, catalog, "tutorial-first", chapter.Segments[0].DurationTicks, chapter.Waves[0], nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if firstPlay.StartingRescueCharge != 20 || firstPlay.Kit.StartingShield != 2 {
		t.Fatalf("first play tutorial boost=%#v", firstPlay)
	}
	authoredCutter, ok := catalog.Enemy("clip-cutter")
	if !ok {
		t.Fatal("missing authored Clip Cutter")
	}
	firstCutter := slices.IndexFunc(firstPlay.Enemies, func(enemy shooter.EnemySpec) bool { return enemy.ID == "clip-cutter" })
	if firstCutter < 0 || firstPlay.Enemies[firstCutter].FireInterval != authoredCutter.ShotInterval*2 {
		t.Fatalf("first play Clip Cutter cadence=%#v, want %d", firstPlay.Enemies, authoredCutter.ShotInterval*2)
	}

	replay := base
	replay.SelectedChoiceIDs = []string{chapter.Story.Intermission.Choices[0].ID}
	replayConfig, err := buildShooterConfig(replay, catalog, "tutorial-replay", chapter.Segments[0].DurationTicks, chapter.Waves[0], nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if replayConfig.StoryChoiceID == "" || replayConfig.StartingRescueCharge != 0 || replayConfig.Kit.StartingShield != 0 {
		t.Fatalf("chapter replay kept tutorial boost=%#v", replayConfig)
	}
	replayCutter := slices.IndexFunc(replayConfig.Enemies, func(enemy shooter.EnemySpec) bool { return enemy.ID == "clip-cutter" })
	if replayCutter < 0 || replayConfig.Enemies[replayCutter].FireInterval != authoredCutter.ShotInterval {
		t.Fatalf("chapter replay kept tutorial Clip Cutter cadence=%#v, want %d", replayConfig.Enemies, authoredCutter.ShotInterval)
	}
}

func TestBossRuntimeConfigUsesBossSlugForItsEmptyWave(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	chapter, ok := catalog.Chapter("seventh-dock")
	if !ok {
		t.Fatal("seventh-dock chapter is missing")
	}
	state := State{
		ChapterSlug: chapter.ID, CharacterSlug: chapter.FeaturedCharacter,
		Hearts: 3, MaxHearts: 3, CompanionSlugs: []string{}, ShowEffects: []string{}, SelectedChoiceIDs: []string{},
	}
	config, err := buildShooterConfig(state, catalog, "boss-wire-contract", chapter.Boss.DurationTicks, gamecontent.V4Wave{}, &chapter.Boss, false)
	if err != nil {
		t.Fatal(err)
	}
	if config.Wave.ID != chapter.Boss.ID || len(config.Wave.Spawns) != 0 || config.Boss == nil {
		t.Fatalf("Boss runtime config=%#v", config)
	}
}

func successfulSegmentOutcome(health int) *SegmentOutcome {
	return &SegmentOutcome{Won: true, Health: health, Score: 100}
}
