# The placeholder is safe to commit to Terraform state. Replace it out of band
# before the first deployment. The deploy workflow decrypts the standard-tier
# parameter once and injects it into the Lambda environment, avoiding paid VPC
# interface endpoints for SSM at runtime.
resource "aws_ssm_parameter" "telegram_bot_token" {
  name        = "/${var.project_name}/${var.environment}/telegram-bot-token"
  description = "Replace out of band before enabling the API Lambda."
  type        = "SecureString"
  tier        = "Standard"
  value       = "replace-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

# External data-service credentials are written out of band after Terraform
# creates these standard-tier SecureString placeholders. Keeping only
# placeholders in state avoids committing Neon or Upstash credentials.
resource "aws_ssm_parameter" "database_url" {
  name        = "/${var.project_name}/${var.environment}/database-url"
  description = "Pooled PostgreSQL URL used by the serverless API runtime."
  type        = "SecureString"
  tier        = "Standard"
  value       = "replace-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "database_migration_url" {
  name        = "/${var.project_name}/${var.environment}/database-migration-url"
  description = "Direct PostgreSQL URL used only for schema migrations."
  type        = "SecureString"
  tier        = "Standard"
  value       = "replace-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "redis_url" {
  name        = "/${var.project_name}/${var.environment}/redis-url"
  description = "TLS Redis URL used by the distributed rate limiter."
  type        = "SecureString"
  tier        = "Standard"
  value       = "replace-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}
