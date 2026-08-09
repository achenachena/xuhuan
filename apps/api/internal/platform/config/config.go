package config

import (
	"errors"
	"fmt"
	"net"
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
	defaultOTELInterval   = 30 * time.Second
	defaultOTELService    = "xuhuan-api"
)

type Environment string

const (
	Development Environment = "development"
	Test        Environment = "test"
	Production  Environment = "production"
)

type Config struct {
	Environment          Environment
	HTTPAddr             string
	Version              string
	DatabaseURL          string
	DatabaseMigrationURL string
	RedisURL             string
	RedisTimeout         time.Duration
	TelegramBotToken     string
	TelegramAuthMaxAge   time.Duration
	DevAuthEnabled       bool
	DevAuthToken         string
	DevTelegramUserID    int64
	DevUsername          string
	DevFirstName         string
	DevLastName          string
	DevLanguageCode      string
	CORSAllowedOrigins   []string
	TrustProxy           bool
	RateLimitWindow      time.Duration
	IPRateLimit          int64
	PlayerRateLimit      int64
	OTLPEndpoint         string
	OTELServiceName      string
	OTELExportInterval   time.Duration
	MaxBodyBytes         int64
	ReadTimeout          time.Duration
	WriteTimeout         time.Duration
	IdleTimeout          time.Duration
	ShutdownTimeout      time.Duration
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
	devAuthEnabled, err := parseBool(lookup, "DEV_AUTH_ENABLED", false)
	if err != nil {
		return Config{}, err
	}
	devTelegramUserID, err := parseInt64(lookup, "DEV_TELEGRAM_USER_ID", 0)
	if err != nil {
		return Config{}, errors.New("DEV_TELEGRAM_USER_ID must be a signed 64-bit integer")
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
	trustProxy, err := parseBool(lookup, "TRUST_PROXY", false)
	if err != nil {
		return Config{}, err
	}
	redisURL := valueOrDefault(lookup, "REDIS_URL", "")
	if redisURL != "" {
		parsedRedisURL, parseErr := url.Parse(redisURL)
		if parseErr != nil || (parsedRedisURL.Scheme != "redis" && parsedRedisURL.Scheme != "rediss") || parsedRedisURL.Host == "" {
			return Config{}, errors.New("REDIS_URL must be a valid redis:// or rediss:// URL")
		}
	}
	databaseURL, err := databaseConnectionURL(lookup, appEnv)
	if err != nil {
		return Config{}, err
	}
	databaseMigrationURL := valueOrDefault(lookup, "DATABASE_MIGRATION_URL", databaseURL)
	otlpEndpoint := valueOrDefault(lookup, "OTEL_EXPORTER_OTLP_ENDPOINT", "")
	if otlpEndpoint != "" {
		parsedEndpoint, parseErr := url.Parse(otlpEndpoint)
		if parseErr != nil || (parsedEndpoint.Scheme != "http" && parsedEndpoint.Scheme != "https") || parsedEndpoint.Host == "" || parsedEndpoint.User != nil || parsedEndpoint.RawQuery != "" || parsedEndpoint.Fragment != "" {
			return Config{}, errors.New("OTEL_EXPORTER_OTLP_ENDPOINT must be an http(s) URL without user information, query, or fragment")
		}
	}
	otelExportInterval, err := parseDuration(lookup, "OTEL_EXPORT_INTERVAL", defaultOTELInterval)
	if err != nil || otelExportInterval > 5*time.Minute {
		return Config{}, errors.New("OTEL_EXPORT_INTERVAL must be a positive duration no greater than 5m")
	}
	otelServiceName := valueOrDefault(lookup, "OTEL_SERVICE_NAME", defaultOTELService)
	if otelServiceName == "" || len(otelServiceName) > 128 {
		return Config{}, errors.New("OTEL_SERVICE_NAME must contain between 1 and 128 characters")
	}

	cfg := Config{
		Environment:          appEnv,
		HTTPAddr:             valueOrDefault(lookup, "HTTP_ADDR", defaultHTTPAddr),
		Version:              valueOrDefault(lookup, "APP_VERSION", "development"),
		DatabaseURL:          databaseURL,
		DatabaseMigrationURL: databaseMigrationURL,
		RedisURL:             redisURL,
		RedisTimeout:         redisTimeout,
		TelegramBotToken:     valueOrDefault(lookup, "TELEGRAM_BOT_TOKEN", ""),
		TelegramAuthMaxAge:   telegramMaxAge,
		DevAuthEnabled:       devAuthEnabled,
		DevAuthToken:         valueOrDefault(lookup, "DEV_AUTH_TOKEN", ""),
		DevTelegramUserID:    devTelegramUserID,
		DevUsername:          valueOrDefault(lookup, "DEV_USERNAME", "dev_player"),
		DevFirstName:         valueOrDefault(lookup, "DEV_FIRST_NAME", "Development"),
		DevLastName:          valueOrDefault(lookup, "DEV_LAST_NAME", "Player"),
		DevLanguageCode:      valueOrDefault(lookup, "DEV_LANGUAGE_CODE", "zh-CN"),
		CORSAllowedOrigins:   origins,
		TrustProxy:           trustProxy,
		RateLimitWindow:      rateLimitWindow,
		IPRateLimit:          ipRateLimit,
		PlayerRateLimit:      playerRateLimit,
		OTLPEndpoint:         otlpEndpoint,
		OTELServiceName:      otelServiceName,
		OTELExportInterval:   otelExportInterval,
		MaxBodyBytes:         maxBodyBytes,
		ReadTimeout:          readTimeout,
		WriteTimeout:         writeTimeout,
		IdleTimeout:          idleTimeout,
		ShutdownTimeout:      shutdownTimeout,
	}

	if strings.TrimSpace(cfg.HTTPAddr) == "" {
		return Config{}, errors.New("HTTP_ADDR must not be empty")
	}
	if cfg.DevAuthEnabled {
		if cfg.Environment != Development {
			return Config{}, errors.New("DEV_AUTH_ENABLED is allowed only when APP_ENV=development")
		}
		if len(cfg.DevAuthToken) < 16 {
			return Config{}, errors.New("DEV_AUTH_TOKEN must contain at least 16 characters when development auth is enabled")
		}
		if cfg.DevTelegramUserID <= 0 {
			return Config{}, errors.New("DEV_TELEGRAM_USER_ID must be positive when development auth is enabled")
		}
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

func databaseConnectionURL(lookup Lookup, environment Environment) (string, error) {
	if databaseURL := valueOrDefault(lookup, "DATABASE_URL", ""); databaseURL != "" {
		return databaseURL, nil
	}
	host := valueOrDefault(lookup, "DATABASE_HOST", "")
	name := valueOrDefault(lookup, "DATABASE_NAME", "")
	username := valueOrDefault(lookup, "DATABASE_USER", "")
	password := valueOrDefault(lookup, "DATABASE_PASSWORD", "")
	if host == "" && name == "" && username == "" && password == "" {
		return "", nil
	}
	if host == "" || strings.ContainsAny(host, " /?#@") || name == "" || strings.ContainsAny(name, "/?#") || username == "" || password == "" {
		return "", errors.New("DATABASE_HOST, DATABASE_NAME, DATABASE_USER, and DATABASE_PASSWORD must all be valid when DATABASE_URL is not set")
	}
	port, err := parseInt64(lookup, "DATABASE_PORT", 5432)
	if err != nil || port < 1 || port > 65535 {
		return "", errors.New("DATABASE_PORT must be between 1 and 65535")
	}
	sslMode := valueOrDefault(lookup, "DATABASE_SSLMODE", "require")
	validSSLModes := map[string]bool{"disable": true, "require": true, "verify-ca": true, "verify-full": true}
	if !validSSLModes[sslMode] || (environment == Production && sslMode == "disable") {
		return "", errors.New("DATABASE_SSLMODE must be require, verify-ca, or verify-full in production")
	}
	connection := &url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(username, password),
		Host:     net.JoinHostPort(host, strconv.FormatInt(port, 10)),
		Path:     name,
		RawQuery: url.Values{"sslmode": []string{sslMode}}.Encode(),
	}
	return connection.String(), nil
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

func parseBool(lookup Lookup, key string, fallback bool) (bool, error) {
	value, ok := lookup(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be true or false", key)
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
		if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, fmt.Errorf("invalid CORS origin %q", candidate)
		}
		if environment == Production && parsed.Scheme != "https" {
			return nil, fmt.Errorf("production CORS origin %q must use https", candidate)
		}
		origin := parsed.Scheme + "://" + parsed.Host
		if _, ok := seen[origin]; ok {
			continue
		}
		seen[origin] = struct{}{}
		origins = append(origins, origin)
	}
	return origins, nil
}
