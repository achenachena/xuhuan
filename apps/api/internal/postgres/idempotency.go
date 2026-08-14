package postgres

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/achenachena/xuhuan/apps/api/internal/battle"
	"github.com/jackc/pgx/v5"
)

func readStoredResponse[T any](ctx context.Context, tx pgx.Tx, playerID, operation, key string, requestHash []byte) (T, bool, error) {
	var zero T
	var storedHash []byte
	var responseBody []byte
	var replayable bool
	err := tx.QueryRow(ctx, `
		SELECT request_hash, response_body, expires_at > now() FROM idempotency_records
		WHERE player_id = $1::uuid AND operation = $2 AND idempotency_key = $3`,
		playerID, operation, key,
	).Scan(&storedHash, &responseBody, &replayable)
	if errors.Is(err, pgx.ErrNoRows) {
		return zero, false, nil
	}
	if err != nil {
		return zero, false, err
	}
	// Keys stay reserved after the replay window closes. This matches the
	// ledger's permanent uniqueness guarantee and prevents a second mutation.
	if !replayable || !bytes.Equal(storedHash, requestHash) {
		return zero, false, battle.ErrIdempotencyConflict
	}
	if err := json.Unmarshal(responseBody, &zero); err != nil {
		return zero, false, fmt.Errorf("decode stored idempotency response: %w", err)
	}
	return zero, true, nil
}

func storeResponse(ctx context.Context, tx pgx.Tx, playerID, operation, key string, requestHash []byte, status int, response any) error {
	responseJSON, err := json.Marshal(response)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO idempotency_records (player_id, operation, idempotency_key, request_hash, response_status, response_body)
		VALUES ($1::uuid, $2, $3, $4, $5, $6)`, playerID, operation, key, requestHash, status, responseJSON)
	return err
}
