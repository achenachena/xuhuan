data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_execution" {
  name               = "${local.name}-lambda-execution"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda_execution" {
  statement {
    sid = "WriteFunctionLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }

  # Lambda requires these EC2 actions only during the reversible VPC-backed
  # migration phase. Before disabling managed data services, delete unaliased
  # VPC-backed function versions and wait for their Hyperplane ENIs to disappear
  # so detachment cannot race this execution-role policy update.
  dynamic "statement" {
    for_each = var.managed_data_services_enabled ? [true] : []

    content {
      sid = "ManageVpcInterfaces"
      actions = [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DescribeSubnets",
        "ec2:DeleteNetworkInterface",
        "ec2:AssignPrivateIpAddresses",
        "ec2:UnassignPrivateIpAddresses",
      ]
      resources = ["*"]
    }
  }
}

resource "aws_iam_role_policy" "lambda_execution" {
  name   = "runtime"
  role   = aws_iam_role.lambda_execution.id
  policy = data.aws_iam_policy_document.lambda_execution.json
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [var.github_oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:${var.github_environment}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "${local.name}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid = "ReleaseLambda"
    actions = [
      "lambda:GetAlias",
      "lambda:DeleteFunctionConcurrency",
      "lambda:GetFunction",
      "lambda:GetFunctionConcurrency",
      "lambda:GetFunctionConfiguration",
      "lambda:InvokeFunction",
      "lambda:PublishVersion",
      "lambda:PutFunctionConcurrency",
      "lambda:UpdateAlias",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
    ]
    resources = [
      aws_lambda_function.api.arn,
      "${aws_lambda_function.api.arn}:*",
    ]
  }

  statement {
    sid       = "ReadAccountConcurrency"
    actions   = ["lambda:GetAccountSettings"]
    resources = ["*"]
  }

  dynamic "statement" {
    for_each = var.managed_data_services_enabled ? [true] : []

    content {
      sid       = "ReadDatabaseBootstrapSecret"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [aws_db_instance.postgres[0].master_user_secret[0].secret_arn]
    }
  }

  statement {
    sid     = "ReadDeploymentParameters"
    actions = ["ssm:GetParameter"]
    resources = [
      aws_ssm_parameter.telegram_bot_token.arn,
      aws_ssm_parameter.database_url.arn,
      aws_ssm_parameter.database_migration_url.arn,
      aws_ssm_parameter.redis_url.arn,
    ]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy-api"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
