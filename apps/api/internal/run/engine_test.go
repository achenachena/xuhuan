package run

import (
	"encoding/base64"
	"testing"

	"github.com/achenachena/xuhuan/apps/api/internal/action"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func autopilotTrace(ticks int) action.InputTrace {
	controls := make([]byte, ticks)
	route := []byte{0, 4, 8, 12}
	for tick := range ticks {
		control := route[(tick/45)%len(route)] | 0x30
		if tick%210 == 1 {
			control |= 0x40
		}
		controls[tick] = control
	}
	raw := make([]byte, 0, ticks/20)
	for index := 0; index < len(controls); {
		count := 1
		for index+count < len(controls) && controls[index+count] == controls[index] && count < 255 {
			count++
		}
		raw = append(raw, controls[index], byte(count))
		index += count
	}
	return action.InputTrace{Encoding: action.TraceEncodingRLE, Ticks: ticks, Data: base64.RawStdEncoding.EncodeToString(raw)}
}

func TestNewRunStartsInsideTutorial(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state, err := NewState(StartInput{ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Seed: "0123456789abcdef", EmergencyReconnectAvailable: true}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if state.Phase != EncounterPhase || state.Encounter == nil || !state.Encounter.Tutorial || state.Map.CurrentNodeID != "tutorial" {
		t.Fatalf("state = %#v", state)
	}
	if len(state.Map.Nodes) != 10 {
		t.Fatalf("nodes = %d", len(state.Map.Nodes))
	}
}

func TestTutorialCompletionOffersThreeBuildCores(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state, err := NewState(StartInput{ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Seed: "0123456789abcdef", EmergencyReconnectAvailable: true}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	trace := autopilotTrace(state.Encounter.MaxTicks)
	resolution, outcome, err := Apply(state, "0123456789abcdef", Command{Type: CompleteEncounter, Trace: &trace}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if outcome != nil || resolution.State.Phase != RewardPhase || resolution.State.Reward == nil {
		t.Fatalf("resolution = %#v outcome=%v", resolution, outcome)
	}
	want := []string{"route-needle", "near-miss-cache", "soft-firewall"}
	for index, slug := range want {
		if resolution.State.Reward.ModuleChoices[index] != slug {
			t.Fatalf("choices = %#v", resolution.State.Reward.ModuleChoices)
		}
	}
	foundTutorial := false
	for _, event := range resolution.Events {
		foundTutorial = foundTutorial || event.Kind == "tutorial_completed"
	}
	if !foundTutorial {
		t.Fatal("tutorial completion event missing")
	}
}

func TestModuleRewardAndRestUpgrade(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state := State{Phase: RewardPhase, Health: 80, MaxHealth: 100, Modules: []ModuleLevel{}, Plugins: []string{}, Map: MapState{CurrentNodeID: "node", Nodes: []MapNode{{ID: "node", Status: CurrentNode}}}, Reward: &RewardState{ModuleChoices: []string{"soft-firewall"}}}
	resolution, _, err := Apply(state, "seed", Command{Type: ChooseModuleReward, ChoiceSlug: "soft-firewall"}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if len(resolution.State.Modules) != 1 || resolution.State.Modules[0].Level != 1 {
		t.Fatalf("modules=%#v", resolution.State.Modules)
	}
	resolution.State.Phase = RestPhase
	resolution.State.Map.CurrentNodeID = "node"
	resolution.State.Map.Nodes[0].Status = CurrentNode
	upgraded, _, err := Apply(resolution.State, "seed", Command{Type: Rest, Operation: "tune", ModuleSlug: "soft-firewall"}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if upgraded.State.Modules[0].Level != 2 {
		t.Fatalf("module=%#v", upgraded.State.Modules[0])
	}
}

func TestSmokeAutopilotCanClearEveryEncounterAtNoiseZero(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	for _, slug := range []string{"signal-handshake", "dock-pursuit", "comment-storm", "mixed-signal", "cache-purge", "moderation-sweep", "optimal-persona"} {
		definition, _ := catalog.Encounter(slug)
		state := State{Health: 100, MaxHealth: 100, NoiseLevel: 0, EmergencyReconnectAvailable: true, Modules: []ModuleLevel{}, Plugins: []string{}, Encounter: &EncounterState{Slug: slug, Seed: "smoke-seed:" + slug, Kind: definition.Kind, DurationTicks: definition.DurationTicks, MaxTicks: definition.MaxTicks, Tutorial: definition.Tutorial}}
		config, err := actionConfig(state, catalog)
		if err != nil {
			t.Fatal(err)
		}
		result, err := action.Simulate(config, autopilotTrace(definition.DurationTicks))
		if err != nil {
			t.Fatalf("%s: %v", slug, err)
		}
		if !result.Won {
			t.Fatalf("%s was not cleared: %#v", slug, result)
		}
	}
}

func TestThreeBuildCoresCanClearBaseEncounters(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	definition, _ := catalog.Encounter("mixed-signal")
	for _, core := range []string{"route-needle", "near-miss-cache", "soft-firewall"} {
		state := State{Health: 100, MaxHealth: 100, NoiseLevel: 0, EmergencyReconnectAvailable: true, Modules: []ModuleLevel{{Slug: core, Level: 1}}, Plugins: []string{}, Encounter: &EncounterState{Slug: definition.Slug, Seed: "build:" + core, Kind: definition.Kind, DurationTicks: definition.DurationTicks, MaxTicks: definition.MaxTicks}}
		config, err := actionConfig(state, catalog)
		if err != nil {
			t.Fatal(err)
		}
		result, err := action.Simulate(config, autopilotTrace(definition.DurationTicks))
		if err != nil || !result.Won {
			t.Fatalf("core %s did not clear: result=%#v err=%v", core, result, err)
		}
	}
}

func TestMapIsReachableAndNoiseAddsRouteConstraints(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	for noise := 0; noise <= 3; noise++ {
		state, err := NewState(StartInput{ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", NoiseLevel: noise, Seed: "map-seed", EmergencyReconnectAvailable: true}, catalog)
		if err != nil {
			t.Fatal(err)
		}
		byID := make(map[string]MapNode, len(state.Map.Nodes))
		for _, node := range state.Map.Nodes {
			byID[node.ID] = node
		}
		seen, queue := map[string]bool{"tutorial": true}, []string{"tutorial"}
		for len(queue) > 0 {
			id := queue[0]
			queue = queue[1:]
			for _, next := range byID[id].Next {
				if _, ok := byID[next]; !ok {
					t.Fatalf("noise %d: node %s references %s", noise, id, next)
				}
				if !seen[next] {
					seen[next] = true
					queue = append(queue, next)
				}
			}
		}
		if !seen["l6-a"] {
			t.Fatalf("noise %d cannot reach boss", noise)
		}
		if noise >= 2 && len(byID["l1-a"].Next) != 1 {
			t.Fatalf("noise %d did not constrain route", noise)
		}
		if noise == 3 && byID["l3-b"].Type != EliteNode {
			t.Fatal("noise 3 should replace rest with an elite")
		}
	}
}
