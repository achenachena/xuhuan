package api

import (
	"log/slog"
	"net/http"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/observability"
)

func requireAuthentication(authenticator *auth.Authenticator, logger *slog.Logger, metrics *observability.Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if authenticator == nil {
				metrics.AuthenticationFailure(r.Context(), "unconfigured")
				logger.ErrorContext(r.Context(), "authentication_unconfigured", "request_id", requestIDFromContext(r.Context()))
				writeError(w, r, http.StatusInternalServerError, "internal_error", "An internal error occurred")
				return
			}
			principal, err := authenticator.Authenticate(r)
			if err != nil {
				reason := authenticationFailureReason(err)
				metrics.AuthenticationFailure(r.Context(), reason)
				logger.WarnContext(r.Context(), "authentication_failed",
					"request_id", requestIDFromContext(r.Context()),
					"reason", reason,
				)
				writeError(w, r, http.StatusUnauthorized, "unauthorized", "Authentication is required")
				return
			}
			ctx := auth.WithPrincipal(r.Context(), principal)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func authenticationFailureReason(err error) string {
	switch err {
	case auth.ErrMissingCredentials:
		return "missing"
	case auth.ErrExpiredInitData:
		return "expired"
	case auth.ErrFutureInitData:
		return "future"
	case auth.ErrInvalidSignature:
		return "signature"
	case auth.ErrMalformedInitData, auth.ErrMalformedUser:
		return "malformed"
	default:
		return "invalid"
	}
}
