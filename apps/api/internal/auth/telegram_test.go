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
	if user.ID != 9_007_199_254_740_993 || user.FirstName != "测试" {
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

func TestDevelopmentAuthenticationIsOptInAndCannotBeProduction(t *testing.T) {
	t.Parallel()

	_, err := NewAuthenticator(nil, DevelopmentConfig{Enabled: true, Environment: "production", Token: "0123456789abcdef", TelegramID: 1})
	if err == nil {
		t.Fatal("NewAuthenticator() allowed development auth in production")
	}

	disabled, err := NewAuthenticator(nil, DevelopmentConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := disabled.Authenticate(httptest.NewRequest("GET", "/", nil)); !errors.Is(err, ErrMissingCredentials) {
		t.Fatalf("disabled Authenticate() error = %v", err)
	}

	enabled, err := NewAuthenticator(nil, DevelopmentConfig{
		Enabled: true, Environment: "development", Token: "0123456789abcdef", TelegramID: 123, Username: "dev",
	})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("GET", "/", nil)
	request.Header.Set(DevelopmentHeader, "0123456789abcdef")
	principal, err := enabled.Authenticate(request)
	if err != nil || principal.Method != MethodDevelopment || principal.User.ID != 123 {
		t.Fatalf("principal = %#v, error = %v", principal, err)
	}
}
