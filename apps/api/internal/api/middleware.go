package api

import (
	"context"
	"log/slog"
	"net/http"
	"runtime/debug"
	"slices"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/platform/observability"
	"github.com/go-chi/chi/v5"
)

type maxBodyContextKey struct{}

type responseRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *responseRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *responseRecorder) Write(body []byte) (int, error) {
	if r.status == 0 {
		r.WriteHeader(http.StatusOK)
	}
	written, err := r.ResponseWriter.Write(body)
	r.bytes += written
	return written, err
}

func maxBodyMiddleware(limit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), maxBodyContextKey{}, limit)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func maxBodyBytesFromContext(ctx context.Context) int64 {
	limit, ok := ctx.Value(maxBodyContextKey{}).(int64)
	if !ok {
		return 64 << 10
	}
	return limit
}

func requireJSONMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch:
			if !isJSONContentType(r.Header.Get("Content-Type")) {
				writeError(w, r, http.StatusUnsupportedMediaType, "unsupported_media_type", "Content-Type must be application/json")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func corsMiddleware(allowedOrigins []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" {
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Add("Vary", "Origin")
			if !slices.Contains(allowedOrigins, origin) {
				writeError(w, r, http.StatusForbidden, "origin_not_allowed", "The request origin is not allowed")
				return
			}

			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Idempotency-Key,X-Request-ID,X-Telegram-Init-Data,X-Dev-Auth")
			w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID,Idempotency-Replayed")
			w.Header().Set("Access-Control-Max-Age", "600")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func accessLogMiddleware(logger *slog.Logger, metrics *observability.Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			started := time.Now()
			recorder := &responseRecorder{ResponseWriter: w}
			next.ServeHTTP(recorder, r)
			duration := time.Since(started)
			status := recorder.status
			if status == 0 {
				status = http.StatusOK
			}
			logger.InfoContext(r.Context(), "http_request",
				"request_id", requestIDFromContext(r.Context()),
				"method", r.Method,
				"route", chi.RouteContext(r.Context()).RoutePattern(),
				"status", status,
				"response_bytes", recorder.bytes,
				"duration_ms", duration.Milliseconds(),
			)
			metrics.HTTPRequest(r.Context(), r.Method, chi.RouteContext(r.Context()).RoutePattern(), status, duration)
		})
	}
}

func recoverMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					logger.ErrorContext(r.Context(), "panic_recovered",
						"request_id", requestIDFromContext(r.Context()),
						"panic", recovered,
						"stack", string(debug.Stack()),
					)
					writeError(w, r, http.StatusInternalServerError, "internal_error", "An internal error occurred")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
