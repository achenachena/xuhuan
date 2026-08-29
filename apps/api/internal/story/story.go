package story

import (
	"slices"
	"sort"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
)

type GameplayProjection struct {
	RewardBias      string
	BossVariant     string
	SourceSceneSlug string
	SourceChoiceTag string
	ChoiceTags      []string
}

// PendingScene projects the next required story beat from immutable choices
// and campaign flags. Authored scene triggers replace chapter-specific code.
func PendingScene(progress progression.Progress, catalog *gamecontent.Catalog) *gamecontent.StoryScene {
	for _, scene := range catalog.Scenes {
		if scene.Trigger.Kind == "new_player" && !choiceMade(progress, scene.Slug) {
			value := scene
			return &value
		}
	}
	for _, scene := range catalog.Scenes {
		if !progress.StoryFlags["scene:"+scene.Slug+":pending"] {
			continue
		}
		if scene.Trigger.Kind == "chapter_midpoint" {
			if latestRevision(progress, scene.Slug) > chapterClears(progress, scene.ChapterSlug) {
				continue
			}
		} else if choiceMade(progress, scene.Slug) {
			continue
		}
		value := scene
		return &value
	}
	chapters := slices.Clone(catalog.Chapters)
	slices.SortFunc(chapters, func(a, b gamecontent.Chapter) int { return a.Order - b.Order })
	for _, chapter := range chapters {
		if chapter.Finale {
			continue
		}
		if progress.StoryFlags["chapter:"+chapter.Slug+":cleared"] && latestRevision(progress, chapter.EpilogueSceneSlug) < chapterClears(progress, chapter.Slug) {
			if scene, ok := catalog.Scene(chapter.EpilogueSceneSlug); ok {
				return &scene
			}
		}
	}
	if chapter, ok := catalog.Chapter(progress.CurrentChapter); ok && !choiceMade(progress, chapter.PreludeSceneSlug) {
		// The first tap launches the playable tutorial immediately. Nana's
		// chapter prelude is inserted after that room; later chapters still show
		// their prelude before a Run starts.
		if chapter.Order != 1 || progress.StoryFlags["action-tutorial-completed"] {
			if scene, exists := catalog.Scene(chapter.PreludeSceneSlug); exists {
				return &scene
			}
		}
	}
	if progress.StoryFlags["finale-unlocked"] {
		for _, scene := range catalog.Scenes {
			if scene.Trigger.Kind == "finale_unlocked" && !choiceMade(progress, scene.Slug) {
				value := scene
				return &value
			}
		}
	}
	if progress.StoryFlags["chapter:zero-channel:cleared"] {
		ending := Ending(progress)
		clears := chapterClears(progress, "zero-channel")
		for _, scene := range catalog.Scenes {
			if scene.Trigger.Kind == "ending" && scene.Trigger.Ending == ending && clears > latestRevision(progress, scene.Slug) {
				value := scene
				return &value
			}
		}
	}
	return nil
}

func chapterClears(progress progression.Progress, chapterSlug string) int {
	for _, chapter := range progress.Chapters {
		if chapter.ChapterSlug == chapterSlug {
			return chapter.Clears
		}
	}
	return 0
}

func latestRevision(progress progression.Progress, sceneSlug string) int {
	latest := 0
	for _, choice := range progress.Choices {
		if choice.SceneSlug == sceneSlug && choice.Revision > latest {
			latest = choice.Revision
		}
	}
	return latest
}

func Ending(progress progression.Progress) string {
	if progress.Authenticity >= progress.Retention+3 {
		return "authentic"
	}
	if progress.Retention >= progress.Authenticity+3 {
		return "retained"
	}
	return "balanced"
}

// ProjectGameplay turns the latest revision of story choices into a compact
// server-owned Run modifier. Multi-option chapter checkpoints take precedence
// over aggregate campaign metrics, so a revised choice changes the very next
// reward and the chapter Boss without rewriting prior command history.
func ProjectGameplay(progress progression.Progress, catalog *gamecontent.Catalog, chapterSlug string) GameplayProjection {
	type indexedChoice struct {
		choice progression.Choice
		index  int
	}
	latest := make(map[string]indexedChoice)
	for index, choice := range progress.Choices {
		if previous, ok := latest[choice.SceneSlug]; !ok || choice.Revision > previous.choice.Revision {
			latest[choice.SceneSlug] = indexedChoice{choice: choice, index: index}
		}
	}
	projection := GameplayProjection{BossVariant: Ending(progress)}
	for _, indexed := range latest {
		if indexed.choice.ChoiceTag != "" {
			projection.ChoiceTags = append(projection.ChoiceTags, indexed.choice.ChoiceTag)
		}
	}
	sort.Strings(projection.ChoiceTags)
	selectedIndex := -1
	for _, scene := range catalog.Scenes {
		if scene.ChapterSlug != chapterSlug || len(scene.Options) < 2 {
			continue
		}
		indexed, ok := latest[scene.Slug]
		if !ok || indexed.index < selectedIndex {
			continue
		}
		choice := indexed.choice
		selectedIndex = indexed.index
		projection.SourceSceneSlug = scene.Slug
		projection.SourceChoiceTag = choice.ChoiceTag
		projection.BossVariant = choiceVariant(choice)
		projection.RewardBias = variantRewardBias(projection.BossVariant)
	}
	return projection
}

func choiceVariant(choice progression.Choice) string {
	if choice.Authenticity > choice.Retention && choice.Authenticity >= choice.Trust {
		return "authentic"
	}
	if choice.Retention > choice.Authenticity && choice.Retention >= choice.Trust {
		return "retained"
	}
	return "balanced"
}

func variantRewardBias(variant string) string {
	switch variant {
	case "authentic":
		return "glitch"
	case "retained":
		return "surge"
	default:
		return "guard"
	}
}

func choiceMade(progress progression.Progress, sceneSlug string) bool {
	for _, choice := range progress.Choices {
		if choice.SceneSlug == sceneSlug {
			return true
		}
	}
	return false
}
