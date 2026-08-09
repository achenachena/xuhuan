# AWS Free Plan infrastructure preparation

This directory describes a credit-conscious AWS deployment; nothing here has been applied. It preserves the Go, PostgreSQL, and Redis-compatible design while removing the continuously metered NAT Gateway, Application Load Balancer, Fargate, ECR, Route 53, ACM, and telemetry sidecar resources.

An AWS Free Plan account does not charge its payment method, but access ends when the plan expires or its credits are exhausted. Every `terraform apply` and deployment still consumes credits. Never upgrade the account to a paid plan without a new cost review.

## Prepared topology

- One public arm64 Go Lambda on the `provided.al2023` runtime, exposed through a stable `live` Function URL alias.
- Memory capped at 512 MB and requested reserved concurrency capped at two. A
  new account that cannot yet allocate reserved concurrency temporarily uses
  its reduced account-wide Lambda concurrency cap.
- Two isolated subnets with no internet gateway, public IPv4 address, NAT gateway, or VPC interface endpoint.
- Single-AZ `db.t4g.micro` RDS PostgreSQL 17 with 20 GB encrypted storage and an AWS-managed master secret.
- One encrypted `cache.t4g.micro` ElastiCache Valkey 8 node. It speaks the Redis protocol and remains non-authoritative.
- A standard-tier SSM SecureString placeholder for the Telegram bot token.
- Three-day Lambda logs, four infrastructure alarms, and one optional email SNS subscription.
- GitHub OIDC roles scoped to one protected environment and the exact Lambda, RDS secret, and SSM parameter.

Terraform preconditions reject larger RDS, Valkey, Lambda memory, concurrency, storage, or availability-zone values. This limits accidental credit burn but cannot make AWS promotional terms permanent.

## Static validation

Install Terraform 1.15.x and build the bootstrap archive, then run only non-mutating checks:

```sh
make lambda-package
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
```

The archive is ignored by Git and exists only to create the disabled bootstrap function. Later releases are owned by the protected GitHub workflow.

## Owner inputs

Copy `production.tfvars.example` to the ignored `production.tfvars` and replace only:

- `github_oidc_provider_arn`
- `github_environment` (`Production` is case-sensitive for the OIDC subject)
- `cors_allowed_origins`
- `alarm_email`

Keep the micro instance, 20 GB storage, 512 MB Lambda, concurrency two, two AZ, single-node cache, and three-day log values unchanged. Do not commit the real tfvars file or email address.

For shared or recoverable state, use an encrypted/versioned S3 backend with native state locking. The backend is intentionally not hard-coded because its globally unique bucket name is an owner decision. A local state is acceptable only for the initial personal experiment if it is backed up securely and never committed.

## Guarded bootstrap order

1. Confirm the AWS console still shows `Free plan`, the remaining credits, and the expiration date. Do not click **Upgrade plan**.
2. Build `apps/api/build/lambda.zip` with `make lambda-package`.
3. Run a saved `terraform plan` with the production var file. Planning contacts AWS but creates nothing:

   ```sh
   terraform -chdir=infra/terraform plan -var-file=production.tfvars -out=production.tfplan
   ```

4. Review the exact resource list and obtain explicit approval before applying. The first apply creates a Lambda with reserved concurrency zero, so the public URL cannot run with placeholder secrets.
5. Replace the SSM placeholder directly in AWS; never pass the real token through Terraform or commit it:

   ```sh
   aws ssm put-parameter \
     --region us-east-1 \
     --name /xuhuan/production/telegram-bot-token \
     --type SecureString \
     --overwrite \
     --value 'ENTER_TOKEN_INTERACTIVELY'
   ```

   Avoid placing the literal token in shell history. Prefer the AWS console or a securely sourced environment variable for the real command.

6. Configure the protected GitHub `production` environment using the outputs below.
7. Run `Deploy API`. It injects the RDS and Telegram secrets into `$LATEST`, publishes an immutable version, enables reserved concurrency two when the account quota permits it, migrates/seeds PostgreSQL, promotes `live`, and smoke-tests the Function URL. New accounts that cannot leave the required ten unreserved executions use their reduced account-wide concurrency cap until AWS raises it automatically. A failure restores both the previous alias and concurrency mode.
8. Set Vercel `NEXT_PUBLIC_API_URL` to the `api_url` output and redeploy the Mini App.

## GitHub environment configuration

Configure these variables; none contains a secret value:

- `AWS_REGION=us-east-1`
- `AWS_DEPLOY_ROLE_ARN` from `github_deploy_role_arn`
- `AWS_LAMBDA_FUNCTION` from `lambda_function_name`
- `AWS_LAMBDA_ALIAS` from `lambda_alias_name`
- `AWS_LAMBDA_RESERVED_CONCURRENCY` from `lambda_reserved_concurrency`
- `AWS_RDS_SECRET_ARN` from `rds_managed_secret_arn`
- `AWS_TELEGRAM_TOKEN_PARAMETER` from `telegram_token_parameter_name`
- `API_BASE_URL` from `api_url`

The workflow receives short-lived AWS credentials through OIDC. It does not require AWS access keys or a GitHub copy of the Telegram/database secrets.

## Credit safety

- Run only one environment. Do not keep staging and production online together.
- Watch the deployment warning for a new-account concurrency fallback. Until
  AWS raises the regional quota to at least twelve, the function can use the
  account-wide cap of ten instead of its requested per-function cap of two.
- Check Billing → Free Tier after apply and after each deployment. Credit reporting is delayed.
- Keep RDS CPU below the burst baseline and avoid manual snapshots or exports.
- Valkey stores rate-limit counters only; snapshots and replicas are disabled.
- The generated Function URL avoids custom-domain and load-balancer resources.
- Before Free Plan expiry, export PostgreSQL data and destroy the stack or accept that AWS access will end. Do not upgrade automatically.

## Deliberately deferred

SQS, EventBridge, custom domains, high availability, Redis replicas, enhanced RDS monitoring, X-Ray, OTLP collectors, and separate staging infrastructure are absent. They add cost or operational surface without improving the current personal game.
