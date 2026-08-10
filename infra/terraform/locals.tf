locals {
  name          = "${var.project_name}-${var.environment}"
  function_name = "${local.name}-api"
}
