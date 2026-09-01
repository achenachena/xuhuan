//go:build smoke

package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestGenerateRejectsUnknownAndTrailingInput(t *testing.T) {
	for _, input := range []string{
		`{"unknown":true}`,
		`{} {}`,
		strings.Repeat(" ", maxConfigBytes+1),
	} {
		if err := generate(strings.NewReader(input), &bytes.Buffer{}); err == nil {
			t.Fatalf("generate(%d bytes) unexpectedly succeeded", len(input))
		}
	}
}
