# Zero-fixed-cost production infrastructure

This directory owns the AWS edge of Xuhuan's production deployment. The final
topology keeps the Go backend on AWS Lambda while moving continuously billed
data services to free serverless providers:

- arm64 Go Lambda on `provided.al2023`, exposed through the stable `live`
  Function URL alias;
- Neon PostgreSQL for the authoritative relational data;
- Upstash Redis for non-authoritative distributed rate limits;
- standard-tier SSM SecureStrings for the two PostgreSQL URLs, Redis URL, and
  Telegram token;
- short-retention CloudWatch logs, Lambda alarms, SNS, GitHub OIDC, and no
  long-lived AWS access keys.

There is no VPC, NAT Gateway, RDS, ElastiCache, API Gateway, load balancer,
Fargate service, or ECR repository after cutover. PostgreSQL SQL, foreign keys,
JSONB, `SELECT ... FOR UPDATE`, advisory migration locks, and multi-table
transactions remain real PostgreSQL features. The rate limiter continues to
use the Redis protocol and an atomic Lua script.

The owner requires zero cash spending. Keep AWS on its Free Plan and Neon and
Upstash on their free plans; do not add payment-backed upgrades or paid add-ons.
Usage limits are availability limits: if a free allowance is exhausted, let
the service pause or throttle and investigate before changing plans.

## Static validation

Use the repository-pinned Terraform version and validate before every plan:

```sh
make lambda-package
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
```

The ignored `production.tfvars` and local state must remain mode `0600` and
must never be committed. For a team deployment, use an encrypted, versioned S3
backend with native state locking.

## External free data services

Create exactly one production project/database in each provider.

### Neon PostgreSQL

1. Select Neon Free and do not enable a paid plan or add-on.
2. Create a project and database for Xuhuan.
3. Copy the pooled connection URL for `DATABASE_URL`; its hostname normally
   contains `-pooler`.
4. Copy the direct connection URL for `DATABASE_MIGRATION_URL`.
5. Require TLS in both URLs. Do not commit or print either password.

Lambda's pgx pool uses at most four connections per execution environment and
keeps zero minimum connections, allowing Neon compute to suspend while idle.
The direct URL is read from Parameter Store by the exact-SHA GitHub production
workflow and used only by its bounded migration runner. It is never added to
the Lambda runtime environment.

### Upstash Redis

1. Select the Upstash Free Redis plan and do not enable paid overage.
2. Create one database in the closest practical North American region.
3. Copy the TLS Redis URL in the form `rediss://default:...@...:port`.

The Redis database contains only short-lived rate-limit counters. If it is
unavailable or at its free limit, the API fails over to a bounded in-process
limiter; authoritative game data remains safe in PostgreSQL.

## Secret storage

Terraform creates placeholders only. Replace all four values out of band in
AWS Systems Manager Parameter Store as standard `SecureString` parameters:

- `/xuhuan/production/database-url`
- `/xuhuan/production/database-migration-url`
- `/xuhuan/production/redis-url`
- `/xuhuan/production/telegram-bot-token`

Prefer the AWS console or an interactive secret source so credentials do not
enter shell history. Terraform ignores later value changes and therefore never
stores these provider credentials in its state.

## Protected GitHub environment

Configure the `Production` environment with these non-secret variables:

- `AWS_REGION=us-east-1`
- `AWS_DEPLOY_ROLE_ARN` from `github_deploy_role_arn`
- `AWS_LAMBDA_FUNCTION` from `lambda_function_name`
- `AWS_LAMBDA_ALIAS` from `lambda_alias_name`
- `AWS_LAMBDA_RESERVED_CONCURRENCY` from `lambda_reserved_concurrency`
- `AWS_DATABASE_URL_PARAMETER` from `database_url_parameter_name`
- `AWS_DATABASE_MIGRATION_URL_PARAMETER` from
  `database_migration_url_parameter_name`
- `AWS_REDIS_URL_PARAMETER` from `redis_url_parameter_name`
- `AWS_TELEGRAM_TOKEN_PARAMETER` from `telegram_token_parameter_name`
- `API_BASE_URL` from `api_url`
- `VERCEL_ORG_ID` for the team/account that owns the linked Mini App project
- `VERCEL_PROJECT_ID` for that Mini App project

Add `VERCEL_TOKEN` as a protected-environment secret scoped to that project and
team. It is the only long-lived deployment credential consumed by GitHub; AWS
access remains short-lived through OIDC.

The deploy workflow exchanges GitHub's OIDC token for short-lived AWS
credentials, verifies the direct and pooled PostgreSQL migration boundary,
stages and checks an exact-SHA Vercel artifact, reads the SecureStrings, replaces
`$LATEST` code and configuration, publishes a numbered Lambda version, promotes
the compatible frontend, applies PostgreSQL migrations, and verifies the `live`
alias again afterward.
Contract migrations are a rollback boundary: after a successful destructive
migration, the workflow does not repoint `live` to an older binary that depends
on the removed schema. Failures after that point are fixed forward.

## Cost and operational guardrails

- Keep one production environment; do not run staging concurrently.
- Lambda memory is capped at 512 MB and requested reserved concurrency at two.
  A new AWS account may temporarily use its reduced account-wide concurrency
  cap until AWS permits the per-function reservation.
- Keep CloudWatch retention at three days and do not enable X-Ray, OTLP
  collectors, custom domains, API Gateway, provisioned concurrency, VPC
  endpoints, or extra alarms without a cost review.
- Watch AWS credits and plan expiration, Neon compute/storage usage, and Upstash
  commands/storage. Reporting can be delayed.
- Redis is disposable. PostgreSQL is not: export authoritative data before any
  provider reset or Free Plan expiration.
- Rotate exposed database, Redis, or Telegram credentials immediately, update
  the SSM value, and publish a new immutable Lambda version.

SQS, EventBridge, custom domains, replicas, high availability, and separate
staging infrastructure remain deferred until a concrete feature justifies both
their complexity and their cost.
