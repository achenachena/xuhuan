package run

import (
	"fmt"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/shooter"
)

func buildShooterConfig(state State, catalog *gamecontent.V4Catalog, seed string, duration int, wave gamecontent.V4Wave, boss *gamecontent.V4Boss, daily bool) (shooter.Config, error) {
	character, ok := catalog.Character(state.CharacterSlug)
	if !ok {
		return shooter.Config{}, ErrContentLocked
	}
	chapter, ok := catalog.Chapter(state.ChapterSlug)
	if !ok {
		return shooter.Config{}, ErrContentLocked
	}
	config := shooter.Config{
		Seed: seed, DurationTicks: duration, PlayerHealth: state.Hearts,
		EncoreLevel: state.EncoreLevel, Daily: daily,
		StoryChoiceID: currentStoryChoiceID(state.SelectedChoiceIDs, chapter),
		Kit: shooter.Kit{
			ID: shooter.KitID(character.ID), MaxHealth: character.BaseStats.MaxHealth,
			AttackDamage: character.BaseStats.ShotDamage, FireInterval: character.BaseStats.ShotInterval,
			MoveLimit: character.BaseStats.MoveLimit, RescueDamage: character.Special.Power,
			SpecialBehavior: character.Special.Behavior, SpecialDuration: character.Special.DurationTicks,
		},
		Companions:  make([]shooter.Companion, 0, len(state.CompanionSlugs)),
		ShowEffects: make([]shooter.Effect, 0, len(state.ShowEffects)),
		Enemies:     make([]shooter.EnemySpec, 0, len(catalog.Enemies)),
		Wave:        shooter.Wave{ID: wave.ID, Spawns: make([]shooter.Spawn, 0, len(wave.Spawns))},
		Limits: shooter.Limits{
			Enemies: catalog.Rules.MaxEnemies, EnemyProjectiles: catalog.Rules.MaxEnemyProjectiles,
			PlayerProjectiles: catalog.Rules.MaxPlayerProjectiles, Pickups: catalog.Rules.MaxPickups,
			Effects: catalog.Rules.MaxEffects,
		},
	}
	tutorial := !daily && state.ChapterSlug == "seventh-dock" && state.SegmentIndex == 0 && config.StoryChoiceID == ""
	if tutorial {
		// Four ordinary kills plus their collected support notes fill Rescue
		// (20 + 4*(10+12) > 100). This keeps the meter visibly earned while making
		// the embedded tutorial independent of grazing or perfect pickup routing.
		config.StartingRescueCharge = 20
		// One training guard forgives a first mistake without hiding extra
		// lives behind the three ON AIR hearts.
		config.Kit.StartingShield = 1
	}
	for _, item := range state.ShowEffects {
		effect, exists := catalog.ShowEffect(item)
		if !exists {
			return shooter.Config{}, ErrContentLocked
		}
		config.ShowEffects = append(config.ShowEffects, shooter.Effect{Kind: shooter.EffectKind(effect.Behavior), Amount: effect.Amount})
	}
	for _, id := range state.CompanionSlugs {
		companion, exists := catalog.Companion(id)
		if !exists {
			return shooter.Config{}, ErrContentLocked
		}
		config.Companions = append(config.Companions, shooter.Companion{ID: shooter.CompanionID(companion.ID), Trigger: companion.Assist.Trigger, Behavior: companion.Assist.Behavior, Amount: companion.Assist.Amount, CooldownTicks: companion.Assist.CooldownTicks})
	}
	for _, item := range catalog.Enemies {
		config.Enemies = append(config.Enemies, shooter.EnemySpec{
			ID: item.ID, Chassis: shooter.Chassis(item.ID), Health: item.MaxHealth,
			Speed: item.Speed, ContactDamage: item.ContactDamage, MovePattern: item.MovePattern,
			ShotPattern: item.ShotPattern, FireInterval: item.ShotInterval,
			ProjectileSpeed: item.ProjectileSpeed, Damage: item.ProjectileDamage,
			TelegraphTicks: item.TelegraphTicks, Score: max(50, item.MaxHealth*4), Traits: append([]string{}, item.Traits...),
		})
	}
	for _, spawn := range wave.Spawns {
		config.Wave.Spawns = append(config.Wave.Spawns, shooter.Spawn{AtTick: spawn.AtTick, EnemyID: spawn.EnemyID, Count: spawn.Count, Formation: spawn.Formation, IntervalTicks: spawn.IntervalTicks})
	}
	if boss == nil && !tutorial {
		// Randomize complete authored groups, keeping counts and time slots: the
		// chapter's threat budget stays bounded. A seed reproduces the same wave.
		stream := randomStream{seed: seed + ":encounters"}
		groups := append([]shooter.Spawn(nil), config.Wave.Spawns...)
		for i := len(groups) - 1; i > 0; i-- {
			j := stream.Intn(i + 1)
			groups[i], groups[j] = groups[j], groups[i]
		}
		formations := []string{"line", "fan", "staggered", "pincer", "sweep"}
		for i := range config.Wave.Spawns {
			slot := &config.Wave.Spawns[i]
			slot.EnemyID, slot.Count, slot.IntervalTicks = groups[i].EnemyID, groups[i].Count, groups[i].IntervalTicks
			slot.Formation = formations[stream.Intn(len(formations))]
			end := duration - 90
			if i+1 < len(config.Wave.Spawns) {
				end = min(end, config.Wave.Spawns[i+1].AtTick-30)
			}
			slot.IntervalTicks = min(slot.IntervalTicks, max(1, (end-slot.AtTick)/max(1, slot.Count-1)))
		}
		// Replace one attacker, rather than adding pressure. The relay arrives
		// beside a group so players can see and break its protective links.
		if stream.Intn(2) == 0 {
			for i := range config.Wave.Spawns {
				slot := &config.Wave.Spawns[i]
				if slot.Count < 2 {
					continue
				}
				slot.Count--
				config.Wave.Spawns = append(config.Wave.Spawns, shooter.Spawn{AtTick: slot.AtTick, EnemyID: "shield-relay", Count: 1, Formation: "center", IntervalTicks: 0})
				break
			}
		}
	}

	if boss != nil {
		// Boss segments do not spawn an authored wave. Keep the runtime wire
		// shape explicit and valid by identifying the empty wave with the Boss
		// slug instead of serializing an invalid empty slug.
		config.Wave.ID = string(boss.ID)
		resolved := &shooter.Boss{ID: shooter.BossID(boss.ID), Health: boss.MaxHealth, Score: max(1000, boss.MaxHealth*5), Stages: make([]shooter.BossStage, 0, len(boss.Stages))}
		for _, stage := range boss.Stages {
			resolved.Stages = append(resolved.Stages, shooter.BossStage{ID: stage.ID, HealthThreshold: stage.HealthThreshold, MovePattern: stage.MovePattern, ShotPattern: stage.ShotPattern, FireInterval: stage.ShotInterval, ProjectileSpeed: stage.ProjectileSpeed, Damage: stage.ProjectileDamage, TelegraphTicks: stage.TelegraphTicks, Special: stage.Special})
		}
		config.Boss = resolved
	}
	enemyPercent, projectilePercent, chargePenaltyPercent := 100, 100, 0
	for level := 0; level < state.EncoreLevel && level < len(chapter.Encore); level++ {
		modifier := chapter.Encore[level]
		enemyPercent += modifier.EnemySpeedPercent
		projectilePercent += modifier.ProjectileSpeedPercent
		chargePenaltyPercent += modifier.SpecialChargePenaltyPercent
	}
	if daily && len(catalog.Daily.EncoreModifierIDs) > 0 {
		index := deterministicIndex(seed+":daily-encore", len(catalog.Daily.EncoreModifierIDs))
		config.DailyModifierID = catalog.Daily.EncoreModifierIDs[index]
		if modifier, exists := catalog.Encore(config.DailyModifierID); exists {
			enemyPercent += modifier.EnemySpeedPercent
			projectilePercent += modifier.ProjectileSpeedPercent
			chargePenaltyPercent += modifier.SpecialChargePenaltyPercent
		}
	}
	for index := range config.Enemies {
		config.Enemies[index].Speed = max(1, config.Enemies[index].Speed*enemyPercent/100)
		config.Enemies[index].ProjectileSpeed = max(1, config.Enemies[index].ProjectileSpeed*projectilePercent/100)
	}
	if config.Boss != nil {
		for index := range config.Boss.Stages {
			config.Boss.Stages[index].ProjectileSpeed = max(1, config.Boss.Stages[index].ProjectileSpeed*projectilePercent/100)
		}
	}
	config.SpecialChargePenaltyPercent = min(75, chargePenaltyPercent)
	if config.Kit.ID == "" || len(config.Enemies) != len(shooter.SupportedChassis) {
		return shooter.Config{}, fmt.Errorf("run: incomplete shooter runtime")
	}
	return config, nil
}

func currentStoryChoiceID(selectedIDs []string, chapter gamecontent.V4Chapter) string {
	result := ""
	for _, selectedID := range selectedIDs {
		for _, choice := range chapter.Story.Intermission.Choices {
			if selectedID == choice.ID {
				result = selectedID
				break
			}
		}
	}
	return result
}
