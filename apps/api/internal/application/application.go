package application

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
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
	"github.com/achenachena/xuhuan/apps/api/migrations"
	seeddata "github.com/achenachena/xuhuan/apps/api/seed"
)

// Runtime owns the long-lived dependencies shared by the local HTTP server and
// warm Lambda invocations.
type Runtime struct {
	Handler   http.Handler
	Database  *postgres.Database
	Logger    *slog.Logger
	telemetry *observability.Telemetry
	redis     *ratelimit.RedisLimiter
}

func New(ctx context.Context, cfg config.Config, output io.Writer) (*Runtime, error) {
	level := slog.LevelInfo
	if cfg.Environment == config.Development {
		level = slog.LevelDebug
	}
	logger := logging.New(output, level)
	slog.SetDefault(logger)

	telemetry, telemetryErr := observability.Initialize(ctx, observability.Config{
		Endpoint:       cfg.OTLPEndpoint,
		ServiceName:    cfg.OTELServiceName,
		ServiceVersion: cfg.Version,
		Environment:    string(cfg.Environment),
		ExportInterval: cfg.OTELExportInterval,
	})
	if telemetryErr != nil {
		// Exporter errors can include endpoint details. Telemetry is optional and
		// must never become an availability dependency.
		logger.Warn("telemetry_initialization_failed")
		telemetry = observability.Noop()
	}

	if cfg.DatabaseURL == "" {
		_ = shutdownTelemetry(telemetry)
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	database, err := postgres.OpenWithTracer(ctx, cfg.DatabaseURL, observability.DatabaseTracer{Metrics: telemetry.Metrics})
	if err != nil {
		_ = shutdownTelemetry(telemetry)
		return nil, fmt.Errorf("connect to PostgreSQL: %w", err)
	}

	runtime := &Runtime{Database: database, Logger: logger, telemetry: telemetry}
	cleanup := func(cause error) (*Runtime, error) {
		closeContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return nil, errors.Join(cause, runtime.Close(closeContext))
	}

	var telegramVerifier *auth.TelegramVerifier
	if cfg.TelegramBotToken != "" {
		telegramVerifier, err = auth.NewTelegramVerifier(cfg.TelegramBotToken, cfg.TelegramAuthMaxAge)
		if err != nil {
			return cleanup(fmt.Errorf("configure Telegram authentication: %w", err))
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
		return cleanup(fmt.Errorf("configure authentication: %w", err))
	}

	playerService := player.NewService(postgres.NewPlayerRepository(database))
	catalogService := character.NewService(postgres.NewCatalogRepository(database))
	battleService := battle.NewService(postgres.NewBattleRepository(database, telemetry.Metrics), playerService, catalogService)

	if cfg.RedisURL != "" {
		runtime.redis, err = ratelimit.NewRedis(cfg.RedisURL, cfg.RedisTimeout)
		if err != nil {
			return cleanup(fmt.Errorf("configure Redis rate limiter"))
		}
	}
	resilientLimiter := ratelimit.NewResilient(runtime.redis, ratelimit.NewMemory(20_000), logger)

	runtime.Handler = apihttp.NewRouter(apihttp.Dependencies{
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
	return runtime, nil
}

func (runtime *Runtime) MigrateAndSeed(ctx context.Context) error {
	if err := runtime.Database.Migrate(ctx, migrations.Files); err != nil {
		return fmt.Errorf("migrate database: %w", err)
	}
	if err := runtime.Database.SeedCatalog(ctx, seeddata.Files); err != nil {
		return fmt.Errorf("seed catalog: %w", err)
	}
	return nil
}

func (runtime *Runtime) Check(ctx context.Context) error {
	return runtime.Database.Check(ctx)
}

func (runtime *Runtime) Close(ctx context.Context) error {
	if runtime == nil {
		return nil
	}
	var redisErr error
	if runtime.redis != nil {
		redisErr = runtime.redis.Close()
	}
	if runtime.Database != nil {
		runtime.Database.Close()
	}
	return errors.Join(redisErr, runtime.telemetry.Shutdown(ctx))
}

func shutdownTelemetry(telemetry *observability.Telemetry) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return telemetry.Shutdown(ctx)
}
