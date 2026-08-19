package combat

import (
	"fmt"
	"math"
	"slices"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

type StartInput struct {
	Deck       []CardInstance
	EnemySlugs []string
	Relics     []string
	Seed       string
	Health     int
	MaxHealth  int
	NoiseLevel int
}

func Start(input StartInput, catalog *gamecontent.Catalog) (Resolution, error) {
	if len(input.Deck) == 0 || len(input.EnemySlugs) == 0 || len(input.EnemySlugs) > 2 || input.Seed == "" {
		return Resolution{}, fmt.Errorf("combat: invalid start input")
	}
	maxHealth := input.MaxHealth
	if maxHealth <= 0 {
		maxHealth = BaseMaxHealth
	}
	health := min(maxHealth, input.Health)
	if health <= 0 {
		health = maxHealth
	}
	state := State{
		Status: Active, Turn: 1, Seed: input.Seed, NoiseLevel: input.NoiseLevel,
		Player:   PlayerState{MaxHealth: maxHealth, Health: health, Bandwidth: BaseBandwidth, DistortionLimit: BaseDistortionLimit},
		DrawPile: slices.Clone(input.Deck), NextCardSequence: len(input.Deck) + 1,
	}
	if input.NoiseLevel >= 3 {
		state.Player.DistortionLimit = 5
	}
	for _, slug := range input.EnemySlugs {
		definition, ok := catalog.Enemy(slug)
		if !ok {
			return Resolution{}, fmt.Errorf("combat: unknown enemy %q", slug)
		}
		state.Enemies = append(state.Enemies, EnemyState{
			ID: fmt.Sprintf("enemy-%d", len(state.Enemies)+1), Slug: slug,
			MaxHealth: definition.MaxHealth, Health: definition.MaxHealth,
		})
	}
	stream := randomStream{seed: input.Seed}
	shuffle(state.DrawPile, &stream)
	for index := range state.Enemies {
		definition, _ := catalog.Enemy(state.Enemies[index].Slug)
		state.Enemies[index].IntentIndex = stream.Intn(len(definition.Intents))
		if input.NoiseLevel >= 1 && definition.Kind != "boss" {
			state.Enemies[index].Strength++
		}
	}
	state.RNGCursor = stream.cursor
	events := make([]Event, 0, 8)
	applyOpeningRelics(&state, input.Relics, &events)
	if input.NoiseLevel >= 2 {
		addGeneratedCard(&state, "packet-loss", &state.DiscardPile)
		events = append(events, Event{Kind: "card_added", Actor: "system", CardSlug: "packet-loss"})
	}
	drawCards(&state, BaseHandSize+openingDrawBonus(input.Relics, state.Player.Health < state.Player.MaxHealth/2), &events)
	normalizeCollections(&state)
	return Resolution{State: state, Events: events}, nil
}

func PlayCard(current State, cardID, targetID string, relics []string, catalog *gamecontent.Catalog) (Resolution, error) {
	if current.Status != Active {
		return Resolution{}, ErrCombatComplete
	}
	state := cloneState(current)
	index := slices.IndexFunc(state.Hand, func(card CardInstance) bool { return card.ID == cardID })
	if index < 0 {
		return Resolution{}, ErrCardNotInHand
	}
	instance := state.Hand[index]
	definition, ok := catalog.Card(instance.Slug)
	if !ok {
		return Resolution{}, fmt.Errorf("combat: unknown card %q", instance.Slug)
	}
	if definition.Unplayable {
		return Resolution{}, ErrCardUnplayable
	}
	cost := definition.Cost
	if definition.Type == "signal" && state.Player.DiscountSignal > 0 {
		cost = 0
	}
	if state.Player.Bandwidth < cost {
		return Resolution{}, ErrInsufficientCost
	}
	targetIndex, err := validateTarget(state, definition.Target, targetID)
	if err != nil {
		return Resolution{}, err
	}
	if required := requiredMarkers(definition.Effects); required > state.Player.Beacons {
		return Resolution{}, ErrInsufficientMarker
	}

	state.Player.Bandwidth -= cost
	if definition.Type == "signal" && definition.Cost > 0 && cost == 0 {
		state.Player.DiscountSignal--
	}
	state.Hand = append(state.Hand[:index], state.Hand[index+1:]...)
	events := []Event{{Kind: "card_played", Actor: "player", TargetID: targetID, CardSlug: definition.Slug, Amount: cost}}
	previousType := state.PreviousCardType
	playedBefore := state.CardsPlayed
	state.CardsPlayed++
	state.PreviousCardType = definition.Type
	state.PlayedTypes = addUnique(state.PlayedTypes, definition.Type)

	for _, effect := range definition.Effects {
		if err := applyCardEffect(&state, definition, effect, targetIndex, previousType, playedBefore, relics, catalog, &events); err != nil {
			return Resolution{}, err
		}
		if state.Status != Active {
			break
		}
	}
	if definition.Exhaust {
		state.ExhaustPile = append(state.ExhaustPile, instance)
	} else {
		state.DiscardPile = append(state.DiscardPile, instance)
	}
	if state.Status == Active && !state.RouteCompleted && containsCoreTypes(state.PlayedTypes) {
		state.RouteCompleted = true
		state.Player.Beacons = min(3, state.Player.Beacons+1)
		events = append(events, Event{Kind: "route_completed", Actor: "player", Amount: 1})
		drawCards(&state, 1, &events)
	}
	checkDistortion(&state, relics, catalog, &events)
	checkOutcome(&state, &events)
	normalizeCollections(&state)
	return Resolution{State: state, Events: events}, nil
}

func EndTurn(current State, relics []string, catalog *gamecontent.Catalog) (Resolution, error) {
	if current.Status != Active {
		return Resolution{}, ErrCombatComplete
	}
	state := cloneState(current)
	events := []Event{{Kind: "turn_ended", Actor: "player", Amount: state.Turn}}
	for _, instance := range state.Hand {
		definition, ok := catalog.Card(instance.Slug)
		if !ok {
			return Resolution{}, fmt.Errorf("combat: unknown card %q", instance.Slug)
		}
		for _, effect := range definition.Effects {
			if effect.Kind == "end_turn_distortion" {
				addDistortion(&state, effect.Amount, relics, &events)
			}
		}
	}
	state.DiscardPile = append(state.DiscardPile, state.Hand...)
	state.Hand = nil
	checkDistortion(&state, relics, catalog, &events)

	for index := range state.Enemies {
		enemy := &state.Enemies[index]
		if enemy.Health <= 0 {
			continue
		}
		enemy.Block = 0
		definition, ok := catalog.Enemy(enemy.Slug)
		if !ok || len(definition.Intents) == 0 {
			return Resolution{}, fmt.Errorf("combat: unknown enemy %q", enemy.Slug)
		}
		intent := definition.Intents[enemy.IntentIndex%len(definition.Intents)]
		events = append(events, Event{Kind: "enemy_intent", Actor: enemy.ID, IntentSlug: intent.Slug})
		for _, effect := range intent.Effects {
			applyEnemyEffect(&state, enemy, effect, catalog, &events)
			if state.Player.Health <= 0 {
				break
			}
		}
		enemy.IntentIndex = (enemy.IntentIndex + 1) % len(definition.Intents)
		if state.Player.Health <= 0 {
			break
		}
	}
	state.Player.Block = 0
	decrementStatuses(&state)
	checkOutcome(&state, &events)
	if state.Status == Active {
		state.Turn++
		state.Player.Bandwidth = max(0, BaseBandwidth+state.Player.NextBandwidth)
		state.Player.NextBandwidth = 0
		state.Player.DiscountSignal = 0
		state.PlayedTypes = nil
		state.PreviousCardType = ""
		state.CardsPlayed = 0
		state.RouteCompleted = false
		drawCards(&state, BaseHandSize, &events)
		events = append(events, Event{Kind: "turn_started", Actor: "player", Amount: state.Turn})
	}
	normalizeCollections(&state)
	return Resolution{State: state, Events: events}, nil
}

func normalizeCollections(state *State) {
	if state.Enemies == nil {
		state.Enemies = []EnemyState{}
	}
	if state.DrawPile == nil {
		state.DrawPile = []CardInstance{}
	}
	if state.DiscardPile == nil {
		state.DiscardPile = []CardInstance{}
	}
	if state.Hand == nil {
		state.Hand = []CardInstance{}
	}
	if state.ExhaustPile == nil {
		state.ExhaustPile = []CardInstance{}
	}
	if state.PlayedTypes == nil {
		state.PlayedTypes = []string{}
	}
}

func CurrentIntent(state State, enemyID string, catalog *gamecontent.Catalog) (gamecontent.Intent, bool) {
	index := slices.IndexFunc(state.Enemies, func(enemy EnemyState) bool { return enemy.ID == enemyID })
	if index < 0 {
		return gamecontent.Intent{}, false
	}
	definition, ok := catalog.Enemy(state.Enemies[index].Slug)
	if !ok || len(definition.Intents) == 0 {
		return gamecontent.Intent{}, false
	}
	return definition.Intents[state.Enemies[index].IntentIndex%len(definition.Intents)], true
}

func applyCardEffect(state *State, card gamecontent.Card, effect gamecontent.Effect, targetIndex int, previousType string, playedBefore int, relics []string, catalog *gamecontent.Catalog, events *[]Event) error {
	switch effect.Kind {
	case "noop", "end_turn_distortion":
		return nil
	case "damage":
		dealDamage(state, targetIndex, playerDamage(state, effect.Amount, card.Type, relics), events)
	case "damage_all":
		for index := range state.Enemies {
			dealDamage(state, index, playerDamage(state, effect.Amount, card.Type, relics), events)
		}
	case "damage_if_marker":
		if state.Player.Beacons > 0 {
			dealDamage(state, targetIndex, playerDamage(state, effect.Amount, card.Type, relics), events)
		}
	case "damage_distorted":
		amount := effect.Amount
		if state.Player.Distortion >= 3 {
			amount *= 2
		}
		dealDamage(state, targetIndex, playerDamage(state, amount, card.Type, relics), events)
	case "damage_per_type":
		for range len(state.PlayedTypes) {
			dealDamage(state, targetIndex, playerDamage(state, effect.Amount, card.Type, relics), events)
		}
	case "damage_per_discard_glitch":
		count := countCardType(state.DiscardPile, "glitch", catalog)
		if count > 0 {
			dealDamage(state, targetIndex, playerDamage(state, count*effect.Amount, card.Type, relics), events)
		}
	case "block":
		state.Player.Block += effect.Amount
		*events = append(*events, Event{Kind: "block_gained", Actor: "player", Amount: effect.Amount})
	case "block_if_previous_attack":
		if previousType == "attack" {
			state.Player.Block += effect.Amount
			*events = append(*events, Event{Kind: "block_gained", Actor: "player", Amount: effect.Amount})
		}
	case "block_if_low_health":
		if state.Player.Health*2 < state.Player.MaxHealth {
			state.Player.Block += effect.Amount
			*events = append(*events, Event{Kind: "block_gained", Actor: "player", Amount: effect.Amount})
		}
	case "draw":
		drawCards(state, effect.Amount, events)
	case "draw_if_first":
		if playedBefore == 0 {
			drawCards(state, effect.Amount, events)
		}
	case "draw_if_distorted":
		if state.Player.Distortion >= 3 {
			drawCards(state, effect.Amount, events)
		}
	case "bandwidth":
		state.Player.Bandwidth += effect.Amount
		*events = append(*events, Event{Kind: "bandwidth_changed", Actor: "player", Amount: effect.Amount})
	case "bandwidth_if_no_route":
		if !state.RouteCompleted {
			state.Player.Bandwidth += effect.Amount
			*events = append(*events, Event{Kind: "bandwidth_changed", Actor: "player", Amount: effect.Amount})
		}
	case "next_bandwidth":
		state.Player.NextBandwidth += effect.Amount
	case "distortion":
		addDistortion(state, effect.Amount, relics, events)
	case "marker":
		state.Player.Beacons = min(3, state.Player.Beacons+effect.Amount)
		*events = append(*events, Event{Kind: "beacon_changed", Actor: "player", Amount: effect.Amount})
	case "spend_marker":
		state.Player.Beacons -= effect.Amount
		*events = append(*events, Event{Kind: "beacon_changed", Actor: "player", Amount: -effect.Amount})
	case "spend_marker_damage":
		if state.Player.Beacons > 0 {
			state.Player.Beacons--
			*events = append(*events, Event{Kind: "beacon_changed", Actor: "player", Amount: -1})
			dealDamage(state, targetIndex, playerDamage(state, effect.Amount, card.Type, relics), events)
		}
	case "spend_all_markers":
		markers := state.Player.Beacons
		state.Player.Beacons = 0
		if markers > 0 {
			state.Player.Block += markers * effect.Amount
			dealDamage(state, targetIndex, playerDamage(state, markers*effect.Amount, card.Type, relics), events)
			*events = append(*events, Event{Kind: "beacon_changed", Actor: "player", Amount: -markers})
		}
	case "discount_signal":
		state.Player.DiscountSignal += effect.Amount
	case "weak_all":
		for index := range state.Enemies {
			state.Enemies[index].Weak += effect.Amount
		}
	case "vulnerable", "vulnerable_all":
		if effect.Kind == "vulnerable_all" {
			for index := range state.Enemies {
				state.Enemies[index].Vulnerable += effect.Amount
			}
		} else {
			state.Enemies[targetIndex].Vulnerable += effect.Amount
		}
	case "redraw_hand":
		count := len(state.Hand)
		state.DiscardPile = append(state.DiscardPile, state.Hand...)
		state.Hand = nil
		drawCards(state, count, events)
	case "heal":
		heal := min(effect.Amount, state.Player.MaxHealth-state.Player.Health)
		state.Player.Health += heal
		*events = append(*events, Event{Kind: "healed", Actor: "player", Amount: heal})
	case "temporary_max_health":
		state.Player.MaxHealth = max(1, state.Player.MaxHealth+effect.Amount)
		state.Player.Health = min(state.Player.Health, state.Player.MaxHealth)
	default:
		return fmt.Errorf("combat: unsupported card effect %q", effect.Kind)
	}
	return nil
}

func applyEnemyEffect(state *State, enemy *EnemyState, effect gamecontent.Effect, catalog *gamecontent.Catalog, events *[]Event) {
	switch effect.Kind {
	case "damage_player", "damage_player_if_distorted":
		if effect.Kind == "damage_player_if_distorted" && state.Player.Distortion < 3 {
			return
		}
		amount := effect.Amount + enemy.Strength
		if enemy.Weak > 0 {
			amount = int(math.Ceil(float64(amount) * .75))
		}
		if state.Player.Vulnerable > 0 {
			amount = int(math.Ceil(float64(amount) * 1.25))
		}
		remaining := absorb(&state.Player.Block, amount)
		state.Player.Health = max(0, state.Player.Health-remaining)
		*events = append(*events, Event{Kind: "damage", Actor: enemy.ID, TargetID: "player", Amount: remaining})
	case "block_enemy":
		enemy.Block += effect.Amount
		*events = append(*events, Event{Kind: "block_gained", Actor: enemy.ID, Amount: effect.Amount})
	case "heal_enemy":
		heal := min(effect.Amount, enemy.MaxHealth-enemy.Health)
		enemy.Health += heal
		*events = append(*events, Event{Kind: "healed", Actor: enemy.ID, Amount: heal})
	case "weak_player":
		state.Player.Weak += effect.Amount
	case "vulnerable_player":
		state.Player.Vulnerable += effect.Amount
	case "strength_enemy":
		enemy.Strength += effect.Amount
	case "add_glitch":
		for range effect.Amount {
			addGeneratedCard(state, "scrambled-caption", &state.DiscardPile)
		}
		*events = append(*events, Event{Kind: "card_added", Actor: enemy.ID, CardSlug: "scrambled-caption", Amount: effect.Amount})
	case "add_packet_loss":
		for range effect.Amount {
			addGeneratedCard(state, "packet-loss", &state.DiscardPile)
		}
		*events = append(*events, Event{Kind: "card_added", Actor: enemy.ID, CardSlug: "packet-loss", Amount: effect.Amount})
	}
	_ = catalog
}

func drawCards(state *State, count int, events *[]Event) {
	stream := randomStream{seed: state.Seed, cursor: state.RNGCursor}
	for range count {
		if len(state.Hand) >= MaximumHandSize {
			break
		}
		if len(state.DrawPile) == 0 {
			if len(state.DiscardPile) == 0 {
				break
			}
			state.DrawPile = slices.Clone(state.DiscardPile)
			state.DiscardPile = nil
			shuffle(state.DrawPile, &stream)
			*events = append(*events, Event{Kind: "deck_shuffled", Actor: "player"})
		}
		card := state.DrawPile[len(state.DrawPile)-1]
		state.DrawPile = state.DrawPile[:len(state.DrawPile)-1]
		state.Hand = append(state.Hand, card)
		*events = append(*events, Event{Kind: "card_drawn", Actor: "player", CardSlug: card.Slug})
	}
	state.RNGCursor = stream.cursor
}

func dealDamage(state *State, targetIndex, amount int, events *[]Event) {
	if targetIndex < 0 || targetIndex >= len(state.Enemies) || state.Enemies[targetIndex].Health <= 0 {
		return
	}
	enemy := &state.Enemies[targetIndex]
	if enemy.Vulnerable > 0 {
		amount = int(math.Ceil(float64(amount) * 1.25))
	}
	remaining := absorb(&enemy.Block, amount)
	enemy.Health = max(0, enemy.Health-remaining)
	*events = append(*events, Event{Kind: "damage", Actor: "player", TargetID: enemy.ID, Amount: remaining})
}

func playerDamage(state *State, base int, cardType string, relics []string) int {
	amount := base
	if state.Player.Weak > 0 {
		amount = int(math.Ceil(float64(amount) * .75))
	}
	if cardType == "attack" && !state.Player.FirstAttackBonusUsed && slices.Contains(relics, "highlight-scissors") {
		amount += 3
		state.Player.FirstAttackBonusUsed = true
	}
	return max(0, amount)
}

func checkOutcome(state *State, events *[]Event) {
	if state.Player.Health <= 0 {
		state.Player.Health = 0
		state.Status = Lost
		*events = append(*events, Event{Kind: "combat_lost", Actor: "player"})
		return
	}
	alive := false
	for _, enemy := range state.Enemies {
		if enemy.Health > 0 {
			alive = true
			break
		}
	}
	if !alive {
		state.Status = Won
		*events = append(*events, Event{Kind: "combat_won", Actor: "player"})
	}
}

func addDistortion(state *State, amount int, relics []string, events *[]Event) {
	if amount > 0 && !state.Player.DistortionShieldUsed && slices.Contains(relics, "noise-cancelling") {
		amount = max(0, amount-1)
		state.Player.DistortionShieldUsed = true
	}
	state.Player.Distortion = max(0, state.Player.Distortion+amount)
	if amount != 0 {
		*events = append(*events, Event{Kind: "distortion_changed", Actor: "player", Amount: amount})
	}
}

func checkDistortion(state *State, relics []string, catalog *gamecontent.Catalog, events *[]Event) {
	_ = relics
	if state.Player.Distortion < state.Player.DistortionLimit {
		return
	}
	state.Player.Distortion = 2
	state.Player.Health = max(0, state.Player.Health-5)
	if _, ok := catalog.Card("scrambled-caption"); ok {
		addGeneratedCard(state, "scrambled-caption", &state.DiscardPile)
	}
	*events = append(*events,
		Event{Kind: "desync", Actor: "player", Amount: 5},
		Event{Kind: "card_added", Actor: "system", CardSlug: "scrambled-caption"},
	)
}

func applyOpeningRelics(state *State, relics []string, events *[]Event) {
	for _, slug := range relics {
		switch slug {
		case "expired-membership":
			state.Player.Block += 6
		case "paper-map":
			state.Player.Beacons = min(3, state.Player.Beacons+1)
		case "borrowed-bandwidth":
			state.Player.Bandwidth++
		}
	}
	if state.Player.Block > 0 {
		*events = append(*events, Event{Kind: "block_gained", Actor: "player", Amount: state.Player.Block})
	}
}

func openingDrawBonus(relics []string, lowHealth bool) int {
	bonus := 0
	if slices.Contains(relics, "unclosed-tab") {
		bonus++
	}
	if lowHealth && slices.Contains(relics, "viewer-one") {
		bonus++
	}
	return bonus
}

func requiredMarkers(effects []gamecontent.Effect) int {
	for _, effect := range effects {
		if effect.Kind == "spend_marker" {
			return effect.Amount
		}
	}
	return 0
}

func validateTarget(state State, target string, targetID string) (int, error) {
	switch target {
	case "none", "self", "all_enemies":
		if targetID != "" && targetID != "player" {
			return -1, ErrInvalidTarget
		}
		return -1, nil
	case "enemy":
		index := slices.IndexFunc(state.Enemies, func(enemy EnemyState) bool { return enemy.ID == targetID && enemy.Health > 0 })
		if index < 0 {
			return -1, ErrInvalidTarget
		}
		return index, nil
	default:
		return -1, ErrInvalidTarget
	}
}

func addGeneratedCard(state *State, slug string, pile *[]CardInstance) {
	card := CardInstance{ID: fmt.Sprintf("generated-%d", state.NextCardSequence), Slug: slug}
	state.NextCardSequence++
	*pile = append(*pile, card)
}

func countCardType(cards []CardInstance, kind string, catalog *gamecontent.Catalog) int {
	count := 0
	for _, instance := range cards {
		definition, ok := catalog.Card(instance.Slug)
		if ok && definition.Type == kind {
			count++
		}
	}
	return count
}

func decrementStatuses(state *State) {
	state.Player.Weak = max(0, state.Player.Weak-1)
	state.Player.Vulnerable = max(0, state.Player.Vulnerable-1)
	for index := range state.Enemies {
		state.Enemies[index].Weak = max(0, state.Enemies[index].Weak-1)
		state.Enemies[index].Vulnerable = max(0, state.Enemies[index].Vulnerable-1)
	}
}

func absorb(block *int, damage int) int {
	absorbed := min(*block, damage)
	*block -= absorbed
	return damage - absorbed
}

func containsCoreTypes(types []string) bool {
	return slices.Contains(types, "attack") && slices.Contains(types, "defense") && slices.Contains(types, "signal")
}

func addUnique(values []string, value string) []string {
	if value == "glitch" || slices.Contains(values, value) {
		return values
	}
	return append(values, value)
}

func cloneState(current State) State {
	next := current
	next.Enemies = slices.Clone(current.Enemies)
	next.DrawPile = slices.Clone(current.DrawPile)
	next.DiscardPile = slices.Clone(current.DiscardPile)
	next.Hand = slices.Clone(current.Hand)
	next.ExhaustPile = slices.Clone(current.ExhaustPile)
	next.PlayedTypes = slices.Clone(current.PlayedTypes)
	return next
}
