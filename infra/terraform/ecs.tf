resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}/api"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "adot" {
  name              = "/ecs/${local.name}/adot"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "telemetry_metrics" {
  name              = "/ecs/${local.name}/metrics"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:${var.bootstrap_image_tag}"
      essential = true
      cpu       = floor(var.task_cpu * 0.75)
      memory    = floor(var.task_memory * 0.75)
      portMappings = [{
        name          = "http"
        containerPort = 8080
        hostPort      = 8080
        protocol      = "tcp"
      }]
      environment = [
        { name = "APP_ENV", value = "production" },
        { name = "APP_VERSION", value = var.bootstrap_image_tag },
        { name = "HTTP_ADDR", value = ":8080" },
        { name = "TRUST_PROXY", value = "true" },
        { name = "DATABASE_HOST", value = aws_db_instance.postgres.address },
        { name = "DATABASE_PORT", value = tostring(aws_db_instance.postgres.port) },
        { name = "DATABASE_NAME", value = var.database_name },
        { name = "DATABASE_SSLMODE", value = "require" },
        { name = "REDIS_TIMEOUT", value = "150ms" },
        { name = "RATE_LIMIT_WINDOW", value = "1m" },
        { name = "RATE_LIMIT_IP_REQUESTS", value = "120" },
        { name = "RATE_LIMIT_PLAYER_REQUESTS", value = "60" },
        { name = "TELEGRAM_AUTH_MAX_AGE", value = "24h" },
        { name = "OTEL_SERVICE_NAME", value = "xuhuan-api" },
        { name = "OTEL_EXPORT_INTERVAL", value = "30s" },
      ]
      secrets = [
        { name = "DATABASE_USER", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:username::" },
        { name = "DATABASE_PASSWORD", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:password::" },
        { name = "TELEGRAM_BOT_TOKEN", valueFrom = "${aws_secretsmanager_secret.api.arn}:telegram_bot_token::" },
        { name = "CORS_ALLOWED_ORIGINS", valueFrom = aws_ssm_parameter.cors_allowed_origins.arn },
        { name = "REDIS_URL", valueFrom = aws_ssm_parameter.redis_url.arn },
        { name = "OTEL_EXPORTER_OTLP_ENDPOINT", valueFrom = aws_ssm_parameter.otel_endpoint.arn },
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1"]
        interval    = 15
        timeout     = 5
        retries     = 3
        startPeriod = 10
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "api"
        }
      }
    },
    {
      name      = "adot"
      image     = "public.ecr.aws/aws-observability/aws-otel-collector:v0.48.0"
      essential = false
      cpu       = ceil(var.task_cpu * 0.25)
      memory    = ceil(var.task_memory * 0.25)
      portMappings = [
        { containerPort = 4317, hostPort = 4317, protocol = "tcp" },
        { containerPort = 4318, hostPort = 4318, protocol = "tcp" },
      ]
      secrets = [{ name = "AOT_CONFIG_CONTENT", valueFrom = aws_ssm_parameter.adot_config.arn }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.adot.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "collector"
        }
      }
    },
  ])
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.secrets_ready ? var.desired_count : 0
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 30
  enable_execute_command             = false
  enable_ecs_managed_tags            = true
  propagate_tags                     = "SERVICE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = [for subnet in aws_subnet.application : subnet.id]
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8080
  }

  depends_on = [aws_lb_listener.https, aws_iam_role_policy.ecs_execution]

  lifecycle {
    ignore_changes = [task_definition]
  }
}

resource "aws_appautoscaling_target" "api" {
  max_capacity       = var.autoscaling_max_capacity
  min_capacity       = var.secrets_ready ? var.autoscaling_min_capacity : 0
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
