package observability

import (
	"context"
	"strconv"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

const instrumentationName = "github.com/achenachena/xuhuan/apps/api"

// Metrics contains low-cardinality, OpenTelemetry-compatible application
// instruments. It intentionally accepts no player IDs, run IDs, URLs, SQL,
// credentials, or request bodies.
type Metrics struct {
	httpRequests     metric.Int64Counter
	httpErrors       metric.Int64Counter
	httpDuration     metric.Float64Histogram
	databaseDuration metric.Float64Histogram
	databaseErrors   metric.Int64Counter
	authFailures     metric.Int64Counter
}

func NewMetrics(meter metric.Meter) (*Metrics, error) {
	result := &Metrics{}
	var err error
	if result.httpRequests, err = meter.Int64Counter("http.server.requests"); err != nil {
		return nil, err
	}
	if result.httpErrors, err = meter.Int64Counter("http.server.errors"); err != nil {
		return nil, err
	}
	if result.httpDuration, err = meter.Float64Histogram("http.server.duration", metric.WithUnit("ms")); err != nil {
		return nil, err
	}
	if result.databaseDuration, err = meter.Float64Histogram("db.client.duration", metric.WithUnit("ms")); err != nil {
		return nil, err
	}
	if result.databaseErrors, err = meter.Int64Counter("db.client.errors"); err != nil {
		return nil, err
	}
	if result.authFailures, err = meter.Int64Counter("auth.failures"); err != nil {
		return nil, err
	}
	return result, nil
}

func (m *Metrics) HTTPRequest(ctx context.Context, method, route string, status int, duration time.Duration) {
	if m == nil {
		return
	}
	if route == "" {
		route = "unmatched"
	}
	attributes := metric.WithAttributes(
		attribute.String("http.request.method", method),
		attribute.String("http.route", route),
		attribute.String("http.response.status_code", strconv.Itoa(status)),
	)
	m.httpRequests.Add(ctx, 1, attributes)
	m.httpDuration.Record(ctx, float64(duration.Microseconds())/1000, attributes)
	if status >= 500 {
		m.httpErrors.Add(ctx, 1, attributes)
	}
}

func (m *Metrics) DatabaseQuery(ctx context.Context, duration time.Duration, failed bool) {
	if m == nil {
		return
	}
	m.databaseDuration.Record(ctx, float64(duration.Microseconds())/1000)
	if failed {
		m.databaseErrors.Add(ctx, 1)
	}
}

func (m *Metrics) AuthenticationFailure(ctx context.Context, reason string) {
	if m != nil {
		m.authFailures.Add(ctx, 1, metric.WithAttributes(attribute.String("reason", reason)))
	}
}
