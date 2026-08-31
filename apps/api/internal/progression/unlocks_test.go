package progression

import (
	"testing"
	"time"
)

func TestV4UnlockVocabularyAndInitialGrant(t *testing.T) {
	grants := InitialUnlocks()
	if len(grants) != 1 || grants[0].Type != CharacterUnlock || grants[0].ContentSlug != "nana7mi" {
		t.Fatalf("initial unlocks=%#v", grants)
	}
	progress := Progress{Unlocks: []Unlock{
		{Type: CharacterUnlock, ContentSlug: "nana7mi", CreatedAt: time.Now()},
		{Type: CompanionUnlock, ContentSlug: "nana7mi-assist", CreatedAt: time.Now()},
		{Type: MemoryClipUnlock, ContentSlug: "seventh-dock-memory", CreatedAt: time.Now()},
	}}
	for _, check := range []struct{ kind, slug string }{
		{CharacterUnlock, "nana7mi"}, {CompanionUnlock, "nana7mi-assist"}, {MemoryClipUnlock, "seventh-dock-memory"},
	} {
		if !HasUnlock(progress, check.kind, check.slug) {
			t.Fatalf("missing unlock %s/%s", check.kind, check.slug)
		}
	}
	if HasUnlock(progress, "show_effect", "double-take") {
		t.Fatal("obsolete show-effect unlock vocabulary is accepted")
	}
}
