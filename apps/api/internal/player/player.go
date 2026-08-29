package player

import (
	"context"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
)

type Player struct {
	ID string
}

type Repository interface {
	GetOrCreate(context.Context, auth.User) (Player, error)
}
