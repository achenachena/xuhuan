package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultHTTPAddr       = ":8080"
	defaultMaxBodyBytes   = int64(64 << 10)
	defaultReadTimeout    = 10 * time.Second
	defaultWriteTimeout   = 15 * time.Second
	defaultIdleTimeout    = 60 * time.Second
	defaultShutdownPeriod = 10 * time.Second
	defaultTelegramMaxAge = 24 * time.Hour
	defaultRedisTimeout   = 150 * time.Millisecond
	defaultRateWindow     = time.Minute
	defaultIPRateLimit    = int64(120)
	defaultPlayerLimit    = int64(60)
)

type Environment string

const (
	Development Environment = "development"
	Test        Environment = "test"
	Production  Environment = "production"
)

type Config struct {
	Environment        Environment
	HTTPAddr           string
	Version            string
	DatabaseURL        string
	RedisURL           string
	RedisTimeout       time.Duration
	TelegramBotToken   string
	TelegramAuthMaxAge time.Duration
	CORSAllowedOrigins []string
	RateLimitWindow    time.Duration
	IPRateLimit        int64
	PlayerRateLimit    int64
	MaxBodyBytes       int64
	ReadTimeout        time.Duration
	WriteTimeout       time.Duration
	IdleTimeout        time.Duration
	ShutdownTimeout    time.Duration
}

type Lookup func(string) (string, bool)

func Load() (Config, error) {
	return LoadFrom(os.LookupEnv)
}

func LoadFrom(lookup Lookup) (Config, error) {
	appEnv := Environment(valueOrDefault(lookup, "APP_ENV", string(Development)))
	if appEnv != Development && appEnv != Test && appEnv != Production {
		return Config{}, fmt.Errorf("APP_ENV must be development, test, or production")
	}

	maxBodyBytes, err := parseInt64(lookup, "HTTP_MAX_BODY_BYTES", defaultMaxBodyBytes)
	if err != nil || maxBodyBytes < 1024 || maxBodyBytes > 1<<20 {
		return Config{}, fmt.Errorf("HTTP_MAX_BODY_BYTES must be an integer from 1024 to 1048576")
	}

	readTimeout, err := parseDuration(lookup, "HTTP_READ_TIMEOUT", defaultReadTimeout)
	if err != nil {
		return Config{}, err
	}
	writeTimeout, err := parseDuration(lookup, "HTTP_WRITE_TIMEOUT", defaultWriteTimeout)
	if err != nil {
		return Config{}, err
	}
	idleTimeout, err := parseDuration(lookup, "HTTP_IDLE_TIMEOUT", defaultIdleTimeout)
	if err != nil {
		return Config{}, err
	}
	shutdownTimeout, err := parseDuration(lookup, "HTTP_SHUTDOWN_TIMEOUT", defaultShutdownPeriod)
	if err != nil {
		return Config{}, err
	}
	telegramMaxAge, err := parseDuration(lookup, "TELEGRAM_AUTH_MAX_AGE", defaultTelegramMaxAge)
	if err != nil || telegramMaxAge > 7*24*time.Hour {
		return Config{}, errors.New("TELEGRAM_AUTH_MAX_AGE must be a positive duration no greater than 168h")
	}
	origins, err := parseOrigins(valueOrDefault(lookup, "CORS_ALLOWED_ORIGINS", ""), appEnv)
	if err != nil {
		return Config{}, err
	}
	redisTimeout, err := parseDuration(lookup, "REDIS_TIMEOUT", defaultRedisTimeout)
	if err != nil || redisTimeout > 5*time.Second {
		return Config{}, errors.New("REDIS_TIMEOUT must be a positive duration no greater than 5s")
	}
	rateLimitWindow, err := parseDuration(lookup, "RATE_LIMIT_WINDOW", defaultRateWindow)
	if err != nil || rateLimitWindow > time.Hour {
		return Config{}, errors.New("RATE_LIMIT_WINDOW must be a positive duration no greater than 1h")
	}
	ipRateLimit, err := parseInt64(lookup, "RATE_LIMIT_IP_REQUESTS", defaultIPRateLimit)
	if err != nil || ipRateLimit <= 0 || ipRateLimit > 1_000_000 {
		return Config{}, errors.New("RATE_LIMIT_IP_REQUESTS must be between 1 and 1000000")
	}
	playerRateLimit, err := parseInt64(lookup, "RATE_LIMIT_PLAYER_REQUESTS", defaultPlayerLimit)
	if err != nil || playerRateLimit <= 0 || playerRateLimit > 1_000_000 {
		return Config{}, errors.New("RATE_LIMIT_PLAYER_REQUESTS must be between 1 and 1000000")
	}
	redisURL := valueOrDefault(lookup, "REDIS_URL", "")
	if err := validateRedisURL(redisURL, appEnv); err != nil {
		return Config{}, err
	}
	databaseURL := valueOrDefault(lookup, "DATABASE_URL", "")
	if err := validatePostgresURL("DATABASE_URL", databaseURL, appEnv); err != nil {
		return Config{}, err
	}
	cfg := Config{
		Environment:        appEnv,
		HTTPAddr:           valueOrDefault(lookup, "HTTP_ADDR", defaultHTTPAddr),
		Version:            valueOrDefault(lookup, "APP_VERSION", "development"),
		DatabaseURL:        databaseURL,
		RedisURL:           redisURL,
		RedisTimeout:       redisTimeout,
		TelegramBotToken:   valueOrDefault(lookup, "TELEGRAM_BOT_TOKEN", ""),
		TelegramAuthMaxAge: telegramMaxAge,
		CORSAllowedOrigins: origins,
		RateLimitWindow:    rateLimitWindow,
		IPRateLimit:        ipRateLimit,
		PlayerRateLimit:    playerRateLimit,
		MaxBodyBytes:       maxBodyBytes,
		ReadTimeout:        readTimeout,
		WriteTimeout:       writeTimeout,
		IdleTimeout:        idleTimeout,
		ShutdownTimeout:    shutdownTimeout,
	}

	if strings.TrimSpace(cfg.HTTPAddr) == "" {
		return Config{}, errors.New("HTTP_ADDR must not be empty")
	}
	if cfg.Environment == Production {
		if cfg.DatabaseURL == "" {
			return Config{}, errors.New("DATABASE_URL is required in production")
		}
		if cfg.TelegramBotToken == "" {
			return Config{}, errors.New("TELEGRAM_BOT_TOKEN is required in production")
		}
		if len(cfg.CORSAllowedOrigins) == 0 {
			return Config{}, errors.New("CORS_ALLOWED_ORIGINS is required in production")
		}
		if cfg.RedisURL == "" {
			return Config{}, errors.New("REDIS_URL is required in production")
		}
	}

	return cfg, nil
}

