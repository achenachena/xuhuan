package run

import "slices"

func normalizeCollections(state *State) {
	if state.CompanionSlugs == nil {
		state.CompanionSlugs = []string{}
	}
	if state.PendingShowOptions == nil {
		state.PendingShowOptions = []string{}
	}
	if state.ShowEffects == nil {
		state.ShowEffects = []string{}
	}
	if state.SelectedChoiceIDs == nil {
		state.SelectedChoiceIDs = []string{}
	}
	if state.Story != nil && state.Story.ChoiceIDs == nil {
		state.Story.ChoiceIDs = []string{}
	}
}

func cloneState(current State) State {
	next := current
	next.CompanionSlugs = slices.Clone(current.CompanionSlugs)
	next.PendingShowOptions = slices.Clone(current.PendingShowOptions)
	next.ShowEffects = slices.Clone(current.ShowEffects)
	next.SelectedChoiceIDs = slices.Clone(current.SelectedChoiceIDs)
	if current.Segment != nil {
		segment := *current.Segment
		segment.RuntimeConfig.Companions = slices.Clone(current.Segment.RuntimeConfig.Companions)
		segment.RuntimeConfig.ShowEffects = slices.Clone(current.Segment.RuntimeConfig.ShowEffects)
		segment.RuntimeConfig.Enemies = slices.Clone(current.Segment.RuntimeConfig.Enemies)
		segment.RuntimeConfig.Wave.Spawns = slices.Clone(current.Segment.RuntimeConfig.Wave.Spawns)
		if current.Segment.RuntimeConfig.Boss != nil {
			boss := *current.Segment.RuntimeConfig.Boss
			boss.Stages = slices.Clone(current.Segment.RuntimeConfig.Boss.Stages)
			segment.RuntimeConfig.Boss = &boss
		}
		next.Segment = &segment
	}
	if current.Story != nil {
		story := *current.Story
		story.ChoiceIDs = slices.Clone(current.Story.ChoiceIDs)
		next.Story = &story
	}
	return next
}
