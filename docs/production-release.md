# Production release

Vercel deploys the frontend through its existing Git integration when a PR merges into `main`. The `Release production` GitHub workflow publishes the API from one explicit commit at the current `main` head.

## Required configuration

The protected `Production` environment supplies:

- `API_BASE_URL`
- `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, `AWS_LAMBDA_FUNCTION`, and `AWS_LAMBDA_ALIAS`
- SSM parameter names for PostgreSQL, Redis, and the Telegram bot token

GitHub OIDC provides short-lived AWS credentials. Long-lived AWS access keys are not stored in GitHub.

## Release steps

1. Wait for the required PR checks, then merge into `main`. CI tests the merge result and requires the branch to be up to date; it does not repeat the suite after merging.
2. Copy the full commit SHA from the current `main` head.
3. Run `Release production` with that SHA and approve the protected environment.
4. The workflow verifies that the commit is still the current remote `main` head.
5. It builds the arm64 Lambda once, before any AWS mutation, publishes an immutable version, then updates the stable alias. CI already tests the Go code; it does not produce a second, unused Lambda binary.
6. It checks API health, readiness and V4 content.
7. Confirm Vercel production points to the merged commit and open `/play` once to check the canvas and runtime errors. Use the API workflow result rather than repeating its successful HTTP checks manually. Do not rerun the full browser suite against production. Frontend-only changes do not require publishing another Lambda version.

The workflow does not repeat the entire CI suite or create a synthetic player. CI already covers contracts, repositories, PostgreSQL and Redis integration, and browser behavior.

## Database migrations

Migrations are not ceremonial release steps. Run `apps/api/cmd/migrate` only when the release contains a new schema migration, before deploying code that requires that schema. Use a compatibility migration pair only when an actual zero-downtime change needs both old and new code to coexist.

Never edit or delete historical migration files that may already have run in production.

## Failure handling

- If Lambda publication fails, the alias remains on its previous immutable version.
- Frontend and API releases are independent. If Vercel fails, inspect its build logs and retry that deployment. Keep API changes compatible with the currently deployed frontend.
- If smoke checks fail, inspect the Lambda and Vercel logs before retrying the same commit or releasing a correction.

Do not paste Telegram `initData`, bot tokens, database URLs, Redis URLs, AWS environment responses, or Vercel credentials into issues or release notes.
