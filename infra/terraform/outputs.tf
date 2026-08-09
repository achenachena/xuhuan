output "api_url" {
  value = trimsuffix(aws_lambda_function_url.api.function_url, "/")
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "lambda_alias_name" {
  value = aws_lambda_alias.live.name
}

output "lambda_reserved_concurrency" {
  value = var.lambda_reserved_concurrency
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "telegram_token_parameter_name" {
  description = "Replace the placeholder value out of band before the first deployment."
  value       = aws_ssm_parameter.telegram_bot_token.name
}

output "rds_managed_secret_arn" {
  description = "Legacy RDS credential secret retained only during the guarded external-data migration."
  value       = var.managed_data_services_enabled ? aws_db_instance.postgres[0].master_user_secret[0].secret_arn : null
}

output "database_url_parameter_name" {
  value = aws_ssm_parameter.database_url.name
}

output "database_migration_url_parameter_name" {
  value = aws_ssm_parameter.database_migration_url.name
}

output "redis_url_parameter_name" {
  value = aws_ssm_parameter.redis_url.name
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}
