package content

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
)

func TestV4CatalogIsCompleteAndBilingual(t *testing.T) {
	catalog := MustLoadV4()
	expectedChoices := map[string][]string{
		"seventh-dock":         {"keep-seven-second-voice", "delete-learned-reply"},
		"always-cheerful":      {"stop-autonomous-encore", "join-encore-with-consent"},
		"loss-hidden":          {"restore-funniest-loss", "mark-missing-loss"},
		"captains-do-not-rest": {"cancel-three-overnights", "share-one-overnight"},
		"localization-failed":  {"publish-original-snark", "post-caption-correction"},
		"which-is-original":    {"keep-both-rooms", "read-session-log"},
		"laplace-florist":      {"hold-future-photo", "recreate-photo-later"},
		"zero-channel":         {"publish-mismatch-log", "publish-seven-approved-notes"},
	}
	if catalog.ContentVersion != V4Version || catalog.Protocol != V4Protocol {
		t.Fatalf("unexpected V4 metadata: %s/%s", catalog.ContentVersion, catalog.Protocol)
	}
	if got := len(catalog.ShowEffects); got != 12 {
		t.Fatalf("show effects = %d, want 12", got)
	}
	if got := len(catalog.Characters); got != 7 {
		t.Fatalf("characters = %d, want 7", got)
	}
	if got := len(catalog.Companions); got != 7 {
		t.Fatalf("companions = %d, want 7", got)
	}
	if got := len(catalog.Enemies); got != 6 {
		t.Fatalf("enemy chassis = %d, want 6", got)
	}
	if got := len(catalog.Chapters); got != 8 {
		t.Fatalf("chapters = %d, want 8", got)
	}
	normalSegments, bosses, bossStages := 0, 0, 0
	for _, chapter := range catalog.Chapters {
		if len(chapter.Segments) != 3 || len(chapter.Boss.Stages) != 3 || len(chapter.Story.Intermission.Choices) != 2 {
			t.Fatalf("chapter %q is incomplete", chapter.ID)
		}
		wantRewardStages := []string{"weapon", "companion", "rescue"}
		for index, segment := range chapter.Segments {
			if segment.RewardStage != wantRewardStages[index] {
				t.Fatalf("chapter %q segment %d reward = %q", chapter.ID, index+1, segment.RewardStage)
			}
			if segment.DurationTicks < 1050 && !(chapter.Order == 1 && index == 0 && segment.DurationTicks == 900) {
				t.Fatalf("chapter %q segment %d is too short: %d", chapter.ID, index+1, segment.DurationTicks)
			}
		}
		if chapter.Boss.DurationTicks != 1800 {
			t.Fatalf("chapter %q boss duration = %d", chapter.ID, chapter.Boss.DurationTicks)
		}
		normalSegments += len(chapter.Segments)
		bosses++
		bossStages += len(chapter.Boss.Stages)
		if catalog.Text("en", chapter.TitleKey) == "" || catalog.Text("zh-CN", chapter.TitleKey) == "" {
			t.Fatalf("chapter %q title is not bilingual", chapter.ID)
		}
		choiceIDs := make([]string, 0, len(chapter.Story.Intermission.Choices))
		for _, choice := range chapter.Story.Intermission.Choices {
			choiceIDs = append(choiceIDs, choice.ID)
		}
		if !slices.Equal(choiceIDs, expectedChoices[chapter.ID]) {
			t.Fatalf("chapter %q choices = %v", chapter.ID, choiceIDs)
		}
	}
	if normalSegments != 24 || bosses != 8 || normalSegments+bosses != 32 || bossStages != 24 {
		t.Fatalf("combat catalog normal=%d bosses=%d total=%d stages=%d", normalSegments, bosses, normalSegments+bosses, bossStages)
	}
	if got := len(catalog.Manifest.Assets); got != 32 {
		t.Fatalf("assets = %d, want 32", got)
	}
	if !slices.Equal(catalog.Manifest.Assets, requiredV4Assets()) {
		t.Fatal("manifest assets do not match the exact 32-file V4 runtime set")
	}
	finale, ok := catalog.Chapter("zero-channel")
	if !ok || len(finale.Endings) != 3 || finale.Boss.ID != "auto-archive-system" {
		t.Fatalf("finale is incomplete: %#v", finale)
	}
	if catalog.Daily.ID != "daily-aftershow" || catalog.Daily.SegmentCount != 2 || catalog.Daily.ShowChoiceCount != 1 {
		t.Fatalf("daily content is incomplete: %#v", catalog.Daily)
	}
	jiaran, _ := catalog.Character("jiaran")
	xiangwan, _ := catalog.Character("xiangwan")
	if catalog.Text("en", jiaran.NameKey) != "Jiaran (Diana)" || catalog.Text("en", xiangwan.NameKey) != "Xiangwan (Ava)" {
		t.Fatal("English first-display character names do not preserve both public names")
	}
}

func TestV4CatalogLookupsStayChapterScoped(t *testing.T) {
	catalog := MustLoadV4()
	if _, ok := catalog.Wave("dock-wave-1", "seventh-dock"); !ok {
		t.Fatal("expected dock wave lookup to succeed")
	}
	if _, ok := catalog.Wave("dock-wave-1", "zero-channel"); ok {
		t.Fatal("wave lookup crossed chapter boundary")
	}
	if boss, ok := catalog.Boss("optimal-nana"); !ok || boss.MaxHealth <= 0 {
		t.Fatalf("boss lookup = %#v, %v", boss, ok)
	}
}

