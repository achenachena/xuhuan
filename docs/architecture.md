# Xuhuan V3 architecture

## System intent

Xuhuan is a single-player, server-authoritative action story roguelite embedded in Telegram. The browser owns rendering, controls, audio, and local prediction. Go owns deterministic encounter replay, map generation, rewards, story projection, progression, daily scoring, and every durable outcome. PostgreSQL is the system of record; Redis is a fail-open distributed rate limiter and never stores game truth.

The public REST namespace is `/v2`. The current authored catalog is `v3`, and its deterministic rules contract is `action-v2`. These versions are intentionally independent:

- HTTP `v2` describes the stable resource and idempotency surface.
- Content `v3` identifies the immutable authored bundle used by a Run.
- Protocol `action-v2` identifies the simulation and command semantics required to replay that bundle.

## Target topology

```text
Telegram WebView
  -> Next.js 16 / React 19 on Vercel
      |  Canvas 2D prediction and presentation
      |  localized content fetched with immutable caching
      v
    HTTPS JSON + raw Telegram initData
      v
Go modular monolith on arm64 AWS Lambda
  |-- authentication, transport, idempotency, and rate limiting
  |-- deterministic action, run, map, story, and progression domains
  |-- embedded V3 manifest, shared catalog, chapters, and locales
  |-- Neon PostgreSQL: players, progression, runs, commands, and daily results
  `-- Upstash Redis: disposable rate-limit counters
```

The Lambda is exposed through a Function URL bound to a stable alias. There is no third-party game-engine runtime, WebSocket server, VPC, NAT Gateway, API Gateway, load balancer, queue, Kubernetes cluster, RDS, or ElastiCache dependency.

## Trust boundary and deterministic replay

1. Telegram signs raw Mini App `initData`; the browser forwards it unchanged.
2. The API validates the HMAC, timestamp, and Telegram identity before creating or loading a player.
3. `GET /v2/game` projects story state plus at most one active campaign Run and one active daily Run.
4. Entering a room stores the encounter slug, derived seed, objective, duration, hard Tick cap, risk, reward bias, and hazards in the Run snapshot.
5. The browser simulates at 30 Hz for responsive presentation and records only quantized direction, magnitude, and Warp presses.
6. Room completion submits one `rle8-v1` input trace under the global 64 KiB request limit. The client does not submit authoritative positions, damage, kills, drops, score, or outcomes.
7. Go decodes and replays the trace with fixed-point coordinates, seeded randomness, stable entity order, and hard entity limits. The replay result is authoritative; the browser sends no client-authored health, damage, reward, or prediction checksum.
8. PostgreSQL locks the player-owned Run, checks `expected_version` and `Idempotency-Key`, appends an immutable command result, writes the new JSONB snapshot, and commits atomically.

Malformed, oversized, non-canonical, or incomplete traces cannot advance a Run. Closing the WebView loses only predicted frames; reopening restarts the current room from the stored encounter seed.

## Domain layout

```text
apps/api/internal/
  action/        fixed-step simulation, traces, objectives, signals, protocols
  run/           map generation, phase machine, rewards, events, rest, daily mode
  content/       embedded V3 files, indexes, localization, reference validation
  story/         pending-scene projection and ending selection
  progression/   chapter state, unlocks, immutable choices, campaign metrics
  game/          authenticated application orchestration
  api/           HTTP v2 transport and localized response mapping
  postgres/      pgx repositories, row locks, migrations, daily results
  platform/      configuration, structured logging, and rate limiting
