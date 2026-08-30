# Production release

The production workflow releases one exact commit to Vercel and AWS Lambda. It does not run historical gameplay migrations or maintain compatibility with retired clients.

## Current production contract

- HTTP namespace: `/v2`
- content: `v3`
- simulation protocol: `action-v2`
- input trace: `rle8-v1`
- required PostgreSQL schema version: 6

Migrations 001–006 remain embedded because a new database must be able to build the current schema from an empty state. They are migration history, not runtime compatibility code. A future schema change must add a new numbered migration and a separately reviewed release step.

## Required GitHub environment

The protected `Production` environment provides:

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

AWS credentials are short-lived GitHub OIDC credentials. Runtime secrets remain in SSM Parameter Store. The Telegram bot token and Vercel deployment token are operational requirements, not player authentication products.

## Release procedure

1. Merge the candidate into `main` and wait for its CI workflow to pass.
2. Copy the full 40-character SHA at the current `main` head.
3. Run **Release Production V3** from `main` with that SHA.
4. Approve the protected `Production` environment.
5. Wait for the workflow to finish the synthetic Telegram journey and cleanup.

The workflow:

1. rejects a stale or non-`main` SHA;
2. requires successful CI for the exact commit;
3. validates content, generated API types, frontend checks, and Go tests;
4. builds and verifies an immutable Vercel production artifact;
5. obtains short-lived AWS credentials and confirms both Neon URLs expose the complete migration-6 schema;
6. builds, publishes, and directly checks an immutable Lambda version;
7. promotes the verified frontend artifact and switches the Lambda alias;
8. verifies CORS, health, readiness, both locales, and catalog counts;
9. runs the production API and browser smoke flow with an ephemeral signed Telegram identity; and
10. deletes that synthetic player and all cascading game records.

There is no routine maintenance window, schema reset, legacy contract migration, or Action V2 rollback branch. A normal code release is compatible with the current schema and replaces only the frontend artifact and Lambda alias target.

## Failure handling

- Before frontend promotion: production is unchanged; fix the candidate and release a new SHA.
- After frontend promotion but before the Lambda alias switch: the public frontend still speaks the same current protocol; fix forward with the checked candidate or a newer SHA.
- After the alias switch: keep the current schema and fix forward. Never edit an applied SQL migration.
- If the synthetic smoke fails, its cleanup still runs. Verify the player no longer exists before retrying.

Keep the workflow URL, commit SHA, Lambda version, Vercel deployment URL, and smoke summary. Never copy raw Telegram `initData`, bot tokens, database URLs, Redis URLs, or Vercel credentials into an issue or release note.
