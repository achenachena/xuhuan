package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"
)

const testBotToken = "123456789:test-bot-token"

func signedInitData(t *testing.T, values url.Values) string {
	t.Helper()
	secret := hmac.New(sha256.New, []byte("WebAppData"))
	_, _ = secret.Write([]byte(testBotToken))
	dataCheckString, err := buildDataCheckString(values)
	if err != nil {
		t.Fatal(err)
	}
	signature := hmac.New(sha256.New, secret.Sum(nil))
	_, _ = signature.Write([]byte(dataCheckString))
	values.Set("hash", hex.EncodeToString(signature.Sum(nil)))
	return values.Encode()
}

func verifierAt(t *testing.T, now time.Time) *TelegramVerifier {
	t.Helper()
	verifier, err := newTelegramVerifier(testBotToken, time.Hour, func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	return verifier
}

func validValues(now time.Time) url.Values {
	return url.Values{
		"auth_date": {strconv.FormatInt(now.Unix(), 10)},
		"query_id":  {"AAHdF6IQAAAAAN0XohDhrOrc"},
		"user":      {`{"id":9007199254740993,"first_name":"测试","last_name":"玩家","username":"player","language_code":"zh-hans"}`},
	}
}

func TestTelegramVerifierAcceptsValidDataAndPreservesInt64ID(t *testing.T) {
	t.Parallel()
	now := time.Unix(1_800_000_000, 0)
	user, err := verifierAt(t, now).Verify(signedInitData(t, validValues(now)))
	if err != nil {
		t.Fatalf("Verify() error = %v", err)
	}
	if user.ID != 9_007_199_254_740_993 || user.LanguageCode != "zh-hans" {
		t.Fatalf("user = %#v", user)
	}
}

func TestTelegramVerifierRejectsInvalidExpiredAndFutureData(t *testing.T) {
	t.Parallel()
	now := time.Unix(1_800_000_000, 0)
	verifier := verifierAt(t, now)

	tests := []struct {
		name    string
		payload func() string
		want    error
	}{
		{name: "invalid signature", payload: func() string { return signedInitData(t, validValues(now)) + "x" }, want: ErrInvalidSignature},
		{name: "expired", payload: func() string { return signedInitData(t, validValues(now.Add(-time.Hour-time.Second))) }, want: ErrExpiredInitData},
		{name: "future", payload: func() string { return signedInitData(t, validValues(now.Add(maxFutureSkew+time.Second))) }, want: ErrFutureInitData},
		{name: "missing hash", payload: func() string { return validValues(now).Encode() }, want: ErrMalformedInitData},
		{name: "malformed user", payload: func() string { values := validValues(now); values.Set("user", `{}`); return signedInitData(t, values) }, want: ErrMalformedUser},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			_, err := verifier.Verify(tt.payload())
			if !errors.Is(err, tt.want) {
				t.Fatalf("Verify() error = %v, want %v", err, tt.want)
			}
		})
	}
}

func TestLocalDevelopmentIdentityIsAutomaticAndEnvironmentBound(t *testing.T) {
	t.Parallel()

	production := NewAuthenticator(nil, false)
	if _, err := production.Authenticate(httptest.NewRequest("GET", "/", nil)); !errors.Is(err, ErrMissingCredentials) {
		t.Fatalf("production Authenticate() error = %v", err)
	}

	development := NewAuthenticator(nil, true)
	principal, err := development.Authenticate(httptest.NewRequest("GET", "/", nil))
	if err != nil || principal.User.ID != localDevelopmentTelegramID || principal.User.LanguageCode != "en" {
		t.Fatalf("principal = %#v, error = %v", principal, err)
	}

	invalidTelegram := httptest.NewRequest("GET", "/", nil)
	invalidTelegram.Header.Set(TelegramHeader, "invalid")
	if _, err := development.Authenticate(invalidTelegram); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("invalid Telegram Authenticate() error = %v", err)
	}
}

func TestTelegramIdentityTakesPrecedenceInDevelopment(t *testing.T) {
	t.Parallel()
	now := time.Unix(1_800_000_000, 0)
	authenticator := NewAuthenticator(verifierAt(t, now), true)
	request := httptest.NewRequest("GET", "/", nil)
	request.Header.Set(TelegramHeader, signedInitData(t, validValues(now)))

	principal, err := authenticator.Authenticate(request)
	if err != nil || principal.User.ID != 9_007_199_254_740_993 {
		t.Fatalf("principal = %#v, error = %v", principal, err)
	}
}
