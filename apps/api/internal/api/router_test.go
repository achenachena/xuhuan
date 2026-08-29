package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/go-chi/chi/v5"
)

func testRouter(readiness ReadinessChecker, register func(chi.Router, func(http.Handler) http.Handler)) http.Handler {
	return newRouter(Dependencies{
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		Version:        "test",
		AllowedOrigins: []string{"https://game.example.com"},
		MaxBodyBytes:   1024,
		Readiness:      readiness,
	}, register)
}

func TestHealthAndReadiness(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		path      string
		readiness ReadinessChecker
		status    int
		code      string
	}{
		{name: "health", path: "/healthz", readiness: ReadinessFunc(func(context.Context) error { return nil }), status: http.StatusOK},
		{name: "ready", path: "/readyz", readiness: ReadinessFunc(func(context.Context) error { return nil }), status: http.StatusOK},
		{name: "not ready", path: "/readyz", readiness: ReadinessFunc(func(context.Context) error { return errors.New("not ready") }), status: http.StatusServiceUnavailable, code: "not_ready"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest(http.MethodGet, tt.path, nil)
			response := httptest.NewRecorder()
			testRouter(tt.readiness, nil).ServeHTTP(response, request)
			if response.Code != tt.status {
				t.Fatalf("status = %d, want %d: %s", response.Code, tt.status, response.Body.String())
			}
			if response.Header().Get(requestIDHeader) == "" {
				t.Fatal("missing request ID")
			}
			if tt.code != "" && !strings.Contains(response.Body.String(), `"code":"`+tt.code+`"`) {
				t.Fatalf("body = %s", response.Body.String())
			}
		})
	}
}

func TestAccessLogUsesBoundedRoutePattern(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	router := newRouter(Dependencies{
		Logger:       slog.New(slog.NewJSONHandler(&logs, nil)),
		Version:      "test",
		MaxBodyBytes: 1024,
		Readiness:    ReadinessFunc(func(context.Context) error { return nil }),
	}, func(router chi.Router, _ func(http.Handler) http.Handler) {
		router.Get("/v2/content/{version}", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		})
	})

	request := httptest.NewRequest(http.MethodGet, "/v2/content/user%0Acontrolled", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	var entry map[string]any
	if err := json.Unmarshal(logs.Bytes(), &entry); err != nil {
		t.Fatalf("decode access log: %v", err)
	}
	if entry["route"] != "/v2/content/{version}" {
		t.Fatalf("route = %#v", entry["route"])
	}
	if _, exists := entry["path"]; exists {
		t.Fatalf("access log includes user-controlled path: %#v", entry["path"])
	}
}

func TestCORSAllowlist(t *testing.T) {
	t.Parallel()

	tests := []struct {
		origin      string
		status      int
		allowOrigin string
	}{
		{origin: "https://game.example.com", status: http.StatusNoContent, allowOrigin: "https://game.example.com"},
		{origin: "https://evil.example.com", status: http.StatusForbidden},
	}

	for _, tt := range tests {
		request := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
		request.Header.Set("Origin", tt.origin)
		request.Header.Set("Access-Control-Request-Method", "GET")
		response := httptest.NewRecorder()
		testRouter(ReadinessFunc(func(context.Context) error { return nil }), nil).ServeHTTP(response, request)
		if response.Code != tt.status || response.Header().Get("Access-Control-Allow-Origin") != tt.allowOrigin {
			t.Fatalf("origin %q: status=%d allow=%q body=%s", tt.origin, response.Code, response.Header().Get("Access-Control-Allow-Origin"), response.Body.String())
		}
	}
}

func TestJSONContentTypeAndBodyLimit(t *testing.T) {
	t.Parallel()

	router := testRouter(ReadinessFunc(func(context.Context) error { return nil }), func(router chi.Router, _ func(http.Handler) http.Handler) {
		router.Post("/echo", func(w http.ResponseWriter, r *http.Request) {
			var body map[string]any
			if err := decodeJSON(w, r, &body); err != nil {
				var maxBytesError *http.MaxBytesError
				if errors.As(err, &maxBytesError) {
					writeError(w, r, http.StatusRequestEntityTooLarge, "payload_too_large", "The request body is too large")
					return
				}
				writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
				return
			}
			writeJSON(w, http.StatusOK, body)
		})
	})

	missingType := httptest.NewRequest(http.MethodPost, "/echo", strings.NewReader(`{"ok":true}`))
	missingTypeResponse := httptest.NewRecorder()
	router.ServeHTTP(missingTypeResponse, missingType)
	if missingTypeResponse.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("missing content type status = %d", missingTypeResponse.Code)
	}

	large := httptest.NewRequest(http.MethodPost, "/echo", strings.NewReader(`{"value":"`+strings.Repeat("x", 2048)+`"}`))
	large.Header.Set("Content-Type", "application/json")
	largeResponse := httptest.NewRecorder()
	router.ServeHTTP(largeResponse, large)
	if largeResponse.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("large body status = %d: %s", largeResponse.Code, largeResponse.Body.String())
	}
}

