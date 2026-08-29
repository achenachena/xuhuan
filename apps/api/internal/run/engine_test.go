package run

import (
	"encoding/base64"
	"fmt"
	"slices"
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
	return encodedControlTrace(controls)
}

func encodedControlTrace(controls []byte) action.InputTrace {
	raw := make([]byte, 0, len(controls)/20)
	for index := 0; index < len(controls); {
		count := 1
		for index+count < len(controls) && controls[index+count] == controls[index] && count < 255 {
			count++
		}
		raw = append(raw, controls[index], byte(count))
		index += count
	}
	return action.InputTrace{Encoding: action.TraceEncodingRLE, Ticks: len(controls), Data: base64.RawURLEncoding.EncodeToString(raw)}
}

func productionSmokeTrace(definition gamecontent.Encounter) action.InputTrace {
	controls := make([]byte, 0, definition.MaxTicks)
	appendControls := func(direction, count int, useWarp bool) {
		for range count {
			skill := byte(0)
			if useWarp && len(controls)%121 == 0 {
				skill = 0x40
			}
			controls = append(controls, byte(direction&0x0f)|0x30|skill)
		}
	}
	if definition.Kind == "tutorial" || definition.Objective.Kind == "recover" {
		// Visit every possible route-pattern coordinate in both directions. The
		// authoritative seed chooses one of three patterns, so this path stays
		// seed-independent while collecting four or five recover signals.
		sweep := [][2]int{{12, 26}, {8, 25}, {4, 5}, {0, 50}, {8, 50}, {12, 31}, {0, 50}, {8, 25}, {12, 41}, {0, 25}, {4, 4}, {8, 25}, {12, 4}, {0, 25}, {4, 41}, {8, 50}, {0, 50}, {4, 31}, {8, 50}, {0, 25}, {12, 5}, {4, 26}}
		for len(controls) < definition.MaxTicks {
			for _, step := range sweep {
				appendControls(step[0], step[1], false)
			}
			if definition.Kind == "tutorial" {
				// All three signals have been visited; release one empowered Warp.
				controls = append(controls, 0x44)
			}
		}
	} else if definition.Objective.Kind == "stabilize" {
		appendControls(12, 48, false)
		for len(controls) < definition.MaxTicks {
			for _, direction := range []int{0, 4, 8, 12} {
				appendControls(direction, 4, false)
			}
		}
	} else {
		// A smooth clockwise orbit models ordinary one-thumb play better than a
		// stationary damage race. Its slower-than-minimum Warp cadence remains
		// valid for every authored kit while avoiding seed-specific pathing.
		return combatOrbitTrace(definition.MaxTicks)
	}
	controls = controls[:definition.MaxTicks]
	return encodedControlTrace(controls)
}

func combatOrbitTrace(ticks int) action.InputTrace {
	return parameterizedOrbitTrace(ticks, 21, 149, 4)
}

func parameterizedOrbitTrace(ticks, segmentTicks, warpEvery, phase int) action.InputTrace {
	controls := make([]byte, ticks)
	for tick := range ticks {
		direction := ((tick + phase) / segmentTicks) % 16
		control := byte(direction&0x0f) | 0x30
		if (tick+phase)%warpEvery == 0 {
			control |= 0x40
		}
		controls[tick] = control
	}
	return encodedControlTrace(controls)
}

func buildCoreExerciseTrace(ticks int) action.InputTrace {
	controls := make([]byte, 0, ticks)
	appendMove := func(direction, count int) {
		for range count {
			control := byte(direction&0x0f) | 0x30
			if len(controls)%121 == 0 {
				control |= 0x40
			}
			controls = append(controls, control)
		}
	}
	appendMove(12, 38)
	for len(controls) < ticks {
		for direction := range 16 {
			appendMove(direction, 11)
		}
	}
	return encodedControlTrace(controls[:ticks])
}

