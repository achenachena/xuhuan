package run

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func TestPortfolioDemoUsesResolvedV4Runtime(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	for _, locale := range []string{"en", "zh-CN"} {
		demo, err := BuildPortfolioDemo(catalog, locale)
		if err != nil {
			t.Fatalf("build %s demo: %v", locale, err)
		}
		if demo.Version != "demo-v2" || demo.Locale != locale || demo.Opening == "" || demo.Wave.DurationTicks != 1200 || len(demo.Options) != 2 {
			t.Fatalf("unexpected %s demo shape: %#v", locale, demo)
		}
		for index, option := range demo.Options {
			config := option.Boss.RuntimeConfig
			if option.Name == "" || config.Boss == nil || len(config.ShowEffects) != 1 || option.Boss.DurationTicks != 1350 || config.DurationTicks != 1350 {
				t.Fatalf("incomplete %s option: %#v", locale, option)
			}
			if config.Reversal == nil || config.Reversal.Weapon != []string{"twin", "pierce"}[index] || len(config.Reversal.Groups) != 0 {
				t.Fatalf("incorrect %s boss preview mode: %#v", locale, config.Reversal)
			}
			if config.PlayerHealth != 3 || config.Kit.StartingShield > 1 || config.Boss.Health != 1050 || len(config.Boss.Stages) != 3 || config.Limits.Pickups != 6 {
				t.Fatalf("incorrect %s preview health, phases, or drop limits: %#v", locale, config)
			}
		}
	}
}

func TestPortfolioDemoAuthoredGroupsAreBoundedAndOrdered(t *testing.T) {
	demo, err := BuildPortfolioDemo(gamecontent.MustLoadV4(), "en")
	if err != nil {
		t.Fatal(err)
	}
	config := demo.Wave.RuntimeConfig
	if config.Reversal == nil || config.Reversal.Weapon != "single" || len(config.Reversal.Groups) != 8 || len(config.Wave.Spawns) != 0 {
		t.Fatal("preview must use authored groups, not campaign replenishment")
	}
	previous := -1
	seen := map[int]bool{}
	for index, group := range config.Reversal.Groups {
		if group.AtTick < previous || group.AtTick >= config.DurationTicks || group.X < 180 || group.X > 3420 || group.Escorts < 0 || group.Escorts > 2 || seen[group.GroupID] {
			t.Fatalf("invalid authored group: %#v", group)
		}
		if index < 2 && (group.AtTick >= 240 || group.Escorts != 0) {
			t.Fatal("first eight seconds must keep the two learning targets harmless")
		}
		previous = group.AtTick
		seen[group.GroupID] = true
	}
	if config.PlayerHealth != 3 || config.Kit.StartingShield != 1 || config.Limits.Pickups != 6 || demo.Wave.BackgroundURL != portfolioDemoBackground {
		t.Fatal("unexpected preview bounds or stage")
	}
}

func TestPortfolioDemoIsDeterministicAndLocaleIndependent(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	english, err := BuildPortfolioDemo(catalog, "en")
	if err != nil {
		t.Fatal(err)
	}
	repeated, err := BuildPortfolioDemo(catalog, "en")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(english, repeated) {
		t.Fatal("same catalog and locale must generate identical static data")
	}
	chinese, err := BuildPortfolioDemo(catalog, "zh-CN")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(english.Wave, chinese.Wave) || english.Opening == chinese.Opening {
		t.Fatal("only localized presentation should change")
	}
	for index, option := range english.Options {
		if option.ID != chinese.Options[index].ID || !reflect.DeepEqual(option.Boss, chinese.Options[index].Boss) || option.Name == chinese.Options[index].Name {
			t.Fatal("localized choice must keep identical gameplay")
		}
	}
	chapter, _ := catalog.Chapter("seventh-dock")
	if chapter.BackgroundURL == portfolioDemoBackground || chapter.Boss.MaxHealth != 900 {
		t.Fatal("preview builder mutated the persistent campaign")
	}
}

func TestCampaignRuntimeOmitsReversalConfig(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	chapter, _ := catalog.Chapter("seventh-dock")
	config, err := buildShooterConfig(State{ChapterSlug: chapter.ID, CharacterSlug: "nana7mi", Hearts: 3}, catalog, "campaign", 900, chapter.Waves[0], nil, false)
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}
	if config.Reversal != nil || strings.Contains(string(data), `"reversal"`) {
		t.Fatal("campaign must retain the existing wire config")
	}
}
