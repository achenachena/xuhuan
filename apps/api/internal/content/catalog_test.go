package content

import "testing"

func TestActionCatalogIsCompleteAndBilingual(t *testing.T) {
	catalog := MustLoad(CurrentVersion)
	if catalog.Version != "v2" || len(catalog.Characters) != 7 || len(catalog.Modules) < 32 || len(catalog.Plugins) != 10 || len(catalog.Enemies) != 7 || len(catalog.Events) != 12 {
		t.Fatalf("unexpected action content counts: characters=%d modules=%d plugins=%d enemies=%d events=%d", len(catalog.Characters), len(catalog.Modules), len(catalog.Plugins), len(catalog.Enemies), len(catalog.Events))
	}
	for _, module := range catalog.Modules {
		if module.Name.Resolve("zh-CN") == "" || module.Name.Resolve("en") == "" || module.Description.Resolve("zh-CN") == "" || module.Description.Resolve("en") == "" {
			t.Fatalf("module %q is not bilingual", module.Slug)
		}
	}
	if encounter, ok := catalog.Encounter("signal-handshake"); !ok || !encounter.Tutorial || encounter.DurationTicks != 1350 {
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
		catalog.Modules[0].Effects[0].Kind = "trust_the_client"
		if err := catalog.indexAndValidate(); err == nil {
			t.Fatal("expected unsupported effect to fail validation")
		}
	})
	t.Run("missing translation", func(t *testing.T) {
		catalog := MustLoad(CurrentVersion)
		catalog.Events[0].Title.EN = ""
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
}