func simulateBuildEncounter(t *testing.T, catalog *gamecontent.Catalog, chapterSlug, characterSlug, encounterSlug, seed string, modules []ModuleLevel, plugins []string) (action.Config, action.Result) {
	t.Helper()
	definition, ok := catalog.Encounter(encounterSlug)
	if !ok {
		t.Fatalf("encounter %q is missing", encounterSlug)
	}
	character, ok := catalog.Character(characterSlug)
	if !ok {
		t.Fatalf("character %q is missing", characterSlug)
	}
	kit, ok := catalog.Kit(character.KitSlug)
	if !ok {
		t.Fatalf("kit %q is missing", character.KitSlug)
	}
	state := State{
		ChapterSlug: chapterSlug, CharacterSlug: characterSlug,
		Health: kit.BaseStats.MaxHealth, MaxHealth: kit.BaseStats.MaxHealth,
		NoiseLevel: 0, EmergencyReconnectAvailable: false,
		Modules: slices.Clone(modules), Plugins: slices.Clone(plugins),
		Encounter: &EncounterState{
			Slug: definition.Slug, Seed: seed, Kind: definition.Kind,
			DurationTicks: definition.DurationTicks, MaxTicks: definition.MaxTicks,
			Objective: action.ObjectiveConfig{Kind: definition.Objective.Kind, Target: definition.Objective.Target},
			Hazards:   slices.Clone(definition.Hazards),
		},
	}
	var err error
	state.RuntimeConfig, err = resolveRuntime(state, catalog)
	if err != nil {
		t.Fatalf("resolve runtime: %v", err)
	}
	config, err := actionConfig(state, catalog)
	if err != nil {
		t.Fatalf("build action config: %v", err)
	}
	result, err := action.Simulate(config, productionSmokeTrace(definition))
	if err != nil {
		t.Fatalf("simulate %s: %v", encounterSlug, err)
	}
	return config, result
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
	if state.Encounter.Hazards == nil {
		t.Fatal("empty encounter hazards must serialize as an array, not null")
	}
	if len(state.Map.Nodes) != 11 {
		t.Fatalf("nodes = %d", len(state.Map.Nodes))
	}
}

