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

func TestLoadFromValidatesDatabaseURLs(t *testing.T) {
	t.Parallel()

	tests := map[string]map[string]string{
		"invalid scheme":        {"DATABASE_URL": "https://db.example.com/xuhuan"},
		"missing database name": {"DATABASE_URL": "postgres://db.example.com"},
		"production no TLS": {
			"APP_ENV": "production", "DATABASE_URL": "postgres://db.example.com/xuhuan",
		},
		"production TLS disabled": {
			"APP_ENV": "production", "DATABASE_URL": "postgres://db.example.com/xuhuan?sslmode=disable",
		},
	}
	for name, values := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := LoadFrom(lookup(values)); err == nil {
				t.Fatal("LoadFrom() accepted an unsafe database URL")
			}
		})
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
		{name: "bot token missing", values: map[string]string{"APP_ENV": "production", "DATABASE_URL": "postgres://db/xuhuan?sslmode=require"}, want: "TELEGRAM_BOT_TOKEN"},
		{name: "origins missing", values: map[string]string{"APP_ENV": "production", "DATABASE_URL": "postgres://db/xuhuan?sslmode=require", "TELEGRAM_BOT_TOKEN": "token"}, want: "CORS_ALLOWED_ORIGINS"},
		{name: "redis missing", values: map[string]string{"APP_ENV": "production", "DATABASE_URL": "postgres://db/xuhuan?sslmode=require", "TELEGRAM_BOT_TOKEN": "token", "CORS_ALLOWED_ORIGINS": "https://game.example.com"}, want: "REDIS_URL"},
		{name: "redis without TLS", values: map[string]string{"APP_ENV": "production", "REDIS_URL": "redis://cache.example.com/0"}, want: "rediss://"},
		{name: "telemetry without TLS", values: map[string]string{"APP_ENV": "production", "OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector.example.com"}, want: "https"},
		{name: "http origin", values: map[string]string{"APP_ENV": "production", "CORS_ALLOWED_ORIGINS": "http://game.example.com"}, want: "must use https"},
		{name: "origin user info", values: map[string]string{"CORS_ALLOWED_ORIGINS": "https://user@game.example.com"}, want: "invalid CORS origin"},
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
