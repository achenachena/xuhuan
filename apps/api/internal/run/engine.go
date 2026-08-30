package run

import (
	"fmt"
	"slices"

	"github.com/achenachena/xuhuan/apps/api/internal/action"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

const baseMaxHealth = 100

func NewState(input StartInput, catalog *gamecontent.Catalog) (State, error) {
	chapter, ok := catalog.Chapter(input.ChapterSlug)
	if !ok || !chapter.Available || (!chapter.Finale && chapter.CharacterSlug != input.CharacterSlug) || input.NoiseLevel < 0 || input.NoiseLevel > 3 {
		return State{}, ErrContentLocked
	}
	character, ok := catalog.Character(input.CharacterSlug)
	if !ok {
		return State{}, ErrContentLocked
	}
	mode := input.Mode
	if mode == "" {
		mode = CampaignMode
	}
	gameMap, cursor, err := generateMap(input.Seed, mode, chapter, input.NoiseLevel, input.TutorialCompleted, catalog)
	if err != nil {
		return State{}, err
	}
	kit, ok := catalog.Kit(character.KitSlug)
	if !ok {
		return State{}, ErrContentLocked
	}
	modulePool, pluginPool, err := resolveRewardPool(input, catalog, input.CharacterSlug)
	if err != nil {
		return State{}, err
	}
	modifier := input.NarrativeModifier
	if modifier.BossVariant == "" {
		modifier.BossVariant = "balanced"
	}
	if modifier.BossVariant != "authentic" && modifier.BossVariant != "balanced" && modifier.BossVariant != "retained" {
		return State{}, ErrContentLocked
	}
	state := State{Phase: MapPhase, ChapterSlug: input.ChapterSlug, CharacterSlug: input.CharacterSlug, CompanionSlugs: slices.Clone(input.CompanionSlugs), SupportAlignment: input.SupportAlignment, WeaponSlug: "auto-signal", NoiseLevel: input.NoiseLevel, Health: kit.BaseStats.MaxHealth, MaxHealth: kit.BaseStats.MaxHealth, Modules: []ModuleLevel{}, Plugins: []string{}, RewardPool: RewardPool{ModuleSlugs: modulePool, PluginSlugs: pluginPool}, NarrativeModifier: modifier, Map: gameMap, ChoiceTags: slices.Clone(input.ChoiceTags), RNGCursor: cursor, EmergencyReconnectAvailable: input.EmergencyReconnectAvailable, RerollsRemaining: 1}
	if input.StarterModuleSlug != "" {
		if !slices.Contains(modulePool, input.StarterModuleSlug) {
			return State{}, ErrContentLocked
		}
		module, exists := catalog.Module(input.StarterModuleSlug)
		if !exists || (module.CharacterSlug != "" && module.CharacterSlug != input.CharacterSlug) {
			return State{}, ErrContentLocked
		}
		state.Modules = append(state.Modules, ModuleLevel{Slug: module.Slug, Level: 1})
		starterEvents := make([]Event, 0, 1)
		if err := applyEffects(&state, module.Levels[0].Effects, catalog, &starterEvents); err != nil {
			return State{}, err
		}
	}
	state.RuntimeConfig, err = resolveRuntime(state, catalog)
	if err != nil {
		return State{}, err
	}
	if gameMap.CurrentNodeID != "" {
		node := gameMap.Nodes[nodeIndex(gameMap, gameMap.CurrentNodeID)]
		if err := startEncounter(&state, input.Seed, node.EncounterSlug, catalog); err != nil {
			return State{}, err
		}
	}
	normalizeCollections(&state)
	return state, nil
}

func resolveRewardPool(input StartInput, catalog *gamecontent.Catalog, characterSlug string) ([]string, []string, error) {
	moduleSlugs := slices.Clone(input.UnlockedModuleSlugs)
	pluginSlugs := slices.Clone(input.UnlockedPluginSlugs)
	if input.UnlockedModuleSlugs == nil {
		for _, module := range catalog.RewardModules(characterSlug) {
			moduleSlugs = append(moduleSlugs, module.Slug)
		}
	}
	if input.UnlockedPluginSlugs == nil {
		for _, plugin := range catalog.Plugins {
			if plugin.CharacterSlug == "" || plugin.CharacterSlug == characterSlug {
				pluginSlugs = append(pluginSlugs, plugin.Slug)
			}
		}
	}
	slices.Sort(moduleSlugs)
	slices.Sort(pluginSlugs)
	moduleSlugs = slices.Compact(moduleSlugs)
	pluginSlugs = slices.Compact(pluginSlugs)
	if len(moduleSlugs) < 3 {
		return nil, nil, ErrContentLocked
	}
	for _, slug := range moduleSlugs {
		module, ok := catalog.Module(slug)
		if !ok || (module.CharacterSlug != "" && module.CharacterSlug != characterSlug) {
			return nil, nil, ErrContentLocked
		}
	}
	for _, slug := range pluginSlugs {
		plugin, ok := catalog.Plugin(slug)
		if !ok || (plugin.CharacterSlug != "" && plugin.CharacterSlug != characterSlug) {
			return nil, nil, ErrContentLocked
		}
	}
	return moduleSlugs, pluginSlugs, nil
}

func Apply(current State, seed string, command Command, catalog *gamecontent.Catalog) (Resolution, *Outcome, error) {
	state := cloneState(current)
	events := make([]Event, 0, 8)
	var outcome *Outcome
	var err error
	switch command.Type {
	case ChooseNode:
		err = chooseNode(&state, seed, command.NodeID, catalog, &events)
	case CompleteEncounter:
		err = completeEncounter(&state, command.Trace, catalog, &events)
	case ChooseModuleReward:
		err = chooseReward(&state, command.ChoiceSlug, catalog, &events)
	case RerollModuleReward:
		err = rerollReward(&state, catalog, &events)
	case ResolveEvent:
		err = resolveEvent(&state, command.ChoiceSlug, catalog, &events)
	case Rest:
		err = rest(&state, command.Operation, command.ModuleSlug, catalog, &events)
	case AbandonRun:
		state.Phase = CompletedPhase
		value := Quit
		outcome = &value
		events = append(events, Event{Kind: "run_abandoned"})
	default:
		err = ErrInvalidCommand
	}
	if err != nil {
		return Resolution{}, nil, err
	}
	if command.Type != AbandonRun && state.Phase == CompletedPhase {
		value := Cleared
		if state.Health <= 0 {
			value = Failed
		}
		outcome = &value
	}
	normalizeCollections(&state)
	return Resolution{State: state, Events: events}, outcome, nil
}

func chooseNode(state *State, seed, id string, catalog *gamecontent.Catalog, events *[]Event) error {
	if state.Phase != MapPhase || state.Map.CurrentNodeID != "" {
		return ErrInvalidCommand
	}
	index := nodeIndex(state.Map, id)
	if index < 0 || state.Map.Nodes[index].Status != AvailableNode {
		return ErrInvalidCommand
	}
	lockAlternativeNodes(&state.Map, state.Map.Nodes[index])
	state.Map.Nodes[index].Status = CurrentNode
	state.Map.CurrentNodeID = id
	node := state.Map.Nodes[index]
	*events = append(*events, Event{Kind: "node_entered", NodeID: id})
	switch node.Type {
	case CombatNode, EliteNode, BossNode:
		if node.Type == BossNode {
			if chapter, ok := catalog.Chapter(state.ChapterSlug); ok {
				if sceneSlug := bossBranchSceneSlug(chapter, catalog); sceneSlug != "" {
					*events = append(*events, Event{Kind: "story_scene_ready", SceneSlug: sceneSlug, ChapterSlug: chapter.Slug})
				}
			}
		}
		return startEncounter(state, seed, node.EncounterSlug, catalog)
	case EventNode, StoryNode:
		state.Phase = EventPhase
		state.CurrentEventSlug = node.EventSlug
	case RestNode:
		state.Phase = RestPhase
	default:
		return ErrInvalidCommand
	}
	return nil
}

func startEncounter(state *State, runSeed, slug string, catalog *gamecontent.Catalog) error {
	definition, ok := catalog.Encounter(slug)
	if !ok {
		return fmt.Errorf("run: unknown encounter %q", slug)
	}
	seed := runSeed + ":" + state.Map.CurrentNodeID
	if definition.Tutorial {
		seed = "tutorial:" + slug + ":0"
	}
	state.Phase = EncounterPhase
	state.Encounter = &EncounterState{Slug: slug, Seed: seed, Kind: definition.Kind, DurationTicks: definition.DurationTicks, MaxTicks: definition.MaxTicks, Tutorial: definition.Tutorial, Objective: action.ObjectiveConfig{Kind: definition.Objective.Kind, Target: definition.Objective.Target}, Risk: definition.Risk, RewardBias: definition.RewardBias, Hazards: append([]string{}, definition.Hazards...)}
	return nil
}

func completeEncounter(state *State, trace *action.InputTrace, catalog *gamecontent.Catalog, events *[]Event) error {
	if state.Phase != EncounterPhase || state.Encounter == nil || trace == nil {
		return ErrInvalidCommand
	}
	config, err := actionConfig(*state, catalog)
	if err != nil {
		return err
	}
	result, err := action.Simulate(config, *trace)
	if err != nil {
		return err
	}
	state.Health = min(state.MaxHealth, result.Health)
	state.Score += result.Score
	if result.EmergencyReconnectUsed {
		state.EmergencyReconnectAvailable = false
		*events = append(*events, Event{Kind: "emergency_reconnect_used"})
	}
	*events = append(*events, Event{Kind: "encounter_completed", EncounterResult: &result})
	state.Encounter = nil
	if !result.Won {
		state.Health = 0
		state.Phase = CompletedPhase
		*events = append(*events, Event{Kind: "run_failed"})
		return nil
	}
	node := state.Map.Nodes[nodeIndex(state.Map, state.Map.CurrentNodeID)]
	if node.Type == TutorialNode {
		*events = append(*events, Event{Kind: "tutorial_completed"})
		if chapter, ok := catalog.Chapter(state.ChapterSlug); ok && chapter.PreludeSceneSlug != "" {
			*events = append(*events, Event{Kind: "story_scene_ready", SceneSlug: chapter.PreludeSceneSlug, ChapterSlug: chapter.Slug})
		}
	}
	if node.Type == BossNode {
		completeCurrentNode(state)
		state.Phase = CompletedPhase
		chapter, _ := catalog.Chapter(state.ChapterSlug)
		nextCharacter := ""
		if next, ok := catalog.Chapter(chapter.NextChapterSlug); ok {
			nextCharacter = next.CharacterSlug
		}
		*events = append(*events, Event{Kind: "chapter_cleared", ChapterSlug: chapter.Slug, NextChapterSlug: chapter.NextChapterSlug, NextCharacterSlug: nextCharacter})
		return nil
	}
	reward := RewardState{ModuleChoices: rewardChoices(state, catalog, encounterRewardBias(node, catalog)), Rerolled: false}
	if node.Type == EliteNode {
		reward.GrantedPlugin = grantPlugin(state, catalog)
		if reward.GrantedPlugin != "" {
			if err := applyEffects(state, mustPlugin(catalog, reward.GrantedPlugin).Effects, catalog, events); err != nil {
				return err
			}
			state.RuntimeConfig, _ = resolveRuntime(*state, catalog)
			*events = append(*events, Event{Kind: "plugin_granted", PluginSlug: reward.GrantedPlugin})
		}
	}
	state.Reward = &reward
	state.Phase = RewardPhase
	return nil
}
