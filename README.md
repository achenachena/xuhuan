# Xuhuan (虚环)

Xuhuan is a mobile-first, turn-based fighting game built as a Telegram Mini App. The existing Next.js presentation is backed by a server-authoritative Go API: the server owns battle randomness, damage, outcomes, rewards, energy, and progression.

## Architecture

```text
Telegram Mini App
  └─ Next.js 16 / React 19 on Vercel
       └─ HTTPS + Telegram initData
            └─ Go REST API (Chi) on ECS Fargate
                 ├─ PostgreSQL on RDS (source of truth)
                 └─ Redis on ElastiCache (rate limits/read cache only)
```

The API contract is [OpenAPI 3.1](apps/api/openapi/openapi.yaml). Design decisions, trust boundaries, and the AWS topology are documented in [docs/architecture.md](docs/architecture.md); the migration record is in [docs/go-rebuild-plan.md](docs/go-rebuild-plan.md).

## Repository layout

```text
apps/
  api/                 Go API, migrations, seed data, and tests
  miniapp/             Next.js Telegram Mini App
packages/
  game-types/          Frontend-only presentation types
docs/                  Architecture and migration documentation
infra/                 Validated, unapplied AWS Terraform configuration
```

## Prerequisites

- Docker with Compose v2
- Node.js 20 and npm 10
- Go 1.25+ (the module selects the tested Go 1.26.5 toolchain)

No Telegram bot token is needed for local play. The local stack uses an explicit development identity that the API refuses to enable outside `APP_ENV=development`.

## Run locally

1. Create a local configuration file:

   ```sh
   cp env.example .env
   ```

2. Install JavaScript dependencies:

   ```sh
   make install
   ```

3. Build the API image, start PostgreSQL and Redis, apply migrations, seed the catalog, and start the API:

   ```sh
   make up
   ```

4. Start the Mini App in a second terminal:

   ```sh
   make miniapp
   ```

5. Open `http://localhost:3000`. The frontend calls the API at `http://localhost:8080` with the local-only token from `.env`.

`make down` stops containers while retaining the local PostgreSQL volume. Run `docker compose down --volumes` only when you intentionally want to discard all local game data.

### Run services separately

```sh
make db-up
make migrate
make seed
make api
make miniapp
```

The migration and seed operations are idempotent. Catalog seed data is deterministic; player and battle data are never seeded. Redis contains rate-limit counters only; losing it never loses authoritative game state, and the API falls back to a bounded in-process limiter while Redis is unavailable.

## Verification

```sh
make test                 # Go unit/contract/race tests + frontend test/lint/type/build
make test-integration     # PostgreSQL-backed repository and transaction tests
make e2e-install          # one-time Playwright Chromium install
make e2e                  # full browser → API → PostgreSQL battle journey
```

Generate frontend contract types after changing OpenAPI, then check in the result:

```sh
npm run generate:api-types --workspace @xuhuan/miniapp
npm run check:api-types --workspace @xuhuan/miniapp
```

## Configuration and security

All supported local variables and safe example values are documented in [env.example](env.example). Production secrets belong in AWS Secrets Manager; non-secret production settings belong in SSM Parameter Store. Do not expose `DEV_AUTH_*` or `NEXT_PUBLIC_DEV_AUTH_TOKEN` in a production build.

Player requests use raw Telegram `initData` in `X-Telegram-Init-Data`. Mutating battle requests also require an `Idempotency-Key` and an expected battle version. The client cannot submit rewards, outcomes, progression, or random seeds.

Optional OpenTelemetry export uses OTLP/HTTP. With no collector endpoint—or if exporter setup fails—the API continues with no-op telemetry. Instruments contain route templates and bounded outcome/reason labels, never authentication payloads, SQL, database arguments, player IDs, or battle IDs.

## Deployment status

The `main` branch deploys the Mini App to Vercel production and is currently passing its deployment checks. The paid API infrastructure has not been provisioned: its target remains AWS ECS Fargate behind an HTTPS Application Load Balancer, with RDS PostgreSQL and ElastiCache Redis. Applying Terraform or running the manual API deployment workflow requires explicit owner approval. Bootstrap and protected-environment instructions are in [infra/terraform/README.md](infra/terraform/README.md).
