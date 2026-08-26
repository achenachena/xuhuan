# Xuhuan: Only One Online

*Xuhuan: Only One Online* is a portrait action roguelite built for Telegram Mini Apps. The player is the "last viewer online" after receiving an anomalous backstage message. They take direct control of a self-aware digital persona and fight the Retention Protocol, a system that compresses each character into the safest, most marketable version of herself.

A complete run takes roughly 6–8 minutes. Routes, modules, and encounters reset between runs, while story choices, memories, and horizontal unlocks persist. The current playable release includes the complete prologue and Nana's first chapter, *No Sea at the Seventh Dock*. Six additional characters and chapters already exist in the versioned content catalog and will expand through the same systems.

## Core gameplay

- A Telegram-style backstage group chat delivers the main story, companion interactions, branching choices, and occasional dark humor.
- A fixed single-thumb joystick controls movement and stops immediately on release. Nana automatically targets nearby enemies, while the single active ability, Route Warp, provides mobility, invulnerability frames, and burst damage.
- Enemies use distinct combat rhythms, including pursuit, cone sweeps, eight-way mine pulses, orbiting crossfire, long-range sniping, and telegraphed charges.
- A six-stage branching route mixes 35–50 second combat rooms with events, elites, rest stops, authored story scenes, and a three-phase boss.
- Crossing three ordered beacons completes a Route, instantly refreshes Route Warp, and empowers its damaging wake.
- Grazing hostile projectiles raises Distortion. At 60, attacks become overclocked; at 100, the player takes damage, clears hostile bullets, and drops back to a safer level. This creates a deliberate risk–reward loop.
- Post-combat Channel Modules support multiple builds. A run can hold up to six module types at three levels each, while elites grant run-defining Channel Plugins.
- A new player enters a playable tutorial in about 20 seconds after clicking **Stay Online** once—without choosing a character, route, or difficulty first.
- The server stores at most one active Run per player. Refreshing the page or closing Telegram resumes that Run; browser storage is never authoritative.

## Architecture

```text
Telegram Mini App
  └─ Next.js 16 / React 19 on Vercel
       └─ HTTPS + Telegram initData
            └─ Go REST API (Chi) on AWS Lambda Function URL
                 ├─ Neon PostgreSQL (authoritative runs, commands, story, unlocks)
                 └─ Upstash Redis (distributed rate limits only)
```

Action combat runs at a deterministic 30 Hz fixed timestep. The browser predicts presentation and records quantized input only. At the end of a room, it submits one `rle8-v1` compressed trace; Go replays that trace and authoritatively resolves health, kills, rewards, and outcomes.

Every mutation includes an idempotency key and an expected version. PostgreSQL locks the Run inside a transaction, appends an immutable command record, and atomically commits the resulting snapshot. Closing Telegram resumes the same Run and restarts the current room from the same seed.

See the [OpenAPI 3.1 contract](apps/api/openapi/openapi.yaml) for the HTTP surface, [architecture.md](docs/architecture.md) for trust boundaries and domain design, and [action-v2-release.md](docs/action-v2-release.md) for the forward-only Action V2 release procedure.

## Repository layout

```text
apps/
  api/                 Go V2 API, versioned content bundles, and tests
  miniapp/             Next.js Telegram Mini App and static game assets
docs/                  Architecture and release documentation
infra/                 Terraform for AWS Lambda and zero-fixed-cost infrastructure
```

## Run locally

Prerequisites: Docker Compose v2, Node.js 20+, npm 10+, and Go 1.25+. The Go module automatically selects the toolchain tested by this repository. Local development does not require a Telegram bot token; the API permits an explicit development identity only when `APP_ENV=development`.

```sh
cp env.example .env
make install
make up
```

In a second terminal, run:

```sh
make miniapp
```

Open `http://localhost:3000`. `make down` stops the containers but preserves the PostgreSQL volume. Use `docker compose down --volumes` only when you intentionally want to erase local data.

## Verification

```sh
make test                 # Go unit/contract/race + frontend test/lint/type/build
make test-integration     # PostgreSQL row-lock/idempotency/rollback + Redis tests
make e2e-install          # one-time Playwright Chromium install
make e2e                  # browser → API → PostgreSQL authoritative journey
```

After merging a production candidate, manually run the `Smoke Production V2` GitHub Actions workflow. The workflow uses AWS OIDC to read the bot token temporarily from SSM, signs a clearly identified synthetic Telegram user, and verifies authentication, disconnect recovery, the boss encounter, story settlement, and noise-level unlocks. Credentials and raw `initData` are never written to logs.

After changing the OpenAPI contract, regenerate and verify the frontend types:

```sh
npm run generate:api-types --workspace @xuhuan/miniapp
npm run check:api-types --workspace @xuhuan/miniapp
```

## Migration status

`004_action_roguelite.sql` is the forward-only Action V2 replacement. As an intentional product decision, it clears existing player, story, and Run data, then changes unlock and command constraints to modules, plugins, and room traces. The old card content, domain code, UI, and protocol have been removed from the main implementation. Card-era saves cannot be restored after this migration; database problems must be fixed forward.

## Configuration, security, and cost

Production PostgreSQL, Redis, and Telegram credentials are stored as AWS SSM standard-tier `SecureString` parameters and injected only into immutable Lambda versions. Production builds must not expose `DEV_AUTH_*` or `NEXT_PUBLIC_DEV_AUTH_TOKEN`. The API validates the signature and age of raw Telegram `initData`; it does not trust `initDataUnsafe`.

The production topology has no VPC, NAT Gateway, API Gateway, load balancer, RDS, ElastiCache, ECS/EKS, or ECR. Neon holds authoritative PostgreSQL data, while Upstash stores only disposable rate-limit counters. Exhausting a free allowance pauses or throttles the service rather than upgrading it to a paid plan automatically. See the [Terraform README](infra/terraform/README.md) for operational details.

## Fan work and assets

This is a non-commercial, unofficial technical demonstration and fan project. It is not affiliated with, endorsed by, or produced in cooperation with any character, group, platform, or rights holder. All characters in the story are fictional digital personas; the narrative makes no factual claims about real people or organizations, and references to real-world memes appear only as easter eggs. Character names, likenesses, and pre-existing portraits belong to their respective rights holders and will be removed upon a valid request.

- The seven character portraits reuse remote assets already referenced by the project. Source information remains in the versioned content bundle.
- The Seventh Dock background and the Nana, Retention Drone, Comment Sweeper, Buffer Mine, Echo Relay, Moderation Hound, and Optimal Persona pixel sprites are original static assets generated for this project with OpenAI image-generation tooling. They live under `apps/miniapp/public/game/v2/`.
- The UI, action effects, enemy names, narrative, and game systems are original work created for this project.

This repository does not grant redistribution rights for third-party fan assets and does not permit their use in a commercial release.
