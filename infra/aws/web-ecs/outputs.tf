output "scaffold_status" {
  description = "Indicates that this directory is currently a planning scaffold, not a finished stack."
  value       = "deployable-stack"
}

output "alb_dns_name" {
  description = "DNS name of the public web ALB."
  value       = aws_lb.web.dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name used by the public web services."
  value       = local.ecs_cluster_name
}

output "ecs_certscore_service_name" {
  description = "ECS service name for certscore.ai."
  value       = aws_ecs_service.certscore.name
}

output "github_actions_deploy_role_arn" {
  description = "IAM role ARN for the GitHub Actions public web deploy workflow."
  value       = aws_iam_role.github_actions_deploy.arn
}

output "github_actions_oidc_provider_arn" {
  description = "Account-wide GitHub Actions OIDC provider ARN to reuse from other stacks."
  value       = aws_iam_openid_connect_provider.github_actions.arn
}

output "web_ecr_repository_url" {
  description = "ECR repository URL for the public web image."
  value       = aws_ecr_repository.web.repository_url
}

output "mcp_ecr_repository_url" {
  description = "ECR repository URL for the isolated MCP service image."
  value       = aws_ecr_repository.mcp.repository_url
}

output "mcp_target_group_arn" {
  description = "Target group ARN for isolated MCP health checks and deployment verification."
  value       = aws_lb_target_group.mcp_service.arn
}

output "ecs_mcp_service_name" {
  description = "ECS service name for mcp.certscore.ai."
  value       = aws_ecs_service.mcp.name
}
