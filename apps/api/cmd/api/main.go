package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/api"
	"github.com/achenachena/xuhuan/apps/api/internal/application"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/config"
)

func main() {
	if err := run(); err != nil {
		slog.Error("api_stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	runtime, err := application.New(context.Background(), cfg, os.Stdout)
	if err != nil {
		return err
	}
	defer func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := runtime.Close(shutdownContext); err != nil {
			runtime.Logger.Warn("runtime_shutdown_failed")
		}
	}()

	server := api.NewHTTPServer(api.ServerConfig{
		Addr:         cfg.HTTPAddr,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}, runtime.Handler)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	serverErrors := make(chan error, 1)
	go func() {
		runtime.Logger.Info("api_listening", "addr", cfg.HTTPAddr, "environment", cfg.Environment, "version", cfg.Version)
		serverErrors <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		runtime.Logger.Info("shutdown_started")
	}

	shutdownContext, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownContext); err != nil {
		_ = server.Close()
		return err
	}
	runtime.Logger.Info("shutdown_complete")
	return nil
}
