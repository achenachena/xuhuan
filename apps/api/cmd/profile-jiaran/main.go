package main

import (
	"encoding/json"
	"os"

	content "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/run"
)

func main() {
	c := content.MustLoadV4()
	s, e := run.NewState(run.StartInput{ChapterSlug: "always-cheerful", CharacterSlug: "jiaran", Seed: "jiaran-profile-2026", Mode: run.CampaignMode}, c)
	if e != nil {
		panic(e)
	}
	for i := 0; i < 3; i++ {
		r, _, e := run.Apply(s, "jiaran-profile-2026", run.CampaignMode, run.Command{Type: run.CompleteSegment, SegmentOutcome: &run.SegmentOutcome{Won: true, Health: 3, Score: 100}}, c)
		if e != nil {
			panic(e)
		}
		s = r.State
		if i == 2 {
			s.ShowEffects = []string{"wide-angle", "clean-cut", "instant-replay"}
		}
		r, _, e = run.Apply(s, "jiaran-profile-2026", run.CampaignMode, run.Command{Type: run.ChooseShowOption, OptionID: s.PendingShowOptions[0]}, c)
		if e != nil {
			panic(e)
		}
		s = r.State
	}
	json.NewEncoder(os.Stdout).Encode(s.Segment.RuntimeConfig)
}
