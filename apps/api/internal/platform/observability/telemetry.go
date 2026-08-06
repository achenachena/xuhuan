package observability

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	metricnoop "go.opentelemetry.io/otel/metric/noop"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	traceSDK "go.opentelemetry.io/otel/sdk/trace"
)

type Config struct {
	Endpoint       string
	ServiceName    string
	ServiceVersion string
	Environment    string
	ExportInterval time.Duration
}

type Telemetry struct {
	Metrics        *Metrics
	metricProvider *metric.MeterProvider
	traceProvider  *traceSDK.TracerProvider
}

// Initialize creates optional OTLP/HTTP exporters. With no endpoint it returns
// no-op instruments, keeping telemetry outside the application's availability
// path.
func Initialize(ctx context.Context, config Config) (*Telemetry, error) {
	if config.Endpoint == "" {
		return Noop(), nil
	}

	applicationResource, err := resource.New(ctx, resource.WithAttributes(
		attribute.String("service.name", config.ServiceName),
		attribute.String("service.version", config.ServiceVersion),
		attribute.String("deployment.environment.name", config.Environment),
	))
	if err != nil {
		return nil, err
	}
	traceExporter, err := otlptracehttp.New(ctx, otlptracehttp.WithEndpointURL(signalEndpoint(config.Endpoint, "traces")))
	if err != nil {
		return nil, err
	}
	traceProvider := traceSDK.NewTracerProvider(
		traceSDK.WithBatcher(traceExporter),
		traceSDK.WithResource(applicationResource),
	)
	metricExporter, err := otlpmetrichttp.New(ctx, otlpmetrichttp.WithEndpointURL(signalEndpoint(config.Endpoint, "metrics")))
	if err != nil {
		_ = traceProvider.Shutdown(ctx)
		return nil, err
	}
	metricProvider := metric.NewMeterProvider(
		metric.WithResource(applicationResource),
		metric.WithReader(metric.NewPeriodicReader(metricExporter, metric.WithInterval(config.ExportInterval))),
	)
	metrics, err := NewMetrics(metricProvider.Meter(instrumentationName))
	if err != nil {
		_ = metricProvider.Shutdown(ctx)
		_ = traceProvider.Shutdown(ctx)
		return nil, err
	}

	otel.SetTracerProvider(traceProvider)
	otel.SetMeterProvider(metricProvider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))
	return &Telemetry{Metrics: metrics, metricProvider: metricProvider, traceProvider: traceProvider}, nil
}

func signalEndpoint(base, signal string) string {
	return strings.TrimRight(base, "/") + "/v1/" + signal
}

func Noop() *Telemetry {
	metrics, _ := NewMetrics(metricnoop.NewMeterProvider().Meter(instrumentationName))
	return &Telemetry{Metrics: metrics}
}

func (t *Telemetry) Enabled() bool {
	return t != nil && t.metricProvider != nil && t.traceProvider != nil
}

func (t *Telemetry) Shutdown(ctx context.Context) error {
	if t == nil {
		return nil
	}
	var metricErr, traceErr error
	if t.metricProvider != nil {
		metricErr = t.metricProvider.Shutdown(ctx)
	}
	if t.traceProvider != nil {
		traceErr = t.traceProvider.Shutdown(ctx)
	}
	return errors.Join(metricErr, traceErr)
}