func TestV4LocalizedBundleResolvesAllCopy(t *testing.T) {
	catalog := MustLoadV4()
	bundle := catalog.Localized("zh-CN")
	if bundle.Version != V4Version || bundle.Protocol != V4Protocol || bundle.Locale != "zh-CN" {
		t.Fatalf("localized metadata = %s/%s/%s", bundle.Version, bundle.Protocol, bundle.Locale)
	}
	encoded, err := json.Marshal(bundle)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "_key\"") {
		t.Fatal("localized response leaked authoring keys")
	}
	if strings.Contains(string(encoded), ":null") {
		t.Fatal("localized response contains a null collection")
	}
	if got, want := bundle.Chapters[0].Title, catalog.Localized("en").Chapters[0].Title; got == "" || got == want {
		t.Fatal("localized response did not resolve locale-specific copy")
	}
	if fallback := catalog.Localized("unknown"); fallback.Locale != "en" {
		t.Fatalf("unknown locale fell back to %q", fallback.Locale)
	}

	english := catalog.Localized("en")
	if got := english.Characters[1].Name; got != "Jiaran (Diana)" {
		t.Fatalf("English character introduction = %q, want Jiaran (Diana)", got)
	}
	if got := english.Characters[2].Name; got != "Xiangwan (Ava)" {
		t.Fatalf("English character introduction = %q, want Xiangwan (Ava)", got)
	}
	if got := english.Chapters[1].Story.Prelude[0].Sender; got != "Jiaran" {
		t.Fatalf("English chat sender = %q, want Jiaran", got)
	}
	if got := english.Chapters[1].Story.Prelude[0].SenderID; got != "jiaran" {
		t.Fatalf("English chat sender ID = %q, want jiaran", got)
	}
	if got := english.Chapters[1].Story.Prelude[1].Sender; got != "Xiangwan" {
		t.Fatalf("English chat sender = %q, want Xiangwan", got)
	}
	if got := english.Chapters[0].Story.Prelude[0].Sender; got != "Archive" {
		t.Fatalf("English system sender = %q, want Archive", got)
	}
	if got := english.Chapters[0].Story.Prelude[0].SenderID; got != "system" {
		t.Fatalf("English system sender ID = %q, want system", got)
	}
	if got, want := bundle.Chapters[1].Story.Prelude[0].Sender, catalog.Text("zh-CN", "sender.jiaran"); got != want {
		t.Fatalf("Chinese chat sender = %q, want localized Jiaran sender %q", got, want)
	}
	if got, want := bundle.Chapters[1].Story.Prelude[1].Sender, catalog.Text("zh-CN", "sender.xiangwan"); got != want {
		t.Fatalf("Chinese chat sender = %q, want localized Xiangwan sender %q", got, want)
	}
	if got, want := bundle.Chapters[0].Story.Prelude[0].Sender, catalog.Text("zh-CN", "sender.system"); got != want {
		t.Fatalf("Chinese system sender = %q, want localized system sender %q", got, want)
	}
	if got := bundle.Chapters[0].Story.Prelude[0].SenderID; got != "system" {
		t.Fatalf("Chinese system sender ID = %q, want system", got)
	}
}

func TestV4CatalogRejectsIncompleteAuthoredContent(t *testing.T) {
	t.Run("missing translation", func(t *testing.T) {
		catalog := MustLoadV4()
		delete(catalog.Locales["zh-CN"], catalog.Chapters[0].TitleKey)
		if err := catalog.validate(); err == nil {
			t.Fatal("expected missing translation to fail")
		}
	})
	t.Run("undeclared asset", func(t *testing.T) {
		catalog := MustLoadV4()
		catalog.Characters[0].SpriteURL = "/game/v4/players/not-listed.webp"
		if err := catalog.validate(); err == nil {
			t.Fatal("expected undeclared asset to fail")
		}
	})
	t.Run("missing required pickup asset", func(t *testing.T) {
		catalog := MustLoadV4()
		catalog.Manifest.Assets = catalog.Manifest.Assets[:len(catalog.Manifest.Assets)-1]
		if err := catalog.validate(); err == nil {
			t.Fatal("expected missing required pickup asset to fail")
		}
	})
	t.Run("missing boss stage", func(t *testing.T) {
		catalog := MustLoadV4()
		catalog.Chapters[0].Boss.Stages = catalog.Chapters[0].Boss.Stages[:2]
		if err := catalog.validate(); err == nil {
			t.Fatal("expected incomplete boss to fail")
		}
	})
	t.Run("abstract story score", func(t *testing.T) {
		catalog := MustLoadV4()
		catalog.Chapters[0].Story.Intermission.Choices[0].Tag = ""
		if err := catalog.validate(); err == nil {
			t.Fatal("expected untagged concrete choice to fail")
		}
	})
	t.Run("unknown story sender", func(t *testing.T) {
		catalog := MustLoadV4()
		catalog.Chapters[0].Story.Prelude[0].Sender = "raw-account-id"
		if err := catalog.validate(); err == nil {
			t.Fatal("expected unknown story sender to fail")
		}
	})
	t.Run("missing story sender translation", func(t *testing.T) {
		catalog := MustLoadV4()
		delete(catalog.Locales["zh-CN"], "sender.nana7mi")
		if err := catalog.validate(); err == nil {
			t.Fatal("expected missing story sender translation to fail")
		}
	})
}
