package combat

import (
	"reflect"
	"testing"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func testDeck() []CardInstance {
	return []CardInstance{
		{ID: "a1", Slug: "forward-signal"}, {ID: "a2", Slug: "forward-signal"},
		{ID: "a3", Slug: "forward-signal"}, {ID: "d1", Slug: "emergency-shield"},
		{ID: "d2", Slug: "emergency-shield"}, {ID: "d3", Slug: "emergency-shield"},
		{ID: "s1", Slug: "course-correction"}, {ID: "s2", Slug: "course-correction"},
		{ID: "s3", Slug: "this-is-good"}, {ID: "a4", Slug: "crash-through"},
	}
}

func TestStartIsDeterministic(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	input := StartInput{Deck: testDeck(), EnemySlugs: []string{"retention-drone", "muted-comment"}, Seed: "same-seed", Health: 64, MaxHealth: 64, NoiseLevel: 2}
	first, err := Start(input, catalog)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Start(input, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatal("same seed and input produced different combat states")
	}
	if len(first.State.Hand) != BaseHandSize {
		t.Fatalf("opening hand = %d, want %d", len(first.State.Hand), BaseHandSize)
	}
	if len(first.State.Enemies) != 2 {
		t.Fatalf("enemies = %d, want 2", len(first.State.Enemies))
	}
	if first.State.Hand == nil || first.State.DrawPile == nil || first.State.DiscardPile == nil || first.State.ExhaustPile == nil {
		t.Fatal("combat piles must serialize empty collections as arrays")
	}
}

func TestNanaRouteAwardsOneBeaconAndOneCard(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state := State{
		Status: Active, Seed: "route", Turn: 1,
		Player:   PlayerState{MaxHealth: 64, Health: 64, Bandwidth: 3, DistortionLimit: 6},
		Enemies:  []EnemyState{{ID: "enemy-1", Slug: "retention-drone", MaxHealth: 99, Health: 99}},
		Hand:     []CardInstance{{ID: "attack", Slug: "forward-signal"}, {ID: "defense", Slug: "emergency-shield"}, {ID: "signal", Slug: "course-correction"}},
		DrawPile: []CardInstance{{ID: "drawn", Slug: "this-is-good"}, {ID: "extra", Slug: "forward-signal"}},
	}
	var err error
	for _, play := range []struct{ card, target string }{{"attack", "enemy-1"}, {"defense", "player"}, {"signal", ""}} {
		resolution, playErr := PlayCard(state, play.card, play.target, nil, catalog)
		if playErr != nil {
			err = playErr
			break
		}
		state = resolution.State
	}
	if err != nil {
		t.Fatal(err)
	}
	if state.Player.Beacons != 1 || !state.RouteCompleted {
		t.Fatalf("route state = beacons %d, completed %v", state.Player.Beacons, state.RouteCompleted)
	}
	if len(state.Hand) != 2 {
		t.Fatalf("hand = %d, want two cards from the signal draw and route draw", len(state.Hand))
	}
}

func TestDistortionOverflowDamagesAndInjectsGlitch(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state := State{
		Status: Active, Seed: "distortion", Turn: 1,
		Player:  PlayerState{MaxHealth: 64, Health: 64, Bandwidth: 3, DistortionLimit: 6},
		Enemies: []EnemyState{{ID: "enemy-1", Slug: "retention-drone", MaxHealth: 99, Health: 99}},
		Hand:    []CardInstance{{ID: "g1", Slug: "overclock-voyage"}, {ID: "g2", Slug: "overclock-voyage"}, {ID: "g3", Slug: "overclock-voyage"}},
	}
	for _, id := range []string{"g1", "g2", "g3"} {
		resolution, err := PlayCard(state, id, "", nil, catalog)
		if err != nil {
			t.Fatal(err)
		}
		state = resolution.State
	}
	if state.Player.Distortion != 2 || state.Player.Health != 59 {
		t.Fatalf("after desync distortion=%d health=%d, want 2 and 59", state.Player.Distortion, state.Player.Health)
	}
	found := false
	for _, card := range state.DiscardPile {
		found = found || card.Slug == "scrambled-caption"
	}
	if !found {
		t.Fatal("desync did not inject scrambled-caption")
	}
}

func TestInvalidTargetDoesNotMutateState(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state := State{
		Status: Active, Seed: "target", Player: PlayerState{MaxHealth: 64, Health: 64, Bandwidth: 3, DistortionLimit: 6},
		Enemies: []EnemyState{{ID: "enemy-1", Slug: "retention-drone", MaxHealth: 28, Health: 28}},
		Hand:    []CardInstance{{ID: "attack", Slug: "forward-signal"}},
	}
	before := cloneState(state)
	if _, err := PlayCard(state, "attack", "missing", nil, catalog); err != ErrInvalidTarget {
		t.Fatalf("PlayCard() error = %v, want ErrInvalidTarget", err)
	}
	if !reflect.DeepEqual(state, before) {
		t.Fatal("invalid command mutated caller state")
	}
}
