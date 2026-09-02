# Xuhuan: Only One Online

*Xuhuan: Only One Online* is a one-thumb portrait shooter built for Telegram Mini Apps. A stream has ended, seven fictional digital performers are still in the backstage group, and an automatic archive is quietly replacing their awkward, funny, unfinished moments with perfect highlights.

The production URL is also a public engineering portfolio. A normal browser receives an English-first project overview and a short, anonymous Canvas demo; Telegram users with valid Mini App `initData` enter the persistent campaign. The browser demo creates no account, stores no progress, and makes no protected API calls.

The V4 campaign is deliberately easy to enter: move only left and right, fire straight upward automatically, collect friendly support notes, and tap one special when it is ready. Each chapter contains three short waves, a concrete two-choice aftershow intermission, and a three-stage boss. Seven character chapters unlock the ensemble finale, **Zero Channel**. The post-campaign **Daily Aftershow** offers one deterministic wave, one show choice, and one boss with a rotating character and UTC seed.

## Why it fits Telegram

- Portrait play with one finger and no virtual joystick.
- The character stays on a fixed vertical line and follows the finger horizontally without inertia.
- Automatic fire keeps attention on dodging, support-note routes, and special timing.
- Three hearts, strong attack telegraphs, short waves, and one obvious special keep the first session readable.
- A room submits one bounded completion result when it ends; normal play sends no frame-by-frame requests.
- Closing Telegram restarts only the current room from its stored seed. PostgreSQL remains authoritative.

## V4 content

V4 uses content version `v4` and simulation protocol `shooter-v1`.

| Content | Included |
| --- | ---: |
| Character chapters | 7 |
| Ensemble finales | 1 |
| Normal combat waves | 24 |
| Boss rooms | 8 |
| Total combat rooms | 32 |
| Boss stages | 24 |
| Shared show effects | 12 |
| Playable character specials | 7 |
| Unlockable companions | 7 |
| Composable enemy chassis | 6 |
| Finale endings | 3 |
| Locales | English and Simplified Chinese |

English is the default. The language can be changed at any time and is remembered on the device. Story decisions are concrete revisions such as sealing Nana's withdrawn voice note, restoring Xiangwan's funniest loss, or cancelling Bella's overnight shifts; V4 does not use hidden Trust, Authenticity, or Retention scores.

Read [game-design.md](docs/game-design.md) for the player loop and complete chapter table. Read [content-authoring.md](docs/content-authoring.md) before changing the embedded catalog.

## Architecture

```text
Telegram Mini App
  -> Next.js / React / Canvas 2D on Vercel
      -> HTTPS JSON + raw Telegram initData
          -> Go / Chi on an arm64 AWS Lambda Function URL
              -> Neon PostgreSQL: authoritative player and game state
              -> Upstash Redis: disposable rate-limit counters only
```

The browser runs a fixed 30 Hz simulation for immediate input and rendering. At the end of a room it sends a bounded result containing win state, remaining hearts, and score. This is an intentional single-player trade-off: the game has no economy or global leaderboard, so frame-by-frame server replay would add more parity risk than useful protection. Go still owns legal phase transitions, reward selection, story choices, unlocks, and durable progression. A command uses an idempotency key and expected Run version so retries cannot apply a completed room twice.

Production identity is exclusively Telegram Mini App `initData`. The repository intentionally contains no paid authentication provider, JWT or cookie session system, payment integration, share-token table, or second identity service. See [architecture.md](docs/architecture.md) for trust boundaries and ownership.

## Repository layout

```text
apps/api/                         Go API, deterministic shooter, migrations
apps/api/internal/content/v4/     Immutable V4 content and locales
apps/miniapp/                     Next.js Mini App and local V4 assets
docs/                             Design, architecture, authoring, release notes
infra/terraform/                  Lambda, IAM, SSM, and operational alarms
scripts/                          Content, asset, and source-policy checks
```

## Run locally

Prerequisites: Docker Compose v2, Node.js 20+, npm 10+, and the Go toolchain selected by `apps/api/go.mod`.

```sh
cp env.example .env
make install
make up
```

In another terminal:

```sh
make miniapp
```

Open `http://localhost:3000` for the public portfolio or `/demo` for the browser showcase. The full campaign is mounted only when the Telegram SDK supplies `initData`; the E2E harness provides a signed Telegram host fixture and the development API maps that fixture to one fixed synthetic player. That identity is disabled in production and is not a login product or public credential.

In a production-mode browser, `/` renders the public portfolio and `/demo` runs the static 60-second showcase. Generate its immutable manifests from the Go catalog after relevant shooter or content changes:

```sh
npm run generate:portfolio-demo
npm run check:portfolio-demo
```

## Verify a change

```sh
npm run check:english-source
npm run check:content-assets
make test
make test-integration
make e2e
```

After changing the OpenAPI contract, regenerate and verify frontend types:

```sh
npm run generate:api-types --workspace @xuhuan/miniapp
npm run check:api-types --workspace @xuhuan/miniapp
```

The V4 loader and CI reject missing chapters, boss stages, translations, referenced assets, invalid behavior IDs, unreachable references, or entity limits that exceed the mobile runtime contract.

## Production release

Merging does not silently publish production. The protected workflow builds one explicit current `main` commit, publishes an immutable Lambda version, deploys the Vercel artifact, and checks API health, content, portfolio, and demo routes. Database migrations run separately only when a release actually changes schema. See [production-release.md](docs/production-release.md).

Runtime secrets stay in AWS SSM `SecureString` parameters. GitHub uses short-lived AWS OIDC credentials; Vercel deployment uses the existing scoped deployment credential. These are deployment requirements, not player accounts or game tokens.

## Cost and scope

The production design has no VPC, NAT Gateway, API Gateway, load balancer, RDS, ElastiCache, container cluster, queue, paid observability service, payment provider, or paid identity provider. Neon holds authoritative PostgreSQL state. Upstash is used only for fail-open distributed rate limiting. Static V4 WebP assets ship with the Mini App.

## Fan-work notice

This is a non-commercial, unofficial fan project and technical portfolio demonstration. It is not affiliated with or endorsed by any character, group, platform, or rights holder. The plot, dialogue, enemies, backgrounds, systems, and V4 aftershow situations are original fiction; they make no factual claims about real people. Character names and likenesses remain the property of their respective rights holders and can be removed upon a valid request.

See [fan-reference-sources.md](docs/fan-reference-sources.md) for the deliberately conservative reference policy used by the V4 story.
