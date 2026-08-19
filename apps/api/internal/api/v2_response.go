package api

import (
	"strings"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/game"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
)

func localizeCatalog(catalog *gamecontent.Catalog, language string) map[string]any {
	characters := make([]map[string]any, 0, len(catalog.Characters))
	for _, item := range catalog.Characters {
		characters = append(characters, map[string]any{"slug": item.Slug, "name": item.Name.Resolve(language), "biography": item.Biography.Resolve(language), "playstyle": item.Playstyle.Resolve(language), "color_theme": item.ColorTheme, "portrait_url": item.PortraitURL, "model_url": item.ModelURL, "available": item.Available})
	}
	modules := make([]map[string]any, 0, len(catalog.Modules))
	for _, item := range catalog.Modules {
		modules = append(modules, map[string]any{"slug": item.Slug, "character_slug": nullableString(item.CharacterSlug), "name": item.Name.Resolve(language), "description": item.Description.Resolve(language), "archetype": item.Archetype, "rarity": item.Rarity, "effects": item.Effects})
	}
	plugins := make([]map[string]any, 0, len(catalog.Plugins))
	for _, item := range catalog.Plugins {
		plugins = append(plugins, map[string]any{"slug": item.Slug, "name": item.Name.Resolve(language), "description": item.Description.Resolve(language), "effects": item.Effects})
	}
	enemies := make([]map[string]any, 0, len(catalog.Enemies))
	for _, item := range catalog.Enemies {
		enemies = append(enemies, map[string]any{"slug": item.Slug, "name": item.Name.Resolve(language), "description": item.Description.Resolve(language), "kind": item.Kind, "pattern": item.Pattern, "max_health": item.MaxHealth, "speed": item.Speed, "contact_damage": item.ContactDamage, "fire_interval": item.FireInterval, "projectile_speed": item.ProjectileSpeed, "projectile_damage": item.ProjectileDamage, "color_theme": item.ColorTheme, "image_url": item.ImageURL})
	}
	encounters := make([]map[string]any, 0, len(catalog.Encounters))
	for _, item := range catalog.Encounters {
		encounters = append(encounters, map[string]any{"slug": item.Slug, "kind": item.Kind, "duration_ticks": item.DurationTicks, "max_ticks": item.MaxTicks, "spawn_interval": item.SpawnInterval, "max_alive": item.MaxAlive, "enemy_slugs": item.EnemySlugs, "tutorial": item.Tutorial})
	}
	events := make([]map[string]any, 0, len(catalog.Events))
	for _, item := range catalog.Events {
		options := make([]map[string]any, 0, len(item.Options))
		for _, option := range item.Options {
			options = append(options, map[string]any{"slug": option.Slug, "label": option.Label.Resolve(language), "result": option.Result.Resolve(language)})
		}
		events = append(events, map[string]any{"slug": item.Slug, "title": item.Title.Resolve(language), "body": item.Body.Resolve(language), "options": options})
	}
	scenes := make([]map[string]any, 0, len(catalog.Scenes))
	for _, item := range catalog.Scenes {
		messages := make([]map[string]any, 0, len(item.Messages))
		for _, message := range item.Messages {
			messages = append(messages, map[string]any{"sender": message.Sender, "kind": message.Kind, "text": message.Text.Resolve(language)})
		}
		options := make([]map[string]any, 0, len(item.Options))
		for _, option := range item.Options {
			options = append(options, map[string]any{"slug": option.Slug, "label": option.Label.Resolve(language)})
		}
		scenes = append(scenes, map[string]any{"slug": item.Slug, "title": item.Title.Resolve(language), "messages": messages, "options": options})
	}
	chapters := make([]map[string]any, 0, len(catalog.Chapters))
	for _, item := range catalog.Chapters {
		chapters = append(chapters, map[string]any{"slug": item.Slug, "title": item.Title.Resolve(language), "subtitle": item.Subtitle.Resolve(language), "character_slug": item.CharacterSlug, "available": item.Available})
	}
	return map[string]any{"version": catalog.Version, "protocol": "action-v1", "locale": language, "characters": characters, "modules": modules, "plugins": plugins, "enemies": enemies, "encounters": encounters, "events": events, "scenes": scenes, "chapters": chapters}
}

func mapGameSnapshot(snapshot game.Snapshot) map[string]any {
	displayName := strings.TrimSpace(valueOrEmpty(snapshot.Player.FirstName) + " " + valueOrEmpty(snapshot.Player.LastName))
	if displayName == "" && snapshot.Player.Username != nil {
		displayName = *snapshot.Player.Username
	}
	if displayName == "" {
		displayName = "Last Viewer"
	}
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
	return map[string]any{"protocol": "action-v1", "player": map[string]any{"id": snapshot.Player.ID, "display_name": displayName, "language_code": snapshot.Player.LanguageCode}, "progress": mapProgress(snapshot.Progress), "active_run": snapshot.ActiveRun, "pending_scene_slug": nullableString(pendingSlug), "onboarding_stage": onboarding}
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
	return map[string]any{"current_chapter_slug": progress.CurrentChapter, "highest_noise_level": progress.HighestNoise, "story_version": progress.StoryVersion, "version": progress.Version, "unlocks": unlocks, "choices": choices}
}
func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
