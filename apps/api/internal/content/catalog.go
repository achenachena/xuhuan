package content

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

// Files embeds the sole production content version. Historical gameplay
// migrations remain in the repository, but retired content is not shipped in
// the Lambda binary.
//
//go:embed v4/*.json v4/chapters/*.json v4/locales/*.json
var Files embed.FS

func decodeFile(filename string, destination any) error {
	data, err := Files.ReadFile(filename)
	if err != nil {
		return fmt.Errorf("content: read %s: %w", filename, err)
	}
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return fmt.Errorf("content: decode %s: %w", filename, err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return fmt.Errorf("content: decode %s: trailing JSON data", filename)
	}
	return nil
}

func stringSet(values ...string) map[string]bool {
	set := make(map[string]bool, len(values))
	for _, value := range values {
		set[value] = true
	}
	return set
}
