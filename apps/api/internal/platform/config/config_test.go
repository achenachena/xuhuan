package config

import (
	"strings"
	"testing"
	"time"
)

func lookup(values map[string]string) Lookup {
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
}

func TestLoadFromDefaults(t *testing.T) {
	t.Parallel()

	cfg, err := LoadFrom(lookup(nil))
	if err != nil {
		t.Fatalf("LoadFrom() error = %v", err)
	}
	if cfg.Environment != Development || cfg.HTTPAddr != ":8080" {
		t.Fatalf("unexpected defaults: %#v", cfg)
	}
	if cfg.MaxBodyBytes != 64<<10 || cfg.ShutdownTimeout != 10*time.Second {
		t.Fatalf("unexpected limits: %#v", cfg)
	}
	if cfg.IPRateLimit != 120 || cfg.PlayerRateLimit != 60 || cfg.RateLimitWindow != time.Minute {
		t.Fatalf("unexpected rate limits: %#v", cfg)
	}
	if cfg.OTELServiceName != "xuhuan-api" || cfg.OTELExportInterval != 30*time.Second || cfg.OTLPEndpoint != "" {
		t.Fatalf("unexpected telemetry defaults: %#v", cfg)
	}
}

func TestLoadFromValidatesTelemetry(t *testing.T) {
	t.Parallel()

	for name, values := range map[string]map[string]string{
		"non http endpoint":  {"OTEL_EXPORTER_OTLP_ENDPOINT": "grpc://collector:4317"},
		"endpoint user info": {"OTEL_EXPORTER_OTLP_ENDPOINT": "https://secret@collector.example.com"},
		"long interval":      {"OTEL_EXPORT_INTERVAL": "10m"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := LoadFrom(lookup(values)); err == nil {
				t.Fatal("LoadFrom() accepted invalid telemetry config")
			}
		})
	}

	cfg, err := LoadFrom(lookup(map[string]string{
		"OTEL_EXPORTER_OTLP_ENDPOINT": "https://collector.example.com",
		"OTEL_SERVICE_NAME":           "battle-api",
		"OTEL_EXPORT_INTERVAL":        "15s",
	}))
	if err != nil {
		t.Fatalf("LoadFrom() error = %v", err)
	}
	if cfg.OTLPEndpoint != "https://collector.example.com" || cfg.OTELServiceName != "battle-api" || cfg.OTELExportInterval != 15*time.Second {
		t.Fatalf("unexpected telemetry config: %#v", cfg)
	}
}

func TestLoadFromBuildsEscapedDatabaseURLForManagedSecrets(t *testing.T) {
	t.Parallel()

	cfg, err := LoadFrom(lookup(map[string]string{
		"DATABASE_HOST":     "db.example.internal",
		"DATABASE_PORT":     "5432",
		"DATABASE_NAME":     "xuhuan",
		"DATABASE_USER":     "game-user",
		"DATABASE_PASSWORD": "p@ss:/word",
		"DATABASE_SSLMODE":  "verify-full",
	}))
	if err != nil {
		t.Fatalf("LoadFrom() error = %v", err)
	}
	if !strings.Contains(cfg.DatabaseURL, "p%40ss%3A%2Fword") || !strings.Contains(cfg.DatabaseURL, "sslmode=verify-full") {
		t.Fatalf("DATABASE_URL was not safely encoded: %q", cfg.DatabaseURL)
	}
}

func TestLoadFromRejectsIncompleteManagedDatabaseConfig(t *testing.T) {
	t.Parallel()

	if _, err := LoadFrom(lookup(map[string]string{"DATABASE_HOST": "db.internal"})); err == nil {
		t.Fatal("LoadFrom() accepted incomplete database settings")
	}
}