```

The `action` and `run` packages do not call databases, clocks, networks, or process-global random functions. Date selection for daily mode occurs in the application service; the resulting UTC date, seed, chapter, and character are stored before replay.

## `action-v2` simulation runtime

The logical arena is 360 by 640 units represented as integer tenths. The character moves from a full-screen relative joystick, attacks the nearest live enemy automatically, and uses Warp for displacement, 12 invulnerable Ticks, projectile clearing along the path, and damage.

Three fixed signal locations yield Surge, Guard, and Echo. Collecting three signals refreshes Warp and arms a protocol:

| Weave | Protocol | Authoritative effect |
| --- | --- | --- |
| At least two Surge | Surge Break | wide damaging Warp path |
| At least two Guard | Guard Aegis | shield, bullet clear, and invulnerability |
| At least two Echo | Echo Replay | damaging replay along the Warp path |
| One of each | Resonance | character-specific kit effect |

Grazing raises Distortion. At 60, automatic attacks gain an overclock bonus. At 100, the player takes 12 damage, hostile projectiles clear, and Distortion returns to 40, 45, 50, or 55 according to Noise. Distortion decays after the player stops grazing.

Enemy definitions compose movement (`chase`, `orbit`, `strafe`, `charge`, `flee`, `stationary`, or `wander`), attacks, and traits. Encounters add one of six objectives plus optional narrow-arena, distortion-rain, signal-decay, or crossfire hazards. The runtime caps enemies, hostile projectiles, player projectiles, pickups, and effects at the values declared in the V3 manifest.

## Run and campaign state

A campaign map is generated before play. Its six layers combine combat, an event or alternate combat route, elite versus rest, a midpoint story event, another combat choice, and a boss. Selecting a node locks its sibling in the same layer. The first chapter prepends the tutorial encounter. Noise 2 narrows route connectivity; Noise 3 replaces the rest branch with an elite.

After a non-boss encounter, the server offers up to three modules. Each Run starts with one reroll; effects can grant more. A Run holds no more than six module slugs, and each module applies three cumulative authored levels. Elite completion also grants one eligible plugin. Rest either repairs 30 percent of maximum health or advances one owned module level.

Campaign completion updates the chapter's clear count, best score, and highest unlocked Noise level, then advances to the next chapter and unlocks its character. Seven character chapters unlock the Zero Channel finale. Finale completion records one of three endings from cumulative Authenticity and Retention and unlocks daily mode.

Daily mode derives a stable seed from the UTC date, rotates through the seven character chapters, and uses a three-room combat -> elite -> boss map. The best result for a player/date retains its score and build snapshot, while consecutive UTC-day clears form a streak. A public share reuses the completed daily Run UUID already present in the result screen. No share record, token, mutation, cleanup task, or additional database write exists. The public endpoint returns only the anonymous best result for that Run's player and UTC date, and successful reads may be cached for five minutes.

## Versioned content

The `apps/api/internal/content/v3/` tree contains:

```text
manifest.json             v3/action-v2 identity, locales, chapter order, caps
shared.json               7 characters, 7 kits, 68 modules, 20 plugins
chapters/*.json           7 character chapters plus the Zero Channel finale
locales/en.json           620 English strings
locales/zh-CN.json        the same 620 keys in Simplified Chinese
```

Loading uses strict JSON decoding and rejects unknown fields, duplicate slugs, locale-key drift, missing text, undeclared asset URLs, invalid enum values, invalid effects, broken content references, incorrect chapter succession, or the wrong fixed counts. CI additionally requires exact parity between the immutable asset manifest and the public V3 WebP tree. The assembled bundle contains 36 enemies, 47 encounters, 28 events, and 34 story scenes.

See [content-authoring.md](content-authoring.md) for the authoring contract. Released content versions must not be edited in place because active Runs retain their `content_version` and seeds.

## PostgreSQL model after V3 migration

| Table | Responsibility | Important constraints |
| --- | --- | --- |
| `players` | Telegram user ID, language, and timestamps | unique Telegram user; retained across V3 reset; no names or profile data |
| `player_campaign_progress` | current chapter, story flags/version, three metrics, ending, daily unlock | one row per player; optimistic version |
| `player_chapter_progress` | per-chapter Noise, clears, and best score | unique player/chapter |
| `player_unlocks` | character, module, plugin, and starter-module unlocks | unique player/type/slug |
| `story_choices` | immutable scene revisions and metric deltas | unique player/scene/revision; direct update/delete rejected |
| `runs` | content version, mode/date, status, seed, and JSONB snapshot | one active Run per player and mode |
| `run_commands` | immutable route, trace, reward, event, rest, and reroll history | unique sequence and idempotency identity |
| `daily_results` | best score, build, and streak for a UTC day | unique player/date and Run |
| `schema_migrations` | ordered migration history | unique numeric version |

Migration `005_action_v3_prepare.sql` preserves `players` but deletes all prior game truth, creates V3 progression and daily state, and permits separate campaign/daily active Runs. After the promoted V3 stack passes its signed smoke journey, migration `006_remove_action_v2.sql` removes the now-unused legacy gameplay tables and Telegram profile-name columns. Both migration files remain permanently in history.

## HTTP surface

Public endpoints:

- `GET /healthz`
- `GET /readyz`
- `GET /v2/content/v3?locale=en|zh-CN`
- `GET /v2/daily/results/{run-id}`

Telegram-authenticated endpoints:

- `GET /v2/game`
- `POST /v2/runs`
- `GET /v2/runs/{id}`
- `POST /v2/runs/{id}/commands`
- `POST /v2/story/choices`

Run commands are `choose_node`, `complete_encounter`, `choose_module_reward`, `reroll_module_reward`, `resolve_event`, `rest`, and `abandon_run`. Mutations are idempotent; state-dependent writes are version checked. Content responses are localized, ETagged, and immutable-cacheable.

## Mini App boundaries

The App Router page remains a Server Component and mounts a small client boundary. The Canvas runtime owns high-frequency mutable entities outside React; React receives lower-frequency HUD snapshots, story, map, reward, and phase transitions. Content and player state can load in parallel, but no browser cache is authoritative.

The interface targets a 320 by 568 portrait viewport, Telegram safe areas, pointer capture, `touch-action: none`, capped device-pixel ratio, and visibility pause. Assets are local under `apps/miniapp/public/game/v3/`; no third-party game runtime is required.

## Release and operational boundaries

Production uses one protected exact-SHA workflow and rejects stale ancestors of the current `main` HEAD. It stages a production-mode Vercel build without domains, verifies its rendered V3/action-v2 marker, checks an immutable Lambda version, promotes the exact staged frontend, and confirms that the linked production domain serves that artifact. It then sets Lambda concurrency to zero, applies the V3 preparation migration, verifies the runtime database URL sees that boundary, switches the alias, restores bounded concurrency, verifies `healthz`/`readyz` and `v3`/`action-v2`, and runs a signed Telegram journey. The same ephemeral signed launch data is injected through a minimal Telegram bridge into headless Chrome so the promoted frontend itself must boot, authenticate its game snapshot, and perform a localized UI/API refresh. During the API cutover, the already-promoted V3 frontend keeps the player in its connection-safe retry state instead of issuing legacy commands. The smoke refuses any pre-existing synthetic Telegram ID; an always-running, identity-scoped cleanup removes only the synthetic player and its cascading game records after any attempted journey. The legacy schema contracts only after both smoke and cleanup pass. See [action-v3-release.md](action-v3-release.md).

Responses carry `X-Request-ID`. Structured logs use route templates and bounded reason labels, never raw init data, credentials, database URLs, SQL arguments, full traces, or player/run identifiers. PostgreSQL gates readiness. Redis failures fall back to a bounded in-process limiter. AWS-native Lambda and CloudWatch signals cover production health without an unused application telemetry exporter.

## Identity and dependency policy

Production player identity comes only from Telegram Mini App `initData`; the project has no paid authentication provider, JWT/session service, payment integration, or cookie-based login. `APP_ENV=development` enables one fixed synthetic player for credential-free local and browser E2E requests. Test and production environments never enable that fallback, and it has no request header or public OpenAPI surface. New identity services, capability-token tables, or cryptographic layers require a concrete product or correctness need rather than speculative future use.
