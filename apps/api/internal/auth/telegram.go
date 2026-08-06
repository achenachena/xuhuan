package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

var (
	ErrMalformedInitData = errors.New("Telegram init data is malformed")
	ErrInvalidSignature  = errors.New("Telegram init data signature is invalid")
	ErrExpiredInitData   = errors.New("Telegram init data is stale")
	ErrFutureInitData    = errors.New("Telegram init data auth_date is in the future")
	ErrMalformedUser     = errors.New("Telegram user data is malformed")
)

const (
	maxInitDataBytes = 8 << 10
	maxFutureSkew    = 30 * time.Second
)

type User struct {
	ID           int64
	Username     string
	FirstName    string
	LastName     string
	LanguageCode string
}

type TelegramVerifier struct {
	secretKey []byte
	maxAge    time.Duration
	now       func() time.Time
}

func NewTelegramVerifier(botToken string, maxAge time.Duration) (*TelegramVerifier, error) {
	return newTelegramVerifier(botToken, maxAge, time.Now)
}

func newTelegramVerifier(botToken string, maxAge time.Duration, now func() time.Time) (*TelegramVerifier, error) {
	if botToken == "" {
		return nil, errors.New("Telegram bot token is required")
	}
	if maxAge <= 0 {
		return nil, errors.New("Telegram auth max age must be positive")
	}
	secret := hmac.New(sha256.New, []byte("WebAppData"))
	_, _ = secret.Write([]byte(botToken))
	return &TelegramVerifier{secretKey: secret.Sum(nil), maxAge: maxAge, now: now}, nil
}

func (v *TelegramVerifier) Verify(raw string) (User, error) {
	if raw == "" || len(raw) > maxInitDataBytes {
		return User{}, ErrMalformedInitData
	}
	values, err := url.ParseQuery(raw)
	if err != nil {
		return User{}, ErrMalformedInitData
	}
	hashValue, err := exactlyOne(values, "hash")
	if err != nil {
		return User{}, err
	}
	providedHash, err := hex.DecodeString(hashValue)
	if err != nil || len(providedHash) != sha256.Size {
		return User{}, ErrInvalidSignature
	}
	dataCheckString, err := buildDataCheckString(values)
	if err != nil {
		return User{}, err
	}
	expected := hmac.New(sha256.New, v.secretKey)
	_, _ = expected.Write([]byte(dataCheckString))
	if !hmac.Equal(expected.Sum(nil), providedHash) {
		return User{}, ErrInvalidSignature
	}

	authDateValue, err := exactlyOne(values, "auth_date")
	if err != nil {
		return User{}, err
	}
	authDateUnix, err := strconv.ParseInt(authDateValue, 10, 64)
	if err != nil || authDateUnix <= 0 {
		return User{}, ErrMalformedInitData
	}
	now := v.now().UTC()
	authDate := time.Unix(authDateUnix, 0).UTC()
	if authDate.After(now.Add(maxFutureSkew)) {
		return User{}, ErrFutureInitData
	}
	if now.Sub(authDate) > v.maxAge {
		return User{}, ErrExpiredInitData
	}

	userValue, err := exactlyOne(values, "user")
	if err != nil {
		return User{}, err
	}
	return parseUser(userValue)
}

func buildDataCheckString(values url.Values) (string, error) {
	keys := make([]string, 0, len(values)-1)
	for key, entries := range values {
		if key == "hash" {
			continue
		}
		if len(entries) != 1 {
			return "", ErrMalformedInitData
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	pairs := make([]string, 0, len(keys))
	for _, key := range keys {
		pairs = append(pairs, key+"="+values.Get(key))
	}
	return strings.Join(pairs, "\n"), nil
}

func exactlyOne(values url.Values, key string) (string, error) {
	entries, ok := values[key]
	if !ok || len(entries) != 1 || entries[0] == "" {
		return "", ErrMalformedInitData
	}
	return entries[0], nil
}

func parseUser(value string) (User, error) {
	var raw struct {
		ID           json.Number `json:"id"`
		Username     string      `json:"username"`
		FirstName    string      `json:"first_name"`
		LastName     string      `json:"last_name"`
		LanguageCode string      `json:"language_code"`
	}
	decoder := json.NewDecoder(strings.NewReader(value))
	decoder.UseNumber()
	if err := decoder.Decode(&raw); err != nil {
		return User{}, ErrMalformedUser
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return User{}, ErrMalformedUser
	}
	id, err := strconv.ParseInt(raw.ID.String(), 10, 64)
	if err != nil || id <= 0 || raw.FirstName == "" {
		return User{}, ErrMalformedUser
	}
	if len(raw.Username) > 64 || len(raw.FirstName) > 256 || len(raw.LastName) > 256 || len(raw.LanguageCode) > 32 {
		return User{}, ErrMalformedUser
	}
	return User{
		ID:           id,
		Username:     raw.Username,
		FirstName:    raw.FirstName,
		LastName:     raw.LastName,
		LanguageCode: raw.LanguageCode,
	}, nil
}

func (u User) String() string {
	return fmt.Sprintf("TelegramUser(%d)", u.ID)
}
