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

variable "consentcheck_domain_name" {
  description = "Public hostname for the ConsentCheck web service."
  type        = string
  default     = "consentcheck.site"
}

variable "consentcheck_hosted_zone_id" {
  description = "Route53 hosted zone id for consentcheck_domain_name."
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
  description = "Container image tag to deploy for both public web services."
  type        = string
  default     = "latest"
}

variable "app_flavor" {
  description = "APP_FLAVOR value for both public web services."
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

variable "privacy_request_to_email_secret_arn" {
  description = "Secrets Manager ARN containing PRIVACY_REQUEST_TO_EMAIL."
  type        = string
  default     = ""
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

variable "tags" {
  description = "Tags applied to future public web infrastructure."
  type        = map(string)
  default     = {}
}
