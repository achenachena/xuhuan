package run

import (
	"slices"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func chooseReward(state *State, slug string, catalog *gamecontent.Catalog, events *[]Event) error {
	if state.Phase != RewardPhase || state.Reward == nil {
		return ErrInvalidCommand
	}
	if slug != "" {
		if !slices.Contains(state.Reward.ModuleChoices, slug) {
			return ErrInvalidCommand
		}
		if err := addOrUpgradeModule(state, slug, catalog, events); err != nil {
			return err
		}
	}
	state.Reward = nil
	completeCurrentNode(state)
	state.Phase = MapPhase
	return nil
}

func rerollReward(state *State, catalog *gamecontent.Catalog, events *[]Event) error {
	if state.Phase != RewardPhase || state.Reward == nil || state.Reward.Rerolled || state.RerollsRemaining <= 0 {
		return ErrInvalidCommand
	}
	bias := "balanced"
	if index := nodeIndex(state.Map, state.Map.CurrentNodeID); index >= 0 {
		bias = encounterRewardBias(state.Map.Nodes[index], catalog)
	}
	previous := append([]string(nil), state.Reward.ModuleChoices...)
	for attempts := 0; attempts < 4; attempts++ {
		choices := rewardChoices(state, catalog, bias)
		if !slices.Equal(choices, previous) {
			state.Reward.ModuleChoices = choices
			break
		}
	}
	state.Reward.Rerolled = true
	state.RerollsRemaining--
	*events = append(*events, Event{Kind: "module_reward_rerolled"})
	return nil
}

func addOrUpgradeModule(state *State, slug string, catalog *gamecontent.Catalog, events *[]Event) error {
	module, ok := catalog.Module(slug)
	if !ok {
		return ErrInvalidCommand
	}
	for index := range state.Modules {
		if state.Modules[index].Slug == slug {
			if state.Modules[index].Level >= 3 {
				return ErrInvalidCommand
			}
			state.Modules[index].Level++
			if err := applyEffects(state, module.Levels[state.Modules[index].Level-1].Effects, catalog, events); err != nil {
				return err
			}
			state.RuntimeConfig, _ = resolveRuntime(*state, catalog)
			*events = append(*events, Event{Kind: "module_upgraded", ModuleSlug: slug})
			return nil
		}
	}
	if len(state.Modules) >= 6 {
		return ErrInvalidCommand
	}
	state.Modules = append(state.Modules, ModuleLevel{Slug: slug, Level: 1})
	if err := applyEffects(state, module.Levels[0].Effects, catalog, events); err != nil {
		return err
	}
	state.RuntimeConfig, _ = resolveRuntime(*state, catalog)
	*events = append(*events, Event{Kind: "module_rewarded", ModuleSlug: slug})
	return nil
}

func rest(state *State, operation, moduleSlug string, catalog *gamecontent.Catalog, events *[]Event) error {
	if state.Phase != RestPhase {
		return ErrInvalidCommand
	}
	switch operation {
	case "repair":
		healRun(state, max(1, state.MaxHealth*30/100), events)
	case "tune":
		index := slices.IndexFunc(state.Modules, func(item ModuleLevel) bool { return item.Slug == moduleSlug })
		if index < 0 || state.Modules[index].Level >= 3 {
			return ErrInvalidCommand
		}
		module, _ := catalog.Module(moduleSlug)
		state.Modules[index].Level++
		if err := applyEffects(state, module.Levels[state.Modules[index].Level-1].Effects, catalog, events); err != nil {
			return err
		}
		state.RuntimeConfig, _ = resolveRuntime(*state, catalog)
		*events = append(*events, Event{Kind: "module_upgraded", ModuleSlug: moduleSlug})
	default:
		return ErrInvalidCommand
	}
	completeCurrentNode(state)
	state.Phase = MapPhase
	return nil
}

func applyEffects(state *State, effects []gamecontent.Effect, catalog *gamecontent.Catalog, events *[]Event) error {
	for _, effect := range effects {
		switch effect.Kind {
		case "heal_run":
			healRun(state, effect.Amount, events)
		case "damage_run":
			state.Health = max(1, state.Health-effect.Amount)
			*events = append(*events, Event{Kind: "run_health_changed", Amount: -effect.Amount})
		case "add_module":
			if catalog == nil {
				return ErrInvalidCommand
			}
			if index := slices.IndexFunc(state.Modules, func(item ModuleLevel) bool { return item.Slug == effect.Value }); index >= 0 && state.Modules[index].Level >= 3 {
				continue
			}
			if !slices.ContainsFunc(state.Modules, func(item ModuleLevel) bool { return item.Slug == effect.Value }) && len(state.Modules) >= 6 {
				continue
			}
			if err := addOrUpgradeModule(state, effect.Value, catalog, events); err != nil {
				return err
			}
		case "add_plugin":
			if catalog == nil {
				return ErrInvalidCommand
			}
			if slices.Contains(state.Plugins, effect.Value) {
				continue
			}
			plugin, ok := catalog.Plugin(effect.Value)
			if !ok {
				return ErrInvalidCommand
			}
			state.Plugins = append(state.Plugins, effect.Value)
			if err := applyEffects(state, plugin.Effects, catalog, events); err != nil {
				return err
			}
			state.RuntimeConfig, _ = resolveRuntime(*state, catalog)
			*events = append(*events, Event{Kind: "plugin_granted", PluginSlug: effect.Value})
		case "max_health":
			state.MaxHealth += effect.Amount
			state.Health += effect.Amount
			*events = append(*events, Event{Kind: "run_health_changed", Amount: effect.Amount})
		case "reroll_charge":
			state.RerollsRemaining += effect.Amount
			*events = append(*events, Event{Kind: "reroll_charge_gained", Amount: effect.Amount})
		default: /* encounter-only effects are accumulated when an encounter starts */
		}
	}
	return nil
}

func rewardChoices(state *State, catalog *gamecontent.Catalog, bias string) []string {
	pool := catalog.RewardModules(state.CharacterSlug)
	pool = slices.DeleteFunc(pool, func(item gamecontent.Module) bool {
		return !slices.Contains(state.RewardPool.ModuleSlugs, item.Slug)
	})
	available := make([]gamecontent.Module, 0, len(pool))
	for _, item := range pool {
		level := 0
		for _, owned := range state.Modules {
			if owned.Slug == item.Slug {
				level = owned.Level
			}
		}
		if level < 3 && (level > 0 || len(state.Modules) < 6) {
			available = append(available, item)
		}
	}
	stream := randomStream{seed: state.ChapterSlug + ":modules", cursor: state.RNGCursor}
	choices := make([]string, 0, 3)
	priorities := make([]string, 0, 2)
	if state.NarrativeModifier.RewardBias != "" {
		priorities = append(priorities, state.NarrativeModifier.RewardBias)
	}
	if bias != "balanced" && !slices.Contains(priorities, bias) {
		priorities = append(priorities, bias)
	}
	for len(choices) < 3 && len(available) > 0 {
		preferred := make([]int, 0)
		preferredBias := ""
		if len(priorities) > len(choices) {
			preferredBias = priorities[len(choices)]
		}
		if preferredBias != "" {
			for index, item := range available {
				if item.Archetype == preferredBias {
					preferred = append(preferred, index)
				}
			}
		}
		index := stream.Intn(len(available))
		if len(preferred) > 0 {
			index = preferred[stream.Intn(len(preferred))]
		}
		choices = append(choices, available[index].Slug)
		available = append(available[:index], available[index+1:]...)
	}
	state.RNGCursor = stream.cursor
	return choices
}
func grantPlugin(state *State, catalog *gamecontent.Catalog) string {
	available := make([]string, 0)
	for _, item := range catalog.Plugins {
		if slices.Contains(state.RewardPool.PluginSlugs, item.Slug) && (item.CharacterSlug == "" || item.CharacterSlug == state.CharacterSlug) && !slices.Contains(state.Plugins, item.Slug) {
			available = append(available, item.Slug)
		}
	}
	if len(available) == 0 {
		return ""
	}
	stream := randomStream{seed: state.ChapterSlug + ":plugins", cursor: state.RNGCursor}
	slug := available[stream.Intn(len(available))]
	state.RNGCursor = stream.cursor
	state.Plugins = append(state.Plugins, slug)
	return slug
}
func encounterRewardBias(node MapNode, catalog *gamecontent.Catalog) string {
	if node.RewardBias != "" {
		return node.RewardBias
	}
	if definition, ok := catalog.Encounter(node.EncounterSlug); ok {
		return definition.RewardBias
	}
	return "balanced"
}
func mustPlugin(catalog *gamecontent.Catalog, slug string) gamecontent.Plugin {
	item, _ := catalog.Plugin(slug)
	return item
}
func healRun(state *State, amount int, events *[]Event) {
	healed := min(amount, state.MaxHealth-state.Health)
	state.Health += healed
	if healed > 0 {
		*events = append(*events, Event{Kind: "run_health_changed", Amount: healed})
	}
}
