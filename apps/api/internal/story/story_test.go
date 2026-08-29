package story

import (
	"slices"
	"testing"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
)

func TestPendingSceneAdvancesWithoutBranchLockout(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	progress := progression.Progress{CurrentChapter: "seventh-dock", StoryFlags: map[string]bool{}}
	if scene := PendingScene(progress, catalog); scene == nil || scene.Slug != "prologue-last-viewer" {
		t.Fatalf("new player scene = %#v", scene)
	}
	progress.Choices = append(progress.Choices, progression.Choice{SceneSlug: "prologue-last-viewer", OptionSlug: "stay-online", ChoiceTag: "choose-presence"})
	if scene := PendingScene(progress, catalog); scene != nil {
		t.Fatalf("the tutorial should start immediately after the first choice: %#v", scene)
	}
	progress.StoryFlags["action-tutorial-completed"] = true
	progress.StoryFlags["scene:nana-prelude:pending"] = true
	if scene := PendingScene(progress, catalog); scene == nil || scene.Slug != "nana-prelude" {
		t.Fatalf("post-tutorial chapter prelude = %#v", scene)
	}
	progress.Choices = append(progress.Choices, progression.Choice{SceneSlug: "nana-prelude", Revision: 1})
	progress.StoryFlags["chapter:seventh-dock:cleared"] = true
	progress.Chapters = []progression.ChapterProgress{{ChapterSlug: "seventh-dock", Clears: 1}}
	if scene := PendingScene(progress, catalog); scene == nil || scene.Slug != "nana-epilogue" {
		t.Fatalf("post-clear scene = %#v", scene)
	}
}

func TestPendingScenePrioritizesRunStoryCheckpoint(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	progress := progression.Progress{
		CurrentChapter: "seventh-dock",
		StoryFlags:     map[string]bool{"scene:nana-midpoint:pending": true},
		Choices:        []progression.Choice{{SceneSlug: "prologue-last-viewer", Revision: 1}, {SceneSlug: "nana-prelude", Revision: 1}},
	}
	if scene := PendingScene(progress, catalog); scene == nil || scene.Slug != "nana-midpoint" {
		t.Fatalf("checkpoint scene=%#v", scene)
	}
	progress.Choices = append(progress.Choices, progression.Choice{SceneSlug: "nana-midpoint", Revision: 1})
	if scene := PendingScene(progress, catalog); scene != nil {
		t.Fatalf("resolved checkpoint remained pending: %#v", scene)
	}
	progress.Chapters = []progression.ChapterProgress{{ChapterSlug: "seventh-dock", Clears: 1}}
	if scene := PendingScene(progress, catalog); scene == nil || scene.Slug != "nana-midpoint" {
		t.Fatalf("replay checkpoint did not request revision two: %#v", scene)
	}
}

func TestEpilogueIsOfferedAfterEachNewClear(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	progress := progression.Progress{
		CurrentChapter: "always-cheerful",
		StoryFlags: map[string]bool{
			"chapter:seventh-dock:cleared": true,
		},
		Choices: []progression.Choice{
			{SceneSlug: "prologue-last-viewer", Revision: 1},
			{SceneSlug: "nana-epilogue", Revision: 1},
			{SceneSlug: "diana-prelude", Revision: 1},
		},
		Chapters: []progression.ChapterProgress{{ChapterSlug: "seventh-dock", Clears: 1}},
	}
	if scene := PendingScene(progress, catalog); scene != nil {
		t.Fatalf("resolved first epilogue remained pending: %#v", scene)
	}
	progress.Chapters[0].Clears = 2
	if scene := PendingScene(progress, catalog); scene == nil || scene.Slug != "nana-epilogue" {
		t.Fatalf("second clear did not request epilogue revision two: %#v", scene)
	}
}