func TestErrorEnvelopeAndRequestID(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodGet, "/missing", nil)
	request.Header.Set(requestIDHeader, "test-request-id")
	response := httptest.NewRecorder()
	testRouter(ReadinessFunc(func(context.Context) error { return nil }), nil).ServeHTTP(response, request)

	if response.Code != http.StatusNotFound || response.Header().Get(requestIDHeader) != "test-request-id" {
		t.Fatalf("unexpected response: %d %#v", response.Code, response.Header())
	}
	var body errorBody
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body.Error.Code != "not_found" || body.Error.RequestID != "test-request-id" {
		t.Fatalf("body = %#v", body)
	}
}

func TestSecurityHeaders(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()
	testRouter(ReadinessFunc(func(context.Context) error { return nil }), nil).ServeHTTP(response, request)

	for name, want := range map[string]string{
		"Content-Security-Policy":   "default-src 'none'; frame-ancestors 'none'; sandbox",
		"Referrer-Policy":           "no-referrer",
		"Strict-Transport-Security": "max-age=31536000",
		"X-Content-Type-Options":    "nosniff",
		"X-Frame-Options":           "DENY",
	} {
		if got := response.Header().Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
}

func TestPanicResponseDoesNotLogRecoveredValue(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	router := newRouter(Dependencies{
		Logger:       slog.New(slog.NewJSONHandler(&logs, nil)),
		Version:      "test",
		MaxBodyBytes: 1024,
		Readiness:    ReadinessFunc(func(context.Context) error { return nil }),
	}, func(router chi.Router, _ func(http.Handler) http.Handler) {
		router.Get("/panic", func(http.ResponseWriter, *http.Request) {
			panic("password=do-not-log")
		})
	})

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/panic", nil))
	if response.Code != http.StatusInternalServerError || !strings.Contains(response.Body.String(), `"code":"internal_error"`) {
		t.Fatalf("panic response = %d %s", response.Code, response.Body.String())
	}
	if strings.Contains(logs.String(), "password=do-not-log") {
		t.Fatalf("panic value leaked into logs: %s", logs.String())
	}
	if !strings.Contains(logs.String(), `"status":500`) {
		t.Fatalf("panic request was not recorded as a 500: %s", logs.String())
	}
}

func TestAuthenticationMiddleware(t *testing.T) {
	t.Parallel()

	buildRouter := func(authenticator *auth.Authenticator) http.Handler {
		return newRouter(Dependencies{
			Logger:        slog.New(slog.NewTextHandler(io.Discard, nil)),
			Version:       "test",
			MaxBodyBytes:  1024,
			Readiness:     ReadinessFunc(func(context.Context) error { return nil }),
			Authenticator: authenticator,
		}, func(router chi.Router, authenticate func(http.Handler) http.Handler) {
			router.With(authenticate).Get("/v2/protected", func(w http.ResponseWriter, r *http.Request) {
				principal, ok := auth.PrincipalFromContext(r.Context())
				if !ok {
					t.Fatal("principal missing from context")
				}
				writeJSON(w, http.StatusOK, map[string]int64{"telegram_id": principal.User.ID})
			})
		})
	}

	unauthorized := httptest.NewRequest(http.MethodGet, "/v2/protected", nil)
	unauthorizedResponse := httptest.NewRecorder()
	buildRouter(auth.NewAuthenticator(nil, false)).ServeHTTP(unauthorizedResponse, unauthorized)
	if unauthorizedResponse.Code != http.StatusUnauthorized || !strings.Contains(unauthorizedResponse.Body.String(), `"code":"unauthorized"`) {
		t.Fatalf("unauthorized response = %d %s", unauthorizedResponse.Code, unauthorizedResponse.Body.String())
	}
	if unauthorizedResponse.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("authenticated route responses must not be cached")
	}

	authorized := httptest.NewRequest(http.MethodGet, "/v2/protected", nil)
	authorizedResponse := httptest.NewRecorder()
	buildRouter(auth.NewAuthenticator(nil, true)).ServeHTTP(authorizedResponse, authorized)
	if authorizedResponse.Code != http.StatusOK || !strings.Contains(authorizedResponse.Body.String(), `"telegram_id":`) {
		t.Fatalf("authorized response = %d %s", authorizedResponse.Code, authorizedResponse.Body.String())
	}
}
