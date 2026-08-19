# 《虚环：仅一人在线》architecture

## Purpose

The product is a single-player, server-authoritative story card roguelite embedded in Telegram. The browser owns presentation and transient selection state. The Go API owns identity, content versions, map generation, shuffle order, combat resolution, story progression, unlocks, and run outcomes. PostgreSQL is the system of record; Redis is never authoritative.

The first content release is the prologue plus Nana's chapter, *No Sea at the Seventh Dock*. Six later chapters share the same versioned content and domain machinery.

## Target system

```text
Telegram WebView
  │ raw initData in X-Telegram-Init-Data
  ▼
Next.js 16 Mini App on Vercel
  │ HTTPS JSON REST (OpenAPI 3.1)
  ▼
Go modular monolith on arm64 AWS Lambda Function URL
  ├── embedded, versioned bilingual content bundle
  ├── pure deterministic combat/map/run engine
  ├── Neon PostgreSQL: identity, progression, runs, immutable commands
  ├── Upstash Redis: distributed fixed-window rate limits only
  └── CloudWatch: short-retention logs and infrastructure alarms
```

There is no VPC, NAT Gateway, API Gateway, load balancer, RDS, ElastiCache, queue, Kubernetes cluster, container service, or paid observability dependency. Exhausting a provider's free allowance reduces availability; it never triggers an automatic paid upgrade.

## Trust boundary and command flow

1. Telegram signs raw Mini App `initData`; the browser forwards it unchanged.
2. The API recomputes the Telegram HMAC, performs a constant-time comparison, checks `auth_date`, and resolves the internal player UUID.
3. `GET /v2/game` returns progression, the next pending story scene, and at most one active Run.
4. A client mutation includes an `Idempotency-Key` and `expected_version`. It never sends damage, draws, drops, random seeds, unlocks, or outcomes.
5. The repository selects the player-owned Run `FOR UPDATE`, checks the idempotency identity and expected version, then calls the pure domain resolver.
6. The transaction updates the authoritative snapshot, appends an immutable result snapshot to `run_commands`, applies progression flags/unlocks, and commits atomically.
7. A repeated identical key returns the stored response. A reused key with a different hash is rejected. A stale version causes the client to fetch the current Run.

Local `X-Dev-Auth` is possible only when `APP_ENV=development`, `DEV_AUTH_ENABLED=true`, and the configured token matches. Production configuration rejects development auth even if a token is accidentally supplied.

## Domain structure

```text
apps/api/internal/
  content/       embedded versioned JSON, indexes, reference/translation checks
  combat/        pure card, intent, status, route and distortion rules
  run/           deterministic map, phase machine, rewards, events and rest
  story/         represented by content scenes and progression choice policy
  progression/   unlocks, immutable choices, pending-scene calculation
  game/          authenticated orchestration across player/progression/run
  api/           V2 HTTP transport and request validation
  postgres/      pgx repositories and transaction boundaries
```

`combat` and `run` do not call databases, clocks, networks, or global random APIs. A Run contains its cryptographic server-generated seed, content version, and deterministic RNG cursor. The same initial snapshot and command sequence therefore produce the same result.

### Combat state

- Five-card opening draw, three bandwidth per turn, draw/discard/exhaust piles, ten-card hand cap.
- Up to two enemies with a visible intent index.
- Attack, defense, signal, and glitch cards with validated targets and effect parameters.
- Distortion threshold and desynchronization penalty; noise 3 lowers the threshold.
- Nana route completion is tracked once per turn and awards one beacon plus one draw.
- Noise levels change enemy composition, deck pollution, and distortion rules rather than only scaling health.

### Run phase machine

```text
map → combat → reward ┐
map → event ──────────┤→ map → … → boss → completed
map → rest ───────────┘
```

The seven-layer map is generated in full before play and records every edge. Selecting a node closes alternatives in the same layer. Failure or abandonment completes the Run and preserves story/unlocks while a new Run receives a fresh map and starter deck.

## Versioned content

`apps/api/internal/content/v1/bundle.json` contains characters, cards, enemies, intents, relics, events, scenes, and chapters. Go embeds it into the Lambda binary. Startup and CI reject duplicate slugs, missing translations, broken references, invalid rules, an incorrect seven-character roster, or a starter deck other than ten cards.

The V1 content budget is:

