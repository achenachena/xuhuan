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
	if !ok || !chapter.Available || chapter.CharacterSlug != input.CharacterSlug || input.NoiseLevel < 0 || input.NoiseLevel > 3 {
		return State{}, ErrContentLocked
	}
	character, ok := catalog.Character(input.CharacterSlug)
	if !ok || !character.Available {
		return State{}, ErrContentLocked
	}
	gameMap, cursor, err := generateMap(input.Seed, input.NoiseLevel, catalog)
	if err != nil {
		return State{}, err
	}
	state := State{Phase: EncounterPhase, ChapterSlug: input.ChapterSlug, CharacterSlug: input.CharacterSlug, WeaponSlug: "auto-signal", NoiseLevel: input.NoiseLevel, Health: baseMaxHealth, MaxHealth: baseMaxHealth, Modules: []ModuleLevel{}, Plugins: []string{}, Map: gameMap, ChoiceTags: []string{}, RNGCursor: cursor, EmergencyReconnectAvailable: input.EmergencyReconnectAvailable}
	if err := startEncounter(&state, input.Seed, "signal-handshake", catalog); err != nil {
		return State{}, err
	}
	return state, nil
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
	state.Phase = EncounterPhase
	state.Encounter = &EncounterState{Slug: slug, Seed: runSeed + ":" + state.Map.CurrentNodeID, Kind: definition.Kind, DurationTicks: definition.DurationTicks, MaxTicks: definition.MaxTicks, Tutorial: definition.Tutorial}
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
	}
	if node.Type == BossNode {
		completeCurrentNode(state)
		state.Phase = CompletedPhase
		*events = append(*events, Event{Kind: "chapter_cleared"})
		return nil
	}
	reward := RewardState{ModuleChoices: rewardChoices(state, catalog, node.Type == TutorialNode)}
	if node.Type == EliteNode {
		reward.GrantedPlugin = grantPlugin(state, catalog)
		if reward.GrantedPlugin != "" {
			if err := applyEffects(state, mustPlugin(catalog, reward.GrantedPlugin).Effects, catalog, events); err != nil {
				return err
			}
			*events = append(*events, Event{Kind: "plugin_granted", PluginSlug: reward.GrantedPlugin})
		}
	}
	state.Reward = &reward
	state.Phase = RewardPhase
	return nil
}

func actionConfig(state State, catalog *gamecontent.Catalog) (action.Config, error) {
	definition, ok := catalog.Encounter(state.Encounter.Slug)
	if !ok {
		return action.Config{}, ErrInvalidCommand
	}
	enemies := make([]action.EnemySpec, 0, len(definition.EnemySlugs))
	for _, slug := range definition.EnemySlugs {
		enemy, ok := catalog.Enemy(slug)
		if !ok {
			return action.Config{}, ErrInvalidCommand
		}
		enemies = append(enemies, action.EnemySpec{Slug: enemy.Slug, Pattern: enemy.Pattern, MaxHealth: enemy.MaxHealth, Speed: enemy.Speed, ContactDamage: enemy.ContactDamage, FireInterval: enemy.FireInterval, ProjectileSpeed: enemy.ProjectileSpeed, ProjectileDamage: enemy.ProjectileDamage})
	}
	buffs := action.Buffs{AttackDamage: 8, AttackInterval: 12, MoveSpeed: 42, DashCooldown: 240, DashDamage: 14, DistortionGain: 4}
	for _, owned := range state.Modules {
		module, ok := catalog.Module(owned.Slug)
		if !ok {
			return action.Config{}, ErrInvalidCommand
		}
		for range owned.Level {
			accumulateBuffs(&buffs, module.Effects)
		}
	}
	for _, slug := range state.Plugins {
		plugin, ok := catalog.Plugin(slug)
		if !ok {
			return action.Config{}, ErrInvalidCommand
		}
		accumulateBuffs(&buffs, plugin.Effects)
	}
	return action.Config{Seed: state.Encounter.Seed, Kind: definition.Kind, DurationTicks: definition.DurationTicks, MaxTicks: definition.MaxTicks, SpawnInterval: definition.SpawnInterval, MaxAlive: definition.MaxAlive, PlayerHealth: state.Health, PlayerMaxHealth: state.MaxHealth, NoiseLevel: state.NoiseLevel, EmergencyReconnectAvailable: state.EmergencyReconnectAvailable, Enemies: enemies, Buffs: buffs}, nil
}

