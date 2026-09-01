package run

import (
	"fmt"
	"slices"
	"sort"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/shooter"
)

const bossSegmentIndex = 3

// NewState creates the complete authoritative state for one campaign or daily
// run. Future segment configs are derived from its seed and immutable content.
func NewState(input StartInput, catalog *gamecontent.V4Catalog) (State, error) {
	if input.Mode != CampaignMode && input.Mode != DailyMode {
		return State{}, ErrInvalidCommand
	}
	chapter, ok := catalog.Chapter(input.ChapterSlug)
	if !ok || input.EncoreLevel < 0 || input.EncoreLevel > 3 {
		return State{}, ErrContentLocked
	}
	if _, ok = catalog.Character(input.CharacterSlug); !ok {
		return State{}, ErrContentLocked
	}
	companions := uniqueKnownCompanions(input.CompanionSlugs, catalog)
	if len(companions) != len(input.CompanionSlugs) {
		return State{}, ErrContentLocked
	}
	state := State{
		Phase: SegmentPhase, ChapterSlug: chapter.ID, CharacterSlug: input.CharacterSlug,
		CompanionSlugs: companions, EncoreLevel: input.EncoreLevel,
		Hearts: catalog.Rules.StartingHearts, MaxHearts: catalog.Rules.StartingHearts,
		SegmentIndex: 0, PendingShowOptions: []string{}, ShowEffects: []string{},
		SelectedChoiceIDs: uniqueStrings(input.SelectedChoices),
	}
	if err := startSegment(&state, input.Seed, input.Mode, catalog); err != nil {
		return State{}, err
	}
	normalizeCollections(&state)
	return state, nil
}

func Apply(current State, seed string, mode Mode, command Command, catalog *gamecontent.V4Catalog) (Resolution, *Outcome, error) {
	state := cloneState(current)
	events := make([]Event, 0, 4)
	var outcome *Outcome
	var err error
	switch command.Type {
	case CompleteSegment:
		err = completeSegment(&state, seed, mode, command.Trace, catalog, &events, &outcome)
	case ChooseShowOption:
		err = chooseShowOption(&state, seed, mode, command.OptionID, catalog, &events)
	case ChooseIntermissionReply:
		err = chooseIntermissionReply(&state, seed, mode, command.SceneID, command.OptionID, catalog, &events, &outcome)
	case AbandonRun:
		if state.Phase == CompletedPhase || command.Trace != nil || command.OptionID != "" || command.SceneID != "" {
			err = ErrInvalidCommand
		} else {
			state.Phase, state.Segment, state.Story = CompletedPhase, nil, nil
			value := Quit
			outcome = &value
		}
	default:
		err = ErrInvalidCommand
	}
	if err != nil {
		return Resolution{}, nil, err
	}
	normalizeCollections(&state)
	return Resolution{State: state, Events: events}, outcome, nil
}

func completeSegment(state *State, seed string, mode Mode, trace *shooter.InputTrace, catalog *gamecontent.V4Catalog, events *[]Event, outcome **Outcome) error {
	if state.Phase != SegmentPhase || state.Segment == nil || trace == nil {
		return ErrInvalidCommand
	}
	result, err := shooter.Simulate(state.Segment.RuntimeConfig, *trace)
	if err != nil {
		return err
	}
	state.Hearts = result.Health
	state.Score += result.Score
	state.DailyVariant = result.DailyVariant
	*events = append(*events, Event{Kind: "segment_completed", SegmentSlug: state.Segment.SegmentSlug, EncounterResult: &result})
	if !result.Won {
		state.Phase, state.Segment = CompletedPhase, nil
		value := Failed
		*outcome = &value
		return nil
	}
	if isFinalSegment(*state, mode) {
		return finishRun(state, catalog, events, outcome)
	}
	state.Phase = ShowChoicePhase
	state.Segment = nil
	state.PendingShowOptions = stagedOptions(*state, seed, catalog)
	if len(state.PendingShowOptions) != 2 {
		return fmt.Errorf("run: content cannot supply staged show choices")
	}
	*events = append(*events, Event{Kind: "show_choice_ready"})
	return nil
}

