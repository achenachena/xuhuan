# Go backend rebuild record

## Scope

The backend migration deliberately started from an empty PostgreSQL database. At migration time it preserved the existing Mini App, Vercel Blob assets, Chinese presentation, deterministic gameplay values, and useful catalog metadata. It did not import player identities, progression, battle runs, database IDs, or unsafe client-owned state. A later frontend maintenance pass upgraded the application to Next.js 16 and React 19 without changing the API contract.

The retired service is recoverable from Git history; no compatibility layer or parallel runtime is retained in the working tree.

## Baseline recorded on 2026-08-06

- Mini App build, lint, and typecheck passed with three existing `@next/next/no-img-element` warnings.
- The retired API build, lint, and typecheck passed before removal.
- Shared game-type build and typecheck passed.
- The baseline CI built and typechecked code but had no meaningful automated tests.
- All 14 character image URLs returned HTTP 200 with `image/png`.
- Seven characters and two encounters were copied into deterministic seed JSON; no player or battle data was copied.

The audit confirmed mismatched battle routes and payloads, client-selected randomness/outcomes/rewards, a client-writable progression endpoint, non-atomic completion, duplicate reward races, missing Telegram freshness validation, permissive CORS, static administrator credentials, and absent tests.

## Implemented API

The normative contract is `apps/api/openapi/openapi.yaml`.

| Method and path | Visibility | Purpose |
| --- | --- | --- |
| `GET /healthz` | Public | Process liveness |
| `GET /readyz` | Public | PostgreSQL readiness |
| `GET /v1/player` | Player | Get or create the authenticated profile |
| `GET /v1/characters` | Public | List playable characters |
| `GET /v1/characters/{slug}` | Public | Character detail |
| `GET /v1/encounters` | Public | List active encounters |
| `GET /v1/encounters/{slug}` | Public | Encounter detail |
| `POST /v1/battles` | Player | Debit energy and create a server-seeded battle |
| `GET /v1/battles/{id}` | Owner | Fetch authoritative battle state |
| `POST /v1/battles/{id}/actions` | Owner | Apply a versioned, idempotent action |

There is no client progression-write endpoint and no administrator HTTP surface.

## Persistence and consistency

`001_initial_schema.sql` creates `players`, `characters`, `encounters`, `battles`, `battle_actions`, `idempotency_records`, `player_ledger`, and `admin_audit_events`. Migrations start from an empty schema. Catalog seeds use deterministic slug-based upserts.

A battle action transaction:

1. Checks for an exact prior idempotent response.
2. Locks the player-owned battle.
3. Requires an active status and matching expected version.
4. Validates and resolves the server-owned action and random stream.
5. Appends the immutable action result and increments the version.
6. On completion, marks the battle and applies ledger/player rewards together.
7. Stores the replayable response and commits.

Uniqueness constraints prevent duplicate action identity and duplicate battle rewards. Rollback tests prove failed statements do not partially update the player or battle.

## Frontend integration

- OpenAPI generates the frontend transport types, with a freshness check that fails on drift.
- A central client resolves the configurable API URL, raw Telegram `initData`, explicit local token, error envelopes, and idempotency headers.
- SWR loads profile/catalog state; mutations start battles and submit versioned actions.
- The UI locks pending start/action controls, refreshes after conflicts, and animates only server responses.
- Bundled Chinese and English locale data keeps the game playable without an external locale host; a valid external bundle may override it.
- Theme, audio, layout, character selection, battle presentation, and reward modal remain presentation concerns.
- The post-migration Next.js 16 / React 19 upgrade retained the same server-authoritative data flow, moved remote character artwork to `next/image`, and added locale coverage for every seeded archetype.

## Test strategy and evidence

- Go unit tests cover Telegram validation/freshness, development-auth gating, damage bounds, criticals, block, counter, enemy choices, rewards, invalid actions, and state transitions.
- HTTP tests cover authentication, CORS, JSON content types, body limits, request IDs, stable errors, and rate limiting.
- Contract tests load and validate OpenAPI, then validate representative live response bodies against the declared schemas.
- PostgreSQL tests use a clean schema and cover migrations, repeatable seeds, player upsert, catalog reads, ownership, optimistic concurrency, action replay, rollback, atomic completion, ledger entries, and concurrent duplicate reward prevention.
- Redis tests cover atomic concurrent limits and bounded in-memory protection during an outage.
- Frontend tests cover transport headers/errors, SWR loading/errors, Telegram initialization, pending controls, duplicate suppression, and conflict refresh.
- Playwright drives a mobile browser through local authentication, selection, battle completion, server rewards, reload, and persisted progression.