func accumulateBuffs(buffs *action.Buffs, effects []gamecontent.Effect) {
	for _, effect := range effects {
		switch effect.Kind {
		case "attack_damage":
			buffs.AttackDamage += effect.Amount
		case "attack_speed":
			buffs.AttackInterval = max(5, buffs.AttackInterval-effect.Amount)
		case "move_speed":
			buffs.MoveSpeed += effect.Amount
		case "dash_cooldown":
			buffs.DashCooldown = max(90, buffs.DashCooldown-effect.Amount)
		case "dash_damage":
			buffs.DashDamage += effect.Amount
		case "starting_shield":
			buffs.StartingShield += effect.Amount
		case "overload_bonus":
			buffs.OverloadBonus += effect.Amount
		case "distortion_gain":
			buffs.DistortionGain += effect.Amount
		case "route_heal":
			buffs.RouteHeal += effect.Amount
		case "reflect_damage":
			buffs.ReflectDamage += effect.Amount
		}
	}
}

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
			if err := applyEffects(state, module.Effects, catalog, events); err != nil {
				return err
			}
			*events = append(*events, Event{Kind: "module_upgraded", ModuleSlug: slug})
			return nil
		}
	}
	if len(state.Modules) >= 6 {
		return ErrInvalidCommand
	}
	state.Modules = append(state.Modules, ModuleLevel{Slug: slug, Level: 1})
	if err := applyEffects(state, module.Effects, catalog, events); err != nil {
		return err
	}
	*events = append(*events, Event{Kind: "module_rewarded", ModuleSlug: slug})
	return nil
}

func resolveEvent(state *State, choiceSlug string, catalog *gamecontent.Catalog, events *[]Event) error {
	if state.Phase != EventPhase || state.CurrentEventSlug == "" {
		return ErrInvalidCommand
	}
	definition, ok := catalog.Event(state.CurrentEventSlug)
	if !ok {
		return ErrInvalidCommand
	}
	index := slices.IndexFunc(definition.Options, func(option gamecontent.EventOption) bool { return option.Slug == choiceSlug })
	if index < 0 {
		return ErrInvalidCommand
	}
	option := definition.Options[index]
	if err := applyEffects(state, option.Effects, catalog, events); err != nil {
		return err
	}
	if option.ChoiceTag != "" && !slices.Contains(state.ChoiceTags, option.ChoiceTag) {
		state.ChoiceTags = append(state.ChoiceTags, option.ChoiceTag)
		*events = append(*events, Event{Kind: "story_tag", ChoiceTag: option.ChoiceTag})
	}
	state.CurrentEventSlug = ""
	completeCurrentNode(state)
	state.Phase = MapPhase
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
		if err := applyEffects(state, module.Effects, catalog, events); err != nil {
			return err
		}
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
			if err := addOrUpgradeModule(state, effect.Status, catalog, events); err != nil {
				return err
			}
		case "add_plugin":
			if catalog == nil || slices.Contains(state.Plugins, effect.Status) {
				return ErrInvalidCommand
			}
			plugin, ok := catalog.Plugin(effect.Status)
			if !ok {
				return ErrInvalidCommand
			}
			state.Plugins = append(state.Plugins, effect.Status)
			if err := applyEffects(state, plugin.Effects, catalog, events); err != nil {
				return err
			}
			*events = append(*events, Event{Kind: "plugin_granted", PluginSlug: effect.Status})
		case "max_health":
			state.MaxHealth += effect.Amount
			state.Health += effect.Amount
			*events = append(*events, Event{Kind: "run_health_changed", Amount: effect.Amount})
		default: /* encounter-only effects are accumulated when an encounter starts */
		}
	}
	return nil
}

func rewardChoices(state *State, catalog *gamecontent.Catalog, tutorial bool) []string {
	if tutorial {
		return []string{"route-needle", "near-miss-cache", "soft-firewall"}
	}
	pool := catalog.RewardModules(state.CharacterSlug)
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
	for len(choices) < 3 && len(available) > 0 {
		index := stream.Intn(len(available))
		choices = append(choices, available[index].Slug)
		available = append(available[:index], available[index+1:]...)
	}
	state.RNGCursor = stream.cursor
	return choices
}
func grantPlugin(state *State, catalog *gamecontent.Catalog) string {
	available := make([]string, 0)
	for _, item := range catalog.Plugins {
		if !slices.Contains(state.Plugins, item.Slug) {
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
func normalizeCollections(state *State) {
	if state.Modules == nil {
		state.Modules = []ModuleLevel{}
	}
	if state.Plugins == nil {
		state.Plugins = []string{}
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
	next.Modules = slices.Clone(current.Modules)
	next.Plugins = slices.Clone(current.Plugins)
	next.ChoiceTags = slices.Clone(current.ChoiceTags)
	next.Map.Nodes = slices.Clone(current.Map.Nodes)
	for index := range next.Map.Nodes {
		next.Map.Nodes[index].Next = slices.Clone(current.Map.Nodes[index].Next)
	}
	if current.Encounter != nil {
		value := *current.Encounter
		next.Encounter = &value
	}
	if current.Reward != nil {
		value := *current.Reward
		value.ModuleChoices = slices.Clone(current.Reward.ModuleChoices)
		next.Reward = &value
	}
	return next
}
