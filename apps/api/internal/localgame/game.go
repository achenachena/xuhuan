// Package localgame projects the shared campaign engine into a browser-local save.
// Nothing here authenticates a player or calls the production persistence API.
package localgame

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	"github.com/achenachena/xuhuan/apps/api/internal/run"
)

var ErrSave = errors.New("local_save_invalid")

type SavedRun struct {
	Run run.GameRun `json:"run"`
	// The seed is deterministic gameplay data, never an authentication secret.
	Seed string `json:"seed"`
}
type Save struct {
	Schema      int                  `json:"schema"`
	Progress    progression.Progress `json:"progress"`
	Campaign    *SavedRun            `json:"campaign"`
	Daily       *SavedRun            `json:"daily"`
	DailyResult *run.DailyResult     `json:"daily_result"`
}
type Request struct {
	Action    string          `json:"action"`
	Save      json.RawMessage `json:"save"`
	Locale    string          `json:"locale"`
	ID        string          `json:"id"`
	Mode      run.Mode        `json:"mode"`
	Chapter   string          `json:"chapter_slug"`
	Character string          `json:"character_slug"`
	Companion string          `json:"companion_slug"`
	Encore    int             `json:"encore_level"`
	Version   int64           `json:"expected_version"`
	Command   run.Command     `json:"command"`
}
type Response struct {
	Save    *Save                `json:"save,omitempty"`
	Game    any                  `json:"game,omitempty"`
	Content any                  `json:"content,omitempty"`
	Result  *run.CommandResponse `json:"result,omitempty"`
	Error   string               `json:"error,omitempty"`
}

func initial(catalog *content.V4Catalog) Save {
	now := time.Now().UTC()
	first := catalog.Chapters[0]
	return Save{Schema: 1, Progress: progression.Progress{
		CurrentChapter: first.ID, StoryVersion: 4, Version: 1, StoryFlags: map[string]bool{},
		Chapters: []progression.ChapterProgress{{ChapterSlug: first.ID, UpdatedAt: now}},
		Unlocks:  []progression.Unlock{{Type: progression.CharacterUnlock, ContentSlug: first.FeaturedCharacter, CreatedAt: now}},
		Choices:  []progression.Choice{}, CreatedAt: now, UpdatedAt: now,
	}}
}

func Handle(request Request, catalog *content.V4Catalog) Response {
	if request.Action == "content" {
		return Response{Content: catalog.Localized(request.Locale)}
	}
	save := initial(catalog)
	if len(request.Save) > 0 && string(request.Save) != "null" {
		save = Save{}
		if err := json.Unmarshal(request.Save, &save); err != nil || !validSave(save, catalog) {
			return Response{Error: ErrSave.Error()}
		}
	}
	current := &save.Campaign
	if request.Mode == run.DailyMode {
		current = &save.Daily
	} else if request.Mode != "" && request.Mode != run.CampaignMode {
		return Response{Error: "invalid_command"}
	}
	var result *run.CommandResponse
	switch request.Action {
	case "load":
	case "hub":
		if save.Campaign != nil && save.Campaign.Run.Status != run.Active {
			save.Campaign = nil
		}
		if save.Daily != nil && save.Daily.Run.Status != run.Active {
			save.Daily = nil
		}
	case "start":
		if *current != nil && (*current).Run.Status == run.Active {
			return Response{Error: "active_run_exists"}
		}
		if request.ID == "" {
			return Response{Error: "invalid_command"}
		}
		prepared, err := run.PrepareRun(save.Progress, run.CampaignStartInput{Mode: request.Mode, ChapterSlug: request.Chapter, CharacterSlug: request.Character, CompanionSlug: request.Companion, EncoreLevel: request.Encore}, catalog)
		if err != nil {
			return Response{Error: err.Error()}
		}
		now := time.Now().UTC()
		*current = &SavedRun{Seed: prepared.Seed, Run: run.GameRun{ID: request.ID, ContentVersion: content.V4Version, Mode: prepared.Mode, DailyDate: prepared.DailyDate, State: prepared.State, Status: run.Active, Version: 1, CreatedAt: now, UpdatedAt: now}}
	case "command":
		if *current == nil || (*current).Run.ID != request.ID || (*current).Run.Version != request.Version {
			return Response{Error: "version_conflict"}
		}
		active := &(*current).Run
		if active.Status != run.Active {
			return Response{Error: "run_not_active"}
		}
		resolution, outcome, err := run.Apply(active.State, (*current).Seed, active.Mode, request.Command, catalog)
		if err != nil {
			return Response{Error: err.Error()}
		}
		active.State = resolution.State
		active.Outcome = outcome
		active.Version++
		active.UpdatedAt = time.Now().UTC()
		if outcome != nil {
			active.Status = run.Completed
			if *outcome == run.Quit {
				active.Status = run.Abandoned
			}
			active.CompletedAt = &active.UpdatedAt
		}
		applyEvents(&save, *active, resolution.Events)
		result = &run.CommandResponse{Run: *active, Events: resolution.Events}
	default:
		return Response{Error: "invalid_command"}
	}
	return Response{Save: &save, Game: snapshot(save), Result: result}
}

