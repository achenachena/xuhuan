package run

import (
	"fmt"
	"slices"

	"github.com/achenachena/xuhuan/apps/api/internal/combat"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func NewState(input StartInput, catalog *gamecontent.Catalog) (State, error) {
	chapter, ok := catalog.Chapter(input.ChapterSlug)
	if !ok || !chapter.Available || chapter.CharacterSlug != input.CharacterSlug || input.NoiseLevel < 0 || input.NoiseLevel > 3 {
		return State{}, ErrContentLocked
	}
	character, ok := catalog.Character(input.CharacterSlug)
	if !ok || !character.Available {
		return State{}, ErrContentLocked
	}
	starter := catalog.StarterDeck(input.CharacterSlug)
	if len(starter) == 0 {
		return State{}, fmt.Errorf("run: character %q has no starter deck", input.CharacterSlug)
	}
	deck := make([]combat.CardInstance, 0, len(starter))
	for index, slug := range starter {
		deck = append(deck, combat.CardInstance{ID: fmt.Sprintf("deck-%d", index+1), Slug: slug})
	}
	gameMap, cursor, err := generateMap(input.Seed, input.NoiseLevel, catalog)
	if err != nil {
		return State{}, err
	}
	return State{
		Phase: MapPhase, ChapterSlug: input.ChapterSlug, CharacterSlug: input.CharacterSlug,
		NoiseLevel: input.NoiseLevel, Health: combat.BaseMaxHealth, MaxHealth: combat.BaseMaxHealth,
		Deck: deck, Relics: []string{}, ChoiceTags: []string{}, Map: gameMap,
		NextCardSequence: len(deck) + 1, RNGCursor: cursor,
	}, nil
}

func Apply(current State, seed string, command Command, catalog *gamecontent.Catalog) (Resolution, *Outcome, error) {
	state := cloneState(current)
	events := make([]Event, 0, 16)
	var outcome *Outcome
	var err error
	switch command.Type {
	case ChooseNode:
		err = chooseNode(&state, seed, command.NodeID, catalog, &events)
	case PlayCard:
		err = playCard(&state, command.CardInstanceID, command.TargetID, catalog, &events)
	case EndTurn:
		err = endTurn(&state, catalog, &events)
	case ChooseCardReward:
		err = chooseReward(&state, command.ChoiceSlug, catalog, &events)
	case ResolveEvent:
		err = resolveEvent(&state, command.ChoiceSlug, catalog, &events)
	case Rest:
		err = rest(&state, command.Operation, command.CardInstanceID, &events)
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
	normalizeRunCollections(&state)
	return Resolution{State: state, Events: events}, outcome, nil
}

func normalizeRunCollections(state *State) {
	if state.Deck == nil {
		state.Deck = []combat.CardInstance{}
	}
	if state.Relics == nil {
		state.Relics = []string{}
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
		enemies := slices.Clone(node.EnemySlugs)
		if node.Type == BossNode {
			chapter, _ := catalog.Chapter(state.ChapterSlug)
			enemies = []string{chapter.BossSlug}
		}
		started, err := combat.Start(combat.StartInput{
			Deck: state.Deck, EnemySlugs: enemies, Relics: state.Relics,
			Seed: seed + ":" + node.ID, Health: state.Health, MaxHealth: state.MaxHealth, NoiseLevel: state.NoiseLevel,
		}, catalog)
		if err != nil {
			return err
		}
		state.Phase = CombatPhase
		state.Combat = &started.State
		appendCombatEvents(events, started.Events)
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

func playCard(state *State, cardID, targetID string, catalog *gamecontent.Catalog, events *[]Event) error {
	if state.Phase != CombatPhase || state.Combat == nil {
		return ErrInvalidCommand
	}
	result, err := combat.PlayCard(*state.Combat, cardID, targetID, state.Relics, catalog)
	if err != nil {
		return err
	}
	state.Combat = &result.State
	appendCombatEvents(events, result.Events)
	return resolveCombatOutcome(state, catalog, events)
}

func endTurn(state *State, catalog *gamecontent.Catalog, events *[]Event) error {
	if state.Phase != CombatPhase || state.Combat == nil {
		return ErrInvalidCommand
	}
	result, err := combat.EndTurn(*state.Combat, state.Relics, catalog)
	if err != nil {
		return err
	}
	state.Combat = &result.State
	appendCombatEvents(events, result.Events)
	return resolveCombatOutcome(state, catalog, events)
}

func resolveCombatOutcome(state *State, catalog *gamecontent.Catalog, events *[]Event) error {
	if state.Combat == nil || state.Combat.Status == combat.Active {
		return nil
	}
	state.Health = min(state.MaxHealth, state.Combat.Player.Health)
	if state.Combat.Status == combat.Lost {
		state.Health = 0
		state.Phase = CompletedPhase
		state.Combat = nil
		*events = append(*events, Event{Kind: "run_failed"})
		return nil
	}
	node := state.Map.Nodes[nodeIndex(state.Map, state.Map.CurrentNodeID)]
	for _, relic := range state.Relics {
		definition, ok := catalog.Relic(relic)
		if ok && definition.Effect.Kind == "heal_after_combat" {
			healRun(state, definition.Effect.Amount, events)
		}
	}
	state.Combat = nil
	if node.Type == BossNode {
		completeCurrentNode(state)
		state.Phase = CompletedPhase
		*events = append(*events, Event{Kind: "chapter_cleared"})
		return nil
	}
	state.Phase = RewardPhase
	reward := RewardState{CardChoices: rewardChoices(state, catalog)}
	if node.Type == EliteNode {
		reward.GrantedRelic = grantRelic(state, catalog)
		if reward.GrantedRelic != "" {
			applyRelicToRun(state, reward.GrantedRelic, catalog, events)
			*events = append(*events, Event{Kind: "relic_granted", RelicSlug: reward.GrantedRelic})
		}
	}
	state.Reward = &reward
	return nil
}

func chooseReward(state *State, slug string, catalog *gamecontent.Catalog, events *[]Event) error {
	if state.Phase != RewardPhase || state.Reward == nil {
		return ErrInvalidCommand
	}
	if slug != "" {
		if !slices.Contains(state.Reward.CardChoices, slug) {
			return ErrInvalidCommand
		}
		if _, ok := catalog.Card(slug); !ok {
			return ErrInvalidCommand
		}
		state.Deck = append(state.Deck, combat.CardInstance{ID: fmt.Sprintf("deck-%d", state.NextCardSequence), Slug: slug})
		state.NextCardSequence++
		*events = append(*events, Event{Kind: "card_rewarded", CardSlug: slug})
	}
	state.Reward = nil
	completeCurrentNode(state)
	state.Phase = MapPhase
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
	optionIndex := slices.IndexFunc(definition.Options, func(option gamecontent.EventOption) bool { return option.Slug == choiceSlug })
	if optionIndex < 0 {
		return ErrInvalidCommand
	}
	option := definition.Options[optionIndex]
	for _, effect := range option.Effects {
		switch effect.Kind {
		case "heal_run":
			healRun(state, effect.Amount, events)
		case "damage_run":
			state.Health = max(1, state.Health-effect.Amount)
			*events = append(*events, Event{Kind: "run_health_changed", Amount: -effect.Amount})
		case "add_card":
			if _, ok := catalog.Card(effect.Status); !ok {
				return fmt.Errorf("run: event references unknown card %q", effect.Status)
			}
			state.Deck = append(state.Deck, combat.CardInstance{ID: fmt.Sprintf("deck-%d", state.NextCardSequence), Slug: effect.Status})
			state.NextCardSequence++
			*events = append(*events, Event{Kind: "card_rewarded", CardSlug: effect.Status})
		case "add_relic":
			if _, ok := catalog.Relic(effect.Status); !ok {
				return fmt.Errorf("run: event references unknown relic %q", effect.Status)
			}
			if !slices.Contains(state.Relics, effect.Status) {
				state.Relics = append(state.Relics, effect.Status)
				applyRelicToRun(state, effect.Status, catalog, events)
				*events = append(*events, Event{Kind: "relic_granted", RelicSlug: effect.Status})
			}
		default:
			return fmt.Errorf("run: unsupported event effect %q", effect.Kind)
		}
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

func rest(state *State, operation, cardID string, events *[]Event) error {
	if state.Phase != RestPhase {
		return ErrInvalidCommand
	}
	switch operation {
	case "heal":
		amount := 14
		if slices.Contains(state.Relics, "operations-read") {
			amount += 5
		}
		healRun(state, amount, events)
	case "remove":
		if len(state.Deck) <= 7 {
			return ErrInvalidCommand
		}
		index := slices.IndexFunc(state.Deck, func(card combat.CardInstance) bool { return card.ID == cardID })
		if index < 0 {
			return ErrInvalidCommand
		}
		removed := state.Deck[index]
		state.Deck = append(state.Deck[:index], state.Deck[index+1:]...)
		*events = append(*events, Event{Kind: "card_removed", CardSlug: removed.Slug})
	default:
		return ErrInvalidCommand
	}
	completeCurrentNode(state)
	state.Phase = MapPhase
	return nil
}

func rewardChoices(state *State, catalog *gamecontent.Catalog) []string {
	pool := catalog.RewardCards(state.CharacterSlug)
	if len(pool) == 0 {
		return nil
	}
	stream := randomStream{seed: state.ChapterSlug + ":rewards", cursor: state.RNGCursor}
	choices := make([]string, 0, 3)
	available := slices.Clone(pool)
	for len(choices) < 3 && len(available) > 0 {
		index := stream.Intn(len(available))
		choices = append(choices, available[index].Slug)
		available = append(available[:index], available[index+1:]...)
	}
	state.RNGCursor = stream.cursor
	return choices
}

func grantRelic(state *State, catalog *gamecontent.Catalog) string {
	available := make([]string, 0)
	for _, relic := range catalog.Relics {
		if !slices.Contains(state.Relics, relic.Slug) {
			available = append(available, relic.Slug)
		}
	}
	if len(available) == 0 {
		return ""
	}
	stream := randomStream{seed: state.ChapterSlug + ":relics", cursor: state.RNGCursor}
	slug := available[stream.Intn(len(available))]
	state.RNGCursor = stream.cursor
	state.Relics = append(state.Relics, slug)
	return slug
}

func applyRelicToRun(state *State, slug string, catalog *gamecontent.Catalog, events *[]Event) {
	relic, ok := catalog.Relic(slug)
	if !ok {
		return
	}
	if relic.Effect.Kind == "max_health" && relic.Effect.Amount > 0 {
		state.MaxHealth += relic.Effect.Amount
		state.Health += relic.Effect.Amount
		*events = append(*events, Event{Kind: "run_health_changed", Amount: relic.Effect.Amount})
	}
}

func healRun(state *State, amount int, events *[]Event) {
	healed := min(amount, state.MaxHealth-state.Health)
	state.Health += healed
	if healed > 0 {
		*events = append(*events, Event{Kind: "run_health_changed", Amount: healed})
	}
}

func appendCombatEvents(events *[]Event, combatEvents []combat.Event) {
	for index := range combatEvents {
		item := combatEvents[index]
		*events = append(*events, Event{Kind: "combat", Combat: &item})
	}
}

func cloneState(current State) State {
	next := current
	next.Deck = slices.Clone(current.Deck)
	next.Relics = slices.Clone(current.Relics)
	next.ChoiceTags = slices.Clone(current.ChoiceTags)
	next.Map.Nodes = slices.Clone(current.Map.Nodes)
	for index := range next.Map.Nodes {
		next.Map.Nodes[index].Next = slices.Clone(current.Map.Nodes[index].Next)
		next.Map.Nodes[index].EnemySlugs = slices.Clone(current.Map.Nodes[index].EnemySlugs)
	}
	if current.Combat != nil {
		value := *current.Combat
		next.Combat = &value
	}
	if current.Reward != nil {
		value := *current.Reward
		value.CardChoices = slices.Clone(current.Reward.CardChoices)
		next.Reward = &value
	}
	return next
}
