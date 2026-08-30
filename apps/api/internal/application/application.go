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
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/game"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/config"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/logging"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/ratelimit"
	"github.com/achenachena/xuhuan/apps/api/internal/postgres"
)

// Runtime owns the long-lived dependencies shared by the local HTTP server and
// warm Lambda invocations.
type Runtime struct {
	Handler  http.Handler
	Logger   *slog.Logger
	database *postgres.Database
	redis    *ratelimit.RedisLimiter
}

func New(ctx context.Context, cfg config.Config, output io.Writer) (*Runtime, error) {
	level := slog.LevelInfo
	if cfg.Environment == config.Development {
		level = slog.LevelDebug
	}
	logger := logging.New(output, level)
	slog.SetDefault(logger)

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	database, err := postgres.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect to PostgreSQL: %w", err)
	}

	runtime := &Runtime{
		Logger:   logger,
		database: database,
	}
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
	// Local development uses one fixed synthetic identity without credentials.
	// Every other environment requires Telegram Mini App initData.
	authenticator := auth.NewAuthenticator(telegramVerifier, cfg.Environment == config.Development)

	players := postgres.NewPlayerRepository(database)
	contentCatalog, err := gamecontent.Load(gamecontent.CurrentVersion)
	if err != nil {
		return cleanup(fmt.Errorf("load game content: %w", err))
	}
	gameService := game.NewService(
		players,
		postgres.NewProgressionRepository(database, contentCatalog),
		postgres.NewRunRepository(database),
		contentCatalog,
	)

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
		},
		Game: gameService,
	})
	return runtime, nil
}

func (runtime *Runtime) Check(ctx context.Context) error {
	return runtime.database.Check(ctx)
}

func (runtime *Runtime) Close(_ context.Context) error {
	if runtime == nil {
		return nil
	}
	var redisErr error
	if runtime.redis != nil {
		redisErr = runtime.redis.Close()
	}
	if runtime.database != nil {
		runtime.database.Close()
	}
	return redisErr
}
