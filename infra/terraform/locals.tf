locals {
  environment   = "production"
  name          = "${var.project_name}-${local.environment}"
  function_name = "${local.name}-api"
}
