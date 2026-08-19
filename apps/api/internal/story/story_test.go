package story

import (
	"testing"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
)

func TestPendingSceneAdvancesWithoutBranchLockout(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	progress := progression.Progress{StoryFlags: map[string]bool{}}
	if scene := PendingScene(progress, catalog); scene == nil || scene.Slug != "prologue-last-viewer" {
		t.Fatalf("new player scene = %#v", scene)
	}
	progress.Choices = append(progress.Choices, progression.Choice{SceneSlug: "prologue-last-viewer", OptionSlug: "stay-online", ChoiceTag: "choose-presence"})
	if scene := PendingScene(progress, catalog); scene != nil {
		t.Fatalf("scene before chapter clear = %#v", scene)
	}
	progress.StoryFlags["chapter-one-cleared"] = true
	if scene := PendingScene(progress, catalog); scene == nil || scene.Slug != "chapter-one-memory" {
		t.Fatalf("post-clear scene = %#v", scene)
	}
	progress.Choices = append(progress.Choices, progression.Choice{SceneSlug: "chapter-one-memory", OptionSlug: "keep-all", ChoiceTag: "memory-plural"})
	if scene := PendingScene(progress, catalog); scene == nil || scene.Slug != "chapter-one-aftercare" {
		t.Fatalf("aftercare scene = %#v", scene)
	}
}
