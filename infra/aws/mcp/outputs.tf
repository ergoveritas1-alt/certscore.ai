output "alb_dns_name" {
  description = "DNS name of the legacy dedicated MCP ALB, when enabled."
  value       = try(aws_lb.mcp[0].dns_name, null)
}

output "ecs_cluster_name" {
  description = "ECS cluster name used by the MCP service."
  value       = local.ecs_cluster_name
}

output "ecs_service_name" {
  description = "Legacy dedicated ECS service name for the MCP service, when enabled."
  value       = try(aws_ecs_service.mcp[0].name, null)
}

output "ecr_repository_name" {
  description = "ECR repository name for the MCP image."
  value       = aws_ecr_repository.mcp.name
}

output "ecr_repository_url" {
  description = "ECR repository URL for the MCP image."
  value       = aws_ecr_repository.mcp.repository_url
}

output "github_actions_deploy_role_arn" {
  description = "IAM role ARN for the GitHub Actions MCP deploy workflow."
  value       = aws_iam_role.github_actions_deploy.arn
}

output "log_group_name" {
  description = "CloudWatch log group for MCP ECS tasks."
  value       = aws_cloudwatch_log_group.mcp.name
}

output "target_group_arn" {
  description = "Legacy dedicated ALB target group ARN for MCP health checks, when enabled."
  value       = try(aws_lb_target_group.mcp[0].arn, null)
}
