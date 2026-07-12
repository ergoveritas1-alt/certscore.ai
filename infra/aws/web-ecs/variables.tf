variable "project_name" {
  description = "Prefix used for AWS web ECS/Fargate infrastructure resources."
  type        = string
  default     = "certscore-web"
}

variable "github_actions_subjects" {
  description = "GitHub OIDC subject patterns allowed to assume the future deploy role."
  type        = list(string)
  default     = ["repo:ergoveritas1-alt/certscore.ai:*"]
}

variable "github_actions_extra_ecr_repository_arns" {
  description = "Additional ECR repository ARNs the GitHub Actions role may push to, for shared production workflows that build validation or scanner images from this repo."
  type        = list(string)
  default     = []
}

variable "aws_region" {
  description = "AWS region for the future public web stack."
  type        = string
  default     = "us-west-1"
}

variable "existing_vpc_id" {
  description = "Optional existing VPC id for the public web stack."
  type        = string
  default     = ""
}

variable "existing_ecs_cluster_name" {
  description = "Optional existing ECS cluster name to reuse for the public web stack."
  type        = string
  default     = ""
}

variable "public_subnet_ids" {
  description = "Public subnet ids for ALB ingress."
  type        = list(string)
  default     = []
}

variable "private_subnet_ids" {
  description = "Subnet ids for ECS tasks. In the current account, this may temporarily point at DB-VPC default subnets until private app subnets exist."
  type        = list(string)
  default     = []
}

variable "assign_public_ip" {
  description = "Whether ECS tasks should receive public IPs. This should be false for a hardened private-subnet deployment, but may be true temporarily in the current DB VPC."
  type        = bool
  default     = false
}

variable "certscore_domain_name" {
  description = "Public hostname for the CertScore web service."
  type        = string
  default     = "certscore.ai"
}

variable "certscore_hosted_zone_id" {
  description = "Route53 hosted zone id for certscore_domain_name."
  type        = string
  default     = ""
}

variable "existing_certificate_arn" {
  description = "Existing ACM certificate ARN for the public hosts when not creating certificates in-stack."
  type        = string
  default     = ""
}

variable "database_security_group_id" {
  description = "Existing RDS security group id to allow from the ECS task security group."
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "Container image tag to deploy for the CertScore public web service."
  type        = string
  default     = "latest"
}

variable "mcp_image_tag" {
  description = "Immutable image tag for the MCP HTTP sidecar deployed with the CertScore web task."
  type        = string
  default     = "mcp-v0.2.7"
}

variable "mcp_ecr_repository_name" {
  description = "ECR repository containing the MCP HTTP sidecar image."
  type        = string
  default     = "certscore-web-mcp"
}

variable "mcp_domain_name" {
  description = "Public hostname for the consolidated MCP service routed through the shared web ALB."
  type        = string
  default     = "mcp.certscore.ai"
}

variable "mcp_certificate_arn" {
  description = "ACM certificate ARN in aws_region covering mcp_domain_name."
  type        = string
  default     = ""
}

variable "app_flavor" {
  description = "APP_FLAVOR value for the CertScore public web service."
  type        = string
  default     = "certscore"
}

variable "build_runtime_target" {
  description = "BUILD_RUNTIME_TARGET value for the ECS/Fargate web services."
  type        = string
  default     = "ecs-fargate"
}

variable "database_ssl_mode" {
  description = "DATABASE_SSL_MODE value for the web services."
  type        = string
  default     = "require"
}

variable "next_public_auth_google_enabled" {
  description = "Whether Google auth is enabled on the public web services."
  type        = string
  default     = "false"
}

variable "certscore_admin_emails" {
  description = "Comma-separated admin allowlist for the public web services."
  type        = string
  default     = ""
}

variable "certscore_chrome_extension_store_url" {
  description = "Chrome Web Store listing URL for the CertScore.ai browser extension."
  type        = string
  default     = "https://chromewebstore.google.com/detail/certscore-ai/fopkldkmhadjkoafdgemginpkgonfmga"
}

variable "certscore_auth_allowed_emails" {
  description = "Optional comma-separated sign-in allowlist; defaults to the admin allowlist when unset."
  type        = string
  default     = ""
}

variable "full_scan_allow_production_load_test_dns_bypass" {
  description = "Whether trusted production load-test full-scan requests bypass intake DNS validation so scanner/runtime records transport outcomes."
  type        = bool
  default     = false
}

variable "s3_bucket" {
  description = "Shared artifact bucket used by the public web services."
  type        = string
  default     = ""
}

variable "s3_region" {
  description = "Region for the shared artifact bucket."
  type        = string
  default     = ""
}

