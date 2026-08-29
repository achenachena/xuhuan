# Xuhuan: Only One Online

*Xuhuan: Only One Online* is a portrait action roguelite for Telegram Mini Apps. The player is the last viewer left in an anomalous backstage channel. They help seven self-aware digital personas resist the Retention Protocol, a system that compresses each person into the safest and most marketable version of herself.

V3 is a complete linear campaign: seven character chapters lead into the **Zero Channel** finale. Choices accumulate Trust, Authenticity, and Retention; the balance between Authenticity and Retention selects one of three endings. Clearing the finale unlocks a deterministic daily challenge with score, streak, build snapshots, and anonymous result links.

## What the player does

- Move with one thumb while the character automatically attacks the nearest enemy.
- Collect three Surge, Guard, or Echo signals, then spend the completed weave with Warp. Repeated signals produce a focused protocol; one of each triggers the character's unique Resonance.
- Graze hostile shots to build Distortion. At 60, attacks overclock; reaching 100 costs health, clears bullets, and resets the meter to a safer level.
- Complete purge, stabilize, recover, holdout, elite, and boss objectives across a branching route.
- Choose from modules after encounters, earn plugins from elites, and use events or rest stops to shape a build. A run holds at most six module types, each with three cumulative levels.
- Resume the same authoritative room after a refresh or closed Telegram WebView. Browser storage never decides progress or rewards.

The browser predicts combat at a fixed 30 Hz and records quantized input. It submits one capped `rle8-v1` trace when a room ends; Go replays the trace and decides health, kills, objectives, score, rewards, and progression.

## V3 content

The versioned `v3` catalog uses the `action-v2` gameplay protocol and ships all authored campaign content in English and Simplified Chinese.

| Content | Count |
| --- | ---: |
| Characters and character kits | 7 each |
| Campaign chapters | 7 plus the Zero Channel finale |
| Modules | 68: 12 shared and 8 per character |
| Plugins | 20: 6 shared and 2 per character |
| Enemies | 36: 21 normal, 7 elite, and 8 bosses |
| Encounters | 47: 30 normal, 8 elite, 8 boss, and 1 tutorial |
| Events | 28 |
| Story scenes | 34, including the prologue and three endings |
| Locale keys | 620 in each locale with exact key parity |

Daily mode reuses the campaign encounter pools. The server derives its seed from the UTC date and rotates through the seven character chapters, so it needs no separate content bundle or scheduler. Anonymous result links reuse the completed Run UUID and permit five-minute public caching; sharing creates no token, database row, cleanup task, or additional write.

See [game-design.md](docs/game-design.md) for the complete rules and campaign structure, and [content-authoring.md](docs/content-authoring.md) for the catalog schema and validation workflow.

## Architecture

```text
Telegram Mini App
  -> Next.js 16 / React 19 on Vercel
      -> HTTPS JSON + raw Telegram initData
          -> Go / Chi on an arm64 AWS Lambda Function URL
              -> Neon PostgreSQL: authoritative game and story state
              -> Upstash Redis: disposable distributed rate limits only
```

Every mutation uses an idempotency key; state-dependent mutations also include an expected version. PostgreSQL locks the player-owned row in a transaction, records an immutable command or story choice, and commits the resulting snapshot atomically. One campaign Run and one daily Run may be active for a player at the same time.

The public HTTP namespace remains `/v2`, while the independently versioned authored bundle is content V3 (`version: "v3"`) with protocol `action-v2`. This distinction lets transport compatibility, authored content, and deterministic gameplay rules evolve deliberately.

Read [architecture.md](docs/architecture.md) for the trust boundaries, data model, and runtime design. The [OpenAPI 3.1 contract](apps/api/openapi/openapi.yaml) is the machine-readable HTTP surface.

## Repository layout

```text
apps/
  api/                 Go API, deterministic engines, migrations, and V3 content
  miniapp/             Next.js Telegram Mini App and static game assets
docs/                  Architecture, game design, authoring, and release guides
infra/terraform/       AWS Lambda, Function URL, IAM, SSM, and observability
scripts/               Repository policy checks
```

## Run locally

Prerequisites are Docker Compose v2, Node.js 20+, npm 10+, and Go 1.25+. The Go module selects the repository's tested toolchain automatically. A local Telegram bot token is not required: when `APP_ENV=development`, the API automatically uses one fixed synthetic player for requests that do not include Telegram `initData`.

```sh
cp env.example .env
make install
make up
```

In a second terminal:

