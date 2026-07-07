variable "project_name" {
  description = "Prefix used for MCP ECS/Fargate infrastructure resources."
  type        = string
  default     = "certscore-mcp"
}

variable "aws_region" {
  description = "AWS region for the MCP stack."
  type        = string
  default     = "us-west-2"
}

variable "github_actions_subjects" {
  description = "GitHub OIDC subject patterns allowed to assume the deploy role."
  type        = list(string)
  default     = ["repo:ergoveritas1-alt/certscore.ai:*"]
}

variable "existing_vpc_id" {
  description = "Existing VPC id for the MCP stack."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet ids for ALB ingress."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Subnet ids for MCP ECS tasks."
  type        = list(string)
}

variable "assign_public_ip" {
  description = "Whether MCP ECS tasks should receive public IPs."
  type        = bool
  default     = false
}

variable "existing_ecs_cluster_name" {
  description = "Optional existing ECS cluster name to reuse for the MCP stack."
  type        = string
  default     = ""
}

variable "mcp_domain_name" {
  description = "Public hostname for the MCP service."
  type        = string
  default     = "mcp.certscore.ai"
}

variable "existing_certificate_arn" {
  description = "Existing ACM certificate ARN for mcp.certscore.ai in aws_region."
  type        = string
}

variable "image_tag" {
  description = "Container image tag to deploy for the MCP service."
  type        = string
  default     = "latest"
}

variable "mcp_cpu" {
  description = "CPU units for the MCP task."
  type        = number
  default     = 512
}

variable "mcp_memory" {
  description = "Memory for the MCP task."
  type        = number
  default     = 1024
}

variable "mcp_desired_count" {
  description = "Desired MCP task count. Keep at 1 until stream sessions use sticky sessions or external session storage."
  type        = number
  default     = 1

  validation {
    condition     = var.mcp_desired_count == 1
    error_message = "Launch MCP with one task. Scaling beyond one task requires sticky sessions or external session storage."
  }
}

variable "certscore_base_url" {
  description = "CERTSCORE_BASE_URL runtime value."
  type        = string
  default     = "https://certscore.ai"
}

variable "oauth_issuer" {
  description = "OAUTH_ISSUER runtime value."
  type        = string
  default     = "https://certscore.ai"
}

variable "session_ttl_seconds" {
  description = "SESSION_TTL_SECONDS runtime value."
  type        = number
  default     = 1800
}

variable "session_max_count" {
  description = "SESSION_MAX_COUNT runtime value."
  type        = number
  default     = 500
}

variable "cors_allowed_origins" {
  description = "CORS_ALLOWED_ORIGINS runtime value."
  type        = string
  default     = ""
}

variable "certscore_request_timeout_ms" {
  description = "Optional CERTSCORE_REQUEST_TIMEOUT_MS runtime value."
  type        = number
  default     = 30000
}

variable "jwt_signing_secret_arn" {
  description = "Secrets Manager or SSM SecureString ARN containing the OAuth JWT signing secret."
  type        = string
}

variable "alarm_actions" {
  description = "SNS topic ARNs or other CloudWatch alarm action ARNs for MCP availability alarms."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to MCP infrastructure."
  type        = map(string)
  default     = {}
}
