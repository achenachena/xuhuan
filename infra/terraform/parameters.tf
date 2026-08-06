resource "aws_secretsmanager_secret" "api" {
  name                    = "/${var.project_name}/${var.environment}/api"
  description             = "Populate a JSON object containing telegram_bot_token before enabling ECS tasks."
  recovery_window_in_days = 7
}

resource "aws_ssm_parameter" "cors_allowed_origins" {
  name  = "/${var.project_name}/${var.environment}/cors-allowed-origins"
  type  = "String"
  value = var.cors_allowed_origins
}

resource "aws_ssm_parameter" "redis_url" {
  name  = "/${var.project_name}/${var.environment}/redis-url"
  type  = "String"
  value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/0"
}

resource "aws_ssm_parameter" "otel_endpoint" {
  name  = "/${var.project_name}/${var.environment}/otel-endpoint"
  type  = "String"
  value = "http://127.0.0.1:4318"
}

resource "aws_ssm_parameter" "adot_config" {
  name = "/${var.project_name}/${var.environment}/adot-config"
  type = "String"
  value = yamlencode({
    receivers = {
      otlp = {
        protocols = {
          grpc = { endpoint = "0.0.0.0:4317" }
          http = { endpoint = "0.0.0.0:4318" }
        }
      }
    }
    processors = {
      batch = {}
    }
    exporters = {
      awsxray = { region = var.aws_region }
      awsemf = {
        region                  = var.aws_region
        namespace               = "Xuhuan/${var.environment}"
        log_group_name          = aws_cloudwatch_log_group.telemetry_metrics.name
        log_stream_name         = "application"
        dimension_rollup_option = "NoDimensionRollup"
      }
    }
    service = {
      pipelines = {
        traces = {
          receivers  = ["otlp"]
          processors = ["batch"]
          exporters  = ["awsxray"]
        }
        metrics = {
          receivers  = ["otlp"]
          processors = ["batch"]
          exporters  = ["awsemf"]
        }
      }
    }
  })
}
