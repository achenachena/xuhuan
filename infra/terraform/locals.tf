data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  name          = "${var.project_name}-${var.environment}"
  function_name = "${local.name}-api"
  azs           = slice(data.aws_availability_zones.available.names, 0, var.availability_zone_count)

  common_tags = {
    Name = local.name
  }
}