```sh
make miniapp
```

Open `http://localhost:3000`. `make down` stops containers while preserving the PostgreSQL volume. Use `docker compose down --volumes` only when you intentionally want to erase local data.

## Verify changes

```sh
npm run check:english-source  # reject non-English source outside reviewed fixtures
npm run check:content-assets  # require exact V3 manifest/public asset parity
make test                     # Go race/unit/contract plus frontend test/lint/type/build
make test-integration         # PostgreSQL transaction/migration and Redis behavior
make e2e-install              # one-time Playwright Chromium installation
make e2e                      # browser -> API -> PostgreSQL authoritative journey
```

After changing the OpenAPI contract, regenerate and verify the frontend types:

```sh
npm run generate:api-types --workspace @xuhuan/miniapp
npm run check:api-types --workspace @xuhuan/miniapp
```

Player-facing translations belong in the V3 content locales or the Mini App UI locales. The English-source check permits only the two canonical `zh-CN` documents, the existing `001` through `006` SQL migrations, and a short path-specific list of localization test fixtures.

## Production release

Merging does not deploy production. Vercel Git deployment is disabled for `main`, and the four older deploy/promote/smoke workflows have been replaced by one protected **Release Production V3** workflow.

The operator supplies the full SHA at the current `main` HEAD. The workflow first requires the successful `main` CI run for that exact SHA, then builds a production-mode Vercel artifact with `--skip-domain`, verifies its SHA and V3 protocol markers, publishes and checks an immutable Lambda candidate, and promotes that exact frontend artifact. It verifies the linked production domain before entering a concurrency-zero API maintenance window, applies migration 005, confirms the Lambda runtime URL sees the V3 schema, switches the Lambda alias, restores bounded concurrency, verifies the API handshake, and runs the signed Telegram production journey. The same ephemeral signed launch data then drives headless system Chrome through the promoted frontend, an authenticated game snapshot, and a localized UI/API refresh. The smoke refuses to reuse a pre-existing synthetic Telegram ID, and an `always()` step removes only the run's exact synthetic player and cascading game records; only after a clean smoke and cleanup does migration 006 remove the legacy gameplay schema.

Read [action-v3-release.md](docs/action-v3-release.md) before releasing. Migrations `005_action_v3_prepare.sql` and `006_remove_action_v2.sql` form an expand/contract boundary: Telegram identities and language are retained, game progress resets for V3, and legacy gameplay tables are removed only after the new stack passes smoke. Keep every historical migration file; after migration 005 succeeds, fix forward instead of restoring an incompatible Action V2 binary or frontend.

## Security, operations, and cost

Production PostgreSQL, Redis, and Telegram credentials live in AWS SSM `SecureString` parameters. GitHub obtains short-lived AWS credentials through OIDC and injects Lambda runtime values into unpublished configuration before publishing an immutable version. Migration, smoke, and cleanup steps retrieve only their required values, mask credentials and the synthetic identity immediately, and run on the ephemeral protected runner. Production builds contain no local-development identity configuration. CI also runs CodeQL against Go and TypeScript plus dependency and container vulnerability scans.

The API verifies the signature and age of raw Telegram `initData`; it never trusts `initDataUnsafe`. Logs use request IDs, route templates, and bounded reason labels, and do not record init data, bot tokens, database URLs, traces, or player/run identifiers.

Telegram `initData` is the only production player identity mechanism. The project intentionally has no paid authentication provider, JWT/session service, cookie login, payment integration, or separate share-token store. The fixed synthetic player is enabled directly by `APP_ENV=development`; it uses no credential, request header, or frontend secret and is not part of the public API contract.

The production topology has no VPC, NAT Gateway, API Gateway, load balancer, RDS, ElastiCache, ECS/EKS, or ECR. Neon stores authoritative PostgreSQL data, while Upstash stores only rate-limit counters. See the [Terraform README](infra/terraform/README.md) for configuration and operational details.

## Fan work and assets

This is a non-commercial, unofficial technical demonstration and fan project. It is not affiliated with, endorsed by, or produced in cooperation with any character, group, platform, or rights holder. All story characters are fictional digital personas; the narrative makes no factual claims about real people or organizations.

Character names and likenesses belong to their respective rights holders and will be removed upon a valid request. Project-created V3 backgrounds, text-free pixel sprites, effects, interface work, enemy concepts, narrative, and game systems live under `apps/miniapp/public/game/`. This repository does not grant redistribution rights for character likenesses or permit their use in a commercial release.
