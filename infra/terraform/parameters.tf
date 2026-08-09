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
