resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, { Name = "${local.name}-vpc" })
}

# RDS and ElastiCache subnet groups require coverage in at least two
# availability zones. These subnets intentionally have no route to an internet
# or NAT gateway. Lambda Function URL ingress is handled by the Lambda service
# plane while the function ENIs need access only to PostgreSQL and Valkey.
resource "aws_subnet" "data" {
  for_each = { for index, az in local.azs : az => index }

  vpc_id            = aws_vpc.main.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 32)

  tags = { Name = "${local.name}-data-${each.key}" }
}

resource "aws_route_table" "isolated" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-isolated" }
}

resource "aws_route_table_association" "data" {
  for_each = aws_subnet.data

  subnet_id      = each.value.id
  route_table_id = aws_route_table.isolated.id
}
