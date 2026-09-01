# Xuhuan V4 architecture

## System intent

Xuhuan is a single-player portrait shooter and story campaign inside Telegram. The Mini App owns controls, presentation, audio, haptics, and prediction. Go owns deterministic room replay, enemy behavior, damage, pickups, rewards, chapter progression, story revisions, and every durable result. PostgreSQL is the system of record. Redis stores only disposable distributed rate-limit counters.

Three version labels have separate purposes:

- `/v2` is the stable HTTP namespace.
- `v4` identifies the immutable authored content bundle stored with a Run.
- `shooter-v1` identifies the deterministic simulation and trace semantics.

## Runtime topology

```text
Telegram WebView
  -> Next.js / React on Vercel
      | Canvas 2D rendering and local prediction
      | English or Simplified Chinese presentation
      v
    HTTPS JSON + raw Telegram initData
      v
Go modular monolith on arm64 AWS Lambda
  | authentication, transport, idempotency, and rate limiting
  | deterministic shooter, campaign, story, and progression domains
  | embedded V4 manifest, chapters, rules, and locales
  | Neon PostgreSQL: authoritative durable state
  ` Upstash Redis: fail-open rate-limit counters
```

The deployment has no WebSocket service, game-engine server, queue, VPC, NAT Gateway, API Gateway, load balancer, container cluster, RDS, or ElastiCache.

## Identity and trust boundary

Production player identity is verified exclusively with Telegram Mini App `initData`:

1. The browser forwards raw `initData` without interpreting it as authority.
2. Go verifies Telegram's HMAC, checks the authentication age, and reads the signed Telegram user ID.
3. The API loads or creates that player and scopes all Run, story, and progression access to the verified owner.

The project does not add JWTs, login cookies, paid authentication, OAuth accounts, payment providers, or a second session service. Development may use one fixed synthetic player when `APP_ENV=development`; production builds cannot enable it.

The cryptography and opaque values that remain each solve a concrete problem:

- Telegram HMAC verification proves the production player identity.
- An idempotency key makes a retried mutation apply once.
- A Run UUID identifies a player-owned resource without exposing Telegram identity.
- A seeded deterministic PRNG reproduces the same wave and reward choices.
- Deployment credentials let GitHub publish to AWS and Vercel; they are not game accounts.

There is no payment token, share-token table, capability-token subsystem, or session hash. Public daily results may reuse a safe opaque completed-Run UUID rather than creating another credential.

## Deterministic room replay

The logical arena is `3600 x 6400` integer units and advances at 30 Ticks per second. The player remains at Y `5200`; input chooses one of 128 horizontal columns and maps the player directly to that column on the next Tick. There is no catch-up step, acceleration, velocity tail, vertical control, or two-dimensional joystick.

The Mini App predicts the same fixed-step rules for responsiveness and records only:

- horizontal control column;
- special-button state; and
- the number of consecutive Ticks for that control.

The canonical `x-position-rle-v1` payload is a JSON array of `[control, count]` tuples. The control byte uses the low seven bits for columns `0..127` and the remaining bit for the special. The browser submits one capped trace after a room; it never submits authoritative health, hits, kills, pickups, score, or rewards.

Go decodes and replays the trace with fixed-point coordinates, seeded randomness, stable iteration, and manifest entity caps. It determines whether the wave or boss was completed. A malformed, oversized, out-of-range, or incomplete trace cannot advance the Run. If Telegram closes mid-room, only predicted frames disappear; the room restarts from the same stored seed.

## Simulation responsibilities

The shared deterministic model is split by concept rather than one oversized engine:

```text
simulation    fixed step, state, collision, damage, fixed-time waves, entity caps
specials      seven character-specific charged actions
companions    event-triggered support behavior
enemies       six chassis, movement, shot patterns, and traits
bosses        three scripted health stages per chapter
trace         canonical RLE decoding and bounds
```

The browser implements prediction for the same concepts but does not become authoritative. Golden fixtures generated from Go compare the complete canonical state: player, enemies, projectiles, pickups, delayed effects, and seeded random state. They are test data, not a client-submitted verification hash.

## Content boundary

`apps/api/internal/content/v4` contains immutable JSON:

- `manifest.json`: versions, locales, rules, assets, chapter order;
- `shared.json`: 12 one-level show effects, seven characters and specials, seven companions, and six enemy chassis;
- `chapters/*.json`: exactly three waves, one three-stage boss, one two-choice intermission, recap, and encore rule per chapter;
- `daily.json`: Daily Aftershow rotation and UTC seed inputs; and
- `locales/en.json` and `locales/zh-CN.json`: exact-key translations, with English canonical.

The loader fails closed on invalid references, unsupported behavior IDs, missing translations, missing stages, duplicate IDs, unregistered assets, and runtime limits. A Run records its immutable content version, whose manifest fixes the matching simulation protocol, so a later bundle cannot silently reinterpret its replay.

## Durable state and transactions

PostgreSQL stores Telegram identity and language separately from resettable campaign state. At most one campaign Run and one daily Run may be active for a player.

Every state-dependent mutation includes:

- the target player-owned Run UUID;
- `expected_version`; and
- an `Idempotency-Key` unique to the user's intended operation.

The repository locks the Run row, checks ownership/version/idempotency, replays or applies the command, appends the immutable command result, and commits the snapshot and progression changes in one transaction. A repeated idempotency key returns the stored result. A stale version returns a conflict and the client reloads authoritative state.

Story choices are append-only revisions identified by concrete option IDs. The latest revision changes the current projection; history is not converted into hidden personality scores. Finale endings match explicit selected option IDs.

## Data ownership

| Concern | Owner |
| --- | --- |
| Telegram identity verification | Go authentication boundary |
| Telegram profile language | PostgreSQL player profile |
| Mini App language override | Browser local storage |
| Wave seeds and definitions | V4 content + Go campaign domain |
| Hits, health, wave or boss completion, score | Go replay |
| Run snapshot and command history | PostgreSQL |
| Story choice revisions | PostgreSQL |
| Rendering, sound, animation, haptics | Mini App |
| Responsive local prediction | Mini App, verified against Go vectors |
| Distributed request throttling | Redis, fail-open and non-authoritative |

Browser storage may remember presentation preferences and retain an unsent completed trace for retry. It never decides progression or rewards.

## Operational safety

Runtime database, Redis, and Telegram credentials remain in AWS SSM `SecureString` parameters. GitHub obtains short-lived AWS credentials through OIDC. The scoped Vercel deployment credential is used only by the protected release job.

Logs contain request IDs, route templates, latency, status, and bounded error reasons. They must not contain Telegram `initData`, bot tokens, database or Redis URLs, traces, or player and Run identifiers. Content and static assets contain no secrets.