- 25 Nana-specific cards (including character glitches) and 8 common glitch cards;
- 10 channel plugins;
- 4 normal enemies, 2 elites, and 1 boss;
- 12 random/fixed events and 3 base story scenes;
- metadata for all seven character chapters, with Nana available.

`GET /v2/content/{version}?locale=...` returns a localized DTO with an immutable ETag and year-long cache. Active Runs keep `content_version`; a future V2 bundle is additive rather than an in-place rules mutation.

## PostgreSQL V2 model

| Table | Responsibility | Important constraints |
| --- | --- | --- |
| `players` | Telegram identity, language, and timestamps | unique `telegram_user_id BIGINT` |
| `player_progress` | chapter, highest noise, story flags/version | one row per player; optimistic version |
| `player_unlocks` | character/card/relic/starter-module unlocks | unique `(player, type, slug)` |
| `story_choices` | immutable base-story decisions and result snapshots | unique scene and idempotency identities; update/delete rejected |
| `runs` | seed, content version, phase/status and authoritative JSONB snapshot | partial unique index permits one active Run per player |
| `run_commands` | immutable command/result history | unique sequence and idempotency identity; expected/resulting version invariant |

Redis keys contain hashed identities and rate-limit counters only. Losing Redis does not lose game state; the API falls back to a bounded in-process limiter.

## V2 REST surface

- `GET /v2/content/{version}?locale=...`
- `GET /v2/game`
- `POST /v2/runs`
- `GET /v2/runs/{id}`
- `POST /v2/runs/{id}/commands`
- `POST /v2/story/choices`

The command endpoint accepts `choose_node`, `play_card`, `end_turn`, `choose_card_reward`, `resolve_event`, `rest`, and `abandon_run`. OpenAPI is the transport contract and generates the TypeScript schema used by the Mini App.

## Mini App boundaries

`src/app/page.tsx` remains a Server Component and mounts one interactive `GameShell` boundary. Feature components are split into story chat, hub, map, combat, reward, event, rest, and result screens. The controller loads content and game state in parallel, stores no authoritative state in local storage, and replaces its snapshot only with server responses.

The map and battle layouts target a 320×568 viewport, observe Telegram safe-area insets, expose SVG nodes through keyboard roles, and keep all combat resources and enemy intents visible. Existing Telegram SDK, theme, audio, and character portrait integration remain available; no voice runtime or third-party game engine was added.

## Completed compatibility rollout

The release used an expand/contract sequence:

1. Migration 002 truncated legacy player/game data as a product decision, created V2 tables, and deployed the V2 endpoints and UI while retaining empty V1 tables/endpoints as a temporary Lambda rollback boundary.
2. The protected `Smoke Production V2` workflow passed in [run 32222594249](https://github.com/achenachena/xuhuan/actions/runs/32222594249). GitHub OIDC read the Telegram token directly from SSM, signed a clearly marked synthetic identity without logging the credential or raw init data, respected production rate limits, and exercised the complete authoritative journey through resume, boss clear, story choice, and noise unlock.
3. Migration 003 is the contract step. It removes V1 HTTP handlers, the legacy `battle` domain, seed data, presentation types, old tables, and the legacy gameplay columns on `players`.

The deploy workflow promotes a new Lambda binary that can read both the 002 and 003 schemas before applying the contract migration. Migrations run transactionally under an advisory lock. Once migration 003 succeeds, rollback to a binary that queries the V1 schema is intentionally disabled; any database issue is fixed forward.

## Verification

- Content tests enforce counts, translations, references, and starter deck invariants.
- Pure Go tests cover deterministic shuffle/map generation, target validity, route completion, distortion overflow, multi-enemy noise rules, and persistent relic effects.
- PostgreSQL integration tests cover migration idempotency, one active Run, story and command replay, conflicting keys/versions, row-lock competition, transaction rollback, and disconnect recovery.
- API contract tests validate localized content, immutable caching, auth, idempotency/version forwarding, and response schemas.
- Vitest covers pending story, Run creation, authoritative resume, and conflict resynchronization.
- Playwright owns the complete browser → API → PostgreSQL journey and the 320px viewport assertion.

## Observability and data handling

Every response has an `X-Request-ID`. Structured logs and metrics use route templates and bounded outcome/reason labels, never complete init data, bot tokens, database URLs, SQL arguments, or player/run identifiers. Optional OTLP export is fail-open and disabled in the free production plan. PostgreSQL gates readiness; Redis degradation does not.
