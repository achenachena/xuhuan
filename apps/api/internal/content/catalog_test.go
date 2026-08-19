package content

import "testing"

func TestVersionOneContentMeetsVerticalSliceBudget(t *testing.T) {
	catalog, err := Load(CurrentVersion)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if got := len(catalog.Characters); got != 7 {
		t.Fatalf("characters = %d, want 7", got)
	}
	if got := len(catalog.StarterDeck("nana7mi")); got != 10 {
		t.Fatalf("starter cards = %d, want 10", got)
	}
	nanaCards, commonGlitches := 0, 0
	for _, card := range catalog.Cards {
		if card.CharacterSlug == "nana7mi" {
			nanaCards++
		}
		if card.CharacterSlug == "" && card.Type == "glitch" {
			commonGlitches++
		}
	}
	if nanaCards < 24 {
		t.Fatalf("nana cards = %d, want at least 24", nanaCards)
	}
	if commonGlitches != 8 {
		t.Fatalf("common glitch cards = %d, want 8", commonGlitches)
	}
	if got := len(catalog.Relics); got != 10 {
		t.Fatalf("relics = %d, want 10", got)
	}
	if got := len(catalog.Events); got != 12 {
		t.Fatalf("events = %d, want 12", got)
	}

	kinds := map[string]int{}
	for _, enemy := range catalog.Enemies {
		kinds[enemy.Kind]++
	}
	if kinds["normal"] != 4 || kinds["elite"] != 2 || kinds["boss"] != 1 {
		t.Fatalf("enemy kinds = %#v, want 4 normal, 2 elite, 1 boss", kinds)
	}
}

func TestEveryLocalizedFieldResolvesInBothLanguages(t *testing.T) {
	catalog := MustLoad(CurrentVersion)
	assert := func(label string, value LocalizedText) {
		t.Helper()
		if value.Resolve("zh-CN") == "" || value.Resolve("en") == "" {
			t.Errorf("%s is missing a translation", label)
		}
	}
	for _, card := range catalog.Cards {
		assert("card name "+card.Slug, card.Name)
		assert("card description "+card.Slug, card.Description)
	}
	for _, scene := range catalog.Scenes {
		assert("scene title "+scene.Slug, scene.Title)
		for _, message := range scene.Messages {
			assert("scene message "+scene.Slug, message.Text)
		}
		for _, option := range scene.Options {
			assert("scene option "+scene.Slug+"/"+option.Slug, option.Label)
		}
	}
}
