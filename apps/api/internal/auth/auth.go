package auth

import (
	"context"
	"errors"
	"net/http"
)

const TelegramHeader = "X-Telegram-Init-Data"

const localDevelopmentTelegramID int64 = 42_424_242

var (
	ErrMissingCredentials = errors.New("authentication credentials are missing")
	ErrInvalidCredentials = errors.New("authentication credentials are invalid")
)

type Principal struct {
	User User
}

type Authenticator struct {
	telegram              *TelegramVerifier
	allowLocalDevelopment bool
}

func NewAuthenticator(telegram *TelegramVerifier, allowLocalDevelopment bool) *Authenticator {
	return &Authenticator{
		telegram:              telegram,
		allowLocalDevelopment: allowLocalDevelopment,
	}
}

func (a *Authenticator) Authenticate(r *http.Request) (Principal, error) {
	if raw := r.Header.Get(TelegramHeader); raw != "" {
		if a.telegram == nil {
			return Principal{}, ErrInvalidCredentials
		}
		user, err := a.telegram.Verify(raw)
		if err != nil {
			return Principal{}, err
		}
		return Principal{User: user}, nil
	}

	if !a.allowLocalDevelopment {
		return Principal{}, ErrMissingCredentials
	}
	return Principal{
		User: User{
			ID:           localDevelopmentTelegramID,
			LanguageCode: "en",
		},
	}, nil
}

type principalContextKey struct{}

func WithPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, principalContextKey{}, principal)
}

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalContextKey{}).(Principal)
	return principal, ok
}
