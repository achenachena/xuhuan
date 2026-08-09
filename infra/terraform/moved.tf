moved {
  from = aws_vpc.main
  to   = aws_vpc.main[0]
}

moved {
  from = aws_route_table.isolated
  to   = aws_route_table.isolated[0]
}

moved {
  from = aws_security_group.lambda
  to   = aws_security_group.lambda[0]
}

moved {
  from = aws_security_group.database
  to   = aws_security_group.database[0]
}

moved {
  from = aws_security_group.redis
  to   = aws_security_group.redis[0]
}

moved {
  from = aws_vpc_security_group_ingress_rule.database_from_lambda
  to   = aws_vpc_security_group_ingress_rule.database_from_lambda[0]
}

moved {
  from = aws_vpc_security_group_egress_rule.lambda_to_database
  to   = aws_vpc_security_group_egress_rule.lambda_to_database[0]
}

moved {
  from = aws_vpc_security_group_ingress_rule.redis_from_lambda
  to   = aws_vpc_security_group_ingress_rule.redis_from_lambda[0]
}

moved {
  from = aws_vpc_security_group_egress_rule.lambda_to_redis
  to   = aws_vpc_security_group_egress_rule.lambda_to_redis[0]
}

moved {
  from = aws_vpc_security_group_egress_rule.lambda_dns_udp
  to   = aws_vpc_security_group_egress_rule.lambda_dns_udp[0]
}

moved {
  from = aws_vpc_security_group_egress_rule.lambda_dns_tcp
  to   = aws_vpc_security_group_egress_rule.lambda_dns_tcp[0]
}

moved {
  from = aws_db_subnet_group.main
  to   = aws_db_subnet_group.main[0]
}

moved {
  from = aws_db_parameter_group.postgres
  to   = aws_db_parameter_group.postgres[0]
}

moved {
  from = aws_db_instance.postgres
  to   = aws_db_instance.postgres[0]
}

moved {
  from = aws_elasticache_subnet_group.main
  to   = aws_elasticache_subnet_group.main[0]
}

moved {
  from = aws_elasticache_parameter_group.valkey
  to   = aws_elasticache_parameter_group.valkey[0]
}

moved {
  from = aws_elasticache_replication_group.redis
  to   = aws_elasticache_replication_group.redis[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.rds_free_storage
  to   = aws_cloudwatch_metric_alarm.rds_free_storage[0]
}

moved {
  from = aws_cloudwatch_metric_alarm.redis_memory
  to   = aws_cloudwatch_metric_alarm.redis_memory[0]
}