func chooseShowOption(state *State, seed string, mode Mode, optionID string, catalog *gamecontent.V4Catalog, events *[]Event) error {
	if state.Phase != ShowChoicePhase || optionID == "" || !slices.Contains(state.PendingShowOptions, optionID) {
		return ErrInvalidCommand
	}
	if effect, ok := catalog.ShowEffect(optionID); ok {
		if slices.Contains(state.ShowEffects, effect.ID) {
			return ErrInvalidCommand
		}
		state.ShowEffects = append(state.ShowEffects, effect.ID)
		*events = append(*events, Event{Kind: "show_effect_chosen", ShowEffectID: effect.ID})
	} else if companion, ok := catalog.Companion(optionID); ok {
		if slices.Contains(state.CompanionSlugs, companion.ID) {
			return ErrInvalidCommand
		}
		state.CompanionSlugs = append(state.CompanionSlugs, companion.ID)
		*events = append(*events, Event{Kind: "companion_chosen", CompanionID: companion.ID})
	} else {
		return ErrInvalidCommand
	}
	state.PendingShowOptions = []string{}
	chapter, _ := catalog.Chapter(state.ChapterSlug)
	completedNumber := state.SegmentIndex + 1
	if mode == CampaignMode && completedNumber == chapter.Story.Intermission.AfterSegment {
		choices := make([]string, 0, len(chapter.Story.Intermission.Choices))
		for _, choice := range chapter.Story.Intermission.Choices {
			choices = append(choices, choice.ID)
		}
		state.Phase = StoryPhase
		state.Story = &StoryState{SceneID: chapter.ID + "-intermission", ChoiceIDs: choices}
		*events = append(*events, Event{Kind: "intermission_ready", SceneID: state.Story.SceneID})
		return nil
	}
	state.SegmentIndex++
	return startSegment(state, seed, mode, catalog)
}

func chooseIntermissionReply(state *State, seed string, mode Mode, sceneID, optionID string, catalog *gamecontent.V4Catalog, events *[]Event, outcome **Outcome) error {
	if mode != CampaignMode || state.Phase != StoryPhase || state.Story == nil || sceneID == "" || sceneID != state.Story.SceneID || !slices.Contains(state.Story.ChoiceIDs, optionID) {
		return ErrInvalidCommand
	}
	chapter, ok := catalog.Chapter(state.ChapterSlug)
	if !ok {
		return ErrContentLocked
	}
	var selected *gamecontent.V4StoryChoice
	for index := range chapter.Story.Intermission.Choices {
		if chapter.Story.Intermission.Choices[index].ID == optionID {
			selected = &chapter.Story.Intermission.Choices[index]
			break
		}
	}
	if selected == nil {
		if state.ChapterSlug == "zero-channel" && state.Story.SceneID == "zero-channel-ending" {
			return chooseEnding(state, optionID, catalog, events, outcome)
		}
		return ErrInvalidCommand
	}
	currentSceneChoices := make(map[string]bool, len(chapter.Story.Intermission.Choices))
	for _, choice := range chapter.Story.Intermission.Choices {
		currentSceneChoices[choice.ID] = true
	}
	state.SelectedChoiceIDs = removeSelectedIDs(state.SelectedChoiceIDs, currentSceneChoices)
	state.SelectedChoiceIDs = append(state.SelectedChoiceIDs, selected.ID)
	if selected.ShowEffectID != "" && !slices.Contains(state.ShowEffects, selected.ShowEffectID) {
		if _, ok := catalog.ShowEffect(selected.ShowEffectID); !ok {
			return ErrContentLocked
		}
		state.ShowEffects = append(state.ShowEffects, selected.ShowEffectID)
	}
	*events = append(*events, Event{Kind: "intermission_replied", SceneID: sceneID, ChoiceID: selected.ID, ChoiceTag: selected.Tag, ShowEffectID: selected.ShowEffectID})
	state.Story = nil
	state.SegmentIndex++
	return startSegment(state, seed, mode, catalog)
}

