package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/achenachena/xuhuan/apps/api/internal/postgres"
	seeddata "github.com/achenachena/xuhuan/apps/api/seed"
)

func main() {
	if err := run(); err != nil {
		slog.Error("seed_failed", "error", err)
		os.Exit(1)
	}
	slog.Info("seed_complete")
}

func run() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	database, err := postgres.Open(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer database.Close()
	return database.SeedCatalog(ctx, seeddata.Files)
}
