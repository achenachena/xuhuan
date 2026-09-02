# Resume Handoff: Xuhuan — Server-Authoritative Telegram Mini Game

Last verified: September 2, 2026

## Purpose of this document

This is a fact-checked handoff for an agent helping Mingchen Liang tailor a resume for software development engineer roles in Canada. Treat it as engineering evidence, not product marketing. The project is a production-deployed personal portfolio project with deliberately small operating costs; it does not claim commercial traffic, high QPS, or a large player base.

Repository: [github.com/achenachena/xuhuan](https://github.com/achenachena/xuhuan)  
Public portfolio: [xuhuan-miniapp.vercel.app](https://xuhuan-miniapp.vercel.app/)  
Playable browser demo: [xuhuan-miniapp.vercel.app/demo](https://xuhuan-miniapp.vercel.app/demo)  
Full Telegram game: [@xuhuangamebot](https://t.me/xuhuangamebot)

## Candidate and resume context

- Target roles: backend SDE, general SDE, and distributed-systems-oriented roles in Canada.
- Strongest existing experience: four years of production backend work in Go and C++, microservices, SQL, Redis, reliability, and delivery ownership.
- Role of this project on the resume: demonstrate current hands-on engineering, end-to-end ownership, modern cloud delivery, and system-design judgment during a recent career break and M.Sc. period.
- Recommended emphasis: backend correctness, deterministic execution, transaction design, API contracts, CI/CD, production deployment, and pragmatic cost control.
- Secondary emphasis: Next.js/TypeScript, Canvas rendering, mobile input, bilingual content, and game design.
- Do not lead with the fan theme. Lead with the engineering system and mention the Telegram game format as the product context.

## One-sentence project description

Xuhuan is a production-deployed, bilingual Telegram Mini App shooter with a server-authoritative 30 Hz simulation, a Go backend on AWS Lambda, a Next.js/Canvas frontend on Vercel, and retry-safe progression stored in PostgreSQL.

The same production origin also serves a recruiter-facing engineering portfolio and a 60-second anonymous browser demo. The showcase reuses the production TypeScript simulation and assets, while its resolved fixed configurations are generated from the canonical Go content catalog. It requires no login, creates no user record, and sends no game-state mutation.

## Product scope

The current V4 release is a one-thumb portrait shooter designed around Telegram WebView constraints:

- direct horizontal drag control with no acceleration, inertia, vertical movement, or second joystick;
- automatic straight-up fire and one charged character special;
- seven character chapters plus an ensemble finale;
- 24 normal combat segments, eight boss rooms, and 24 scripted boss stages;
- 12 one-level show effects, seven character specials, seven companions, and six composable enemy chassis;
- three explicit finale endings and a deterministic Daily Aftershow mode;
- English as the default locale with complete Simplified Chinese support; and
- local pixel-art assets, sound effects, Telegram safe-area handling, haptics, and combat-only gesture locking.

The game intentionally avoids payment, energy, shops, paid progression, global leaderboards, and account systems outside Telegram.

## Architecture

```text
Telegram Mini App
  -> Next.js 16 / React 19 / TypeScript / Canvas 2D on Vercel
      -> HTTPS JSON and raw Telegram initData
          -> Go / Chi modular monolith on arm64 AWS Lambda Function URL
              -> Neon PostgreSQL for authoritative durable state
              -> Upstash Redis for disposable rate-limit counters only
```

The production topology deliberately avoids a VPC, NAT Gateway, API Gateway, load balancer, RDS, ElastiCache, container cluster, queue, paid identity provider, and paid observability platform. Terraform manages Lambda, least-privilege IAM, SSM parameters, CloudWatch alarms, and the stable Lambda alias. This keeps the project within free-plan constraints without replacing PostgreSQL transactions or Redis-based distributed rate limiting.

## Most important engineering work

### 1. Deterministic server-authoritative simulation

- The simulation advances at a fixed 30 Hz with integer coordinates in a `3600 x 6400` logical arena.
- The browser predicts locally for responsive rendering but never submits health, damage, kills, pickups, score, rewards, or progression.
- The client records horizontal position and special-button state as a bounded `x-position-rle-v1` JSON trace and sends one trace after each room instead of sending per-frame requests.
- Go decodes and replays the complete room from its stored seed, then alone decides the authoritative result.
- The same seed and input trace produce the same canonical state. Go-generated golden vectors verify the TypeScript prediction implementation.
- Trace decoding is fuzz-tested for malformed control values, zero-length runs, incorrect total Tick counts, oversized payloads, and invalid tuple shapes.

Resume value: deterministic systems, input validation, client prediction versus server authority, bandwidth-aware protocol design, and cross-language contract testing.

### 2. Transactional, retry-safe game state

- PostgreSQL is the source of truth for players, campaign progress, chapter progress, story revisions, active Runs, immutable command history, and Daily results.
- Each state-changing command includes the player-owned Run UUID, an expected Run version, and an idempotency key.
- The repository locks the Run row, checks ownership and optimistic version, replays or applies the command, appends its result, and commits the Run snapshot plus progression changes in one transaction.
- Retried commands return the stored result instead of applying the action twice; stale clients receive a version conflict and reload authoritative state.
- Database constraints permit at most one active campaign Run and one active Daily Run per player.
- Story choices are append-only revisions; the latest revision changes the current projection without deleting history.

Resume value: PostgreSQL transactions, row locking, optimistic concurrency, idempotency, immutable audit history, ownership boundaries, and failure recovery.

### 3. Versioned content and API contracts

- `/v2` is the stable REST namespace, `v4` identifies the immutable content bundle, and `shooter-v1` identifies replay semantics.
- OpenAPI 3.1 defines the REST contract, authentication header, command union, error envelope, content schema, and health/readiness endpoints.
- `openapi-typescript` generates frontend types, and CI rejects a stale generated contract.
- The Go binary embeds versioned JSON for the manifest, shared behaviors, eight chapters, Daily mode, and both locales.
- Startup and CI fail closed on missing translations, unknown fields, invalid references, missing boss stages, asset mismatches, unreachable content, or entity limits above the mobile runtime contract.
- English and Simplified Chinese locale key sets must match exactly.

Resume value: schema-first API development, compatibility boundaries, content validation, localization correctness, and safe evolution of persisted state.

### 4. Production identity and security boundaries

- Production identity is verified exclusively through Telegram Mini App `initData` HMAC verification and authentication-age checks.
- All Run and progression access is scoped to the verified Telegram owner.
- The API includes request-size limits, CORS allowlisting, security headers, bounded error envelopes, request IDs, and rate limiting before and after authentication as appropriate.
- Redis rate limiting is fail-open for availability while retaining in-process protection; Redis never stores authoritative game state.
- Runtime database, Redis, and Telegram credentials remain in AWS SSM `SecureString` parameters.
- GitHub deploys to AWS using short-lived OIDC credentials and a least-privilege production role.
- The project intentionally has no JWT/session system, paid authentication, payment integration, capability-token table, share-token table, or second identity provider.

Resume value: authentication at a real platform trust boundary, least privilege, secret management, secure defaults, and avoiding unnecessary security infrastructure.

### 5. Exact-version CI/CD and forward-only releases

- Pull requests run Go formatting, `go vet`, race-enabled tests, PostgreSQL/Redis integration tests, frontend tests, lint, type checking, production builds, OpenAPI drift checks, content/asset validation, Terraform validation, browser-to-database Playwright tests, CodeQL, `govulncheck`, npm audit, and Trivy container scanning.
- The protected production workflow accepts one full `main` commit SHA, requires CI success for that exact SHA, and rebuilds the release gates.
- It creates an immutable Vercel production candidate and immutable Lambda version before promoting either stable production reference.
- It verifies the frontend/backend `v4` and `shooter-v1` handshake, CORS, health, readiness, both locales, the complete content catalog, and database migration boundary.
- Production smoke creates a disposable signed Telegram player, traverses all eight chapters, all three endings, and Daily mode, verifies idempotent replay and durable story revisions, then deletes the synthetic player and cascading records.
- Migrations 007 and 008 implemented a forward-only V4 cutover: prepare and reset game progress first, remove retired V3 columns only after production smoke succeeds.

Resume value: immutable releases, exact-artifact promotion, safe schema migration, production smoke testing, security scanning, and operational ownership.

## Verified evidence

The following facts were rechecked on September 2, 2026:

- the public Mini App returned HTTP 200 and exposed the `CONTENT-V4 / SHOOTER-V1` release marker;
- `/healthz` returned HTTP 200 with production commit `e5adf3f1f79ddc1b6bea9d79df1b99104ab7260e`;
- `/readyz` returned HTTP 200 with status `ready`;
- the public content endpoint returned `v4`, `shooter-v1`, eight chapters, 24 normal segments, and eight bosses;
- the latest protected production workflow completed successfully;
- the signed production journey reported all eight chapter IDs, all three ending IDs, persisted Daily results, idempotent replay, and story revision success;
- the production browser smoke verified hold-to-move, ignored vertical displacement, immediate stop on release, safe repeated downward drags, in-arena choices, boss completion, and locale switching;
- 96 named Go test or fuzz functions exist across unit, contract, integration, replay, migration, authentication, and release-smoke packages;
- all 48 Vitest tests in 14 frontend test files passed locally; and
- all Go packages passed locally on the current `main` commit.

These are implementation and test metrics, not user-adoption metrics.

## Recommended resume entry

### Project title and technology line

**Xuhuan — Server-Authoritative Telegram Mini Game** | GitHub | Live Demo  
*Go, TypeScript, Next.js, React, PostgreSQL, Redis, AWS Lambda, Terraform, Docker, GitHub Actions, Playwright*

### Recommended three bullets

- Built and deployed a bilingual, server-authoritative Telegram Mini App with a Go API on AWS Lambda and a Next.js/Canvas frontend on Vercel, delivering an eight-chapter campaign with 32 deterministic combat rooms.
- Designed a fixed-step 30 Hz replay engine that compresses player input into one bounded trace per room; the browser predicts responsively while Go replays the same seed and remains authoritative for combat, rewards, and progression.
- Implemented retry-safe state transitions with PostgreSQL row locks, optimistic versioning, idempotent commands, and immutable command history; automated race-enabled, integration, OpenAPI, Playwright, security, Terraform, and exact-SHA production release checks in GitHub Actions.

### More backend-focused alternative

- Engineered a Go server-authoritative simulation and REST API for a production Telegram game, replaying deterministic 30 Hz input traces on AWS Lambda instead of trusting client-computed combat results.
- Built transactional PostgreSQL repositories using row locks, optimistic concurrency, idempotency keys, immutable command history, and atomic campaign/story progression; used Redis only for distributed rate limiting.
- Created an exact-commit CI/CD pipeline that promotes immutable Vercel and Lambda artifacts, sequences forward-only database migrations, and validates eight chapters, three endings, Daily mode, and browser-to-database recovery flows before release.

Use one set, not both. The first set is better for general SDE roles; the second is better for backend or platform roles.

## ATS and recruiter keywords supported by the implementation

Use only where natural:

- Go, TypeScript, React, Next.js, REST API, OpenAPI
- PostgreSQL, SQL transactions, row-level locking, optimistic concurrency, idempotency
- Redis, distributed rate limiting, fail-open design
- AWS Lambda, serverless, IAM, SSM, CloudWatch, Terraform
- deterministic simulation, fixed-step processing, client prediction, server authority
- CI/CD, GitHub Actions, Docker, Playwright, Vitest, race detector
- CodeQL, Trivy, dependency scanning, least privilege
- localization, content validation, schema evolution, zero-downtime or forward-only migration

Avoid inserting “microservices,” “Kubernetes,” “high throughput,” or “large scale” into this project entry. Those terms are not needed to make the project strong and are not supported by its current production workload.

## Strong interview narratives

### Determinism and trust

Explain why a browser game cannot be authoritative over damage or rewards. Walk through input capture, RLE compression, stored seed, Go replay, fixed-point state, and golden vectors. Discuss the trade-off: a room submits once, so the design saves network traffic and Lambda invocations, but an interrupted room restarts from the same seed rather than resuming every frame.

### Transaction and retry design

Use a Telegram network retry as the failure scenario. Explain how expected versions, idempotency keys, row locks, immutable command results, and one transaction prevent duplicate progression. Contrast this with adding unnecessary sessions, hashes, or token tables.

### Safe production cutover

Describe the exact-SHA release workflow, immutable frontend/backend candidates, migration 007 prepare boundary, signed synthetic smoke, migration 008 cleanup, and synthetic-user deletion. Emphasize fix-forward behavior after the irreversible migration boundary.

### Zero-fixed-cost architecture

Explain choosing an arm64 Lambda Function URL, Neon PostgreSQL, Upstash Redis, Vercel, and static assets while deliberately avoiding NAT, API Gateway, RDS, ElastiCache, and container orchestration. The important story is preserving correctness and deployability under a strict cost constraint, not merely choosing free products.

### Mobile interaction debugging

Discuss Telegram WebView gesture conflicts and poor-feeling movement in earlier iterations. The final design reduced the control model to direct horizontal mapping, ignored finger Y movement, stopped immediately on release, captured the pointer inside the arena, and disabled Telegram vertical swipes only during combat. Playwright and production browser smoke now assert those behaviors.

## Honest limitations and claims to avoid

- This is a personal portfolio project, not a commercial game or employer-owned production service.
- There is no defensible active-user, revenue, QPS, latency-improvement, or uptime metric. Do not invent one.
- The system integrates multiple managed components, but the backend is intentionally a modular monolith, not a fleet of microservices.
- The simulation is server-authoritative by room replay, not a continuously connected multiplayer server.
- The content is an unofficial, non-commercial fan work. Do not imply affiliation or endorsement.
- The project demonstrates production engineering practices at small scale; it does not prove internet-scale operations.

## Recommended recruiter framing

The strongest concise framing is:

> A production-deployed personal project that applies backend correctness patterns usually missing from portfolio games: deterministic server replay, transactional and idempotent state changes, schema-first contracts, protected exact-version releases, and end-to-end production smoke testing.

This framing complements Mingchen's prior Go/C++ backend experience. It shows that the candidate can still design, implement, test, deploy, and operate a complete modern system rather than only discuss work completed at a previous employer.
