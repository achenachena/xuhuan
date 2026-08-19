package api

import (
	"context"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/game"
	"github.com/achenachena/xuhuan/apps/api/internal/progression"
	gameRun "github.com/achenachena/xuhuan/apps/api/internal/run"
)

// GameService is the transport-facing V2 application boundary.
type GameService interface {
	Catalog() *gamecontent.Catalog
	Get(context.Context, auth.User) (game.Snapshot, error)
	Start(context.Context, auth.User, game.StartInput) (gameRun.GameRun, bool, error)
	GetRun(context.Context, auth.User, string) (gameRun.GameRun, error)
	Command(context.Context, auth.User, game.CommandInput) (gameRun.CommandResponse, bool, error)
	ChooseStory(context.Context, auth.User, game.StoryChoiceInput) (progression.Progress, bool, error)
}
