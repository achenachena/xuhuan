package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/postgres"
	"github.com/achenachena/xuhuan/apps/api/migrations"
)

const migrationCommandTimeout = 6 * time.Minute

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
	signalContext, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(signalContext, migrationCommandTimeout)
	defer cancel()
	database, err := postgres.Open(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer database.Close()
	return database.Migrate(ctx, migrations.Files)
}