func TestTutorialDoesNotRepeatAfterCompletion(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state, err := NewState(StartInput{ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Seed: "0123456789abcdef", EmergencyReconnectAvailable: true, TutorialCompleted: true}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if state.Phase != MapPhase || state.Encounter != nil || state.Map.CurrentNodeID != "" || len(state.Map.Nodes) != 10 {
		t.Fatalf("returning-player state = %#v", state)
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
	if len(resolution.State.Reward.ModuleChoices) != 3 {
		t.Fatalf("choices = %#v", resolution.State.Reward.ModuleChoices)
	}
	foundTutorial, foundPrelude := false, false
	for _, event := range resolution.Events {
		foundTutorial = foundTutorial || event.Kind == "tutorial_completed"
		foundPrelude = foundPrelude || event.Kind == "story_scene_ready" && event.SceneSlug == "nana-prelude"
	}
	if !foundTutorial || !foundPrelude {
		t.Fatalf("tutorial events=%#v", resolution.Events)
	}
}

func TestModuleRewardAndRestUpgrade(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state := State{Phase: RewardPhase, ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Health: 80, MaxHealth: 100, Modules: []ModuleLevel{}, Plugins: []string{}, Map: MapState{CurrentNodeID: "node", Nodes: []MapNode{{ID: "node", Status: CurrentNode}}}, Reward: &RewardState{ModuleChoices: []string{"soft-firewall"}}, RerollsRemaining: 1}
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

func TestEveryChapterBuildsAuthoritativeEncounterConfig(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	for _, chapter := range catalog.Chapters {
		character := chapter.CharacterSlug
		if character == "" {
			character = "nana7mi"
		}
		definition, _ := catalog.Encounter(chapter.BossEncounterSlug)
		base, err := NewState(StartInput{ChapterSlug: chapter.Slug, CharacterSlug: character, Seed: "smoke-seed", Mode: CampaignMode, EmergencyReconnectAvailable: true}, catalog)
		if err != nil {
			t.Fatalf("%s: %v", chapter.Slug, err)
		}
		state := base
		state.Encounter = &EncounterState{Slug: definition.Slug, Seed: "smoke:" + chapter.Slug, Kind: definition.Kind, DurationTicks: definition.DurationTicks, MaxTicks: definition.MaxTicks, Objective: action.ObjectiveConfig{Kind: definition.Objective.Kind, Target: definition.Objective.Target}, Hazards: definition.Hazards}
		config, err := actionConfig(state, catalog)
		if err != nil {
			t.Fatal(err)
		}
		if config.Runtime.Kit == "" || config.Objective.Kind == "" || len(config.Enemies) == 0 {
			t.Fatalf("%s unresolved config %#v", chapter.Slug, config)
		}
	}
}

func TestProductionSmokeTraceClearsEveryAuthoredEncounter(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	for _, definition := range catalog.Encounters {
		definition := definition
		t.Run(definition.Slug, func(t *testing.T) {
			chapter, ok := catalog.Chapter(definition.ChapterSlug)
			if !ok {
				t.Fatal("chapter is missing")
			}
			character := chapter.CharacterSlug
			if character == "" {
				character = "nana7mi"
			}
			for seedIndex := range 3 {
				seed := fmt.Sprintf("production-smoke:%s:%d", definition.Slug, seedIndex)
				state := State{ChapterSlug: chapter.Slug, CharacterSlug: character, Health: baseMaxHealth, MaxHealth: baseMaxHealth, EmergencyReconnectAvailable: true, Modules: []ModuleLevel{}, Plugins: []string{}, Encounter: &EncounterState{Slug: definition.Slug, Seed: seed, Kind: definition.Kind, DurationTicks: definition.DurationTicks, MaxTicks: definition.MaxTicks, Objective: action.ObjectiveConfig{Kind: definition.Objective.Kind, Target: definition.Objective.Target}, Hazards: definition.Hazards}}
				state.RuntimeConfig, _ = resolveRuntime(state, catalog)
				config, err := actionConfig(state, catalog)
				if err != nil {
					t.Fatal(err)
				}
				result, err := action.Simulate(config, productionSmokeTrace(definition))
				if err != nil || !result.Won {
					t.Fatalf("seed=%d objective=%s health=%d ticks=%d kills=%d protocols=%d progress=%d/%d error=%v", seedIndex, definition.Objective.Kind, result.Health, result.Ticks, result.Kills, result.ProtocolsCompleted, result.Final.Objective.Progress, result.Final.Objective.Target, err)
				}
			}
		})
	}
}

func TestFinaleCompanionsResolveIntoAuthoritativeSupport(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state, err := NewState(StartInput{
		ChapterSlug: "zero-channel", CharacterSlug: "nana7mi", Seed: "finale-support-seed",
		CompanionSlugs: []string{"jiaran", "xiangwan", "bella", "lulu", "xingtong", "nailu"}, SupportAlignment: "authentic",
	}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	character, _ := catalog.Character("nana7mi")
	kit, _ := catalog.Kit(character.KitSlug)
	if len(state.CompanionSlugs) != 6 || state.RuntimeConfig.AttackDamage != kit.BaseStats.AttackDamage+6 || state.RuntimeConfig.ProjectileCount != 3 || state.RuntimeConfig.ResonancePower != 12 {
		t.Fatalf("finale support state=%#v runtime=%#v", state.CompanionSlugs, state.RuntimeConfig)
	}
}

func TestNanaBuildCoresClearBossWithAuthoredMechanics(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	tests := []struct {
		name        string
		seed        string
		modules     []ModuleLevel
		plugins     []string
		verifyBuild func(*testing.T, action.Config, action.Result)
	}{
		{
			name: "route loop", seed: "production-smoke:optimal-persona:0",
			modules: []ModuleLevel{{Slug: "route-needle", Level: 1}, {Slug: "wake-cutter", Level: 1}, {Slug: "seventh-coordinate", Level: 1}, {Slug: "harbor-map", Level: 1}},
			plugins: []string{"harbor-router"},
			verifyBuild: func(t *testing.T, config action.Config, result action.Result) {
				t.Helper()
				if !slices.ContainsFunc(config.Runtime.Behaviors, func(behavior action.RuntimeBehavior) bool { return behavior.Kind == "warp_aftershock" }) || result.ProtocolsCompleted == 0 {
					t.Fatalf("route mechanics were not exercised: runtime=%#v result=%#v", config.Runtime, result)
				}
			},
		},
		{
			name: "distortion burst", seed: "production-smoke:optimal-persona:2",
			modules: []ModuleLevel{{Slug: "false-horizon", Level: 1}, {Slug: "wide-berth", Level: 2}, {Slug: "unsafe-optimization", Level: 1}, {Slug: "route-needle", Level: 1}},
			verifyBuild: func(t *testing.T, config action.Config, result action.Result) {
				t.Helper()
				if config.Runtime.DistortionGain <= 4 || config.Runtime.OverloadBonus == 0 || result.Final.TotalGrazes < 10 || result.Distortion < 60 {
					t.Fatalf("distortion mechanics were not exercised: runtime=%#v grazes=%d distortion=%d", config.Runtime, result.Final.TotalGrazes, result.Distortion)
				}
			},
		},
		{
			name: "guard echo", seed: "production-smoke:optimal-persona:0",
			modules: []ModuleLevel{{Slug: "soft-firewall", Level: 1}, {Slug: "tidal-cache", Level: 1}, {Slug: "return-current", Level: 1}, {Slug: "echo-recorder", Level: 1}},
			plugins: []string{"compass-without-north"},
			verifyBuild: func(t *testing.T, config action.Config, result action.Result) {
				t.Helper()
				if config.Runtime.StartingShield == 0 || config.Runtime.EchoPower == 0 || config.Runtime.HealOnProtocol == 0 || result.ProtocolsCompleted == 0 {
					t.Fatalf("guard/echo mechanics were not exercised: runtime=%#v result=%#v", config.Runtime, result)
				}
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			config, _ := simulateBuildEncounter(t, catalog, "seventh-dock", "nana7mi", "optimal-persona", test.seed, test.modules, test.plugins)
			result, err := action.Simulate(config, buildCoreExerciseTrace(config.MaxTicks))
			if err != nil {
				t.Fatal(err)
			}
			if !result.Won || result.Health <= 0 || result.EmergencyReconnectUsed {
				t.Fatalf("build did not clear without reconnect: health=%d ticks=%d result=%#v", result.Health, result.Ticks, result)
			}
			test.verifyBuild(t, config, result)
		})
	}
}

func TestCombatOrbitTraceClearsLowHealthCumulativeBossRegression(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	definition, ok := catalog.Encounter("reality-auditor")
	if !ok {
		t.Fatal("reality-auditor encounter is missing")
	}
	tests := []struct {
		name    string
		seed    string
		health  int
		modules []ModuleLevel
		plugins []string
	}{
		{name: "critical-health", seed: "a7dc9935f1359794860c5fc4bca8b2bf376da56bc76eb79519caadbd57ab97f3:l6-a", health: 15, modules: []ModuleLevel{{Slug: "memory-seed", Level: 3}, {Slug: "wide-berth", Level: 1}, {Slug: "guard-channel", Level: 1}, {Slug: "unsafe-optimization", Level: 1}}, plugins: []string{"flower-without-source"}},
		{name: "two-plugins", seed: "66a9a62d43628c4a597486456f3830bf4bf5284bbff77e3c3df076f3aca954b0:l6-a", health: 60, modules: []ModuleLevel{{Slug: "memory-seed", Level: 2}, {Slug: "wide-berth", Level: 1}, {Slug: "kindness-compost", Level: 1}, {Slug: "unsafe-optimization", Level: 1}}, plugins: []string{"flower-without-source", "dead-air-fan"}},
		{name: "authentic-branch", seed: "4fa74d80ae08cf5ccd896308a64d6c042b65f30f345931eb143308833db92409:l6-a", health: 46, modules: []ModuleLevel{{Slug: "memory-seed", Level: 2}, {Slug: "wide-berth", Level: 1}, {Slug: "kindness-compost", Level: 1}, {Slug: "unsafe-optimization", Level: 1}}, plugins: []string{"flower-without-source", "dead-air-fan"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			state := State{
				ChapterSlug: "laplace-florist", CharacterSlug: "nailu", Health: test.health, MaxHealth: 108,
				Modules:           test.modules,
				Plugins:           test.plugins,
				Encounter:         &EncounterState{Slug: definition.Slug, Seed: test.seed, Kind: definition.Kind, DurationTicks: definition.DurationTicks, MaxTicks: definition.MaxTicks, Objective: action.ObjectiveConfig{Kind: "boss", Target: 1}, Hazards: slices.Clone(definition.Hazards)},
				NarrativeModifier: NarrativeModifier{BossVariant: "authentic"},
			}
			var err error
			state.RuntimeConfig, err = resolveRuntime(state, catalog)
			if err != nil {
				t.Fatal(err)
			}
			config, err := actionConfig(state, catalog)
			if err != nil {
				t.Fatal(err)
			}
			result, err := action.Simulate(config, combatOrbitTrace(definition.MaxTicks))
			if err != nil || !result.Won || result.Health <= 0 || result.EmergencyReconnectUsed {
				t.Fatalf("low-health regression did not clear without reconnect: result=%#v error=%v", result, err)
			}
		})
	}
}

func TestBellaPerfectWarpClearsCumulativeBossRegression(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	definition, ok := catalog.Encounter("perfect-captain")
	if !ok {
		t.Fatal("perfect-captain encounter is missing")
	}
	tests := []struct {
		name    string
		seed    string
		health  int
		modules []ModuleLevel
	}{
		{name: "full-health-overload", seed: "07a7aca4ba2dd52296788f8606d1330d51414bfae41a99757b59a8413269a65a:l6-a", health: 118, modules: []ModuleLevel{{Slug: "perfect-beat", Level: 1}, {Slug: "overtime-step", Level: 1}, {Slug: "human-metronome", Level: 1}, {Slug: "rest-request", Level: 1}, {Slug: "unsafe-optimization", Level: 1}}},
		{name: "damaged-with-rest", seed: "9375339909751c180ce76fa9f8f974715f79f5dbebef04ec470407b830e9573e:l6-a", health: 83, modules: []ModuleLevel{{Slug: "perfect-beat", Level: 1}, {Slug: "overtime-step", Level: 1}, {Slug: "rest-request", Level: 2}, {Slug: "unsafe-optimization", Level: 1}}},
		{name: "wide-berth", seed: "8c1c3c9f2967da11c532b136b9172482528ba6a72d31774a0e26d317c80808d1:l6-a", health: 106, modules: []ModuleLevel{{Slug: "perfect-beat", Level: 1}, {Slug: "wide-berth", Level: 1}, {Slug: "rest-request", Level: 1}, {Slug: "human-metronome", Level: 1}}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			state := State{ChapterSlug: "captains-do-not-rest", CharacterSlug: "bella", Health: test.health, MaxHealth: 118, Modules: test.modules,
				Encounter:         &EncounterState{Slug: definition.Slug, Seed: test.seed, Kind: definition.Kind, DurationTicks: definition.DurationTicks, MaxTicks: definition.MaxTicks, Objective: action.ObjectiveConfig{Kind: "boss", Target: 1}, Hazards: slices.Clone(definition.Hazards)},
				NarrativeModifier: NarrativeModifier{BossVariant: "authentic"}}
			var err error
			state.RuntimeConfig, err = resolveRuntime(state, catalog)
			if err != nil {
				t.Fatal(err)
			}
			config, err := actionConfig(state, catalog)
			if err != nil {
				t.Fatal(err)
			}
			result, err := action.Simulate(config, combatOrbitTrace(definition.MaxTicks))
			if err != nil || !result.Won || result.Health <= 0 || result.EmergencyReconnectUsed {
				t.Fatalf("cumulative Bella boss regression did not clear without reconnect: result=%#v error=%v", result, err)
			}
		})
	}
}

func TestEveryCharacterKitClearsNormalEliteAndBossAtNoiseZero(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	tests := []struct {
		chapter, character, kit, plugin string
		modules                         []string
	}{
		{chapter: "seventh-dock", character: "nana7mi", kit: "nana-route", plugin: "harbor-router", modules: []string{"route-needle", "soft-firewall", "tidal-cache", "false-horizon", "signal-lens"}},
		{chapter: "always-cheerful", character: "jiaran", kit: "diana-cheer", plugin: "emergency-encore", modules: []string{"cheer-counter", "quiet-encore", "applause-loop", "off-air-sigh", "signal-lens"}},
		{chapter: "loss-hidden", character: "xiangwan", kit: "ava-afterimage", plugin: "retry-cartridge", modules: []string{"afterimage-driver", "retry-buffer", "ghost-input", "hidden-loss", "signal-lens"}},
		{chapter: "captains-do-not-rest", character: "bella", kit: "bella-cadence", plugin: "metronome-exception", modules: []string{"perfect-beat", "captain-shield", "tempo-core", "overtime-step", "signal-lens"}},
		{chapter: "localization-failed", character: "lulu", kit: "lulu-glitch", plugin: "translation-memory", modules: []string{"mistranslation-ray", "comment-out", "locale-fallback", "syntax-error", "signal-lens"}},
		{chapter: "which-is-original", character: "xingtong", kit: "xingtong-prism", plugin: "virtual-origin", modules: []string{"beam-rehearsal", "orbit-stage", "prism-stance", "original-copy", "signal-lens"}},
		{chapter: "laplace-florist", character: "nailu", kit: "nailu-bloom", plugin: "flower-without-source", modules: []string{"laplace-bloom", "imaginary-soil", "delayed-petal", "kindness-compost", "signal-lens"}},
	}
	for _, test := range tests {
		t.Run(test.character, func(t *testing.T) {
			chapter, ok := catalog.Chapter(test.chapter)
			if !ok || len(chapter.EncounterPool) == 0 || len(chapter.ElitePool) == 0 {
				t.Fatalf("chapter %q is missing representative encounters", test.chapter)
			}
			stages := []struct {
				name, encounter string
				moduleCount     int
				plugin          string
			}{
				{name: "normal", encounter: chapter.EncounterPool[0], moduleCount: 1},
				{name: "elite", encounter: chapter.ElitePool[0], moduleCount: 3},
				{name: "boss", encounter: chapter.BossEncounterSlug, moduleCount: len(test.modules), plugin: test.plugin},
			}
			for _, stage := range stages {
				t.Run(stage.name, func(t *testing.T) {
					modules := make([]ModuleLevel, 0, stage.moduleCount)
					for _, slug := range test.modules[:stage.moduleCount] {
						modules = append(modules, ModuleLevel{Slug: slug, Level: 1})
					}
					plugins := []string{}
					if stage.plugin != "" {
						plugins = append(plugins, stage.plugin)
					}
					for seedIndex := range 2 {
						t.Run(fmt.Sprintf("seed-%d", seedIndex), func(t *testing.T) {
							seed := fmt.Sprintf("production-smoke:%s:%d", stage.encounter, seedIndex)
							config, result := simulateBuildEncounter(t, catalog, test.chapter, test.character, stage.encounter, seed, modules, plugins)
							if config.Runtime.Kit != test.kit || !result.Won || result.Health <= 0 || result.EmergencyReconnectUsed {
								t.Fatalf("kit=%s encounter=%s health=%d ticks=%d won=%v reconnect=%v", config.Runtime.Kit, stage.encounter, result.Health, result.Ticks, result.Won, result.EmergencyReconnectUsed)
							}
						})
					}
				})
			}
		})
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

func TestStoryNodesExposeAuthoredMidpointAndBossBranch(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	midpoint := State{
		Phase: EventPhase, ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Health: 80, MaxHealth: 100,
		Modules: []ModuleLevel{}, Plugins: []string{}, CurrentEventSlug: "unsent-voice",
		Map: MapState{CurrentNodeID: "l4-a", Nodes: []MapNode{{ID: "l4-a", Type: StoryNode, Status: CurrentNode}}},
	}
	resolved, _, err := Apply(midpoint, "seed", Command{Type: ResolveEvent, ChoiceSlug: "keep-trace"}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(resolved.Events, func(event Event) bool { return event.Kind == "story_scene_ready" && event.SceneSlug == "nana-midpoint" }) {
		t.Fatalf("midpoint events=%#v", resolved.Events)
	}
	boss := State{
		Phase: MapPhase, ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Health: 80, MaxHealth: 100,
		Modules: []ModuleLevel{}, Plugins: []string{}, Map: MapState{Nodes: []MapNode{{ID: "boss", Type: BossNode, Status: AvailableNode, EncounterSlug: "optimal-persona"}}},
	}
	entered, _, err := Apply(boss, "seed", Command{Type: ChooseNode, NodeID: "boss"}, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(entered.Events, func(event Event) bool {
		return event.Kind == "story_scene_ready" && event.SceneSlug == "nana-boss-branch"
	}) {
		t.Fatalf("boss events=%#v", entered.Events)
	}
}

func TestRewardRerollIsLimitedAndCanBeEarned(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state := State{
		Phase: RewardPhase, ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Health: 100, MaxHealth: 100,
		Modules: []ModuleLevel{}, Plugins: []string{}, RerollsRemaining: 1,
		Map:    MapState{CurrentNodeID: "node", Nodes: []MapNode{{ID: "node", Status: CurrentNode, RewardBias: "surge"}}},
		Reward: &RewardState{ModuleChoices: []string{"route-needle", "near-miss-cache", "soft-firewall"}},
	}
	first, _, err := Apply(state, "seed", Command{Type: RerollModuleReward}, catalog)
	if err != nil || first.State.RerollsRemaining != 0 || !first.State.Reward.Rerolled {
		t.Fatalf("reroll=%#v error=%v", first.State.Reward, err)
	}
	if _, _, err := Apply(first.State, "seed", Command{Type: RerollModuleReward}, catalog); err != ErrInvalidCommand {
		t.Fatalf("second reroll error=%v", err)
	}
	events := []Event{}
	if err := applyEffects(&first.State, []gamecontent.Effect{{Kind: "reroll_charge", Amount: 1}}, catalog, &events); err != nil || first.State.RerollsRemaining != 1 {
		t.Fatalf("earned reroll=%d events=%#v error=%v", first.State.RerollsRemaining, events, err)
	}
}

func TestRewardPoolFiltersLockedContentAndKeepsThreeChoices(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state := State{
		ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Modules: []ModuleLevel{}, Plugins: []string{},
		RewardPool: RewardPool{ModuleSlugs: []string{"signal-lens", "soft-firewall", "forked-message"}, PluginSlugs: []string{"one-person-cdn"}},
	}
	choices := rewardChoices(&state, catalog, "balanced")
	if len(choices) != 3 {
		t.Fatalf("unlocked choices=%#v", choices)
	}
	for _, slug := range choices {
		if !slices.Contains(state.RewardPool.ModuleSlugs, slug) {
			t.Fatalf("locked module %q entered reward %#v", slug, choices)
		}
	}
	if plugin := grantPlugin(&state, catalog); plugin != "one-person-cdn" {
		t.Fatalf("locked plugin entered elite reward: %q", plugin)
	}
	state.Plugins = nil
	state.RewardPool.PluginSlugs = []string{}
	if plugin := grantPlugin(&state, catalog); plugin != "" {
		t.Fatalf("empty persistent plugin pool granted %q", plugin)
	}
}

func TestNarrativeBranchDeterministicallyWeightsImmediateReward(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	base := State{
		ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Modules: []ModuleLevel{}, Plugins: []string{},
		RewardPool: RewardPool{ModuleSlugs: []string{"signal-lens", "soft-firewall", "forked-message", "wide-berth"}},
	}
	authentic := cloneState(base)
	authentic.NarrativeModifier = NarrativeModifier{RewardBias: "glitch", BossVariant: "authentic"}
	retained := cloneState(base)
	retained.NarrativeModifier = NarrativeModifier{RewardBias: "surge", BossVariant: "retained"}
	authenticChoices := rewardChoices(&authentic, catalog, "balanced")
	retainedChoices := rewardChoices(&retained, catalog, "balanced")
	if authenticChoices[0] != "wide-berth" || retainedChoices[0] != "signal-lens" || slices.Equal(authenticChoices, retainedChoices) {
		t.Fatalf("authentic=%#v retained=%#v", authenticChoices, retainedChoices)
	}
}

func TestUnlockedStarterAndCumulativeModuleBehaviorsResolveAtRunStart(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	state, err := NewState(StartInput{
		ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Seed: "starter-seed", TutorialCompleted: true,
		UnlockedModuleSlugs: []string{"route-needle", "signal-lens", "soft-firewall"},
		UnlockedPluginSlugs: []string{"harbor-router"}, StarterModuleSlug: "route-needle",
	}, catalog)
	if err != nil || len(state.Modules) != 1 || state.Modules[0] != (ModuleLevel{Slug: "route-needle", Level: 1}) {
		t.Fatalf("starter state=%#v error=%v", state.Modules, err)
	}
	state.Modules = []ModuleLevel{{Slug: "signal-lens", Level: 3}}
	runtime, err := resolveRuntime(state, catalog)
	if err != nil || len(runtime.Behaviors) != 3 {
		t.Fatalf("resolved behaviors=%#v error=%v", runtime.Behaviors, err)
	}
	for index, behavior := range runtime.Behaviors {
		if behavior.SourceSlug != "signal-lens" || behavior.Level != index+1 || behavior.Kind != "warp_aftershock" {
			t.Fatalf("behavior[%d]=%#v", index, behavior)
		}
	}
}

func TestNoiseOnlyRaisesDifficultyPressure(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	base := State{ChapterSlug: "seventh-dock", CharacterSlug: "nana7mi", Modules: []ModuleLevel{}, Plugins: []string{}}
	zero, err := resolveRuntime(base, catalog)
	if err != nil {
		t.Fatal(err)
	}
	base.NoiseLevel = 3
	noiseThree, err := resolveRuntime(base, catalog)
	if err != nil {
		t.Fatal(err)
	}
	if noiseThree.AttackDamage != zero.AttackDamage || noiseThree.MoveSpeed != zero.MoveSpeed || noiseThree.DistortionGain != zero.DistortionGain+4 {
		t.Fatalf("noise zero=%#v noise three=%#v", zero, noiseThree)
	}
}
