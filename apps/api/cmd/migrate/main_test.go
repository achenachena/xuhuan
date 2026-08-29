package main

import (
	"testing"
	"time"
)

func TestMigrationCommandTimeoutLeavesWorkflowCleanupMargin(t *testing.T) {
	t.Parallel()

	if migrationCommandTimeout != 6*time.Minute {
		t.Fatalf("migration command timeout = %s, want 6m", migrationCommandTimeout)
	}
}
