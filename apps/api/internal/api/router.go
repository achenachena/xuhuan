package api

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/observability"
	"github.com/go-chi/chi/v5"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

type ReadinessChecker interface {
	Check(context.Context) error
}

type ReadinessFunc func(context.Context) error

func (f ReadinessFunc) Check(ctx context.Context) error {
	return f(ctx)
}

type Dependencies struct {
	Logger         *slog.Logger
	Version        string
	AllowedOrigins []string
	MaxBodyBytes   int64
	Readiness      ReadinessChecker
	Authenticator  *auth.Authenticator
	Services       *Services
	RateLimit      RateLimitConfig
	Metrics        *observability.Metrics
	TracingEnabled bool
}

func NewRouter(dependencies Dependencies) http.Handler {
	return newRouter(dependencies, nil)
}

func newRouter(dependencies Dependencies, register func(chi.Router, func(http.Handler) http.Handler)) http.Handler {
	if dependencies.Logger == nil {
		panic("api: Logger is required")
	}
	if dependencies.Readiness == nil {
		panic("api: Readiness is required")
	}

	router := chi.NewRouter()
	router.Use(requestIDMiddleware)
	router.Use(accessLogMiddleware(dependencies.Logger, dependencies.Metrics))
	router.Use(recoverMiddleware(dependencies.Logger))
	router.Use(securityHeadersMiddleware)
	router.Use(corsMiddleware(dependencies.AllowedOrigins))
	router.Use(maxBodyMiddleware(dependencies.MaxBodyBytes))
	router.Use(requireJSONMiddleware)
	router.Use(ipRateLimitMiddleware(dependencies.RateLimit))

	router.NotFound(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found")
	})
	router.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "The request method is not allowed")
	})

	router.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"version": dependencies.Version,
		})
	})
	router.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := dependencies.Readiness.Check(r.Context()); err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "not_ready", "A required dependency is not ready")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "ready",
			"checks": map[string]string{"postgres": "ready"},
		})
	})
	if dependencies.Services != nil {
		registerV1Routes(router, requireAuthentication(dependencies.Authenticator, dependencies.Logger, dependencies.Metrics), dependencies.RateLimit, *dependencies.Services, dependencies.Logger, dependencies.Metrics)
	}

	if register != nil {
		register(router, requireAuthentication(dependencies.Authenticator, dependencies.Logger, dependencies.Metrics))
	}

	if dependencies.TracingEnabled {
		return otelhttp.NewHandler(router, "http.server")
	}
	return router
}
