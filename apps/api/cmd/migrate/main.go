package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/achenachena/xuhuan/apps/api/internal/postgres"
	"github.com/achenachena/xuhuan/apps/api/migrations"
)

func main() {
	if err := run(); err != nil {
		slog.Error("migration_failed", "error", err)
		os.Exit(1)
	}
	slog.Info("migrations_complete")
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
	return database.Migrate(ctx, migrations.Files)
}
