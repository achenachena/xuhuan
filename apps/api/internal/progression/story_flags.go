package progression

// ProjectStoryFlags keeps append-only choice rows while making the materialized
// story projection reflect only the latest revision for a scene.
func ProjectStoryFlags(current Progress, sceneSlug, choiceTag string) map[string]bool {
	projected := make(map[string]bool, len(current.StoryFlags)+2)
	for key, value := range current.StoryFlags {
		projected[key] = value
	}
	latestRevision := 0
	previousTag := ""
	for _, choice := range current.Choices {
		if choice.SceneSlug == sceneSlug && choice.Revision >= latestRevision {
			latestRevision = choice.Revision
			previousTag = choice.ChoiceTag
		}
	}
	if previousTag != "" {
		delete(projected, previousTag)
	}
	projected[sceneSlug+"-resolved"] = true
	if choiceTag != "" {
		projected[choiceTag] = true
	}
	return projected
}
