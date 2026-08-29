package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"strings"
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
	target := int64(0)
	if raw := strings.TrimSpace(os.Getenv("MIGRATION_TARGET_VERSION")); raw != "" {
		target, err = strconv.ParseInt(raw, 10, 64)
		if err != nil || target <= 0 {
			return errors.New("MIGRATION_TARGET_VERSION must be a positive integer")
		}
	}
	return database.MigrateTo(ctx, migrations.Files, target)
}
