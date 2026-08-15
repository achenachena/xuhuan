package battle

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"

	"github.com/achenachena/xuhuan/apps/api/internal/auth"
	"github.com/achenachena/xuhuan/apps/api/internal/character"
	"github.com/achenachena/xuhuan/apps/api/internal/player"
)

type CreateRepositoryInput struct {
	Player         player.Player
	Character      character.Character
	Encounter      character.Encounter
	Seed           string
	State          State
	IdempotencyKey string
	RequestHash    [sha256.Size]byte
}

type ApplyRepositoryInput struct {
	PlayerID        string
	BattleID        string
	Action          ActionKind
	ExpectedVersion int64
	IdempotencyKey  string
	RequestHash     [sha256.Size]byte
}

type Resolver func(Battle, ActionKind) (State, ActionResult, *Outcome, *Reward, error)

type Repository interface {
	Create(context.Context, CreateRepositoryInput) (Battle, bool, error)
	Get(context.Context, string, string) (Battle, error)
	Apply(context.Context, ApplyRepositoryInput, Resolver) (ActionResponse, bool, error)
}

type PlayerService interface {
	GetOrCreate(context.Context, auth.User) (player.Player, error)
}

type CatalogService interface {
	GetCharacter(context.Context, string) (character.Character, error)
	GetEncounter(context.Context, string) (character.Encounter, error)
}

type Service struct {
	repository Repository
	players    PlayerService
	catalog    CatalogService
}

func NewService(repository Repository, players PlayerService, catalog CatalogService) *Service {
	return &Service{repository: repository, players: players, catalog: catalog}
}

func (s *Service) Start(ctx context.Context, user auth.User, input StartInput) (Battle, bool, error) {
	if input.CharacterSlug == "" || input.EncounterSlug == "" || input.IdempotencyKey == "" {
		return Battle{}, false, ErrInvalidAction
	}
	currentPlayer, err := s.players.GetOrCreate(ctx, user)
	if err != nil {
		return Battle{}, false, err
	}
	selectedCharacter, err := s.catalog.GetCharacter(ctx, input.CharacterSlug)
	if err != nil {
		return Battle{}, false, err
	}
	selectedEncounter, err := s.catalog.GetEncounter(ctx, input.EncounterSlug)
	if err != nil {
		return Battle{}, false, err
	}
	seed, err := newSeed()
	if err != nil {
		return Battle{}, false, err
	}
	requestHash, err := hashRequest(struct {
		CharacterSlug string `json:"character_slug"`
		EncounterSlug string `json:"encounter_slug"`
	}{input.CharacterSlug, input.EncounterSlug})
	if err != nil {
		return Battle{}, false, err
	}
	return s.repository.Create(ctx, CreateRepositoryInput{
		Player: currentPlayer, Character: selectedCharacter, Encounter: selectedEncounter,
		Seed: seed, State: NewState(selectedCharacter, selectedEncounter, currentPlayer.Level),
		IdempotencyKey: input.IdempotencyKey, RequestHash: requestHash,
	})
}

func (s *Service) Get(ctx context.Context, user auth.User, battleID string) (Battle, error) {
	currentPlayer, err := s.players.GetOrCreate(ctx, user)
	if err != nil {
		return Battle{}, err
	}
	return s.repository.Get(ctx, currentPlayer.ID, battleID)
}

func (s *Service) Act(ctx context.Context, user auth.User, input ActionInput) (ActionResponse, bool, error) {
	if !validAction(input.Action) || input.ExpectedVersion < 1 || input.IdempotencyKey == "" {
		return ActionResponse{}, false, ErrInvalidAction
	}
	currentPlayer, err := s.players.GetOrCreate(ctx, user)
	if err != nil {
		return ActionResponse{}, false, err
	}
	requestHash, err := hashRequest(struct {
		Action          ActionKind `json:"action"`
		ExpectedVersion int64      `json:"expected_version"`
	}{input.Action, input.ExpectedVersion})
	if err != nil {
		return ActionResponse{}, false, err
	}
	return s.repository.Apply(ctx, ApplyRepositoryInput{
		PlayerID: currentPlayer.ID, BattleID: input.BattleID, Action: input.Action,
		ExpectedVersion: input.ExpectedVersion, IdempotencyKey: input.IdempotencyKey, RequestHash: requestHash,
	}, func(current Battle, action ActionKind) (State, ActionResult, *Outcome, *Reward, error) {
		return ResolveTurn(current.State, current.Seed, action, current.Encounter.Level)
	})
}

func newSeed() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func hashRequest(value any) ([sha256.Size]byte, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return [sha256.Size]byte{}, err
	}
	return sha256.Sum256(encoded), nil
}
