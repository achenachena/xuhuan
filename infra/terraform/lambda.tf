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

  environment {
    variables = {
      APP_ENV                    = "production"
      APP_VERSION                = "bootstrap"
      CORS_ALLOWED_ORIGINS       = var.cors_allowed_origins
      RATE_LIMIT_WINDOW          = "1m"
      RATE_LIMIT_IP_REQUESTS     = "120"
      RATE_LIMIT_PLAYER_REQUESTS = "60"
      TELEGRAM_BOT_TOKEN         = "replaced-by-deploy-workflow"
      TELEGRAM_AUTH_MAX_AGE      = "24h"
      DATABASE_URL               = "replaced-by-deploy-workflow"
      REDIS_URL                  = "replaced-by-deploy-workflow"
      REDIS_TIMEOUT              = "1s"
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
    # Releases are owned by release-production.yml after the bootstrap apply. Ignoring
    # these fields prevents a later infrastructure plan from rolling back code,
    # live secrets, or the Free Plan concurrency guardrail.
    ignore_changes = [filename, environment, reserved_concurrent_executions]

    precondition {
      condition     = var.lambda_memory_size <= 512 && var.lambda_reserved_concurrency <= 2
      error_message = "The Free Plan topology caps Lambda at 512 MB and requests at most two reserved concurrent executions."
    }
  }
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  description      = "Stable public alias; updated only by the guarded deployment workflow."
  function_name    = aws_lambda_function.api.function_name
  function_version = aws_lambda_function.api.version

  lifecycle {
    ignore_changes = [description, function_version]
  }
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  qualifier          = aws_lambda_alias.live.name
  authorization_type = "NONE"
  invoke_mode        = "BUFFERED"
}
