package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
)

func main() {
	if len(os.Args) < 2 || len(os.Args) > 3 || len(os.Args) == 3 && os.Args[1] != "--check" {
		fmt.Fprintln(os.Stderr, "usage: export-portfolio-demo [--check] OUTPUT_DIRECTORY")
		os.Exit(2)
	}
	check := len(os.Args) == 3
	outputDirectory := os.Args[len(os.Args)-1]
	if err := os.MkdirAll(outputDirectory, 0o755); err != nil {
		panic(err)
	}
	catalog := gamecontent.MustLoadV4()
	for _, locale := range []string{"en", "zh-CN"} {
		demo, err := gameRun.BuildPortfolioDemo(catalog, locale)
		if err != nil {
			panic(err)
		}
		data, err := json.MarshalIndent(demo, "", "  ")
		if err != nil {
			panic(err)
		}
		data = append(data, '\n')
		filename := filepath.Join(outputDirectory, "demo-v1."+locale+".json")
		if check {
			current, readErr := os.ReadFile(filename)
			if readErr != nil || string(current) != string(data) {
				fmt.Fprintf(os.Stderr, "%s is stale; regenerate the portfolio demo\n", filename)
				os.Exit(1)
			}
			continue
		}
		if err := os.WriteFile(filename, data, 0o644); err != nil {
			panic(err)
		}
	}
}
