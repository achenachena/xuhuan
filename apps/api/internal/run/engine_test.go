package run

import (
	"reflect"
	"testing"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func newTestState(t *testing.T, seed string, noise int) State {
	t.Helper()
	state, err := NewState(StartInput{ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", NoiseLevel: noise, Seed: seed}, gamecontent.MustLoad(gamecontent.CurrentVersion))
	if err != nil {
		t.Fatal(err)
	}
	return state
}

func TestMapGenerationIsDeterministicAndReachable(t *testing.T) {
	first := newTestState(t, "map-seed", 1)
	second := newTestState(t, "map-seed", 1)
	if first.Relics == nil || first.ChoiceTags == nil {
		t.Fatal("new run must serialize empty collections as arrays")
	}
	if !reflect.DeepEqual(first.Map, second.Map) {
		t.Fatal("same seed produced different maps")
	}
	if len(first.Map.Nodes) != 12 {
		t.Fatalf("nodes = %d, want 12", len(first.Map.Nodes))
	}
	for _, node := range first.Map.Nodes {
		if node.Next == nil {
			t.Fatalf("node %s must serialize next as an array", node.ID)
		}
		if len(node.EnemySlugs) == 2 && node.EnemySlugs[0] == node.EnemySlugs[1] {
			t.Fatalf("node %s contains a duplicate enemy pair", node.ID)
		}
	}

	seen := map[string]bool{"l1-a": true, "l1-b": true}
	for changed := true; changed; {
		changed = false
		for _, node := range first.Map.Nodes {
			if !seen[node.ID] {
				continue
			}
			for _, next := range node.Next {
				if !seen[next] {
					seen[next] = true
					changed = true
				}
			}
		}
	}
	if !seen["l7-a"] {
		t.Fatal("boss is unreachable")
	}
}

func TestBackupBatteryPermanentlyRaisesRunHealth(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state := newTestState(t, "battery", 0)
	state.Phase = EventPhase
	state.CurrentEventSlug = "late-night-ops"
	state.Map.CurrentNodeID = "l2-a"
	state.Map.Nodes[nodeIndex(state.Map, "l2-a")].Status = CurrentNode

	resolution, outcome, err := Apply(state, "battery", Command{Type: ResolveEvent, ChoiceSlug: "copy"}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if outcome != nil {
		t.Fatalf("outcome = %v, want nil", *outcome)
	}
	if resolution.State.MaxHealth != 72 || resolution.State.Health != 72 {
		t.Fatalf("health = %d/%d, want 72/72", resolution.State.Health, resolution.State.MaxHealth)
	}
	if len(resolution.State.Relics) != 1 || resolution.State.Relics[0] != "backup-battery" {
		t.Fatalf("relics = %#v", resolution.State.Relics)
	}
}

func TestNoiseThreeChangesRulesInsteadOfOnlyHealth(t *testing.T) {
	state := newTestState(t, "noise", 3)
	resolution, _, err := Apply(state, "noise", Command{Type: ChooseNode, NodeID: "l1-b"}, gamecontent.MustLoad(gamecontent.CurrentVersion))
	if err != nil {
		t.Fatal(err)
	}
	if resolution.State.Combat == nil {
		t.Fatal("combat was not started")
	}
	if got := len(resolution.State.Combat.Enemies); got != 2 {
		t.Fatalf("noise encounter enemies = %d, want 2", got)
	}
	if resolution.State.Map.Nodes[nodeIndex(resolution.State.Map, "l1-a")].Status != LockedNode {
		t.Fatal("choosing l1-b did not close the alternative l1-a route")
	}
	if resolution.State.Combat.Player.DistortionLimit != 5 {
		t.Fatalf("distortion limit = %d, want 5", resolution.State.Combat.Player.DistortionLimit)
	}
	foundPacketLoss := false
	for _, card := range resolution.State.Combat.DiscardPile {
		foundPacketLoss = foundPacketLoss || card.Slug == "packet-loss"
	}
	if !foundPacketLoss {
		t.Fatal("noise level 3 did not inject packet-loss")
	}
}
