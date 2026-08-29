package api

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/ratelimit"
)

type countingLimiter struct {
	mu     sync.Mutex
	counts map[string]int64
}

func (limiter *countingLimiter) Allow(_ context.Context, key string, policy ratelimit.Policy) (ratelimit.Decision, error) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	limiter.counts[key]++
	count := limiter.counts[key]
	return ratelimit.Decision{
		Allowed: count <= policy.Limit, Remaining: max(policy.Limit-count, 0), RetryAfter: time.Minute,
	}, nil
}

func TestIPRateLimitReturnsStableErrorAndHeaders(t *testing.T) {
	t.Parallel()
	limiter := &countingLimiter{counts: make(map[string]int64)}
	router := NewRouter(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test", MaxBodyBytes: 1024,
		Readiness: ReadinessFunc(func(context.Context) error { return nil }),
		RateLimit: RateLimitConfig{
			Limiter: limiter, IPPolicy: ratelimit.Policy{Limit: 1, Window: time.Minute},
		},
	})

	for requestNumber := range 2 {
		request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
		request.RemoteAddr = "192.0.2.5:1234"
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if requestNumber == 0 && response.Code != http.StatusOK {
			t.Fatalf("first status=%d", response.Code)
		}
		if requestNumber == 1 {
			if response.Code != http.StatusTooManyRequests || response.Header().Get("Retry-After") == "" {
				t.Fatalf("second status=%d headers=%v body=%s", response.Code, response.Header(), response.Body.String())
			}
			if body := response.Body.String(); body == "" || !containsAll(body, "rate_limited", "request_id") {
				t.Fatalf("body=%s", body)
			}
		}
	}
}

func TestClientIPIgnoresSpoofableForwardedHeader(t *testing.T) {
	t.Parallel()
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "10.0.0.4:4321"
	request.Header.Set("X-Forwarded-For", "198.51.100.2, 203.0.113.8")
	if got := clientIP(request); got != "10.0.0.4" {
		t.Fatalf("client IP=%q", got)
	}
}

func TestPlayerRateLimitRunsAfterAuthentication(t *testing.T) {
	t.Parallel()
	limiter := &countingLimiter{counts: make(map[string]int64)}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	authenticator := auth.NewAuthenticator(nil, true)
	handler := requireAuthentication(authenticator, logger, nil)(
		playerRateLimitMiddleware(RateLimitConfig{
			Limiter: limiter, PlayerPolicy: ratelimit.Policy{Limit: 1, Window: time.Minute},
		})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		})),
	)

	for requestNumber := range 2 {
		request := httptest.NewRequest(http.MethodGet, "/v2/game", nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		want := http.StatusNoContent
		if requestNumber == 1 {
			want = http.StatusTooManyRequests
		}
		if response.Code != want {
			t.Fatalf("request %d status=%d want=%d body=%s", requestNumber, response.Code, want, response.Body.String())
		}
	}
}

func containsAll(value string, parts ...string) bool {
	for _, part := range parts {
		if !strings.Contains(value, part) {
			return false
		}
	}
	return true
}
