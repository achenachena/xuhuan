# Resume agent brief: Xuhuan

## Project summary

Xuhuan is a production-deployed, bilingual Telegram Mini App shooter and story campaign. It combines a Go REST API on AWS Lambda, a Next.js/Canvas frontend on Vercel, PostgreSQL persistence on Neon, and Redis rate limiting on Upstash.

The normal browser URL is an English-first engineering portfolio with a static 60-second demo. Telegram users enter the complete eight-chapter game after server-side verification of Mini App `initData`.

## Verified scope

- Eight story chapters and eight three-stage bosses
- Seven playable characters and seven companions
- Twenty-four campaign wave segments plus Boss encounters
- Twelve one-level show effects and three explicit finale endings
- English and Simplified Chinese content with matching-key CI validation
- A short Daily Aftershow with personal best and streak persistence
- A public browser demo that creates no user or server state

## Architecture

```text
Next.js + Canvas on Vercel
        |
        | authenticated REST in Telegram only
        v
Go on AWS Lambda Function URL
        |-- Neon PostgreSQL
        `-- Upstash Redis rate limits
```

The 30 Hz shooter simulation runs locally for immediate input and rendering. The API owns run phases, deterministic reward selection, story decisions, unlocks, Daily records, and all durable progress. Segment completion submits only a bounded `{won, health, score}` result, an intentional trade-off for a noncompetitive single-player game with no economy or global leaderboard.

## Backend engineering highlights

- Telegram `initData` is the only production identity mechanism; Go verifies the required HMAC and age before resolving a player.
- PostgreSQL transactions combine an owned Run row lock, optimistic version, idempotency key, immutable command payload/result, Run snapshot, and progress update.
- Identical mobile-network retries return the stored response; stale clients reload after a version conflict.
- OpenAPI defines the REST contract and generates frontend TypeScript types.
- The content loader embeds and validates references, both locales, assets, chapter structure, entity limits, and supported behavior identifiers.
- Redis contains only disposable distributed rate-limit counters and never game state.

## Frontend engineering highlights

- Canvas 2D uses a fixed 30 Hz simulation with interpolated rendering.
- Horizontal pointer input follows the finger directly; vertical movement is ignored to fit Telegram Mini App gestures.
- Telegram lifecycle handling pauses local time in the background and respects safe-area/stable-viewport values.
- The same local simulator and renderer power the anonymous browser demo without adding another identity or API.
- Static WebP assets and local sound effects avoid runtime media services and fixed cost.

## Delivery and quality

- Pull requests run Go format/vet/tests, PostgreSQL and Redis integration checks, OpenAPI drift checks, Vitest, lint, type checking, Next.js production build, content validation, Terraform validation, a Playwright browser-to-database journey, dependency audit, and `govulncheck`.
- Production builds from an explicit current `main` commit, publishes an immutable Lambda version, deploys the Vercel artifact, and checks API health, content, portfolio, and demo routes.
- Database migrations run only when a release actually changes schema; historical migrations remain preserved.

## Cost-conscious production design

The deployment deliberately avoids a VPC, NAT Gateway, API Gateway, load balancer, RDS, ElastiCache, container cluster, Kubernetes, queue, paid authentication, payment service, and paid observability platform. Terraform manages the small AWS boundary while Neon, Upstash, and Vercel remain within their free plans.

## Suggested resume bullets

- Built and deployed a bilingual Telegram Mini App shooter with an eight-chapter campaign using Go, Next.js, Canvas 2D, PostgreSQL, Redis, AWS Lambda, Vercel, and Terraform.
- Implemented retry-safe game progression with PostgreSQL transactions, row locks, optimistic versions, idempotent commands, and atomic chapter/story unlocks.
- Defined a schema-first REST API with OpenAPI-generated TypeScript contracts and automated backend, frontend, integration, browser, security, and infrastructure checks in GitHub Actions.
- Added a public engineering portfolio and anonymous browser demo by reusing the production Canvas runtime without creating guest identities or server-side state.
- Deployed the complete system with no fixed-cost infrastructure, using an arm64 Lambda Function URL, Neon, Upstash, Vercel, and least-privilege AWS access.

## Interview discussion points

1. Explain why idempotency and atomic progress matter on unreliable Telegram mobile networks.
2. Explain the deliberate decision to keep combat local: full server replay had poor product value for a noncompetitive game and increased cross-language parity bugs, so the API remains authoritative only where correctness affects durable state.
3. Walk through Telegram `initData` verification without adding JWTs, sessions, payments, or another identity provider.
4. Describe how OpenAPI, content validation, and generated demo manifests prevent contract and content drift.
5. Discuss the zero-fixed-cost topology and the services intentionally avoided.

Do not describe the project as high-scale or claim real-user throughput that has not been measured. Its strongest story is pragmatic engineering judgment, production ownership, and a complete playable product under strict cost constraints.
