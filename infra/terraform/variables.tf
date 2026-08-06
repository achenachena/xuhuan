variable "aws_region" {
  description = "AWS region for this isolated environment."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short name used in resource names."
  type        = string
  default     = "xuhuan"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.project_name))
    error_message = "project_name must be a short lowercase DNS-style name."
  }
}

variable "environment" {
  description = "Deployment environment. Use a separate state file for each value."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "github_repository" {
  description = "GitHub owner/repository allowed to assume the deployment role."
  type        = string
}

variable "github_oidc_provider_arn" {
  description = "ARN of the account-level token.actions.githubusercontent.com OIDC provider."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR for the environment VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "availability_zone_count" {
  description = "Number of availability zones; two is the supported minimum."
  type        = number
  default     = 2

  validation {
    condition     = var.availability_zone_count >= 2 && var.availability_zone_count <= 3
    error_message = "availability_zone_count must be two or three."
  }
}

variable "api_domain_name" {
  description = "Public API hostname, for example api.example.com."
  type        = string
}

variable "route53_zone_id" {
  description = "Optional Route 53 hosted-zone ID. Leave empty when DNS is managed elsewhere."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "Validated ACM certificate ARN for api_domain_name in this region."
  type        = string
}

variable "cors_allowed_origins" {
  description = "Exact HTTPS Mini App origins, comma separated."
  type        = string

  validation {
    condition     = !strcontains(var.cors_allowed_origins, "*") && startswith(var.cors_allowed_origins, "https://")
    error_message = "cors_allowed_origins must be an explicit HTTPS allowlist with no wildcard."
  }
}

variable "bootstrap_image_tag" {
  description = "Existing immutable ECR image tag used by Terraform's initial task definition."
  type        = string
  default     = "bootstrap-required"
}

variable "secrets_ready" {
  description = "Set true only after the API secret has a telegram_bot_token JSON key and a bootstrap image exists."
  type        = bool
  default     = false
}

variable "desired_count" {
  description = "Steady-state ECS task count once secrets_ready is true."
  type        = number
  default     = 1
}

variable "autoscaling_min_capacity" {
  type    = number
  default = 1
}

variable "autoscaling_max_capacity" {
  type    = number
  default = 4
}

variable "task_cpu" {
  description = "Fargate task CPU units, shared by the API and ADOT sidecar."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 1024
}

variable "database_name" {
  type    = string
  default = "xuhuan"
}

variable "database_master_username" {
  type    = string
  default = "xuhuan_admin"
}

variable "database_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "database_allocated_storage" {
  type    = number
  default = 20
}

variable "database_max_allocated_storage" {
  type    = number
  default = 100
}

variable "database_multi_az" {
  type    = bool
  default = false
}

variable "database_deletion_protection" {
  type    = bool
  default = true
}

variable "database_skip_final_snapshot" {
  type    = bool
  default = false
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "redis_replica_count" {
  description = "Total cache nodes. Use at least two for automatic failover."
  type        = number
  default     = 1
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "alarm_email" {
  description = "Optional email subscription for the alarm SNS topic. Confirmation is required."
  type        = string
  default     = ""
}
