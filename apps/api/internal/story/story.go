package story

import (
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
)

// PendingScene is the story state machine. Choices never lock the main path;
// they add tags while this policy advances the required base scenes.
func PendingScene(progress progression.Progress, catalog *gamecontent.Catalog) *gamecontent.StoryScene {
	ordered := []string{"prologue-last-viewer", "chapter-one-memory", "chapter-one-aftercare"}
	for _, slug := range ordered {
		if choiceMade(progress, slug) {
			continue
		}
		scene, ok := catalog.Scene(slug)
		if !ok {
			continue
		}
		switch scene.Trigger {
		case "new_player":
			return &scene
		case "chapter-one-cleared":
			if progress.StoryFlags["chapter-one-cleared"] {
				return &scene
			}
		case "chapter-one-choice-made":
			if choiceMade(progress, "chapter-one-memory") {
				return &scene
			}
		}
	}
	return nil
}

func choiceMade(progress progression.Progress, sceneSlug string) bool {
	for _, choice := range progress.Choices {
		if choice.SceneSlug == sceneSlug {
			return true
		}
	}
	return false
}
