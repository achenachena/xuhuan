package postgres

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// inTransaction centralizes commit and rollback semantics for repository
// operations. Callers only describe the atomic work they need to perform.
func (d *Database) inTransaction(ctx context.Context, operation func(pgx.Tx) error) (err error) {
	tx, err := d.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := operation(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
