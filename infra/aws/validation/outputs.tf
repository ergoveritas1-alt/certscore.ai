output "validation_ops_base_url" {
  description = "Base URL for the validation ops web surface."
  value       = local.validation_ops_base_url
}

output "alb_dns_name" {
  description = "DNS name of the validation ops ALB."
  value       = aws_lb.validation.dns_name
}

output "ecs_cluster_name" {
  description = "Validation ECS cluster name."
  value       = aws_ecs_cluster.validation.name
}

output "ecs_web_service_name" {
  description = "Validation ops web ECS service name."
  value       = aws_ecs_service.web.name
}

output "ecs_worker_service_name" {
  description = "Validation worker ECS service name."
  value       = aws_ecs_service.worker.name
}

output "ecs_scheduler_service_name" {
  description = "Validation scheduler ECS service name."
  value       = aws_ecs_service.scheduler.name
}

output "web_ecr_repository_url" {
  description = "ECR repository URL for the validation ops web image."
  value       = aws_ecr_repository.web.repository_url
}

output "worker_ecr_repository_url" {
  description = "ECR repository URL for the validation worker image."
  value       = aws_ecr_repository.worker.repository_url
}

output "validation_redis_secret_arn" {
  description = "Secrets Manager ARN containing the validation rediss URL."
  value       = aws_secretsmanager_secret.validation_redis_url.arn
}

output "validation_redis_primary_endpoint" {
  description = "ElastiCache primary endpoint address."
  value       = aws_elasticache_replication_group.validation.primary_endpoint_address
}