func startSegment(state *State, seed string, mode Mode, catalog *gamecontent.V4Catalog) error {
	chapter, ok := catalog.Chapter(state.ChapterSlug)
	if !ok {
		return ErrContentLocked
	}
	segmentSeed := fmt.Sprintf("%s:segment:%d", seed, state.SegmentIndex)
	var segmentSlug, waveID, rewardStage, background string
	var duration int
	var wave gamecontent.V4Wave
	var boss *gamecontent.V4Boss
	if mode == DailyMode {
		duration = catalog.Daily.SegmentDurationTicks
		if state.SegmentIndex == catalog.Daily.SegmentCount-1 {
			bossID := catalog.Daily.BossIDs[deterministicIndex(seed+":daily-boss", len(catalog.Daily.BossIDs))]
			resolved, exists := catalog.Boss(bossID)
			if !exists {
				return ErrContentLocked
			}
			// Daily is one 30-second act plus the authored 60-second Boss. Reusing
			// the act duration here silently shortened every Boss to 30 seconds.
			boss, segmentSlug, duration, background = &resolved, "daily-boss", resolved.DurationTicks, chapter.BackgroundURL
		} else {
			waveID = catalog.Daily.WaveIDs[deterministicIndex(fmt.Sprintf("%s:daily-wave:%d", seed, state.SegmentIndex), len(catalog.Daily.WaveIDs))]
			resolved, exists := findWave(catalog, waveID)
			if !exists {
				return ErrContentLocked
			}
			wave, segmentSlug, rewardStage, background = resolved, fmt.Sprintf("daily-segment-%d", state.SegmentIndex+1), rewardStageForIndex(state.SegmentIndex), chapter.BackgroundURL
		}
	} else if state.SegmentIndex < len(chapter.Segments) {
		item := chapter.Segments[state.SegmentIndex]
		resolved, exists := catalog.Wave(item.WaveID, chapter.ID)
		if !exists {
			return ErrContentLocked
		}
		segmentSlug, duration, waveID, rewardStage, background, wave = item.ID, item.DurationTicks, item.WaveID, item.RewardStage, item.BackgroundURL, resolved
	} else if state.SegmentIndex == bossSegmentIndex {
		resolved := chapter.Boss
		boss, segmentSlug, duration, background = &resolved, chapter.Boss.ID, chapter.Boss.DurationTicks, chapter.BackgroundURL
	} else {
		return ErrInvalidCommand
	}
	config, err := buildShooterConfig(*state, catalog, segmentSeed, duration, wave, boss, mode == DailyMode)
	if err != nil {
		return err
	}
	state.Phase = SegmentPhase
	state.Segment = &SegmentState{SegmentSlug: segmentSlug, SegmentIndex: state.SegmentIndex, Seed: segmentSeed, DurationTicks: duration, WaveID: waveID, RewardStage: rewardStage, BackgroundURL: background, RuntimeConfig: config}
	if boss != nil {
		state.Segment.BossID = boss.ID
	}
	return nil
}

func stagedOptions(state State, seed string, catalog *gamecontent.V4Catalog) []string {
	candidates := make([]string, 0)
	switch rewardStageForIndex(state.SegmentIndex) {
	case "weapon":
		for _, item := range catalog.ShowEffects {
			if item.Archetype == "power" && !slices.Contains(state.ShowEffects, item.ID) {
				candidates = append(candidates, item.ID)
			}
		}
	case "companion":
		for _, item := range catalog.Companions {
			if item.CharacterID != state.CharacterSlug && !slices.Contains(state.CompanionSlugs, item.ID) {
				candidates = append(candidates, item.ID)
			}
		}
	case "rescue":
		for _, item := range catalog.ShowEffects {
			if item.Archetype == "guard" && !slices.Contains(state.ShowEffects, item.ID) {
				candidates = append(candidates, item.ID)
			}
		}
		// A concrete story reply may already grant one of the two guard effects.
		// Keep the third gate at exactly two understandable, one-level choices by
		// filling from style first, then power, without offering duplicates.
		for _, fallbackArchetype := range []string{"style", "power"} {
			for _, item := range catalog.ShowEffects {
				if len(candidates) >= 2 {
					break
				}
				if item.Archetype == fallbackArchetype && !slices.Contains(state.ShowEffects, item.ID) && !slices.Contains(candidates, item.ID) {
					candidates = append(candidates, item.ID)
				}
			}
		}
	}
	sort.Strings(candidates)
	stream := randomStream{seed: seed + fmt.Sprintf(":show:%d", state.SegmentIndex)}
	for index := len(candidates) - 1; index > 0; index-- {
		swap := stream.Intn(index + 1)
		candidates[index], candidates[swap] = candidates[swap], candidates[index]
	}
	if len(candidates) > 2 {
		candidates = candidates[:2]
	}
	return candidates
}

