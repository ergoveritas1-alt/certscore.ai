variable "project_name" {
  description = "Stable prefix for the production v2 DAG Lambda resources."
  type        = string
  default     = "certscore-v2-dag-local"
}

variable "image_uris" {
  description = "Immutable regional ECR image URIs (prefer digest-qualified URIs) for the scanner Lambda."
  type = object({
    eu_central_1 = string
    eu_west_1    = string
    us_west_2    = string
  })

  validation {
    condition = alltrue([
      for uri in values(var.image_uris) : can(regex("^[0-9]+\\.dkr\\.ecr\\.[a-z0-9-]+\\.amazonaws\\.com/.+@sha256:[a-f0-9]{64}$", uri))
    ])
    error_message = "Each scanner image URI must be regional ECR and digest-qualified."
  }
}

variable "memory_size" {
  description = "Memory allocated to each regional scanner function."
  type        = number
  default     = 3008

  validation {
    condition     = var.memory_size >= 512 && var.memory_size <= 10240
    error_message = "memory_size must be between 512 and 10240 MB."
  }
}

variable "reserved_concurrent_executions" {
  description = "Regional concurrency ceiling. Size this above sharded scan fan-out but below the account safety limit."
  type        = number
  default     = 50

  validation {
    condition     = var.reserved_concurrent_executions >= 10
    error_message = "reserved_concurrent_executions must be at least 10 for the sharded scanner."
  }
}

variable "result_redrive_max_receive_count" {
  description = "Failed WC01 result-ingestion attempts before SQS moves a message to the result DLQ."
  type        = number
  default     = 5
}

variable "artifact_prefix" {
  description = "Bounded S3 key prefix for retained Lambda evidence."
  type        = string
  default     = "v2-dag-lambda/local"
}

variable "log_retention_days" {
  description = "CloudWatch retention for each scanner function."
  type        = number
  default     = 30
}

variable "alarm_actions" {
  description = "SNS topic ARNs notified by scanner Lambda and queue alarms."
  type        = list(string)
  default     = []
}

variable "environment_variables_by_region" {
  description = "Additional regional runtime variables, including existing proxy configuration. Values are stored in encrypted Terraform state."
  type        = map(map(string))
  sensitive   = true
  default     = {}
}

variable "vpc_config_by_region" {
  description = "Optional existing VPC attachment for each regional Lambda. Omit a region to preserve AWS-managed public egress."
  type = map(object({
    security_group_ids = list(string)
    subnet_ids         = list(string)
  }))
  default = {}
}

variable "tags" {
  description = "Additional tags for scanner resources."
  type        = map(string)
  default     = {}
}