func validatePostgresURL(key, raw string, environment Environment) error {
	if raw == "" {
		return nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Opaque != "" || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") || parsed.Hostname() == "" || strings.Trim(parsed.Path, "/") == "" || parsed.Fragment != "" {
		return fmt.Errorf("%s must be a valid PostgreSQL URL", key)
	}
	query, err := url.ParseQuery(parsed.RawQuery)
	if err != nil || len(query["sslmode"]) > 1 {
		return fmt.Errorf("%s must have valid query parameters", key)
	}
	if environment != Production {
		return nil
	}
	sslModes := query["sslmode"]
	if len(sslModes) != 1 || (sslModes[0] != "require" && sslModes[0] != "verify-ca" && sslModes[0] != "verify-full") {
		return fmt.Errorf("%s must use TLS with sslmode=require, verify-ca, or verify-full in production", key)
	}
	return nil
}

func validateRedisURL(raw string, environment Environment) error {
	if raw == "" {
		return nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Opaque != "" || (parsed.Scheme != "redis" && parsed.Scheme != "rediss") || parsed.Hostname() == "" || parsed.Fragment != "" {
		return errors.New("REDIS_URL must be a valid redis:// or rediss:// URL")
	}
	if environment == Production && parsed.Scheme != "rediss" {
		return errors.New("REDIS_URL must use rediss:// in production")
	}
	return nil
}

func valueOrDefault(lookup Lookup, key, fallback string) string {
	if value, ok := lookup(key); ok {
		return strings.TrimSpace(value)
	}
	return fallback
}

func parseInt64(lookup Lookup, key string, fallback int64) (int64, error) {
	value, ok := lookup(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback, nil
	}
	return strconv.ParseInt(value, 10, 64)
}

func parseDuration(lookup Lookup, key string, fallback time.Duration) (time.Duration, error) {
	value, ok := lookup(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive Go duration", key)
	}
	return parsed, nil
}

func parseOrigins(raw string, environment Environment) ([]string, error) {
	if raw == "" {
		return nil, nil
	}

	seen := make(map[string]struct{})
	origins := make([]string, 0)
	for _, candidate := range strings.Split(raw, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if candidate == "*" {
			return nil, errors.New("CORS_ALLOWED_ORIGINS must not contain a wildcard")
		}
		parsed, err := url.Parse(candidate)
		if err != nil || parsed.Opaque != "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, fmt.Errorf("invalid CORS origin %q", candidate)
		}
		if environment == Production && parsed.Scheme != "https" {
			return nil, fmt.Errorf("production CORS origin %q must use https", candidate)
		}
		origin := strings.ToLower(parsed.Scheme + "://" + parsed.Host)
		if _, ok := seen[origin]; ok {
			continue
		}
		seen[origin] = struct{}{}
		origins = append(origins, origin)
	}
	return origins, nil
}
