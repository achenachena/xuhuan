# AWS infrastructure preparation

This directory describes a paid AWS deployment target; nothing here has been applied. Keep staging and production in separate state files and AWS accounts where possible. Configure a remote encrypted state backend with locking before the first shared apply—the backend itself is intentionally not hard-coded because its bucket/table names are owner decisions.

## Prepared topology

- Two or three availability zones with public load-balancer subnets, private application subnets, and isolated data subnets.
- An HTTPS Application Load Balancer forwarding only to private ECS Fargate tasks.
- An immutable, scan-on-push ECR repository and ECS deployment circuit breaker.
- RDS PostgreSQL 17 with encryption, managed master credentials in Secrets Manager, backups, forced TLS, enhanced monitoring, and deletion protection.
- Encrypted ElastiCache Redis with TLS, private security-group access, and optional replicas/failover. Redis remains non-authoritative.
- An AWS Distro for OpenTelemetry sidecar exporting application traces to X-Ray and metrics through CloudWatch EMF. API, collector, RDS, ECS, ALB, and alarm telemetry stay in CloudWatch/X-Ray.
- Exact task-execution/task/deployment IAM policies and GitHub OIDC trust scoped to one repository and protected environment.

NAT gateways, Fargate, ALB, RDS, ElastiCache, CloudWatch, Route 53, ACM, ECR, and data transfer can all incur charges. Obtain explicit owner approval before any `terraform apply` or deployment workflow run.

## Static validation

Install Terraform 1.15.x, then run only the non-mutating checks:

```sh
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
```

`terraform plan` contacts AWS but does not create resources. Use an explicit environment file and saved plan only after account/domain/certificate/sizing/cost choices are reviewed:

```sh
terraform -chdir=infra/terraform plan -var-file=staging.tfvars -out=staging.tfplan
```

Never apply a plan copied from another environment.

## Owner inputs and bootstrap order

1. Copy the appropriate `*.tfvars.example` to an untracked `*.tfvars` and replace account, OIDC provider, domain, hosted-zone, certificate, sizing, and alarm values.
2. Add a remote state backend and verify the selected AWS account/region.
3. With approval, apply first with `secrets_ready = false`. This deliberately creates zero API tasks.
4. Populate the created API secret out of band with a JSON object containing `telegram_bot_token`. Terraform never receives or stores the token.
5. Build and push one image under its full Git SHA, update `bootstrap_image_tag`, set `secrets_ready = true`, review a fresh plan, and apply with approval.
6. Configure protected GitHub `staging` and `production` environments with the Terraform outputs and required approvals.

The API accepts split `DATABASE_*` settings so ECS can inject RDS-managed `username` and `password` JSON fields without assembling or storing a database URL in Terraform state.

## Deployment workflow configuration

For `.github/workflows/deploy-api.yml`, configure these GitHub environment variables:

- `AWS_REGION`
- `AWS_DEPLOY_ROLE_ARN`
- `AWS_ECR_REPOSITORY` (repository name, not URL)
- `AWS_ECS_CLUSTER`
- `AWS_ECS_SERVICE`
- `API_BASE_URL`

The workflow uses GitHub OIDC, pushes only the immutable commit SHA, records the prior task definition, registers the new revision, runs migrations as a one-off task, waits for ECS stability, checks `/healthz` and `/readyz`, and explicitly restores the previous revision on failure. The ECS circuit breaker independently rolls back failed rollouts.

For `.github/workflows/deploy-miniapp.yml`, configure `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as environment variables and `VERCEL_TOKEN` as a secret. It creates a prebuilt deployment, smoke-tests its immutable URL, and promotes that exact artifact only for production.

## Deliberately deferred

SQS and EventBridge are absent. No selected feature needs asynchronous delivery yet; adding empty infrastructure would increase cost and operational surface without improving the game.
