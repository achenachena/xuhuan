package run

import (
	"slices"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func resolveEvent(state *State, choiceSlug string, catalog *gamecontent.Catalog, events *[]Event) error {
	if state.Phase != EventPhase || state.CurrentEventSlug == "" {
		return ErrInvalidCommand
	}
	definition, ok := catalog.Event(state.CurrentEventSlug)
	if !ok {
		return ErrInvalidCommand
	}
	index := slices.IndexFunc(definition.Options, func(option gamecontent.EventOption) bool { return option.Slug == choiceSlug })
	if index < 0 {
		return ErrInvalidCommand
	}
	option := definition.Options[index]
	if err := applyEffects(state, option.Effects, catalog, events); err != nil {
		return err
	}
	if option.ChoiceTag != "" && !slices.Contains(state.ChoiceTags, option.ChoiceTag) {
		state.ChoiceTags = append(state.ChoiceTags, option.ChoiceTag)
		*events = append(*events, Event{Kind: "story_tag", ChoiceTag: option.ChoiceTag})
	}
	if option.Metrics != (gamecontent.StoryMetrics{}) {
		*events = append(*events, Event{Kind: "story_metrics", Trust: option.Metrics.Trust, Authenticity: option.Metrics.Authenticity, Retention: option.Metrics.Retention})
	}
	if index := nodeIndex(state.Map, state.Map.CurrentNodeID); index >= 0 && state.Map.Nodes[index].Type == StoryNode {
		if chapter, ok := catalog.Chapter(state.ChapterSlug); ok && chapter.MidpointSceneSlug != "" {
			*events = append(*events, Event{Kind: "story_scene_ready", SceneSlug: chapter.MidpointSceneSlug, ChapterSlug: chapter.Slug})
		}
	}
	state.CurrentEventSlug = ""
	completeCurrentNode(state)
	state.Phase = MapPhase
	return nil
}

func bossBranchSceneSlug(chapter gamecontent.Chapter, catalog *gamecontent.Catalog) string {
	for _, scene := range catalog.Scenes {
		if scene.ChapterSlug == chapter.Slug && scene.Trigger.Kind == "chapter_midpoint" && scene.Slug != chapter.MidpointSceneSlug {
			return scene.Slug
		}
	}
	return ""
}
