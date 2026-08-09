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
  description = "The deploy workflow reads this once per release and injects credentials into the versioned Lambda configuration."
  value       = aws_db_instance.postgres.master_user_secret[0].secret_arn
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}
