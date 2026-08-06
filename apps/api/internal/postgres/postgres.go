package postgres

import (
	"context"
	"errors"
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
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, errors.New("parse DATABASE_URL: " + err.Error())
	}
	config.MaxConns = 10
	config.MinConns = 1
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute
	config.HealthCheckPeriod = 30 * time.Second
	config.ConnConfig.Tracer = tracer
	return OpenConfig(ctx, config)
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

func (d *Database) Pool() *pgxpool.Pool {
	return d.pool
}