func rewardStageForIndex(index int) string {
	return []string{"weapon", "companion", "rescue"}[min(max(index, 0), 2)]
}

func finishRun(state *State, catalog *gamecontent.V4Catalog, events *[]Event, outcome **Outcome) error {
	chapter, ok := catalog.Chapter(state.ChapterSlug)
	if !ok {
		return ErrContentLocked
	}
	if chapter.ID == "zero-channel" {
		choices := make([]string, 0, len(chapter.Endings))
		for _, ending := range chapter.Endings {
			choices = append(choices, ending.ID)
		}
		state.Phase, state.Segment, state.PendingShowOptions = StoryPhase, nil, []string{}
		state.Story = &StoryState{SceneID: "zero-channel-ending", ChoiceIDs: choices}
		*events = append(*events, Event{Kind: "ending_choice_ready", SceneID: state.Story.SceneID})
		return nil
	}
	state.Phase, state.Segment, state.Story, state.PendingShowOptions = CompletedPhase, nil, nil, []string{}
	nextChapter, nextCharacter := nextChapter(catalog, chapter.Order)
	*events = append(*events, Event{Kind: "chapter_cleared", ChapterSlug: chapter.ID, CompanionID: chapter.UnlockCompanion, NextChapterSlug: nextChapter, NextCharacterSlug: nextCharacter})
	value := Cleared
	*outcome = &value
	return nil
}

func isFinalSegment(state State, mode Mode) bool {
	if mode == DailyMode {
		return state.SegmentIndex == 1
	}
	return state.SegmentIndex == bossSegmentIndex
}

func chooseEnding(state *State, endingID string, catalog *gamecontent.V4Catalog, events *[]Event, outcome **Outcome) error {
	chapter, ok := catalog.Chapter(state.ChapterSlug)
	if !ok || !slices.ContainsFunc(chapter.Endings, func(ending gamecontent.V4Ending) bool { return ending.ID == endingID }) {
		return ErrInvalidCommand
	}
	state.EndingID = endingID
	endingIDs := make(map[string]bool, len(chapter.Endings))
	for _, ending := range chapter.Endings {
		endingIDs[ending.ID] = true
	}
	state.SelectedChoiceIDs = removeSelectedIDs(state.SelectedChoiceIDs, endingIDs)
	state.SelectedChoiceIDs = append(state.SelectedChoiceIDs, endingID)
	state.Phase, state.Story = CompletedPhase, nil
	*events = append(*events,
		Event{Kind: "ending_chosen", SceneID: "zero-channel-ending", ChoiceID: endingID, ChoiceTag: endingID, EndingID: endingID},
		Event{Kind: "chapter_cleared", ChapterSlug: chapter.ID, EndingID: endingID},
	)
	value := Cleared
	*outcome = &value
	return nil
}

func removeSelectedIDs(selected []string, remove map[string]bool) []string {
	result := make([]string, 0, len(selected))
	for _, id := range selected {
		if !remove[id] {
			result = append(result, id)
		}
	}
	return result
}

func nextChapter(catalog *gamecontent.V4Catalog, order int) (string, string) {
	for _, chapter := range catalog.Chapters {
		if chapter.Order == order+1 {
			return chapter.ID, chapter.FeaturedCharacter
		}
	}
	return "", ""
}

func findWave(catalog *gamecontent.V4Catalog, id string) (gamecontent.V4Wave, bool) {
	for _, chapter := range catalog.Chapters {
		if wave, ok := catalog.Wave(id, chapter.ID); ok {
			return wave, true
		}
	}
	return gamecontent.V4Wave{}, false
}

func uniqueKnownCompanions(values []string, catalog *gamecontent.V4Catalog) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := catalog.Companion(value); !ok || slices.Contains(result, value) {
			continue
		}
		result = append(result, value)
	}
	return result
}

func uniqueStrings(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = appendUnique(result, value)
	}
	return result
}

func appendUnique(values []string, value string) []string {
	if value != "" && !slices.Contains(values, value) {
		return append(values, value)
	}
	return values
}
