package run

import (
	"github.com/achenachena/xuhuan/apps/api/internal/action"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func actionConfig(state State, catalog *gamecontent.Catalog) (action.Config, error) {
	definition, ok := catalog.Encounter(state.Encounter.Slug)
	if !ok {
		return action.Config{}, ErrInvalidCommand
	}
	enemies := make([]action.EnemySpec, 0, len(definition.EnemySlugs))
	for _, slug := range definition.EnemySlugs {
		enemy, ok := catalog.Enemy(slug)
		if !ok {
			return action.Config{}, ErrInvalidCommand
		}
		attacks := make([]action.AttackSpec, 0, len(enemy.Attacks))
		for _, attack := range enemy.Attacks {
			attacks = append(attacks, action.AttackSpec{Kind: attack.Kind, Interval: attack.Interval, ProjectileSpeed: attack.ProjectileSpeed, Damage: attack.Damage, Count: attack.Count, Spread: attack.Spread, TelegraphTicks: attack.TelegraphTicks})
		}
		traits := make([]action.TraitSpec, 0, len(enemy.Traits))
		for _, trait := range enemy.Traits {
			traits = append(traits, action.TraitSpec{Kind: trait.Kind, Amount: trait.Amount, Value: trait.Value})
		}
		enemies = append(enemies, action.EnemySpec{Slug: enemy.Slug, Kind: enemy.Kind, MaxHealth: enemy.MaxHealth, Speed: enemy.Speed, ContactDamage: enemy.ContactDamage, Movement: action.MovementSpec{Kind: enemy.Movement.Kind, Amount: enemy.Movement.Amount}, Attacks: attacks, Traits: traits})
	}
	return action.Config{Seed: state.Encounter.Seed, Kind: definition.Kind, DurationTicks: definition.DurationTicks, MaxTicks: definition.MaxTicks, SpawnInterval: definition.SpawnInterval, MaxAlive: definition.MaxAlive, PlayerHealth: state.Health, PlayerMaxHealth: state.MaxHealth, NoiseLevel: state.NoiseLevel, EmergencyReconnectAvailable: state.EmergencyReconnectAvailable, Enemies: enemies, Runtime: state.RuntimeConfig, Objective: state.Encounter.Objective, Hazards: append([]string(nil), state.Encounter.Hazards...), BossVariant: state.NarrativeModifier.BossVariant}, nil
}

func resolveRuntime(state State, catalog *gamecontent.Catalog) (action.RuntimeConfig, error) {
	character, ok := catalog.Character(state.CharacterSlug)
	if !ok {
		return action.RuntimeConfig{}, ErrInvalidCommand
	}
	kit, ok := catalog.Kit(character.KitSlug)
	if !ok {
		return action.RuntimeConfig{}, ErrInvalidCommand
	}
	stats := kit.BaseStats
	runtime := action.RuntimeConfig{Kit: kit.Slug, Passive: kit.Passive, Resonance: kit.Resonance, AttackDamage: stats.AttackDamage, AttackInterval: stats.AttackInterval, MoveSpeed: stats.MoveSpeed, WarpCooldown: stats.WarpCooldown, WarpDamage: stats.WarpDamage, DistortionGain: 4, GrazeRadius: 310, ProjectileCount: 1, ProjectileSpeed: 100, Behaviors: []action.RuntimeBehavior{}}
	for _, owned := range state.Modules {
		module, ok := catalog.Module(owned.Slug)
		if !ok || owned.Level < 1 || owned.Level > 3 {
			return action.RuntimeConfig{}, ErrInvalidCommand
		}
		for level := 0; level < owned.Level; level++ {
			accumulateRuntime(&runtime, module.Levels[level].Effects)
			for _, behavior := range module.Levels[level].Behaviors {
				runtime.Behaviors = append(runtime.Behaviors, action.RuntimeBehavior{SourceSlug: module.Slug, Level: level + 1, Kind: behavior.Kind, Amount: behavior.Amount, Every: behavior.Every})
			}
		}
	}
	for _, slug := range state.Plugins {
		plugin, ok := catalog.Plugin(slug)
		if !ok {
			return action.RuntimeConfig{}, ErrInvalidCommand
		}
		accumulateRuntime(&runtime, plugin.Effects)
	}
	chapter, ok := catalog.Chapter(state.ChapterSlug)
	if !ok {
		return action.RuntimeConfig{}, ErrInvalidCommand
	}
	for _, rule := range chapter.NoiseRules {
		if rule.Level <= state.NoiseLevel {
			accumulateRuntime(&runtime, rule.Modifiers)
		}
	}
	if chapter.Finale && len(state.CompanionSlugs) > 0 {
		// The off-screen cast supports the selected lead according to the latest
		// story projection. Go resolves the support into ordinary action stats so
		// clients never interpret narrative choices as gameplay authority.
		supporters := len(state.CompanionSlugs)
		switch state.SupportAlignment {
		case "authentic":
			runtime.AttackDamage += supporters
			runtime.ProjectileCount += min(2, supporters/3)
			runtime.ResonancePower += supporters * 2
		case "retained":
			runtime.StartingShield += supporters * 2
			runtime.ProtocolShield += supporters
			runtime.HealOnProtocol += max(1, supporters/3)
		default:
			runtime.AttackDamage += supporters / 2
			runtime.StartingShield += supporters
			runtime.EchoPower += supporters
		}
	}
	runtime.AttackInterval = max(4, runtime.AttackInterval)
	runtime.WarpCooldown = max(75, runtime.WarpCooldown)
	runtime.MoveSpeed = max(20, runtime.MoveSpeed)
	return runtime, nil
}

func accumulateRuntime(buffs *action.RuntimeConfig, effects []gamecontent.Effect) {
	for _, effect := range effects {
		switch effect.Kind {
		case "attack_damage":
			buffs.AttackDamage += effect.Amount
		case "attack_speed":
			buffs.AttackInterval = max(5, buffs.AttackInterval-effect.Amount)
		case "move_speed":
			buffs.MoveSpeed += effect.Amount
		case "warp_cooldown":
			buffs.WarpCooldown = max(75, buffs.WarpCooldown-effect.Amount)
		case "warp_damage":
			buffs.WarpDamage += effect.Amount
		case "starting_shield":
			buffs.StartingShield += effect.Amount
		case "overload_bonus":
			buffs.OverloadBonus += effect.Amount
		case "distortion_gain":
			buffs.DistortionGain += effect.Amount
		case "protocol_damage":
			buffs.ProtocolDamage += effect.Amount
		case "protocol_shield":
			buffs.ProtocolShield += effect.Amount
		case "echo_power":
			buffs.EchoPower += effect.Amount
		case "resonance_power":
			buffs.ResonancePower += effect.Amount
		case "projectile_pierce":
			buffs.ProjectilePierce += effect.Amount
		case "projectile_count":
			buffs.ProjectileCount += effect.Amount
		case "projectile_speed":
			buffs.ProjectileSpeed += effect.Amount
		case "graze_radius":
			buffs.GrazeRadius += effect.Amount
		case "heal_on_protocol":
			buffs.HealOnProtocol += effect.Amount
		case "reflect_damage":
			buffs.ReflectDamage += effect.Amount
		}
	}
}
