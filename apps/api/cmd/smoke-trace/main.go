//go:build smoke

// Command smoke-trace creates an authority-derived input trace for release
// validation. The smoke build tag excludes it from normal API/Lambda builds.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/achenachena/xuhuan/apps/api/internal/shooter"
)

const maxConfigBytes = 1 << 20

func main() {
	if err := generate(os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func generate(input io.Reader, output io.Writer) error {
	payload, err := io.ReadAll(io.LimitReader(input, maxConfigBytes+1))
	if err != nil {
		return fmt.Errorf("read runtime config: %w", err)
	}
	if len(payload) == 0 || len(payload) > maxConfigBytes {
		return errors.New("runtime config size is invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	var config shooter.Config
	if err := decoder.Decode(&config); err != nil {
		return fmt.Errorf("decode runtime config: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return errors.New("runtime config must contain exactly one JSON value")
	}
	trace, err := shooter.BuildSmokeTrace(config)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(trace); err != nil {
		return fmt.Errorf("encode trace: %w", err)
	}
	return nil
}
