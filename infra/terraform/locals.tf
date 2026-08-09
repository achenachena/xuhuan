data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  name          = "${var.project_name}-${var.environment}"
  function_name = "${local.name}-api"
  azs           = var.managed_data_services_enabled ? slice(data.aws_availability_zones.available.names, 0, var.availability_zone_count) : []

  common_tags = {
    Name = local.name
  }
}

check "lambda_vpc_requires_managed_data_services" {
  assert {
    condition     = !var.lambda_vpc_enabled || var.managed_data_services_enabled
    error_message = "lambda_vpc_enabled requires managed_data_services_enabled; external data services run outside the isolated VPC."
  }
}
