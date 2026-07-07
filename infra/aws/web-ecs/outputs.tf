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

output "ecs_mcp_service_name" {
  description = "ECS service name for the shared-ALB MCP service."
  value       = aws_ecs_service.mcp.name
}

output "github_actions_deploy_role_arn" {
  description = "IAM role ARN for the GitHub Actions public web deploy workflow."
  value       = aws_iam_role.github_actions_deploy.arn
}

output "mcp_ecr_repository_url" {
  description = "ECR repository URL for the shared-ALB MCP image."
  value       = aws_ecr_repository.mcp.repository_url
}

output "mcp_target_group_arn" {
  description = "Target group ARN for shared-ALB MCP health checks."
  value       = aws_lb_target_group.mcp.arn
}

output "web_ecr_repository_url" {
  description = "ECR repository URL for the public web image."
  value       = aws_ecr_repository.web.repository_url
}
