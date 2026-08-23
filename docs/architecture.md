# 《虚环：仅一人在线》architecture

## Purpose

The product is a single-player, server-authoritative action story roguelite embedded in Telegram. The browser owns rendering, transient controls, and local prediction. Go owns encounter replay, damage, drops, map generation, story progression, unlocks, and outcomes. PostgreSQL is the system of record; Redis is only a disposable distributed rate limiter.

The first release contains the prologue and Nana's full chapter, *No Sea at the Seventh Dock*. Six later character chapters reuse the same content and domain machinery.

## Target system

```text
Telegram WebView
  └─ Next.js 16 / React 19 on Vercel
       ├─ Canvas 2D: 30Hz prediction + 60Hz rendering
       └─ HTTPS JSON REST + signed Telegram initData
            └─ Go modular monolith on arm64 AWS Lambda
                 ├─ deterministic action/map/run engines
                 ├─ embedded bilingual V2 content
                 ├─ Neon PostgreSQL: authoritative state and history
                 └─ Upstash Redis: rate-limit counters only
```

There is no game engine, WebSocket server, VPC, NAT Gateway, API Gateway, RDS, ElastiCache, queue, Kubernetes cluster, or paid observability dependency.

## Trust boundary and room replay

1. Telegram signs raw Mini App `initData`; the browser forwards it unchanged.
2. The API verifies the HMAC, timestamp, and internal player identity.
3. `GET /v2/game` returns story progress and at most one active Run.
4. Entering a node stores an encounter slug, seed, duration, and trace limit in the Run.
5. The browser simulates locally but records only quantized direction, magnitude, and Warp presses.
6. On room completion it submits one `rle8-v1` trace. It never submits damage, positions, kills, drops, or outcomes.
7. Go validates and replays at a fixed 30Hz with fixed-point coordinates and stable entity order.
8. PostgreSQL locks the player-owned Run `FOR UPDATE`, checks `expected_version` and `Idempotency-Key`, writes the new JSONB snapshot plus immutable command result, and commits atomically.

The worst-case 2,700-Tick trace remains below the 64KB request limit. A malformed, oversized, incomplete, or digest-mismatched trace cannot advance the Run. Closing the WebView discards only local frames; reopening restarts the same room seed.

## Domain structure

```text
apps/api/internal/
  action/        fixed-step physics, enemies, projectiles, route, distortion, trace codec
  content/       embedded V2 JSON and reference/translation validation
  run/           map, phase machine, encounters, modules, plugins, events, rest
  story/         pending authored scene policy
  progression/   unlocks, immutable choices, one-time flags
  game/          authenticated application orchestration
  api/           V2 HTTP transport and OpenAPI mapping
  postgres/      pgx repositories and transaction boundaries
```

`action` and `run` do not call databases, clocks, networks, or global random APIs. TypeScript mirrors the action rules for responsive rendering and consumes a permanent Go-generated conformance vector in Vitest.

### Encounter rules

- The arena uses a 360×640 logical viewport represented as integer tenths.
- A full-screen relative joystick controls movement; automatic attacks select the nearest live enemy.
- Warp provides a short dash and 12 invulnerable Ticks. Its base cooldown is 240 Ticks.
- Three ordered beacons complete a route, refresh Warp, and empower its damaging wake.
- Hostile shots expose a charge line or area before firing. Boss phase one uses scripted volleys, phase two copies the dominant route/distortion/echo build, and phase three loses control into radial barrages.
- Grazing hostile projectiles raises distortion. At 60, attacks overclock; at 100, the player loses health, hostile bullets clear, and distortion returns to 40–55 depending on noise.
- The first account-wide death can trigger Emergency Reconnect: 40% health, bullet clear, and a one-time progression flag.
- Entity and projectile caps bound CPU and memory in both implementations.

### Run phase machine

```text
one-tap prologue → tutorial encounter → module reward → map
map → encounter → reward ┐
map → event ─────────────┤→ map → story → boss → completed
map → rest ──────────────┘
```

The full route is generated before play. Selecting a node locks alternatives in the same layer. A Run carries at most six module types at levels one through three. Elite encounters grant one channel plugin. Rest offers either 30% healing or one module level.

Noise 1–3 changes firing cadence, telegraph time, distortion pressure, route connectivity, and eventually removes the rest branch; health scaling is not the sole difficulty control.

## Versioned content

`apps/api/internal/content/v2/bundle.json` contains seven characters, 32 modules, 10 plugins, 8 enemies, 7 encounter definitions, 12 events, 3 story scenes, and chapter metadata. Startup and CI reject duplicate slugs, missing translations, unsupported action patterns, invalid effects, and broken references.

`GET /v2/content/v2?locale=...` returns a localized `action-v1` manifest with immutable caching. Runs retain `content_version`, although this forward-only launch resets all card-era data.

## PostgreSQL model

| Table | Responsibility | Important constraints |
| --- | --- | --- |
| `players` | Telegram identity and timestamps | unique Telegram user |
| `player_progress` | chapter, noise, story and one-time action flags | one row/player; optimistic version |
| `player_unlocks` | character/module/plugin/starter-module unlocks | unique type and slug |
| `story_choices` | immutable decisions and result snapshots | update/delete rejected |
| `runs` | seed, content version, status and JSONB action snapshot | one active Run/player |
| `run_commands` | immutable route, trace, reward and event history | unique sequence and idempotency identity |

Migration `004_action_roguelite.sql` intentionally truncates player-owned data and replaces the card-era constraints. It is forward-only.

## V2 REST surface

- `GET /v2/content/{version}?locale=...`
- `GET /v2/game`
- `POST /v2/runs`
- `GET /v2/runs/{id}`
- `POST /v2/runs/{id}/commands`
- `POST /v2/story/choices`

Commands are `choose_node`, `complete_encounter`, `choose_module_reward`, `resolve_event`, `rest`, and `abandon_run`. Every mutation is versioned and idempotent.

## Mini App boundaries

`page.tsx` remains a Server Component and mounts one `GameShell` Client boundary. The Canvas runtime owns mutable entities outside React; React receives low-frequency HUD snapshots and phase transitions only. Content and game state load in parallel, and no browser storage is authoritative.

The UI targets 320×568, Telegram safe areas, pointer capture, `touch-action: none`, capped device-pixel ratio, and visibility pause. Existing Telegram theme, audio, and portrait integration remain; no third-party game runtime was added.

## Verification

- Go covers trace validation, deterministic physics, collision, Warp, route, distortion, enemy behavior, reconnect, map/reward rules, and a complete smoke autopilot for every encounter.
- Vitest consumes a shared Go/TypeScript digest vector and covers story/start/resume/version-conflict behavior.
- PostgreSQL tests cover migrations, one active Run, row locks, idempotency replay, version conflicts, rollback, and recovery.
- API tests validate the OpenAPI 3.1 response contract, localization, authentication, and immutable caching.
- Playwright exercises one-tap onboarding, real pointer input, room restart after reload, authoritative Boss completion, story settlement, noise unlock, and the 320px viewport.
- Production smoke signs a synthetic Telegram identity from the SSM-provided bot token and replays complete action traces without logging credentials or raw init data.

## Observability and data handling

Responses carry `X-Request-ID`. Logs and metrics use route templates and bounded reason labels, never init data, bot tokens, database URLs, SQL arguments, full traces, or player/run identifiers. PostgreSQL gates readiness; Redis degradation falls back to a bounded in-process limiter.
