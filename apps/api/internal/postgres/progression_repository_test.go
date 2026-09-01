package postgres

import (
	"reflect"
	"testing"

	"github.com/achenachena/xuhuan/apps/api/internal/progression"
)

func TestProjectStoryFlagsReplacesOnlyTheRevisedSceneChoice(t *testing.T) {
	current := progression.Progress{
		StoryFlags: map[string]bool{
			"kept-withdrawn-voice":               true,
			"seventh-dock-intermission-resolved": true,
			"another-chapter-choice":             true,
			"another-intermission-resolved":      true,
		},
		Choices: []progression.Choice{
			{SceneSlug: "seventh-dock-intermission", ChoiceTag: "older-choice", Revision: 1},
			{SceneSlug: "seventh-dock-intermission", ChoiceTag: "kept-withdrawn-voice", Revision: 2},
			{SceneSlug: "another-intermission", ChoiceTag: "another-chapter-choice", Revision: 1},
		},
	}

	got := projectStoryFlags(current, "seventh-dock-intermission", "deleted-learned-reply")
	want := map[string]bool{
		"deleted-learned-reply":              true,
		"seventh-dock-intermission-resolved": true,
		"another-chapter-choice":             true,
		"another-intermission-resolved":      true,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("projectStoryFlags() = %#v, want %#v", got, want)
	}
	if !current.StoryFlags["kept-withdrawn-voice"] {
		t.Fatal("projection mutated the stored input map")
	}
}
