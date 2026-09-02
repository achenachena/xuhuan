# Architecture

Xuhuan is a single-player Telegram Mini App with a public portfolio and a local browser demo. The design intentionally keeps the interactive game on the device while the Go API owns identity, legal run transitions, rewards, unlocks, story choices, and durable progress.

## Runtime topology

```text
Telegram Mini App / public browser
        |
        | static Next.js UI, Canvas game, local 30 Hz simulation
        v
Vercel

Telegram Mini App
        |
        | HTTPS REST + Telegram initData
        v
AWS Lambda Function URL (Go)
        |-- Neon PostgreSQL: durable player and run state
        `-- Upstash Redis: disposable distributed rate limits
```

The public browser demo is static. It creates no account, calls no protected API, and stores no progress.

## Security boundary

Production player identity is verified only from Telegram Mini App `initData`. The browser forwards the raw value; Go verifies Telegram's required HMAC, timestamp, and user payload before creating a player context.

There is no JWT/session service, paid authentication provider, payment system, capability-token table, or share-token table. Public daily results reuse the completed Run UUID as a non-secret resource identifier.

## Game and server ownership

The TypeScript client runs the shooter locally at a fixed 30 Hz for responsive input and rendering. At the end of a segment it sends only a bounded result:

```json
{ "won": true, "health": 2, "score": 840 }
```

This is a deliberate single-player trade-off. The game has no economy or global competitive leaderboard, so frame-by-frame server replay would add more parity bugs and maintenance cost than useful protection.

The API still rejects invalid phases and out-of-range results. It alone chooses show options, advances chapters, records concrete story choices, unlocks characters and companions, and commits Daily results.

## Transaction model

Every write includes an `Idempotency-Key` and `expected_version` because Telegram mobile requests can time out and retry. The PostgreSQL repository:

1. locks and verifies the owned active Run;
2. returns the prior stored response for an identical idempotent retry;
3. rejects a reused key with a different JSON payload;
4. applies the legal state transition; and
5. commits the command record, Run snapshot, and any progress update in one transaction.

Redis is never a source of game truth. If distributed rate limiting is unavailable, the API retains local protection and fails open for playability.

## Content

`apps/api/internal/content/v4` contains the embedded English-first V4 catalog: shared effects, seven characters, six enemy chassis, eight chapters, Daily mode, and matching English and Simplified Chinese locale files. Startup and CI validate references, translations, asset paths, limits, and chapter structure.

Go resolves authored content into a browser-ready `runtime_config`. TypeScript does not maintain a second content rules interpreter. The public demo manifests are generated from the same catalog.

## Deployment

Vercel hosts the Next.js application and static assets. AWS Lambda runs an arm64 Go binary behind a Function URL. Terraform owns Lambda, IAM, SSM references, alarms, and the stable alias.

Production releases build from one explicit `main` commit, publish a new immutable Lambda version, point the alias to it, deploy the Vercel build, and run health/content/browser smoke checks. Database migrations are run separately only when a release actually changes the schema.

This topology has no VPC, NAT Gateway, API Gateway, load balancer, container cluster, queue, RDS, ElastiCache, paid identity provider, or paid observability service.