func TestLoadFromUsesSeparateMigrationDatabaseURL(t *testing.T) {
	t.Parallel()

	cfg, err := LoadFrom(lookup(map[string]string{
		"DATABASE_URL":           "postgres://pooler.example/xuhuan?sslmode=require",
		"DATABASE_MIGRATION_URL": "postgres://direct.example/xuhuan?sslmode=require",
	}))
	if err != nil {
		t.Fatalf("LoadFrom() error = %v", err)
	}
	if cfg.DatabaseURL != "postgres://pooler.example/xuhuan?sslmode=require" {
		t.Fatalf("DatabaseURL = %q", cfg.DatabaseURL)
	}
	if cfg.DatabaseMigrationURL != "postgres://direct.example/xuhuan?sslmode=require" {
		t.Fatalf("DatabaseMigrationURL = %q", cfg.DatabaseMigrationURL)
	}

	cfg, err = LoadFrom(lookup(map[string]string{
		"DATABASE_URL": "postgres://single.example/xuhuan?sslmode=require",
	}))
	if err != nil {
		t.Fatalf("LoadFrom() fallback error = %v", err)
	}
	if cfg.DatabaseMigrationURL != cfg.DatabaseURL {
		t.Fatalf("migration fallback = %q, database = %q", cfg.DatabaseMigrationURL, cfg.DatabaseURL)
	}
}

func TestLoadFromRejectsUnsafeProduction(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		values map[string]string
		want   string
	}{
		{name: "database missing", values: map[string]string{"APP_ENV": "production"}, want: "DATABASE_URL"},
		{name: "bot token missing", values: map[string]string{"APP_ENV": "production", "DATABASE_URL": "postgres://db"}, want: "TELEGRAM_BOT_TOKEN"},
		{name: "origins missing", values: map[string]string{"APP_ENV": "production", "DATABASE_URL": "postgres://db", "TELEGRAM_BOT_TOKEN": "token"}, want: "CORS_ALLOWED_ORIGINS"},
		{name: "redis missing", values: map[string]string{"APP_ENV": "production", "DATABASE_URL": "postgres://db", "TELEGRAM_BOT_TOKEN": "token", "CORS_ALLOWED_ORIGINS": "https://game.example.com"}, want: "REDIS_URL"},
		{name: "http origin", values: map[string]string{"APP_ENV": "production", "CORS_ALLOWED_ORIGINS": "http://game.example.com"}, want: "must use https"},
		{name: "wildcard", values: map[string]string{"APP_ENV": "production", "CORS_ALLOWED_ORIGINS": "*"}, want: "wildcard"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			_, err := LoadFrom(lookup(tt.values))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("LoadFrom() error = %v, want containing %q", err, tt.want)
			}
		})
	}
}

func TestLoadFromNormalizesOriginsAndTimeouts(t *testing.T) {
	t.Parallel()

	cfg, err := LoadFrom(lookup(map[string]string{
		"CORS_ALLOWED_ORIGINS": "http://localhost:3000, http://localhost:3000,https://web.telegram.org",
		"HTTP_READ_TIMEOUT":    "3s",
	}))
	if err != nil {
		t.Fatalf("LoadFrom() error = %v", err)
	}
	if len(cfg.CORSAllowedOrigins) != 2 {
		t.Fatalf("origins = %#v", cfg.CORSAllowedOrigins)
	}
	if cfg.ReadTimeout != 3*time.Second {
		t.Fatalf("ReadTimeout = %s", cfg.ReadTimeout)
	}
}

func TestLoadFromDevelopmentAuthIsExplicitAndDevelopmentOnly(t *testing.T) {
	t.Parallel()

	_, err := LoadFrom(lookup(map[string]string{
		"APP_ENV":              "production",
		"DATABASE_URL":         "postgres://db",
		"TELEGRAM_BOT_TOKEN":   "token",
		"CORS_ALLOWED_ORIGINS": "https://game.example.com",
		"DEV_AUTH_ENABLED":     "true",
		"DEV_AUTH_TOKEN":       "0123456789abcdef",
		"DEV_TELEGRAM_USER_ID": "123456789",
	}))
	if err == nil || !strings.Contains(err.Error(), "APP_ENV=development") {
		t.Fatalf("production development auth error = %v", err)
	}

	cfg, err := LoadFrom(lookup(map[string]string{
		"APP_ENV":              "development",
		"DEV_AUTH_ENABLED":     "true",
		"DEV_AUTH_TOKEN":       "0123456789abcdef",
		"DEV_TELEGRAM_USER_ID": "123456789",
	}))
	if err != nil {
		t.Fatalf("development config error = %v", err)
	}
	if !cfg.DevAuthEnabled || cfg.DevTelegramUserID != 123456789 {
		t.Fatalf("development auth config = %#v", cfg)
	}
}
