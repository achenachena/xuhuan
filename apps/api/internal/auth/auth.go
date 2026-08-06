package auth

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
)

const (
	TelegramHeader    = "X-Telegram-Init-Data"
	DevelopmentHeader = "X-Dev-Auth"
)

var (
	ErrMissingCredentials = errors.New("authentication credentials are missing")
	ErrInvalidCredentials = errors.New("authentication credentials are invalid")
)

type Method string

const (
	MethodTelegram    Method = "telegram"
	MethodDevelopment Method = "development"
)

type Principal struct {
	User   User
	Method Method
}

type DevelopmentConfig struct {
	Enabled      bool
	Environment  string
	Token        string
	TelegramID   int64
	Username     string
	FirstName    string
	LastName     string
	LanguageCode string
}

type Authenticator struct {
	telegram    *TelegramVerifier
	development DevelopmentConfig
}

func NewAuthenticator(telegram *TelegramVerifier, development DevelopmentConfig) (*Authenticator, error) {
	if development.Enabled {
		if development.Environment != "development" {
			return nil, errors.New("development authentication is allowed only in the development environment")
		}
		if len(development.Token) < 16 || development.TelegramID <= 0 {
			return nil, errors.New("development authentication requires a strong token and positive Telegram ID")
		}
	}
	return &Authenticator{telegram: telegram, development: development}, nil
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
		return Principal{User: user, Method: MethodTelegram}, nil
	}

	if !a.development.Enabled {
		return Principal{}, ErrMissingCredentials
	}
	provided := r.Header.Get(DevelopmentHeader)
	if len(provided) != len(a.development.Token) || subtle.ConstantTimeCompare([]byte(provided), []byte(a.development.Token)) != 1 {
		return Principal{}, ErrInvalidCredentials
	}
	return Principal{
		Method: MethodDevelopment,
		User: User{
			ID:           a.development.TelegramID,
			Username:     a.development.Username,
			FirstName:    a.development.FirstName,
			LastName:     a.development.LastName,
			LanguageCode: a.development.LanguageCode,
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
