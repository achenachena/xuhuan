package observability

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

type databaseStartKey struct{}

// DatabaseTracer records only latency and success/failure. Query text and
// arguments are deliberately excluded because they can contain sensitive data.
type DatabaseTracer struct {
	Metrics *Metrics
}

func (t DatabaseTracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	return context.WithValue(ctx, databaseStartKey{}, time.Now())
}

func (t DatabaseTracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	started, ok := ctx.Value(databaseStartKey{}).(time.Time)
	if !ok {
		return
	}
	t.Metrics.DatabaseQuery(ctx, time.Since(started), data.Err != nil)
}