variable "s3_endpoint" {
  description = "Optional S3-compatible endpoint override."
  type        = string
  default     = ""
}

variable "s3_force_path_style" {
  description = "Optional S3_FORCE_PATH_STYLE value."
  type        = string
  default     = ""
}

variable "database_url_secret_arn" {
  description = "Secrets Manager ARN containing DATABASE_URL."
  type        = string
  default     = ""
}

variable "better_auth_secret_arn" {
  description = "Secrets Manager ARN containing BETTER_AUTH_SECRET."
  type        = string
  default     = ""
}

variable "google_client_id_secret_arn" {
  description = "Optional Secrets Manager ARN containing GOOGLE_CLIENT_ID."
  type        = string
  default     = ""
}

variable "google_client_secret_secret_arn" {
  description = "Optional Secrets Manager ARN containing GOOGLE_CLIENT_SECRET."
  type        = string
  default     = ""
}

variable "openai_api_key_secret_arn" {
  description = "Optional Secrets Manager ARN containing OPENAI_API_KEY."
  type        = string
  default     = ""
}

variable "s3_access_key_id_secret_arn" {
  description = "Secrets Manager ARN containing S3_ACCESS_KEY_ID."
  type        = string
  default     = ""
}

variable "s3_secret_access_key_secret_arn" {
  description = "Secrets Manager ARN containing S3_SECRET_ACCESS_KEY."
  type        = string
  default     = ""
}

variable "gmail_smtp_user_secret_arn" {
  description = "Secrets Manager ARN containing GMAIL_SMTP_USER."
  type        = string
  default     = ""
}

variable "gmail_smtp_app_password_secret_arn" {
  description = "Secrets Manager ARN containing GMAIL_SMTP_APP_PASSWORD."
  type        = string
  default     = ""
}

variable "feedback_to_email_secret_arn" {
  description = "Secrets Manager ARN containing FEEDBACK_TO_EMAIL."
  type        = string
  default     = ""
}

variable "billing_alert_to_email_secret_arn" {
  description = "Optional Secrets Manager ARN containing BILLING_ALERT_TO_EMAIL."
  type        = string
  default     = ""
}

variable "privacy_request_to_email_secret_arn" {
  description = "Secrets Manager ARN containing PRIVACY_REQUEST_TO_EMAIL."
  type        = string
  default     = ""
}

variable "stripe_secret_key_secret_arn" {
  description = "Optional Secrets Manager ARN containing STRIPE_SECRET_KEY."
  type        = string
  default     = ""
}

variable "stripe_webhook_secret_secret_arn" {
  description = "Optional Secrets Manager ARN containing STRIPE_WEBHOOK_SECRET."
  type        = string
  default     = ""
}

variable "bx01_observed_signal_ingest_token_secret_arn" {
  description = "Optional Secrets Manager ARN for the bounded BX01 observed-signal ingest token."
  type        = string
  default     = ""
}

variable "stripe_price_individual_monthly" {
  description = "Stripe monthly price id for the CertScore Starter plan."
  type        = string
  default     = ""
}

variable "stripe_price_pro_monthly" {
  description = "Stripe monthly price id for the CertScore Pro plan."
  type        = string
  default     = ""
}

variable "stripe_billing_portal_configuration_id" {
  description = "Optional Stripe Billing Portal configuration id with subscription cancellation enabled."
  type        = string
  default     = ""
}

variable "stripe_billing_portal_return_path" {
  description = "Return path used after Stripe Billing Portal sessions."
  type        = string
  default     = "/app/modify-plan"
}

variable "web_cpu" {
  description = "CPU units for each public web task."
  type        = number
  default     = 512
}

variable "web_memory" {
  description = "Memory for each public web task."
  type        = number
  default     = 1024
}

variable "web_desired_count" {
  description = "Desired task count per public host."
  type        = number
  default     = 1
}

variable "web_autoscaling_min_capacity" {
  description = "Minimum CertScore web task count when ECS service autoscaling is enabled."
  type        = number
  default     = 1
}

variable "web_autoscaling_max_capacity" {
  description = "Maximum CertScore web task count for CPU target tracking."
  type        = number
  default     = 3
}

variable "web_autoscaling_target_cpu" {
  description = "Average ECS CPU percentage targeted by CertScore web service autoscaling."
  type        = number
  default     = 60
}

variable "full_scan_queue_allow_degraded_heartbeat" {
  description = "Allow the web app to accept full-scan queue requests when scanner heartbeat is stale; requires external worker wake-up monitoring."
  type        = bool
  default     = false
}

variable "alarm_actions" {
  description = "SNS topic ARNs or other CloudWatch alarm action ARNs for public web availability alarms."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to future public web infrastructure."
  type        = map(string)
  default     = {}
}
