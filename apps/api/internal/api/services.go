package api

import (
	"context"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/battle"
	"github.com/achenachena/xuhuan/apps/api/internal/character"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
)

// Services lists only the application operations used by the HTTP transport.
// Keeping transport-facing interfaces here decouples handlers from concrete
// implementations and makes new transports or decorators straightforward.
type Services struct {
	Players PlayerService
	Catalog CatalogService
	Battles BattleService
}

type PlayerService interface {
	GetOrCreate(context.Context, auth.User) (player.Player, error)
}

type CatalogService interface {
	ListCharacters(context.Context) ([]character.Character, error)
	GetCharacter(context.Context, string) (character.Character, error)
	ListEncounters(context.Context) ([]character.Encounter, error)
	GetEncounter(context.Context, string) (character.Encounter, error)
}

type BattleService interface {
	Start(context.Context, auth.User, battle.StartInput) (battle.Battle, bool, error)
	Get(context.Context, auth.User, string) (battle.Battle, error)
	Act(context.Context, auth.User, battle.ActionInput) (battle.ActionResponse, bool, error)
}
