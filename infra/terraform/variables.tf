variable "aws_region" {
  description = "AWS region for the single Free Plan environment."
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
  description = "Protected GitHub environment used for this single deployment."
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "github_repository" {
  description = "GitHub owner/repository allowed to assume the deployment role."
  type        = string
}

variable "github_environment" {
  description = "Case-sensitive protected GitHub environment used in the OIDC subject claim."
  type        = string
  default     = "Production"

  validation {
    condition     = contains(["staging", "Production"], var.github_environment)
    error_message = "github_environment must be staging or Production."
  }
}

variable "github_oidc_provider_arn" {
  description = "ARN of the account-level token.actions.githubusercontent.com OIDC provider."
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

variable "lambda_package_path" {
  description = "Bootstrap zip built before the first apply; later releases use the deploy workflow."
  type        = string
  default     = "../../apps/api/build/lambda.zip"
}

variable "lambda_memory_size" {
  description = "Memory allocated to the arm64 Go Lambda."
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Maximum HTTP or maintenance invocation duration in seconds."
  type        = number
  default     = 30
}

variable "lambda_reserved_concurrency" {
  description = "Concurrency enabled by the deploy workflow after secrets and migrations are ready."
  type        = number
  default     = 2
}

variable "log_retention_days" {
  type    = number
  default = 3

  validation {
    condition     = contains([1, 3, 5, 7], var.log_retention_days)
    error_message = "Free Plan log retention must be 1, 3, 5, or 7 days."
  }
}

variable "alarm_email" {
  description = "Optional email subscription for alarms; confirmation is required."
  type        = string
  default     = ""
}
