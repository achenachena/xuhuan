output "api_url" {
  value = "https://${var.api_domain_name}"
}

output "load_balancer_dns_name" {
  value = aws_lb.api.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.api.name
}

output "ecs_task_definition_family" {
  value = aws_ecs_task_definition.api.family
}

output "application_subnet_ids" {
  value = [for subnet in aws_subnet.application : subnet.id]
}

output "api_security_group_id" {
  value = aws_security_group.api.id
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "api_secret_arn" {
  description = "Populate the telegram_bot_token JSON key out of band; Terraform never stores the value."
  value       = aws_secretsmanager_secret.api.arn
}

output "rds_managed_secret_arn" {
  value     = aws_db_instance.postgres.master_user_secret[0].secret_arn
  sensitive = true
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}
