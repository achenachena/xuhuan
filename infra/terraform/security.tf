resource "aws_security_group" "lambda" {
  name        = "${local.name}-lambda"
  description = "Go Lambda access to private PostgreSQL and Valkey only"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-lambda" }
}

resource "aws_security_group" "database" {
  name        = "${local.name}-database"
  description = "PostgreSQL from the API Lambda only"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-database" }
}

resource "aws_vpc_security_group_ingress_rule" "database_from_lambda" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = aws_security_group.lambda.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "lambda_to_database" {
  security_group_id            = aws_security_group.lambda.id
  referenced_security_group_id = aws_security_group.database.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_security_group" "redis" {
  name        = "${local.name}-valkey"
  description = "Valkey from the API Lambda only"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-valkey" }
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_lambda" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = aws_security_group.lambda.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "lambda_to_redis" {
  security_group_id            = aws_security_group.lambda.id
  referenced_security_group_id = aws_security_group.redis.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "lambda_dns_udp" {
  security_group_id = aws_security_group.lambda.id
  cidr_ipv4         = var.vpc_cidr
  from_port         = 53
  to_port           = 53
  ip_protocol       = "udp"
}

resource "aws_vpc_security_group_egress_rule" "lambda_dns_tcp" {
  security_group_id = aws_security_group.lambda.id
  cidr_ipv4         = var.vpc_cidr
  from_port         = 53
  to_port           = 53
  ip_protocol       = "tcp"
}
