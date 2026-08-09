resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  filename      = abspath("${path.module}/${var.lambda_package_path}")
  function_name = local.function_name
  description   = "Xuhuan Go API on the AWS Free Plan topology"
  role          = aws_iam_role.lambda_execution.arn
  handler       = "bootstrap"
  runtime       = "provided.al2023"
  architectures = ["arm64"]
  memory_size   = var.lambda_memory_size
  timeout       = var.lambda_timeout
  publish       = true

  # Terraform creates a deliberately disabled bootstrap. The deployment
  # workflow injects real secrets, publishes a version, points the live alias at
  # it, and then enables the small concurrency limit.
  reserved_concurrent_executions = 0

  vpc_config {
    subnet_ids         = [for subnet in aws_subnet.data : subnet.id]
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      APP_ENV                    = "production"
      APP_VERSION                = "bootstrap"
      DATABASE_HOST              = aws_db_instance.postgres.address
      DATABASE_PORT              = tostring(aws_db_instance.postgres.port)
      DATABASE_NAME              = var.database_name
      DATABASE_USER              = var.database_master_username
      DATABASE_PASSWORD          = "replaced-by-deploy-workflow"
      DATABASE_SSLMODE           = "require"
      REDIS_URL                  = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/0"
      REDIS_TIMEOUT              = "150ms"
      CORS_ALLOWED_ORIGINS       = var.cors_allowed_origins
      TRUST_PROXY                = "true"
      RATE_LIMIT_WINDOW          = "1m"
      RATE_LIMIT_IP_REQUESTS     = "120"
      RATE_LIMIT_PLAYER_REQUESTS = "60"
      TELEGRAM_BOT_TOKEN         = "replaced-by-deploy-workflow"
      TELEGRAM_AUTH_MAX_AGE      = "24h"
      OTEL_SERVICE_NAME          = "xuhuan-api"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_iam_role_policy.lambda_execution,
  ]

  lifecycle {
    # Releases are owned by deploy-api.yml after the bootstrap apply. Ignoring
    # these fields prevents a later infrastructure plan from rolling back code,
    # live secrets, or the Free Plan concurrency guardrail.
    ignore_changes = [filename, environment, reserved_concurrent_executions]

    precondition {
      condition     = var.lambda_memory_size <= 512 && var.lambda_reserved_concurrency <= 2
      error_message = "The Free Plan topology caps Lambda at 512 MB and two concurrent executions."
    }
  }
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  description      = "Stable public alias; updated only by the guarded deployment workflow."
  function_name    = aws_lambda_function.api.function_name
  function_version = aws_lambda_function.api.version

  lifecycle {
    ignore_changes = [function_version]
  }
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  qualifier          = aws_lambda_alias.live.name
  authorization_type = "NONE"
  invoke_mode        = "BUFFERED"
}
