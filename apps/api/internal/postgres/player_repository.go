package postgres

import (
	"context"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
)

type PlayerRepository struct {
	database *Database
}

func NewPlayerRepository(database *Database) *PlayerRepository {
	return &PlayerRepository{database: database}
}

func (r *PlayerRepository) GetOrCreate(ctx context.Context, user auth.User) (player.Player, error) {
	row := r.database.pool.QueryRow(ctx, `
		INSERT INTO players (telegram_user_id, username, first_name, last_name, language_code)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (telegram_user_id) DO UPDATE SET
			username = EXCLUDED.username,
			first_name = EXCLUDED.first_name,
			last_name = EXCLUDED.last_name,
			language_code = EXCLUDED.language_code,
			updated_at = now()
		RETURNING id::text, telegram_user_id, username, first_name, last_name, language_code,
			level, experience, credits, energy, version, created_at, updated_at`,
		user.ID, nullIfEmpty(user.Username), nullIfEmpty(user.FirstName), nullIfEmpty(user.LastName), nullIfEmpty(user.LanguageCode),
	)
	return scanPlayer(row)
}

type playerRow interface {
	Scan(...any) error
}

func scanPlayer(row playerRow) (player.Player, error) {
	var result player.Player
	err := row.Scan(
		&result.ID, &result.TelegramUserID, &result.Username, &result.FirstName, &result.LastName,
		&result.LanguageCode, &result.Level, &result.Experience, &result.Credits, &result.Energy,
		&result.Version, &result.CreatedAt, &result.UpdatedAt,
	)
	return result, err
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}
