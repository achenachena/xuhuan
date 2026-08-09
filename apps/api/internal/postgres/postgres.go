package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Database struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string) (*Database, error) {
	return OpenWithTracer(ctx, databaseURL, nil)
}

func OpenWithTracer(ctx context.Context, databaseURL string, tracer pgx.QueryTracer) (*Database, error) {
	config, err := serverlessPoolConfig(databaseURL, tracer)
	if err != nil {
		return nil, err
	}
	return OpenConfig(ctx, config)
}

func serverlessPoolConfig(databaseURL string, tracer pgx.QueryTracer) (*pgxpool.Config, error) {
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, errors.New("parse DATABASE_URL: " + err.Error())
	}
	// Keep each Lambda execution environment small and allow serverless
	// PostgreSQL computes to suspend. A minimum connection would keep a free
	// scale-to-zero database awake while the Lambda environment is warm.
	config.MaxConns = 4
	config.MinConns = 0
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute
	config.HealthCheckPeriod = 30 * time.Second
	config.ConnConfig.Tracer = tracer
	return config, nil
}

func OpenConfig(ctx context.Context, config *pgxpool.Config) (*Database, error) {
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}
	database := &Database{pool: pool}
	if err := database.Check(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return database, nil
}

func (d *Database) Close() {
	d.pool.Close()
}

func (d *Database) Check(ctx context.Context) error {
	return d.pool.Ping(ctx)
}

// DataSummary returns fixed-table row counts for cutover safety checks. The
// table list is deliberately static so this maintenance operation cannot be
// used to execute arbitrary SQL.
func (d *Database) DataSummary(ctx context.Context) (map[string]int64, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT 'players', count(*)::bigint FROM players
		UNION ALL SELECT 'characters', count(*)::bigint FROM characters
		UNION ALL SELECT 'encounters', count(*)::bigint FROM encounters
		UNION ALL SELECT 'battles', count(*)::bigint FROM battles
		UNION ALL SELECT 'battle_actions', count(*)::bigint FROM battle_actions
		UNION ALL SELECT 'idempotency_records', count(*)::bigint FROM idempotency_records
		UNION ALL SELECT 'player_ledger', count(*)::bigint FROM player_ledger
		UNION ALL SELECT 'admin_audit_events', count(*)::bigint FROM admin_audit_events
	`)
	if err != nil {
		return nil, fmt.Errorf("query data summary: %w", err)
	}
	defer rows.Close()

	counts := make(map[string]int64, 8)
	for rows.Next() {
		var table string
		var count int64
		if err := rows.Scan(&table, &count); err != nil {
			return nil, fmt.Errorf("scan data summary: %w", err)
		}
		counts[table] = count
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read data summary: %w", err)
	}
	return counts, nil
}

func (d *Database) Pool() *pgxpool.Pool {
	return d.pool
}