func validSave(save Save, catalog *content.V4Catalog) bool {
	if save.Schema != 1 || save.Progress.Version < 1 || len(save.Progress.Chapters) == 0 || save.Progress.StoryFlags == nil || save.Progress.Unlocks == nil || save.Progress.Choices == nil {
		return false
	}
	if _, ok := catalog.Chapter(save.Progress.CurrentChapter); !ok {
		return false
	}
	for _, saved := range []*SavedRun{save.Campaign, save.Daily} {
		if saved == nil {
			continue
		}
		r := saved.Run
		if (saved == save.Campaign && r.Mode != run.CampaignMode) || (saved == save.Daily && (r.Mode != run.DailyMode || r.DailyDate == nil)) {
			return false
		}
		if r.Status != run.Active && r.Status != run.Completed && r.Status != run.Abandoned {
			return false
		}
		if r.State.Hearts < 0 || r.State.Hearts > 3 || r.State.MaxHearts != 3 {
			return false
		}
		if r.ID == "" || r.Version < 1 || saved.Seed == "" || r.ContentVersion != content.V4Version {
			return false
		}
		if _, ok := catalog.Chapter(r.State.ChapterSlug); !ok {
			return false
		}
		if _, ok := catalog.Character(r.State.CharacterSlug); !ok {
			return false
		}
		if r.State.Phase == run.SegmentPhase && r.State.Segment == nil {
			return false
		}
		if r.State.Phase == run.StoryPhase && r.State.Story == nil {
			return false
		}
		if r.State.Phase != run.SegmentPhase && r.State.Phase != run.StoryPhase && r.State.Phase != run.ShowChoicePhase && r.State.Phase != run.CompletedPhase {
			return false
		}
	}
	return true
}

func snapshot(save Save) any {
	var campaign, daily *run.GameRun
	if save.Campaign != nil {
		campaign = &save.Campaign.Run
	}
	if save.Daily != nil {
		daily = &save.Daily.Run
	}
	dailyResult := save.DailyResult
	if dailyResult != nil && dailyResult.Date != time.Now().UTC().Format("2006-01-02") {
		dailyResult = nil
	}
	return map[string]any{"protocol": content.V4Protocol, "content_version": content.V4Version, "progress": save.Progress, "campaign_run": campaign, "daily_run": daily, "daily_result": dailyResult}
}

// Events are produced by the shared Go rules, including all chapter, character,
// companion and ending IDs. This is their local persistence projection.
func applyEvents(save *Save, current run.GameRun, events []run.Event) {
	p := &save.Progress
	now := current.UpdatedAt
	if current.Mode == run.DailyMode {
		if current.Outcome == nil || *current.Outcome != run.Cleared {
			return
		}
		date := *current.DailyDate
		previous := save.DailyResult
		streak := 1
		if previous != nil {
			if previous.Date == date {
				if previous.Score >= current.State.Score {
					return
				}
				streak = previous.Streak
			} else if day, err := time.Parse("2006-01-02", date); err == nil && previous.Date == day.AddDate(0, 0, -1).Format("2006-01-02") {
				streak = previous.Streak + 1
			}
		}
		save.DailyResult = &run.DailyResult{Date: date, CharacterSlug: current.State.CharacterSlug, Score: current.State.Score, ShowEffects: current.State.ShowEffects, CompanionSlugs: current.State.CompanionSlugs, Streak: streak}
		return
	}
	for _, event := range events {
		switch event.Kind {
		case "intermission_replied", "ending_chosen":
			revision := 1
			for _, choice := range p.Choices {
				if choice.SceneSlug == event.SceneID {
					revision = max(revision, choice.Revision+1)
				}
			}
			p.StoryFlags = progression.ProjectStoryFlags(*p, event.SceneID, event.ChoiceTag)
			p.Choices = append(p.Choices, progression.Choice{SceneSlug: event.SceneID, OptionSlug: event.ChoiceID, ChoiceTag: event.ChoiceTag, Revision: revision, CreatedAt: now})
			p.Version++
			p.UpdatedAt = now
		case "chapter_cleared":
			p.StoryFlags["chapter:"+event.ChapterSlug+":cleared"] = true
			if event.ChapterSlug == "zero-channel" {
				p.StoryFlags["finale-cleared"] = true
			}
			if event.NextChapterSlug != "" && p.CurrentChapter == event.ChapterSlug {
				p.CurrentChapter = event.NextChapterSlug
			}
			if event.EndingID != "" {
				p.Ending = event.EndingID
				p.DailyUnlocked = true
			}
			for i := range p.Chapters {
				if p.Chapters[i].ChapterSlug == event.ChapterSlug {
					c := &p.Chapters[i]
					c.Clears++
					c.HighestEncore = max(c.HighestEncore, min(3, current.State.EncoreLevel+1))
					c.BestScore = max(c.BestScore, current.State.Score)
					c.UpdatedAt = now
				}
			}
			if event.NextChapterSlug != "" {
				found := false
				for _, c := range p.Chapters {
					found = found || c.ChapterSlug == event.NextChapterSlug
				}
				if !found {
					p.Chapters = append(p.Chapters, progression.ChapterProgress{ChapterSlug: event.NextChapterSlug, UpdatedAt: now})
				}
			}
			for _, grant := range []progression.UnlockGrant{{Type: progression.CompanionUnlock, ContentSlug: event.CompanionID}, {Type: progression.CharacterUnlock, ContentSlug: event.NextCharacterSlug}, {Type: progression.MemoryClipUnlock, ContentSlug: event.ChapterSlug + "-memory"}} {
				if grant.ContentSlug != "" && grant.ContentSlug != "player-choice" && !progression.HasUnlock(*p, grant.Type, grant.ContentSlug) {
					p.Unlocks = append(p.Unlocks, progression.Unlock{Type: grant.Type, ContentSlug: grant.ContentSlug, CreatedAt: now})
				}
			}
			p.Version++
			p.UpdatedAt = now
		}
	}
}
