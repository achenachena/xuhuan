package run

import (
	"fmt"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/shooter"
)

const (
	portfolioDemoVersion    = "demo-v2"
	portfolioDemoWaveTicks  = 1200
	portfolioDemoBossTicks  = 1350
	portfolioDemoBackground = "/game/v4/reversal/stage.webp"
)

type PortfolioDemoOption struct {
	ID   string       `json:"id"`
	Name string       `json:"name"`
	Boss SegmentState `json:"boss"`
}

type PortfolioDemo struct {
	Version string                        `json:"version"`
	Locale  string                        `json:"locale"`
	Opening string                        `json:"opening"`
	Content gamecontent.V4LocalizedBundle `json:"content"`
	Wave    SegmentState                  `json:"wave"`
	Options []PortfolioDemoOption         `json:"options"`
}

// BuildPortfolioDemo resolves the public, non-persistent browser demo from the
// same catalog and runtime builder used by authenticated runs. The output is a
// static Vercel asset: it creates no identity, session, token, or database row.
func BuildPortfolioDemo(catalog *gamecontent.V4Catalog, locale string) (PortfolioDemo, error) {
	chapter, ok := catalog.Chapter("seventh-dock")
	if !ok || len(chapter.Segments) == 0 || len(chapter.Waves) == 0 {
		return PortfolioDemo{}, fmt.Errorf("run: portfolio demo chapter is incomplete")
	}
	state := State{
		Phase: SegmentPhase, ChapterSlug: chapter.ID, CharacterSlug: "nana7mi",
		Hearts: 3, MaxHearts: 3, PendingShowOptions: []string{}, ShowEffects: []string{},
		SelectedChoiceIDs: []string{}, CompanionSlugs: []string{},
	}
	wave := gamecontent.V4Wave{ID: "reversal-opening"}
	waveConfig, err := buildShooterConfig(state, catalog, "portfolio-demo-wave-v2", portfolioDemoWaveTicks, wave, nil, false)
	if err != nil {
		return PortfolioDemo{}, err
	}
	waveConfig.Reversal = &shooter.Reversal{Weapon: "single", Groups: []shooter.ReversalGroup{
		{AtTick: 30, GroupID: 1, X: 1800, Escorts: 0},
		{AtTick: 120, GroupID: 2, X: 1100, Escorts: 0},
		{AtTick: 240, GroupID: 3, X: 1800, Escorts: 1},
		{AtTick: 480, GroupID: 4, X: 950, Escorts: 1},
		{AtTick: 480, GroupID: 5, X: 2650, Escorts: 1},
		{AtTick: 720, GroupID: 6, X: 950, Escorts: 2},
		{AtTick: 720, GroupID: 7, X: 2650, Escorts: 2},
		{AtTick: 900, GroupID: 8, X: 1800, Escorts: 2},
	}}
	waveConfig.StartingRescueCharge = 35
	waveConfig.Kit.StartingShield = 1
	waveConfig.Kit.AttackDamage = 4
	waveConfig.Kit.FireInterval = 6
	waveConfig.Limits.Pickups = 6
	waveState := SegmentState{
		SegmentSlug: "portfolio-demo-wave", SegmentIndex: 0,
		Seed: waveConfig.Seed, DurationTicks: portfolioDemoWaveTicks, WaveID: wave.ID,
		BackgroundURL: portfolioDemoBackground, RuntimeConfig: waveConfig,
	}

	options := make([]PortfolioDemoOption, 0, 2)
	for _, option := range []struct{ id, weapon, nameKey string }{
		{"double-take", "twin", "demo.reversal.twin.name"},
		{"clean-cut", "pierce", "demo.reversal.pierce.name"},
	} {
		optionID := option.id
		_, exists := catalog.ShowEffect(optionID)
		if !exists {
			return PortfolioDemo{}, fmt.Errorf("run: portfolio demo effect %q is missing", optionID)
		}
		bossState := state
		bossState.SegmentIndex = len(chapter.Segments)
		bossState.ShowEffects = []string{optionID}
		bossConfig, buildErr := buildShooterConfig(bossState, catalog, "portfolio-demo-boss-v2:"+optionID, portfolioDemoBossTicks, gamecontent.V4Wave{ID: string(chapter.Boss.ID)}, &chapter.Boss, false)
		if buildErr != nil {
			return PortfolioDemo{}, buildErr
		}
		bossConfig.Reversal = &shooter.Reversal{Weapon: option.weapon, Groups: []shooter.ReversalGroup{}}
		bossConfig.StartingRescueCharge = 55
		bossConfig.Kit.StartingShield = 1
		bossConfig.Kit.AttackDamage = 4
		bossConfig.Kit.FireInterval = 6
		bossConfig.Limits.Pickups = 6
		if bossConfig.Boss == nil {
			return PortfolioDemo{}, fmt.Errorf("run: portfolio demo boss is missing")
		}
		bossConfig.Boss.Health = 1050
		options = append(options, PortfolioDemoOption{
			ID:   optionID,
			Name: catalog.Text(locale, option.nameKey),
			Boss: SegmentState{
				SegmentSlug:  "portfolio-demo-boss-" + optionID,
				SegmentIndex: 1, Seed: bossConfig.Seed, DurationTicks: portfolioDemoBossTicks,
				BossID: string(chapter.Boss.ID), BackgroundURL: portfolioDemoBackground,
				RuntimeConfig: bossConfig,
			},
		})
	}

	localized := catalog.Localized(locale)
	localized.ShowEffects = filterLocalizedShowEffects(localized.ShowEffects, "double-take", "clean-cut")
	localized.Characters = filterLocalizedCharacters(localized.Characters, "nana7mi")
	localized.Companions = []gamecontent.V4LocalizedCompanion{}
	localized.Enemies = []gamecontent.V4LocalizedEnemy{}
	localized.Chapters = filterLocalizedChapters(localized.Chapters, chapter.ID)
	for index := range localized.Chapters {
		// Runtime combat data is already resolved into each stage. The public demo
		// only needs these catalog entries to locate its existing visual assets.
		localized.Chapters[index].Segments = []gamecontent.V4Segment{}
		localized.Chapters[index].Waves = []gamecontent.V4Wave{}
		localized.Chapters[index].Story = gamecontent.V4LocalizedStory{}
		localized.Chapters[index].Encore = []gamecontent.V4LocalizedEncoreModifier{}
		localized.Chapters[index].Endings = []gamecontent.V4LocalizedEnding{}
	}

	return PortfolioDemo{
		Version: portfolioDemoVersion, Locale: locale, Opening: catalog.Text(locale, "demo.reversal.opening"), Content: localized,
		Wave: waveState, Options: options,
	}, nil
}

func filterLocalizedShowEffects(items []gamecontent.V4LocalizedShowEffect, ids ...string) []gamecontent.V4LocalizedShowEffect {
	wanted := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		wanted[id] = struct{}{}
	}
	result := make([]gamecontent.V4LocalizedShowEffect, 0, len(ids))
	for _, item := range items {
		if _, ok := wanted[item.ID]; ok {
			result = append(result, item)
		}
	}
	return result
}

func filterLocalizedCharacters(items []gamecontent.V4LocalizedCharacter, id string) []gamecontent.V4LocalizedCharacter {
	for _, item := range items {
		if item.ID == id {
			return []gamecontent.V4LocalizedCharacter{item}
		}
	}
	return nil
}

func filterLocalizedChapters(items []gamecontent.V4LocalizedChapter, id string) []gamecontent.V4LocalizedChapter {
	for _, item := range items {
		if item.ID == id {
			return []gamecontent.V4LocalizedChapter{item}
		}
	}
	return nil
}
