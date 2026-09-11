package localgame

import (
	"encoding/json"
	"testing"

	"github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/run"
)

func TestCompleteBrowserCampaignSurvivesEverySaveAndUnlocksDaily(t *testing.T) {
	catalog := content.MustLoadV4()
	saved := Handle(Request{Action: "load"}, catalog).Save
	act := func(request Request) Response {
		t.Helper()
		raw, err := json.Marshal(saved)
		if err != nil {
			t.Fatal(err)
		}
		request.Save = raw
		response := Handle(request, catalog)
		if response.Error != "" {
			t.Fatalf("%s: %s", request.Action, response.Error)
		}
		saved = response.Save
		return response
	}
	finish := func(mode run.Mode) {
		t.Helper()
		for step := 0; step < 20; step++ {
			current := saved.Campaign
			if mode == run.DailyMode {
				current = saved.Daily
			}
			if current.Run.Status != run.Active {
				return
			}
			state := current.Run.State
			command := run.Command{}
			switch state.Phase {
			case run.SegmentPhase:
				command = run.Command{Type: run.CompleteSegment, SegmentOutcome: &run.SegmentOutcome{Won: true, Health: 3, Score: 100}}
			case run.ShowChoicePhase:
				command = run.Command{Type: run.ChooseShowOption, OptionID: state.PendingShowOptions[0]}
			case run.StoryPhase:
				command = run.Command{Type: run.ChooseIntermissionReply, SceneID: state.Story.SceneID, OptionID: state.Story.ChoiceIDs[0]}
			default:
				t.Fatalf("unexpected phase %s", state.Phase)
			}
			act(Request{Action: "command", Mode: mode, ID: current.Run.ID, Version: current.Run.Version, Command: command})
		}
		t.Fatal("run did not complete")
	}
	for i, chapter := range catalog.Chapters {
		if saved.Progress.CurrentChapter != chapter.ID {
			t.Fatalf("chapter %d: %s", i, saved.Progress.CurrentChapter)
		}
		character := chapter.FeaturedCharacter
		if character == "player-choice" {
			character = "nana7mi"
		}
		act(Request{Action: "start", Mode: run.CampaignMode, ID: chapter.ID, Chapter: chapter.ID, Character: character})
		// Reloading must retain the exact generated room seed/config and version.
		before, _ := json.Marshal(saved.Campaign)
		act(Request{Action: "load"})
		after, _ := json.Marshal(saved.Campaign)
		if string(before) != string(after) {
			t.Fatal("reload changed encounter")
		}
		finish(run.CampaignMode)
		if saved.Campaign.Run.Outcome == nil || *saved.Campaign.Run.Outcome != run.Cleared {
			t.Fatal("missing win")
		}
		act(Request{Action: "hub"})
	}
	if !saved.Progress.DailyUnlocked || saved.Progress.Ending == "" {
		t.Fatal("finale did not unlock daily")
	}
	for _, chapter := range saved.Progress.Chapters {
		if chapter.Clears != 1 || chapter.HighestEncore != 1 || chapter.BestScore != 400 {
			t.Fatalf("wrong chapter progress: %+v", chapter)
		}
	}
	act(Request{Action: "start", Mode: run.DailyMode, ID: "daily"})
	finish(run.DailyMode)
	if saved.DailyResult == nil || saved.DailyResult.Score != 200 || saved.DailyResult.Streak != 1 {
		t.Fatalf("daily: %+v", saved.DailyResult)
	}
	act(Request{Action: "hub"})
	act(Request{Action: "start", Mode: run.DailyMode, ID: "daily-replay"})
	finish(run.DailyMode)
	if saved.DailyResult.Streak != 1 {
		t.Fatal("replaying daily increased streak")
	}
	// Replay and failure never remove previously unlocked progress.
	act(Request{Action: "hub"})
	act(Request{Action: "start", Mode: run.CampaignMode, ID: "retry", Chapter: catalog.Chapters[0].ID, Character: "nana7mi", Encore: 1})
	act(Request{Action: "command", Mode: run.CampaignMode, ID: "retry", Version: 1, Command: run.Command{Type: run.CompleteSegment, SegmentOutcome: &run.SegmentOutcome{Won: false, Health: 0}}})
	if saved.Campaign.Run.Outcome == nil || *saved.Campaign.Run.Outcome != run.Failed || !saved.Progress.DailyUnlocked {
		t.Fatal("failure damaged progress")
	}
}

func TestInvalidAndConcurrentLocalCommandsDoNotAdvanceSave(t *testing.T) {
	catalog := content.MustLoadV4()
	for _, raw := range []string{`{}`, `{"schema":99}`, `null garbage`} {
		if response := Handle(Request{Action: "load", Save: json.RawMessage(raw)}, catalog); response.Error != ErrSave.Error() || response.Save != nil {
			t.Fatalf("invalid save accepted: %s", raw)
		}
	}
	saved := Handle(Request{Action: "start", Mode: run.CampaignMode, ID: "first", Chapter: "seventh-dock", Character: "nana7mi"}, catalog).Save
	raw, _ := json.Marshal(saved)
	for _, request := range []Request{
		{Action: "command", Mode: run.CampaignMode, ID: "first", Version: 0, Command: run.Command{Type: run.AbandonRun}},
		{Action: "start", Mode: run.CampaignMode, ID: "second", Chapter: "seventh-dock", Character: "nana7mi"},
		{Action: "start", Mode: run.DailyMode, ID: "daily"},
	} {
		request.Save = raw
		if response := Handle(request, catalog); response.Error == "" || response.Save != nil {
			t.Fatal("illegal command accepted")
		}
	}
}
