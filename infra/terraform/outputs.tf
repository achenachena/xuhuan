output "api_url" {
  value = trimsuffix(aws_lambda_function_url.api.function_url, "/")
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "lambda_alias_name" {
  value = aws_lambda_alias.live.name
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "telegram_token_parameter_name" {
  description = "Replace the placeholder value out of band before the first deployment."
  value       = aws_ssm_parameter.telegram_bot_token.name
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
