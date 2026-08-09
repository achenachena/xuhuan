resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-database"
  subnet_ids = [for subnet in aws_subnet.data : subnet.id]
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${local.name}-postgres17"
  family = "postgres17"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }
}

resource "aws_db_instance" "postgres" {
  identifier = "${local.name}-postgres"

  engine                      = "postgres"
  engine_version              = "17"
  instance_class              = var.database_instance_class
  allocated_storage           = var.database_allocated_storage
  max_allocated_storage       = var.database_max_allocated_storage
  storage_type                = "gp3"
  storage_encrypted           = true
  db_name                     = var.database_name
  username                    = var.database_master_username
  manage_master_user_password = true
  port                        = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.postgres.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period    = 1
  backup_window              = "03:00-04:00"
  maintenance_window         = "sun:04:00-sun:05:00"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true
  deletion_protection        = var.database_deletion_protection
  skip_final_snapshot        = var.database_skip_final_snapshot
  final_snapshot_identifier  = var.database_skip_final_snapshot ? null : "${local.name}-final"

  lifecycle {
    precondition {
      condition     = var.database_instance_class == "db.t4g.micro" && var.database_allocated_storage == 20 && var.database_max_allocated_storage == 0
      error_message = "The Free Plan topology requires db.t4g.micro, exactly 20 GB, and storage autoscaling disabled."
    }
  }
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name}-valkey"
  subnet_ids = [for subnet in aws_subnet.data : subnet.id]
}

resource "aws_elasticache_parameter_group" "valkey" {
  name   = "${local.name}-valkey8"
  family = "valkey8"
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.name}-valkey"
  description          = "Non-authoritative rate-limit cache for ${local.name}"

  engine                     = "valkey"
  engine_version             = "8.2"
  node_type                  = var.redis_node_type
  port                       = 6379
  parameter_group_name       = aws_elasticache_parameter_group.valkey.name
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  snapshot_retention_limit   = 0
  auto_minor_version_upgrade = true

  lifecycle {
    precondition {
      condition     = var.redis_node_type == "cache.t4g.micro"
      error_message = "The Free Plan topology requires one cache.t4g.micro Valkey node."
    }
  }
}
