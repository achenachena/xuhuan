package run

import "slices"

func normalizeCollections(state *State) {
	if state.CompanionSlugs == nil {
		state.CompanionSlugs = []string{}
	}
	if state.Modules == nil {
		state.Modules = []ModuleLevel{}
	}
	if state.Plugins == nil {
		state.Plugins = []string{}
	}
	if state.RewardPool.ModuleSlugs == nil {
		state.RewardPool.ModuleSlugs = []string{}
	}
	if state.RewardPool.PluginSlugs == nil {
		state.RewardPool.PluginSlugs = []string{}
	}
	if state.ChoiceTags == nil {
		state.ChoiceTags = []string{}
	}
	if state.Map.Nodes == nil {
		state.Map.Nodes = []MapNode{}
	}
	for index := range state.Map.Nodes {
		if state.Map.Nodes[index].Next == nil {
			state.Map.Nodes[index].Next = []string{}
		}
	}
}
func cloneState(current State) State {
	next := current
	next.CompanionSlugs = slices.Clone(current.CompanionSlugs)
	next.Modules = slices.Clone(current.Modules)
	next.Plugins = slices.Clone(current.Plugins)
	next.RewardPool.ModuleSlugs = slices.Clone(current.RewardPool.ModuleSlugs)
	next.RewardPool.PluginSlugs = slices.Clone(current.RewardPool.PluginSlugs)
	next.ChoiceTags = slices.Clone(current.ChoiceTags)
	next.Map.Nodes = slices.Clone(current.Map.Nodes)
	for index := range next.Map.Nodes {
		next.Map.Nodes[index].Next = slices.Clone(current.Map.Nodes[index].Next)
		next.Map.Nodes[index].EnemySlugs = slices.Clone(current.Map.Nodes[index].EnemySlugs)
		next.Map.Nodes[index].Hazards = slices.Clone(current.Map.Nodes[index].Hazards)
	}
	if current.Encounter != nil {
		value := *current.Encounter
		value.Hazards = slices.Clone(current.Encounter.Hazards)
		next.Encounter = &value
	}
	if current.Reward != nil {
		value := *current.Reward
		value.ModuleChoices = slices.Clone(current.Reward.ModuleChoices)
		next.Reward = &value
	}
	return next
}
