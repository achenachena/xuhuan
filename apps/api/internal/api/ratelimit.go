package api

import (
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/ratelimit"
)

type RateLimitConfig struct {
	Limiter      ratelimit.Limiter
	IPPolicy     ratelimit.Policy
	PlayerPolicy ratelimit.Policy
	TrustProxy   bool
}

func ipRateLimitMiddleware(config RateLimitConfig) func(http.Handler) http.Handler {
	return rateLimitMiddleware(config.Limiter, config.IPPolicy, func(r *http.Request) string {
		return ratelimit.Key("ip", clientIP(r, config.TrustProxy))
	})
}

func playerRateLimitMiddleware(config RateLimitConfig) func(http.Handler) http.Handler {
	return rateLimitMiddleware(config.Limiter, config.PlayerPolicy, func(r *http.Request) string {
		principal, ok := auth.PrincipalFromContext(r.Context())
		if !ok {
			return ratelimit.Key("player", "missing")
		}
		return ratelimit.Key("player", strconv.FormatInt(principal.User.ID, 10))
	})
}

func rateLimitMiddleware(limiter ratelimit.Limiter, policy ratelimit.Policy, key func(*http.Request) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if limiter == nil || policy.Limit <= 0 || policy.Window <= 0 {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			decision, err := limiter.Allow(r.Context(), key(r), policy)
			if err != nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "An internal error occurred")
				return
			}
			w.Header().Set("X-RateLimit-Limit", strconv.FormatInt(policy.Limit, 10))
			w.Header().Set("X-RateLimit-Remaining", strconv.FormatInt(decision.Remaining, 10))
			if !decision.Allowed {
				retrySeconds := max(int64((decision.RetryAfter+time.Second-1)/time.Second), 1)
				w.Header().Set("Retry-After", strconv.FormatInt(retrySeconds, 10))
				writeError(w, r, http.StatusTooManyRequests, "rate_limited", "Too many requests")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		forwarded := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		for index := len(forwarded) - 1; index >= 0; index-- {
			candidate := strings.TrimSpace(forwarded[index])
			if address, err := netip.ParseAddr(candidate); err == nil {
				return address.String()
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	if address, err := netip.ParseAddr(r.RemoteAddr); err == nil {
		return address.String()
	}
	return "unknown"
}
