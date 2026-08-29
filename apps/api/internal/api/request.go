package api

import (
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
)

var (
	resourceIDPattern     = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)
	slugPattern           = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	idempotencyKeyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{8,128}$`)
)

func authenticatedPrincipal(w http.ResponseWriter, r *http.Request) (auth.Principal, bool) {
	principal, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "unauthorized", "Authentication is required")
	}
	return principal, ok
}

func validatedIdempotencyKey(w http.ResponseWriter, r *http.Request) (string, bool) {
	value := r.Header.Get("Idempotency-Key")
	if !idempotencyKeyPattern.MatchString(value) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid Idempotency-Key is required")
		return "", false
	}
	return value, true
}

func decodeRequest(w http.ResponseWriter, r *http.Request, destination any) bool {
	if err := decodeJSON(w, r, destination); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeError(w, r, http.StatusRequestEntityTooLarge, "payload_too_large", "The request body is too large")
			return false
		}
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid")
		return false
	}
	return true
}

func validSlugValue(value string) bool {
	return len(value) <= 64 && slugPattern.MatchString(value)
}

func responseLanguage(r *http.Request) string {
	for _, preference := range strings.Split(strings.ToLower(r.Header.Get("Accept-Language")), ",") {
		tag := strings.TrimSpace(strings.SplitN(preference, ";", 2)[0])
		if tag == "zh" || strings.HasPrefix(tag, "zh-") {
			return "zh-CN"
		}
		if tag == "en" || strings.HasPrefix(tag, "en-") {
			return "en"
		}
	}
	return "en"
}
