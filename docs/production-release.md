# Production release

The `Release production` GitHub workflow deploys one explicit commit from the current `main` branch.

## Required configuration

The protected `Production` environment supplies:

- `API_BASE_URL`
- `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, `AWS_LAMBDA_FUNCTION`, and `AWS_LAMBDA_ALIAS`
- SSM parameter names for PostgreSQL, Redis, and the Telegram bot token
- `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and the `VERCEL_TOKEN` secret

GitHub OIDC provides short-lived AWS credentials. Long-lived AWS access keys are not stored in GitHub.

## Release steps

1. Merge a reviewed change to `main` and wait for CI.
2. Copy the full commit SHA from the current `main` head.
3. Run `Release production` with that SHA and approve the protected environment.
4. The workflow verifies that the commit is still the current remote `main` head.
5. It builds and publishes a new arm64 Lambda version, then updates the stable alias.
6. It builds and deploys the Next.js production artifact with the pinned Vercel CLI.
7. It checks API health, readiness, V4 content, the portfolio, and the browser demo.

The workflow does not repeat the entire CI suite or create a synthetic player. CI already covers contracts, repositories, frontend behavior, and the browser-to-database journey.

## Database migrations

Migrations are not ceremonial release steps. Run `apps/api/cmd/migrate` only when the release contains a new schema migration, before deploying code that requires that schema. Use a compatibility migration pair only when an actual zero-downtime change needs both old and new code to coexist.

Never edit or delete historical migration files that may already have run in production.

## Failure handling

- If Lambda publication fails, the alias remains on its previous immutable version.
- If the Vercel deployment fails after the Lambda switch, fix forward or redeploy the prior frontend; the REST namespace remains backward-compatible for ordinary changes.
- If smoke checks fail, inspect the Lambda and Vercel logs before retrying the same commit or releasing a correction.

Do not paste Telegram `initData`, bot tokens, database URLs, Redis URLs, AWS environment responses, or Vercel credentials into issues or release notes.
