# Production release

The protected **Release Production V4** workflow publishes one exact `main` commit to Vercel and AWS Lambda. The V4 cutover is forward-only because migration 007 resets gameplay progress and migration 008 removes retired Action V3 columns.

The public browser portfolio and `/demo` are static Vercel surfaces. They require no schema migration or second authentication path. CI verifies that the checked-in `demo-v1` manifests still match the Go V4 catalog before building the frontend.

## Release contract

- HTTP namespace: `/v2`
- content version: `v4`
- simulation protocol: `shooter-v1`
- input trace: `x-position-rle-v1`
- prepared PostgreSQL schema: migration 007
- finalized PostgreSQL schema: migration 008

Historical migrations remain embedded so an empty database can be built to the current schema. Never edit a migration already applied in production.

## Required protected environment

The `Production` GitHub environment provides:

- `AWS_REGION`
- `AWS_DEPLOY_ROLE_ARN`
- `AWS_LAMBDA_FUNCTION`
- `AWS_LAMBDA_ALIAS`
- `AWS_DATABASE_URL_PARAMETER`
- `AWS_DATABASE_MIGRATION_URL_PARAMETER`
- `AWS_REDIS_URL_PARAMETER`
- `AWS_TELEGRAM_TOKEN_PARAMETER`
- `API_BASE_URL`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- the scoped `VERCEL_TOKEN` secret

GitHub receives short-lived AWS credentials through OIDC. Runtime database, Redis, and Telegram secrets remain in SSM. The Vercel token is an existing scoped deployment credential. None of these values creates a player account, game session, payment identity, or public capability token.

## Before approval

1. Merge the reviewed candidate into protected `main`.
2. Wait for CI, CodeQL, content, asset, API-type, Terraform, and browser checks to pass for the exact commit.
3. Confirm the planned reset is acceptable: Telegram identities and language preferences remain, while Runs, story choices, unlocks, daily results, and campaign progress restart for V4.
4. Copy the full 40-character SHA at the current `main` head.
5. Start **Release Production V4** with that SHA and approve the `Production` environment.

Do not run migration 007 manually before the release artifact is ready. The workflow orders the maintenance/cutover steps.

## Workflow sequence

The release job:

1. rejects a stale SHA or commit not at current `main`;
2. requires successful CI for that exact SHA;
3. reruns V4 content, locale, asset, API-type, frontend, and Go gates;
4. builds an immutable Vercel production candidate without assigning public domains;
5. verifies the candidate metadata and exact `CONTENT-V4 / SHOOTER-V1` marker;
6. builds an immutable Lambda ZIP and verifies its artifact hash;
7. validates that Neon is at a supported V4 boundary (schema 006, prepared 007, or finalized 008) and obtains runtime configuration from SSM without printing values;
8. promotes the exact staged Mini App artifact;
9. confirms the promoted Vercel production target ID equals the staged deployment ID, then chooses only a public alias that serves the exact V4 marker and passes API CORS;
10. applies migration 007 when the database is still at 006, or verifies the existing prepared/finalized V4 boundary on a fix-forward rerun; player identity/language are preserved while gameplay state is reset once;
11. publishes and directly checks the immutable Lambda version before switching the stable alias;
12. validates health, readiness, CORS, English/Chinese V4 content, 8 chapters, 24 normal segments plus 8 boss rooms (32 combat rooms total), 24 boss stages, 12 effects, 7 characters, 7 companions, and 6 chassis;
13. runs signed API and Telegram browser smoke journeys with a fresh synthetic player;
14. applies migration 008 when needed to remove retired V3 gameplay columns only after smoke succeeds, and treats an existing 008 boundary as an idempotent fix-forward rerun; and
15. removes the synthetic player and its cascading records in an `always()` cleanup step.

The Vercel project query in step 9 reuses the existing deployment token. It does not add an authentication service, database state, game token, or long-lived release session.

## Forward-only failure handling

- **Before Vercel promotion:** production is unchanged. Fix the candidate and release a new SHA.
- **After promotion but before migration 007:** the public V4 frontend should display maintenance until the API is ready. Fix forward or promote a corrected candidate.
- **After migration 007:** old gameplay progress is intentionally unavailable. Keep maintenance visible and fix forward; do not advertise a V3 save rollback.
- **After Lambda alias switch but before migration 008:** V4 is live while compatibility columns remain. Fix forward, rerun smoke, and apply 008 only after success.
- **After migration 008:** restore service with a new migration and code release. Never reverse schema by editing migration history.

If smoke fails, verify the cleanup step removed only the generated synthetic Telegram user before retrying.

## Evidence to retain

Record the workflow URL, commit SHA, Lambda immutable version, staged Vercel deployment ID/URL, promoted public origin, schema versions, and smoke summary. Do not copy raw Telegram `initData`, bot tokens, database URLs, Redis URLs, AWS responses containing environment variables, or Vercel credentials into issues or release notes.

## Post-release checks

- Open the production origin in a normal browser. Confirm that the portfolio renders without calling `/v2/game`, both public links work, and `/demo` completes a wave, one show-effect choice, and the Boss showcase without any API mutation.
- Open the Mini App through Telegram and verify English default, Chinese switching, safe-area layout, direct horizontal movement, special timing, one chapter resume, and a story choice revision.
- Confirm `/healthz`, `/readyz`, and `/v2/content/v4?locale=en` return the V4 contract.
- Confirm Lambda errors and throttles remain at baseline.
- Check Neon and Upstash usage and the AWS billing page; V4 adds no fixed-cost resource.
- Confirm no unexpected player records remain from production smoke.
