package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	apihttp "github.com/achenachena/xuhuan/apps/api/internal/api"
	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/battle"
	"github.com/achenachena/xuhuan/apps/api/internal/character"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/config"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/logging"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/observability"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/ratelimit"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
	"github.com/achenachena/xuhuan/apps/api/internal/postgres"
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

	level := slog.LevelInfo
	if cfg.Environment == config.Development {
		level = slog.LevelDebug
	}
	logger := logging.New(os.Stdout, level)
	slog.SetDefault(logger)
	telemetry, telemetryErr := observability.Initialize(context.Background(), observability.Config{
		Endpoint:       cfg.OTLPEndpoint,
		ServiceName:    cfg.OTELServiceName,
		ServiceVersion: cfg.Version,
		Environment:    string(cfg.Environment),
		ExportInterval: cfg.OTELExportInterval,
	})
	if telemetryErr != nil {
		// Exporter errors can include endpoint details, so do not copy the error
		// into logs. Telemetry must never be an availability dependency.
		logger.Warn("telemetry_initialization_failed")
		telemetry = observability.Noop()
	}
	defer func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := telemetry.Shutdown(shutdownContext); err != nil {
			logger.Warn("telemetry_shutdown_failed")
		}
	}()

	if cfg.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	database, err := postgres.OpenWithTracer(context.Background(), cfg.DatabaseURL, observability.DatabaseTracer{Metrics: telemetry.Metrics})
	if err != nil {
		return fmt.Errorf("connect to PostgreSQL: %w", err)
	}
	defer database.Close()

	var telegramVerifier *auth.TelegramVerifier
	if cfg.TelegramBotToken != "" {
		telegramVerifier, err = auth.NewTelegramVerifier(cfg.TelegramBotToken, cfg.TelegramAuthMaxAge)
		if err != nil {
			return fmt.Errorf("configure Telegram authentication: %w", err)
		}
	}
	authenticator, err := auth.NewAuthenticator(telegramVerifier, auth.DevelopmentConfig{
		Enabled:      cfg.DevAuthEnabled,
		Environment:  string(cfg.Environment),
		Token:        cfg.DevAuthToken,
		TelegramID:   cfg.DevTelegramUserID,
		Username:     cfg.DevUsername,
		FirstName:    cfg.DevFirstName,
		LastName:     cfg.DevLastName,
		LanguageCode: cfg.DevLanguageCode,
	})
	if err != nil {
		return fmt.Errorf("configure authentication: %w", err)
	}
	playerService := player.NewService(postgres.NewPlayerRepository(database))
	catalogService := character.NewService(postgres.NewCatalogRepository(database))
	battleService := battle.NewService(postgres.NewBattleRepository(database, telemetry.Metrics), playerService, catalogService)

	var redisLimiter *ratelimit.RedisLimiter
	if cfg.RedisURL != "" {
		redisLimiter, err = ratelimit.NewRedis(cfg.RedisURL, cfg.RedisTimeout)
		if err != nil {
			return fmt.Errorf("configure Redis rate limiter")
		}
		defer func() {
			if closeErr := redisLimiter.Close(); closeErr != nil {
				logger.Warn("redis_close_failed")
			}
		}()
	}
	resilientLimiter := ratelimit.NewResilient(redisLimiter, ratelimit.NewMemory(20_000), logger)

	handler := apihttp.NewRouter(apihttp.Dependencies{
		Logger:         logger,
		Version:        cfg.Version,
		AllowedOrigins: cfg.CORSAllowedOrigins,
		MaxBodyBytes:   cfg.MaxBodyBytes,
		Readiness:      database,
		Authenticator:  authenticator,
		RateLimit: apihttp.RateLimitConfig{
			Limiter: resilientLimiter,
			IPPolicy: ratelimit.Policy{
				Limit: cfg.IPRateLimit, Window: cfg.RateLimitWindow,
			},
			PlayerPolicy: ratelimit.Policy{
				Limit: cfg.PlayerRateLimit, Window: cfg.RateLimitWindow,
			},
			TrustProxy: cfg.TrustProxy,
		},
		Metrics:        telemetry.Metrics,
		TracingEnabled: telemetry.Enabled(),
		Services: &apihttp.Services{
			Players: playerService,
			Catalog: catalogService,
			Battles: battleService,
		},
	})
	server := apihttp.NewHTTPServer(apihttp.ServerConfig{
		Addr:         cfg.HTTPAddr,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}, handler)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("api_listening", "addr", cfg.HTTPAddr, "environment", cfg.Environment, "version", cfg.Version)
		serverErrors <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		logger.Info("shutdown_started")
	}

	shutdownContext, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownContext); err != nil {
		_ = server.Close()
		return err
	}
	logger.Info("shutdown_complete")
	return nil
}