func TestFinaleProjectsAllThreeAuthoredEndings(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	tests := []struct {
		name                    string
		authenticity, retention int
		want                    string
	}{
		{name: "authentic", authenticity: 5, retention: 1, want: "zero-authentic-ending"},
		{name: "balanced", authenticity: 3, retention: 2, want: "zero-balanced-ending"},
		{name: "retained", authenticity: 1, retention: 5, want: "zero-retained-ending"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			progress := progression.Progress{
				CurrentChapter: "zero-channel", Authenticity: test.authenticity, Retention: test.retention,
				StoryFlags: map[string]bool{"chapter:zero-channel:cleared": true, "finale-unlocked": true},
				Choices:    []progression.Choice{{SceneSlug: "prologue-last-viewer", Revision: 1}, {SceneSlug: "finale-unlocked", Revision: 1}},
				Chapters:   []progression.ChapterProgress{{ChapterSlug: "zero-channel", Clears: 1}},
			}
			if scene := PendingScene(progress, catalog); scene == nil || scene.Slug != test.want {
				t.Fatalf("ending scene=%#v want=%s", scene, test.want)
			}
		})
	}
}

func TestFinaleReplayQueuesARevisionOfTheSameEnding(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	progress := progression.Progress{
		CurrentChapter: "zero-channel", Authenticity: 2, Retention: 2,
		StoryFlags: map[string]bool{"chapter:zero-channel:cleared": true, "finale-unlocked": true},
		Choices: []progression.Choice{
			{SceneSlug: "prologue-last-viewer", Revision: 1},
			{SceneSlug: "finale-unlocked", Revision: 1},
			{SceneSlug: "zero-balanced-ending", Revision: 1},
		},
		Chapters: []progression.ChapterProgress{{ChapterSlug: "zero-channel", Clears: 2}},
	}
	if scene := PendingScene(progress, catalog); scene == nil || scene.Slug != "zero-balanced-ending" {
		t.Fatalf("replayed ending scene=%#v", scene)
	}
}

func TestLatestStoryRevisionProjectsDistinctGameplayBranches(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	progress := progression.Progress{Authenticity: 2, Retention: 2, Choices: []progression.Choice{
		{SceneSlug: "nana-midpoint", ChoiceTag: "nana-contradictions", Revision: 1, Trust: 2, Authenticity: 2, Retention: -1},
	}}
	authentic := ProjectGameplay(progress, catalog, "seventh-dock")
	if authentic.BossVariant != "authentic" || authentic.RewardBias != "glitch" || authentic.SourceChoiceTag != "nana-contradictions" {
		t.Fatalf("authentic projection=%#v", authentic)
	}
	progress.Choices = append(progress.Choices, progression.Choice{
		SceneSlug: "nana-midpoint", ChoiceTag: "nana-highlight", Revision: 2, Trust: 0, Authenticity: -1, Retention: 2,
	})
	retained := ProjectGameplay(progress, catalog, "seventh-dock")
	if retained.BossVariant != "retained" || retained.RewardBias != "surge" || retained.SourceChoiceTag != "nana-highlight" {
		t.Fatalf("retained projection=%#v", retained)
	}
	if slices.Contains(retained.ChoiceTags, "nana-contradictions") {
		t.Fatalf("superseded tag leaked into latest projection: %#v", retained.ChoiceTags)
	}
}

func TestMostRecentlyRevisedCheckpointWinsOverAnOlderLaterScene(t *testing.T) {
	catalog := gamecontent.MustLoad(gamecontent.CurrentVersion)
	progress := progression.Progress{Choices: []progression.Choice{
		{SceneSlug: "nana-boss-branch", ChoiceTag: "nana-retained", Revision: 1, Retention: 2},
		{SceneSlug: "nana-midpoint", ChoiceTag: "nana-contradictions", Revision: 2, Authenticity: 2, Retention: -1},
	}}
	projection := ProjectGameplay(progress, catalog, "seventh-dock")
	if projection.SourceSceneSlug != "nana-midpoint" || projection.BossVariant != "authentic" || projection.RewardBias != "glitch" {
		t.Fatalf("latest projection=%#v", projection)
	}
}
