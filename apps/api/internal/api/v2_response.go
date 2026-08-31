package api

import (
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/game"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
)

func mapGameSnapshot(snapshot game.Snapshot) map[string]any {
	return map[string]any{
		"protocol": gamecontent.V4Protocol, "content_version": gamecontent.V4Version,
		"progress": mapProgress(snapshot.Progress), "campaign_run": snapshot.CampaignRun,
		"daily_run": snapshot.DailyRun, "daily_result": snapshot.DailyResult,
	}
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
	return map[string]any{
		"current_chapter_slug": progress.CurrentChapter, "story_version": progress.StoryVersion,
		"version": progress.Version, "unlocks": unlocks, "choices": choices, "chapters": chapters,
		"ending": nullableString(progress.Ending), "daily_unlocked": progress.DailyUnlocked,
	}
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
