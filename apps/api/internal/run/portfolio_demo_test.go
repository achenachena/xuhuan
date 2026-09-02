package run

import (
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
		if demo.Version != "demo-v1" || demo.Locale != locale || demo.Wave.DurationTicks != portfolioDemoTicks || len(demo.Options) != 2 {
			t.Fatalf("unexpected %s demo shape: %#v", locale, demo)
		}
		for _, option := range demo.Options {
			if option.Name == "" || option.Description == "" || option.Boss.RuntimeConfig.Boss == nil || len(option.Boss.RuntimeConfig.ShowEffects) != 1 {
				t.Fatalf("incomplete %s option: %#v", locale, option)
			}
		}
	}
}
