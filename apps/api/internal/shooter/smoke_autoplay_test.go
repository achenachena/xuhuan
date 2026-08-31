//go:build smoke

package shooter

import (
	"errors"
	"testing"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func TestSmokeAutoplayClearsEveryAuthoredAuthoritySegment(t *testing.T) {
	catalog := gamecontent.MustLoadV4()
	for _, chapter := range catalog.Chapters {
		for segmentIndex := 0; segmentIndex < 4; segmentIndex++ {
			config := authoredBalanceConfig(t, catalog, chapter, segmentIndex)
			got, err := BuildSmokeTrace(config)
			if err != nil {
				t.Fatalf("%s segment %d: %v", chapter.ID, segmentIndex+1, err)
			}
			result, err := Simulate(config, got)
			if err != nil || !result.Won {
				t.Fatalf("%s segment %d replay result=%#v err=%v", chapter.ID, segmentIndex+1, result, err)
			}
		}
	}
}

func TestSmokeAutoplayRejectsInvalidConfig(t *testing.T) {
	_, err := BuildSmokeTrace(Config{})
	if err == nil || errors.Is(err, ErrSmokeAutoplayFailed) {
		t.Fatalf("invalid config error=%v", err)
	}
}
