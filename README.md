# Xuhuan (虚环)

Xuhuan is a mobile-first, turn-based fighting game built as a Telegram Mini App. The existing Next.js presentation is backed by a server-authoritative Go API: the server owns battle randomness, damage, outcomes, rewards, energy, and progression.

## Architecture

```text
Telegram Mini App
  └─ Next.js 16 / React 19 on Vercel
       └─ HTTPS + Telegram initData
            └─ Go REST API (Chi) on AWS Lambda Function URL
                 ├─ Neon PostgreSQL (source of truth, SQL + transactions)
                 └─ Upstash Redis (distributed rate limits only)
```

The API contract is [OpenAPI 3.1](apps/api/openapi/openapi.yaml). Design decisions, trust boundaries, and the AWS topology are documented in [docs/architecture.md](docs/architecture.md).

## Repository layout

```text
apps/
  api/                 Go API, migrations, seed data, and tests
  miniapp/             Next.js Telegram Mini App
packages/
  game-types/          Frontend-only presentation types
docs/                  Architecture and migration documentation
infra/                 Terraform for the deployed AWS serverless edge
```

## Prerequisites

- Docker with Compose v2
- Node.js 20 and npm 10
- Go 1.25+ (the module selects the tested Go 1.26.6 toolchain)

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

All supported local variables and safe example values are documented in [env.example](env.example). Production database, Redis, and Telegram credentials are stored as standard-tier AWS SSM SecureStrings and injected only into immutable Lambda versions. Do not expose `DEV_AUTH_*` or `NEXT_PUBLIC_DEV_AUTH_TOKEN` in a production build.

Player requests use raw Telegram `initData` in `X-Telegram-Init-Data`. Mutating battle requests also require an `Idempotency-Key` and an expected battle version. The client cannot submit rewards, outcomes, progression, or random seeds.

Optional OpenTelemetry export uses OTLP/HTTP. With no collector endpoint—or if exporter setup fails—the API continues with no-op telemetry. Instruments contain route templates and bounded outcome/reason labels, never authentication payloads, SQL, database arguments, player IDs, or battle IDs.

## Deployment status

The production target keeps the resume-relevant AWS and Go design without continuously billed AWS data resources: an arm64 Go Lambda Function URL connects over TLS to Neon PostgreSQL and Upstash Redis. PostgreSQL SQL, foreign keys, row locks, JSONB, and multi-table transactions remain unchanged; Redis remains a real Redis-protocol dependency but is non-authoritative. There is no VPC, NAT Gateway, API Gateway, load balancer, RDS instance, ElastiCache node, Fargate service, or ECR repository in the final topology. Free services stop or throttle at their limits instead of being intentionally upgraded. Bootstrap, cutover, secret, and cost guardrails are in [infra/terraform/README.md](infra/terraform/README.md).
