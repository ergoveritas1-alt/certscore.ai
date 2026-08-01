variable "project_name" {
  description = "Prefix used for AWS validation infrastructure resources."
  type        = string
  default     = "certscore-validation"
}

variable "github_actions_subjects" {
  description = "GitHub OIDC subject patterns allowed to assume the deploy role."
  type        = list(string)
  default     = ["repo:ergoveritas1-alt/certscore.ai:*"]
}

variable "aws_region" {
  description = "AWS region for the validation stack."
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "Two AZs for the validation stack. Leave empty to auto-select the first two available."
  type        = list(string)
  default     = []
}

variable "vpc_cidr" {
  description = "CIDR block for the validation VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "nat_gateway_count" {
  description = "Number of NAT gateways to create for private subnets."
  type        = number
  default     = 1
}

variable "ecs_task_subnet_ids" {
  description = "Optional subnet ids for validation ECS tasks. Use the DB VPC subnets until the validation VPC has private database routing."
  type        = list(string)
  default     = []
}

variable "ecs_task_security_group_ids" {
  description = "Optional security group ids for validation ECS tasks. Use a group allowed by the production database security group when tasks need direct Postgres access."
  type        = list(string)
  default     = []
}

variable "ecs_task_assign_public_ip" {
  description = "Whether validation ECS tasks receive public IPs. Set true when using public/default DB-VPC subnets."
  type        = bool
  default     = false
}

variable "validation_domain_name" {
  description = "Public hostname for the validation ops web surface."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone id for validation_domain_name."
  type        = string
  default     = ""
}

variable "existing_certificate_arn" {
  description = "Existing ACM certificate ARN for the validation domain. Leave empty to create one when hosted_zone_id is set."
  type        = string
  default     = ""
}

variable "database_url_secret_arn" {
  description = "Secrets Manager ARN containing DATABASE_URL."
  type        = string
}

variable "better_auth_secret_arn" {
  description = "Secrets Manager ARN containing BETTER_AUTH_SECRET."
  type        = string
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
  description = "Secrets Manager ARN containing OPENAI_API_KEY."
  type        = string
}

variable "s3_bucket" {
  description = "Shared artifact bucket used by the validation services."
  type        = string
}

variable "s3_region" {
  description = "Region for the shared artifact bucket."
  type        = string
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

variable "s3_access_key_id_secret_arn" {
  description = "Secrets Manager ARN containing S3_ACCESS_KEY_ID."
  type        = string
}

variable "s3_secret_access_key_secret_arn" {
  description = "Secrets Manager ARN containing S3_SECRET_ACCESS_KEY."
  type        = string
}

variable "certscore_admin_emails" {
  description = "Comma-separated admin email allowlist for the validation ops web surface."
  type        = string
  default     = ""
}

variable "next_public_auth_google_enabled" {
  description = "Whether Google auth is enabled on the validation ops web surface."
  type        = string
  default     = "false"
}

variable "web_bot_auth_private_key_secret_arn" {
  description = "Optional Secrets Manager ARN containing WEB_BOT_AUTH_PRIVATE_KEY_PEM."
  type        = string
  default     = ""
}

variable "web_bot_auth_signature_agent_url" {
  description = "Optional WEB_BOT_AUTH_SIGNATURE_AGENT_URL."
  type        = string
  default     = ""
}

variable "web_bot_auth_enabled" {
  description = "Optional WEB_BOT_AUTH_ENABLED flag."
  type        = string
  default     = "0"
}

variable "web_bot_auth_expires_seconds" {
  description = "Optional WEB_BOT_AUTH_EXPIRES_SECONDS."
  type        = string
  default     = "300"
}

variable "web_bot_auth_include_nonce" {
  description = "Optional WEB_BOT_AUTH_INCLUDE_NONCE flag."
  type        = string
  default     = "0"
}

variable "validation_tranco_source_url" {
  description = "Optional Tranco source override for the validation scheduler."
  type        = string
  default     = ""
}

variable "validation_tranco_min_rank" {
  description = "Minimum Tranco rank for validation automation."
  type        = number
  default     = 1000
}

variable "validation_tranco_max_rank" {
  description = "Maximum Tranco rank for validation automation."
  type        = number
  default     = 100000
}

variable "validation_pipeline_enabled" {
  description = "Validation pipeline feature flag for the worker and scheduler."
  type        = string
  default     = "1"
}

variable "validation_scheduler_poll_minutes" {
  description = "Validation scheduler polling interval."
  type        = string
  default     = "1"
}

variable "validation_default_run_mode" {
  description = "Default validation run mode."
  type        = string
  default     = "manual"
}

variable "validation_default_sample_interval_minutes" {
  description = "Default sample interval used by the validation scheduler."
  type        = string
  default     = "20"
}

variable "validation_openai_model" {
  description = "Validation worker model name."
  type        = string
  default     = "gpt-5.4-nano"
}

variable "certscore_extraction_model" {
  description = "Model used for bounded extraction and routine triage."
  type        = string
  default     = "gpt-5.4-nano"
}

variable "certscore_review_model" {
  description = "Model used for interpretation-heavy policy and finding review."
  type        = string
  default     = "gpt-5.4-mini"
}

variable "certscore_escalation_model" {
  description = "Optional model used only for bounded high-impact conflicting cases."
  type        = string
  default     = ""
}

variable "certscore_mini_review_enabled" {
  description = "Whether approved precision-first Mini policy review is enabled."
  type        = string
  default     = "1"
}

variable "certscore_escalation_enabled" {
  description = "Whether selective strong-model escalation is enabled. Disabled by default."
  type        = string
  default     = "0"
}

variable "certscore_model_review_mode" {
  description = "Model review mode. Enforced permits only invariant-verified production projections."
  type        = string
  default     = "enforced"
}

variable "certscore_parallel_policy_review_enabled" {
  description = "Runs the early static policy review and terminal parallel shadow join."
  type        = string
  default     = "1"
}

variable "certscore_parallel_policy_projection_enabled" {
  description = "Allows a verified parallel policy join to replace the canonical full review after parity gates pass."
  type        = string
  default     = "1"
}

variable "worker_concurrency" {
  description = "Validation worker rank-stage concurrency."
  type        = string
  default     = "1"
}

variable "llm_enrichment_enabled" {
  description = "Whether verdict/enrichment jobs are enabled."
  type        = string
  default     = "0"
}

variable "playwright_browsers_path" {
  description = "Playwright browsers path inside the validation worker image."
  type        = string
  default     = "/ms-playwright"
}

variable "web_cpu" {
  description = "CPU units for the validation ops web task."
  type        = number
  default     = 512
}

variable "web_memory" {
  description = "Memory for the validation ops web task."
  type        = number
  default     = 1024
}

variable "worker_cpu" {
  description = "CPU units for the validation worker task."
  type        = number
  default     = 512
}

variable "worker_memory" {
  description = "Memory for the validation worker task."
  type        = number
  default     = 1024
}

variable "web_desired_count" {
  description = "Desired task count for validation ops web."
  type        = number
  default     = 0
}

variable "worker_desired_count" {
  description = "Desired task count for validation worker."
  type        = number
  default     = 1
}

variable "image_tag" {
  description = "Image tag used by the ECS task definitions."
  type        = string
  default     = "latest"
}

variable "tags" {
  description = "Tags applied to validation infrastructure."
  type        = map(string)
  default     = {}
}
