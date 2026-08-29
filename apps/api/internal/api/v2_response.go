package api

import (
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/game"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
)

func localizeCatalog(catalog *gamecontent.Catalog, locale string) map[string]any {
	text := func(key string) string { return catalog.Text(locale, key) }
	characters := make([]map[string]any, 0, len(catalog.Characters))
	for _, item := range catalog.Characters {
		characters = append(characters, map[string]any{"slug": item.Slug, "name": text(item.NameKey), "biography": text(item.BiographyKey), "playstyle": text(item.PlaystyleKey), "color_theme": item.ColorTheme, "portrait_url": item.PortraitURL, "model_url": item.ModelURL, "kit_slug": item.KitSlug})
	}
	kits := make([]map[string]any, 0, len(catalog.Kits))
	for _, item := range catalog.Kits {
		kits = append(kits, map[string]any{"slug": item.Slug, "character_slug": item.CharacterSlug, "passive": item.Passive, "resonance": item.Resonance, "base_stats": item.BaseStats})
	}
	modules := make([]map[string]any, 0, len(catalog.Modules))
	for _, item := range catalog.Modules {
		modules = append(modules, map[string]any{"slug": item.Slug, "character_slug": nullableString(item.CharacterSlug), "name": text(item.NameKey), "description": text(item.DescriptionKey), "archetype": item.Archetype, "rarity": item.Rarity, "levels": item.Levels})
	}
	plugins := make([]map[string]any, 0, len(catalog.Plugins))
	for _, item := range catalog.Plugins {
		plugins = append(plugins, map[string]any{"slug": item.Slug, "character_slug": nullableString(item.CharacterSlug), "name": text(item.NameKey), "description": text(item.DescriptionKey), "effects": item.Effects})
	}
	enemies := make([]map[string]any, 0, len(catalog.Enemies))
	for _, item := range catalog.Enemies {
		enemies = append(enemies, map[string]any{"slug": item.Slug, "chapter_slug": nullableString(item.ChapterSlug), "name": text(item.NameKey), "description": text(item.DescriptionKey), "kind": item.Kind, "max_health": item.MaxHealth, "speed": item.Speed, "contact_damage": item.ContactDamage, "color_theme": item.ColorTheme, "image_url": item.ImageURL, "movement": item.Movement, "attacks": item.Attacks, "traits": item.Traits})
	}
	encounters := make([]map[string]any, 0, len(catalog.Encounters))
	for _, item := range catalog.Encounters {
		encounters = append(encounters, map[string]any{"slug": item.Slug, "chapter_slug": item.ChapterSlug, "kind": item.Kind, "objective": item.Objective, "duration_ticks": item.DurationTicks, "max_ticks": item.MaxTicks, "spawn_interval": item.SpawnInterval, "max_alive": item.MaxAlive, "enemy_slugs": item.EnemySlugs, "hazards": item.Hazards, "reward_bias": item.RewardBias, "tutorial": item.Tutorial, "risk": item.Risk})
	}
	events := make([]map[string]any, 0, len(catalog.Events))
	for _, item := range catalog.Events {
		options := make([]map[string]any, 0, len(item.Options))
		for _, option := range item.Options {
			options = append(options, map[string]any{"slug": option.Slug, "label": text(option.LabelKey), "result": text(option.ResultKey), "effects": option.Effects, "metrics": option.Metrics})
		}
		events = append(events, map[string]any{"slug": item.Slug, "chapter_slug": item.ChapterSlug, "title": text(item.TitleKey), "body": text(item.BodyKey), "options": options})
	}
	scenes := make([]map[string]any, 0, len(catalog.Scenes))
	for _, item := range catalog.Scenes {
		messages := make([]map[string]any, 0, len(item.Messages))
		for _, message := range item.Messages {
			messages = append(messages, map[string]any{"sender": message.Sender, "kind": message.Kind, "text": text(message.TextKey)})
		}
		options := make([]map[string]any, 0, len(item.Options))
		for _, option := range item.Options {
			options = append(options, map[string]any{"slug": option.Slug, "label": text(option.LabelKey), "metrics": option.Metrics})
		}
		scenes = append(scenes, map[string]any{"slug": item.Slug, "chapter_slug": nullableString(item.ChapterSlug), "title": text(item.TitleKey), "trigger": item.Trigger, "messages": messages, "options": options})
	}
	chapters := make([]map[string]any, 0, len(catalog.Chapters))
	for _, item := range catalog.Chapters {
		chapters = append(chapters, map[string]any{"slug": item.Slug, "order": item.Order, "title": text(item.TitleKey), "subtitle": text(item.SubtitleKey), "character_slug": nullableString(item.CharacterSlug), "finale": item.Finale, "available": item.Available, "next_chapter_slug": nullableString(item.NextChapterSlug), "background_url": item.BackgroundURL, "kit_slug": nullableString(item.KitSlug)})
	}
	return map[string]any{"version": catalog.Version, "protocol": catalog.Protocol, "locale": locale, "limits": catalog.Manifest.Limits, "characters": characters, "kits": kits, "modules": modules, "plugins": plugins, "enemies": enemies, "encounters": encounters, "events": events, "scenes": scenes, "chapters": chapters}
}

func mapGameSnapshot(snapshot game.Snapshot) map[string]any {
	pendingSlug := ""
	if snapshot.PendingScene != nil {
		pendingSlug = snapshot.PendingScene.Slug
	}
	onboarding := "complete"
	if !snapshot.Progress.StoryFlags["action-tutorial-completed"] {
		if pendingSlug != "" {
			onboarding = "intro"
		} else {
			onboarding = "tutorial"
		}
	}
	return map[string]any{"protocol": gamecontent.CurrentProtocol, "content_version": gamecontent.CurrentVersion, "progress": mapProgress(snapshot.Progress), "campaign_run": snapshot.CampaignRun, "daily_run": snapshot.DailyRun, "daily_result": snapshot.DailyResult, "pending_scene_slug": nullableString(pendingSlug), "onboarding_stage": onboarding}
}

func mapProgress(progress progression.Progress) map[string]any {
	unlocks := progress.Unlocks
	if unlocks == nil {
		unlocks = []progression.Unlock{}
	}
	choices := progress.Choices
	if choices == nil {
		choices = []progression.Choice{}
	}
	chapters := progress.Chapters
	if chapters == nil {
		chapters = []progression.ChapterProgress{}
	}
	return map[string]any{"current_chapter_slug": progress.CurrentChapter, "highest_noise_level": progress.HighestNoise, "story_version": progress.StoryVersion, "version": progress.Version, "unlocks": unlocks, "choices": choices, "chapters": chapters, "trust": progress.Trust, "authenticity": progress.Authenticity, "retention": progress.Retention, "ending": nullableString(progress.Ending), "daily_unlocked": progress.DailyUnlocked}
}
func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
