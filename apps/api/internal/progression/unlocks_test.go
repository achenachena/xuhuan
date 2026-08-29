package progression

import (
	"testing"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func TestHorizontalUnlockPolicy(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	initial := InitialUnlocks(catalog)
	progress := Progress{}
	for _, grant := range initial {
		progress.Unlocks = append(progress.Unlocks, Unlock{Type: grant.Type, ContentSlug: grant.ContentSlug})
	}
	modules, plugins := RewardUnlocks(progress, catalog, "nana7mi")
	if len(modules) != 20 || len(plugins) != 8 || StarterModule(progress, catalog, "nana7mi") != "route-needle" {
		t.Fatalf("initial modules=%d plugins=%d starter=%q", len(modules), len(plugins), StarterModule(progress, catalog, "nana7mi"))
	}
	if HasUnlock(progress, CharacterUnlock, "jiaran") {
		t.Fatal("the second character was unlocked before a chapter clear")
	}

	for _, grant := range ChapterClearUnlocks(catalog, "jiaran") {
		progress.Unlocks = append(progress.Unlocks, Unlock{Type: grant.Type, ContentSlug: grant.ContentSlug})
	}
	modules, plugins = RewardUnlocks(progress, catalog, "jiaran")
	if len(modules) != 20 || len(plugins) != 8 || StarterModule(progress, catalog, "jiaran") != "cheer-counter" {
		t.Fatalf("Diana modules=%d plugins=%d starter=%q", len(modules), len(plugins), StarterModule(progress, catalog, "jiaran"))
	}
}

func TestEveryCharacterUnlockPoolHasAtLeastThreeRewardChoices(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	for _, character := range catalog.Characters {
		progress := Progress{}
		for _, grant := range append(InitialUnlocks(catalog), ChapterClearUnlocks(catalog, character.Slug)...) {
			progress.Unlocks = append(progress.Unlocks, Unlock{Type: grant.Type, ContentSlug: grant.ContentSlug})
		}
		modules, plugins := RewardUnlocks(progress, catalog, character.Slug)
		if len(modules) < 3 || len(plugins) < 1 || StarterModule(progress, catalog, character.Slug) == "" {
			t.Fatalf("character %s has modules=%d plugins=%d starter=%q", character.Slug, len(modules), len(plugins), StarterModule(progress, catalog, character.Slug))
		}
	}
}

func TestChapterClearUnlocksRejectUnknownContent(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	if unlocks := ChapterClearUnlocks(catalog, "missing-character"); len(unlocks) != 0 {
		t.Fatalf("unknown character unlocks=%#v", unlocks)
	}
}
