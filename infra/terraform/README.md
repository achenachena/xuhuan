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

## Migration switches

Two Terraform variables make the live RDS/ElastiCache migration reversible:

| Variable | Meaning |
| --- | --- |
| `managed_data_services_enabled` | Retains the legacy RDS, ElastiCache, isolated VPC, data alarms, and deploy-secret permission. |
| `lambda_vpc_enabled` | Attaches `$LATEST` Lambda configuration to that isolated VPC. It cannot be true when the managed data tier is false. |

Both default to `false`, so a fresh deployment cannot accidentally create the
continuously metered AWS data tier. An existing deployment temporarily sets
both to `true`; never change both to `false` in one unverified step.

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
The direct URL is used only by the IAM-invoked migration and seed operation.

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

The deploy workflow exchanges GitHub's OIDC token for short-lived AWS
credentials, reads the SecureStrings, replaces `$LATEST` code and configuration,
publishes a numbered Lambda version, migrates/seeds PostgreSQL, and promotes the
`live` alias only after the new version succeeds.

## Guarded cutover from RDS and ElastiCache

Use separate saved plans and review each one. The expected order is:

1. **Preserve everything.** Set both migration switches to `true`. Apply the
   moved resource addresses, SSM placeholders, and updated IAM policy. The plan
   must not delete or replace RDS, ElastiCache, or the VPC.
2. **Measure the source.** Publish the new Lambda code without promoting it and
   invoke `{"operation":"data-summary"}` on that numbered version. Record every
   table count. Catalog rows are deterministic; any player, battle, action,
   idempotency, ledger, or audit rows must be exported and imported before
   continuing.
3. **Prepare external services.** Store the Neon pooled/direct URLs and Upstash
   TLS URL in the SSM placeholders. Test PostgreSQL and Redis connectivity.
4. **Detach only `$LATEST`.** Keep `managed_data_services_enabled=true`, set
   `lambda_vpc_enabled=false`, and apply. The existing `live` numbered version
   stays on the old VPC and remains the rollback path.
5. **Release externally.** Update the protected GitHub variables and run
   `Deploy API`. It migrates/seeds Neon, publishes a new version, promotes
   `live`, and checks `/healthz` and `/readyz`. Exercise one authenticated read
   and battle flow if a Telegram session is available.
6. **Observe before deletion.** Invoke `data-summary` on the new live version,
   compare expected authoritative counts, verify CloudWatch has no connection
   errors, and retain the old data tier until these checks pass.
7. **Disable RDS deletion protection.** Keep managed services enabled, set
   `database_deletion_protection=false`, and apply that change by itself.
8. **Persist the no-snapshot decision separately.** Keep
   `managed_data_services_enabled=true` and `lambda_vpc_enabled=false`, set
   `database_skip_final_snapshot=true` only after authoritative data is
   verified elsewhere, and apply a plan with zero destroys. Confirm Terraform
   state records `skip_final_snapshot=true` and no final snapshot identifier.
   Do not combine this state change with removing the counted RDS resource: a
   destroy plan can otherwise retain the old `skip_final_snapshot=false` state.
9. **Release Lambda VPC interfaces.** List every alias and published version,
   then delete only unaliased historical versions that still reference the old
   VPC. Keep the execution role's EC2 interface permissions in place and allow
   up to 20 minutes for Lambda to delete its Hyperplane ENIs. Verify that no ENI
   uses the legacy Lambda security group before continuing.
10. **Remove fixed-cost resources.** Set
    `managed_data_services_enabled=false` and keep
    `lambda_vpc_enabled=false`. Review a new saved plan listing the exact RDS,
    ElastiCache, VPC, subnet, security-group, and obsolete alarm deletions.
    Confirm the Lambda function, `live` alias, Function URL, and SSM parameters
    are no-ops, then apply. The final IAM update should remove the now-unused
    EC2 interface and RDS bootstrap-secret permissions.

Do not destroy the source tier if any count is unexplained or the new API is not
ready. The existing VPC-backed Lambda versions are the direct rollback path
through step 8; the old data resources remain intact until step 10.

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
