package main

import (
	"strings"
	"testing"
)

func TestRunRejectsInvalidTargetBeforeOpeningDatabase(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	for _, args := range [][]string{{"-target", "-1"}, {"-target", "7", "extra"}, {"-target", "not-a-number"}} {
		if err := run(args); err == nil || !strings.Contains(err.Error(), "target") && !strings.Contains(err.Error(), "flags") {
			t.Fatalf("run(%q) error=%v", args, err)
		}
	}
}

func TestRunAcceptsTargetFlagSyntax(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	err := run([]string{"-target", "7"})
	if err == nil || err.Error() != "DATABASE_URL is required" {
		t.Fatalf("run target syntax error=%v", err)
	}
}
