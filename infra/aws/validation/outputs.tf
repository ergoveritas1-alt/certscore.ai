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

output "github_actions_deploy_role_arn" {
  description = "IAM role ARN for the GitHub Actions AWS deploy workflow."
  value       = aws_iam_role.github_actions_deploy.arn
}

output "github_actions_oidc_provider_arn" {
  description = "Account-wide GitHub Actions OIDC provider ARN reused by this stack."
  value       = var.github_actions_oidc_provider_arn
}

output "web_ecr_repository_url" {
  description = "ECR repository URL for the validation ops web image."
  value       = aws_ecr_repository.web.repository_url
}

output "worker_ecr_repository_url" {
  description = "ECR repository URL for the validation worker image."
  value       = aws_ecr_repository.worker.repository_url
}
