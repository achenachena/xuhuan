package content

import "testing"

func TestActionCatalogIsCompleteAndBilingual(t *testing.T) {
	catalog := MustLoad(CurrentVersion)
	if catalog.Version != "v3" || catalog.Protocol != "action-v2" || len(catalog.Characters) != 7 || len(catalog.Modules) != 68 || len(catalog.Plugins) != 20 || len(catalog.Enemies) < 30 || len(catalog.Events) < 20 || len(catalog.Chapters) != 8 {
		t.Fatalf("unexpected action content counts: characters=%d modules=%d plugins=%d enemies=%d events=%d", len(catalog.Characters), len(catalog.Modules), len(catalog.Plugins), len(catalog.Enemies), len(catalog.Events))
	}
	for _, module := range catalog.Modules {
		if catalog.Text("zh-CN", module.NameKey) == "" || catalog.Text("en", module.NameKey) == "" || catalog.Text("zh-CN", module.DescriptionKey) == "" || catalog.Text("en", module.DescriptionKey) == "" {
			t.Fatalf("module %q is not bilingual", module.Slug)
		}
	}
	behaviorCount := 0
	for _, module := range catalog.Modules {
		for _, level := range module.Levels {
			behaviorCount += len(level.Behaviors)
		}
	}
	if behaviorCount < 12 {
		t.Fatalf("only %d authored module behaviors were loaded", behaviorCount)
	}
	for _, character := range catalog.Characters {
		found := false
		for _, module := range catalog.Modules {
			if module.CharacterSlug != character.Slug {
				continue
			}
			for _, level := range module.Levels {
				found = found || len(level.Behaviors) > 0
			}
		}
		if !found {
			t.Fatalf("character %q has no authored module behavior", character.Slug)
		}
	}
	if encounter, ok := catalog.Encounter("signal-handshake"); !ok || !encounter.Tutorial || encounter.Objective.Kind != "recover" {
		t.Fatalf("tutorial encounter = %#v, %v", encounter, ok)
	}
	if chapter, ok := catalog.Chapter("seventh-dock"); !ok || chapter.BossEncounterSlug != "optimal-persona" {
		t.Fatalf("chapter = %#v, %v", chapter, ok)
	}
}

func TestUnknownContentVersionIsRejected(t *testing.T) {
	if _, err := Load("v999"); err == nil {
		t.Fatal("expected unknown content version to fail")
	}
}

func TestCatalogValidationRejectsBrokenAuthoredContent(t *testing.T) {
	t.Run("unsupported module effect", func(t *testing.T) {
		catalog := MustLoad(CurrentVersion)
		catalog.Modules[0].Levels[0].Effects[0].Kind = "trust_the_client"
		if err := catalog.indexAndValidate(); err == nil {
			t.Fatal("expected unsupported effect to fail validation")
		}
	})
	t.Run("unsupported module behavior", func(t *testing.T) {
		catalog := MustLoad(CurrentVersion)
		catalog.Modules[0].Levels[0].Behaviors = []Behavior{{Kind: "trust_the_client", Amount: 1}}
		if err := catalog.indexAndValidate(); err == nil {
			t.Fatal("expected unsupported behavior to fail validation")
		}
	})
	t.Run("missing translation", func(t *testing.T) {
		catalog := MustLoad(CurrentVersion)
		delete(catalog.Locales["en"], catalog.Events[0].TitleKey)
		if err := catalog.indexAndValidate(); err == nil {
			t.Fatal("expected missing translation to fail validation")
		}
	})
	t.Run("duplicate scene", func(t *testing.T) {
		catalog := MustLoad(CurrentVersion)
		catalog.Scenes = append(catalog.Scenes, catalog.Scenes[0])
		if err := catalog.indexAndValidate(); err == nil {
			t.Fatal("expected duplicate scene to fail validation")
		}
	})
	t.Run("player buff used as noise modifier", func(t *testing.T) {
		catalog := MustLoad(CurrentVersion)
		catalog.Chapters[0].NoiseRules[0].Modifiers[0] = Effect{Kind: "attack_damage", Amount: 1}
		if err := catalog.indexAndValidate(); err == nil {
			t.Fatal("expected unsafe noise modifier to fail validation")
		}
	})
	t.Run("undeclared visual asset", func(t *testing.T) {
		catalog := MustLoad(CurrentVersion)
		catalog.Characters[0].PortraitURL = "/game/v3/players/missing.webp"
		if err := catalog.indexAndValidate(); err == nil {
			t.Fatal("expected undeclared visual asset to fail validation")
		}
	})
}
