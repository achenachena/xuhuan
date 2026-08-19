package observability

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

func TestRequiredMetricsAreRecorded(t *testing.T) {
	t.Parallel()

	reader := metric.NewManualReader()
	provider := metric.NewMeterProvider(metric.WithReader(reader))
	t.Cleanup(func() { _ = provider.Shutdown(context.Background()) })
	metrics, err := NewMetrics(provider.Meter(instrumentationName))
	if err != nil {
		t.Fatalf("NewMetrics() error = %v", err)
	}

	ctx := context.Background()
	metrics.HTTPRequest(ctx, "POST", "/v2/runs/{id}/commands", 500, 12*time.Millisecond)
	metrics.AuthenticationFailure(ctx, "signature")
	databaseContext := DatabaseTracer{Metrics: metrics}.TraceQueryStart(ctx, nil, pgx.TraceQueryStartData{})
	DatabaseTracer{Metrics: metrics}.TraceQueryEnd(databaseContext, nil, pgx.TraceQueryEndData{Err: errors.New("query failed")})

	var collected metricdata.ResourceMetrics
	if err := reader.Collect(ctx, &collected); err != nil {
		t.Fatalf("Collect() error = %v", err)
	}
	names := make(map[string]bool)
	for _, scope := range collected.ScopeMetrics {
		for _, item := range scope.Metrics {
			names[item.Name] = true
		}
	}
	for _, name := range []string{
		"http.server.requests", "http.server.errors", "http.server.duration",
		"db.client.duration", "db.client.errors", "auth.failures",
	} {
		if !names[name] {
			t.Errorf("metric %q was not collected", name)
		}
	}
}

func TestNoopTelemetry(t *testing.T) {
	t.Parallel()

	telemetry, err := Initialize(context.Background(), Config{})
	if err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	if telemetry.Enabled() {
		t.Fatal("telemetry without an endpoint must be disabled")
	}
	telemetry.Metrics.AuthenticationFailure(context.Background(), "test")
	if err := telemetry.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}
}

func TestSignalEndpoint(t *testing.T) {
	t.Parallel()

	if got := signalEndpoint("http://collector:4318/custom/", "traces"); got != "http://collector:4318/custom/v1/traces" {
		t.Fatalf("signalEndpoint() = %q", got)
	}
}
