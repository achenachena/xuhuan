package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
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
	if err := run(os.Args[1:]); err != nil {
		slog.Error("migration_failed", "error", err)
		os.Exit(1)
	}
	slog.Info("migrations_complete")
}

func run(args []string) error {
	flags := flag.NewFlagSet("migrate", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	target := flags.Int64("target", 0, "last migration version to apply (zero applies all)")
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("parse migration flags: %w", err)
	}
	if *target < 0 || flags.NArg() != 0 {
		return errors.New("-target must be a non-negative migration version and no positional arguments are allowed")
	}
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
	return database.MigrateTo(ctx, migrations.Files, *target)
}