## Local runtime

`Dockerfile` builds static API, migration, and seed binaries into a non-root Alpine runtime. `compose.yaml` starts PostgreSQL, ephemeral Redis, one-shot migration/seed jobs, and the healthy API. `Makefile` and `env.example` define the supported developer workflow. PostgreSQL is persistent; Redis is never authoritative.

## AWS preparation

Infrastructure code prepares an ECR repository, HTTPS load balancer, private ECS Fargate service, RDS PostgreSQL, ElastiCache, Secrets Manager references, SSM parameters, CloudWatch telemetry, least-privilege IAM, alarms, and separate staging/production inputs. CI uses GitHub OIDC and immutable image tags. Applying infrastructure remains an explicit owner action because it can create paid resources.

## Phase acceptance status

| Phase | Acceptance status |
| --- | --- |
| 0 — baseline/design | Baseline recorded; ten issues confirmed; assets checked; deterministic catalog seeds and OpenAPI added |
| 1 — Go foundation | Health/readiness, request IDs, errors, CORS, body limits, timeouts, logs, and graceful shutdown pass |
| 2 — PostgreSQL | Empty migration and repeatable seed pass against PostgreSQL 17 |
| 3 — authentication | Valid data passes; malformed, invalid, future, and stale data fail; local auth cannot run in production |
| 4 — read APIs | Explicit DTOs match OpenAPI and storage models remain internal |
| 5 — battles | Ownership, rules, versioning, replay, audit history, atomic rewards, and duplicate defenses pass |
| 6 — Mini App | The active game uses `/v1` only and server responses drive outcomes/progression |
| 7 — tests | Unit, integration, contract, frontend, and browser tests execute the required stories |
| 8 — local development | Compose builds/migrates/seeds/runs; a complete persisted browser battle passes |
| 9 — Redis | Atomic IP/player limits work; a live outage test proves bounded local fallback |
| 10 — retired-code removal | Old service, contracts, configuration, dependencies, and client battle engine removed |
| 11 — CI | Format/vet/race/integration/contract/frontend/E2E/container/security jobs are defined and locally validated |
| 12 — AWS files | Terraform and guarded deployment workflows pass static validation; no plan, apply, or deployment was run |
| 13 — asynchronous work | Intentionally deferred because no concrete feature justifies SQS or EventBridge |

## Post-migration frontend maintenance

- Upgraded the Mini App to Next.js 16.3 and React 19.2, along with the compatible lint and test toolchain.
- Replaced the remaining native remote character images with `next/image` and restricted optimization to the project's Vercel Blob path.
- Added the missing English and Simplified Chinese archetype labels and automated coverage for every supported archetype.
- Re-ran lint, unit tests, type checking, production build, browser E2E, container, and security checks. The production dependency audit reports no known vulnerabilities; the full development audit has the tool-only finding documented below.
- Connected `main` to Vercel production; the paid AWS API infrastructure remains unapplied.

## Remaining risks

- The two encounters have no bespoke artwork, so the UI intentionally uses its generated fallback.
- Integration and browser tests require Docker; Playwright also requires a Chromium install.
- Production Telegram launch cannot be exercised without a real bot token, although deterministic verifier fixtures cover the protocol.
- Account IDs, domains, certificates, sizing, budgets, and secret values require owner input before any infrastructure apply.
- The Mini App production deployment cannot provide a complete live battle flow until an HTTPS Go API endpoint and Telegram launch configuration are supplied.
- The full `npm audit` reports two high-severity development-tool findings through `openapi-typescript` → Redocly 1.x → `js-yaml`. The production-dependency audit is clean, type generation only parses the repository-controlled OpenAPI file, and `js-yaml` 5 is not API-compatible with Redocly 1.x; CI continues to block critical findings while awaiting a compatible upstream release.
