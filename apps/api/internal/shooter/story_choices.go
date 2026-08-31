package shooter

// storyChoiceMode intentionally uses the authored action IDs directly. The
// two concrete choices in each chapter select visibly different Boss beats
// and companion timing; no hidden score, hash, or generic personality metric
// is introduced.
func storyChoiceMode(choiceID string) int {
	switch choiceID {
	case "keep-seven-second-voice", "join-encore-with-consent", "mark-missing-loss", "cancel-three-overnights", "post-caption-correction", "keep-both-rooms", "hold-future-photo", "publish-mismatch-log":
		return 1
	case "delete-learned-reply", "stop-autonomous-encore", "restore-funniest-loss", "share-one-overnight", "publish-original-snark", "read-session-log", "recreate-photo-later", "publish-seven-approved-notes":
		return 2
	default:
		return 0
	}
}
