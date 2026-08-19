package player

import (
	"context"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
)

type Player struct {
	ID             string
	TelegramUserID int64
	Username       *string
	FirstName      *string
	LastName       *string
	LanguageCode   *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type Repository interface {
	GetOrCreate(context.Context, auth.User) (Player, error)
}
