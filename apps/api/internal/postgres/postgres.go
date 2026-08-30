package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Database struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string) (*Database, error) {
	config, err := serverlessPoolConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	return OpenConfig(ctx, config)
}

func serverlessPoolConfig(databaseURL string) (*pgxpool.Config, error) {
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		// pgx parse errors can contain credentials from the connection URL.
		return nil, errors.New("parse DATABASE_URL")
	}
	// Keep each Lambda execution environment small and allow serverless
	// PostgreSQL computes to suspend. A minimum connection would keep a free
	// scale-to-zero database awake while the Lambda environment is warm.
	config.MaxConns = 4
	config.MinConns = 0
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute
	config.HealthCheckPeriod = 30 * time.Second
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
