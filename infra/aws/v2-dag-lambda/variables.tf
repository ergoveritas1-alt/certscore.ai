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
    us_west_1    = string
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

variable "alarm_actions_by_region" {
  description = "Regional SNS topic ARNs notified by scanner Lambda and queue alarms. Each topic must be in the same region as its alarms."
  type        = map(list(string))
  default     = {}

  validation {
    condition = length(setsubtract(
      toset(keys(var.alarm_actions_by_region)),
      toset(["eu-central-1", "eu-west-1", "us-west-1"])
    )) == 0
    error_message = "alarm_actions_by_region supports only eu-central-1, eu-west-1, and us-west-1."
  }

  validation {
    condition = alltrue(flatten([
      for region, action_arns in var.alarm_actions_by_region : [
        for action_arn in action_arns : can(regex(
          "^arn:aws[a-z-]*:sns:${region}:[0-9]{12}:[A-Za-z0-9_-]+$",
          action_arn
        ))
      ]
    ]))
    error_message = "Every alarm action must be an SNS topic ARN in the same region as its map key."
  }
}

variable "environment_variables_by_region" {
  description = "Additional regional runtime variables, including existing proxy configuration. Values are stored in encrypted Terraform state."
  type        = map(map(string))
  sensitive   = true
  default     = {}
}

variable "expected_egress_region_by_region" {
  description = "Optional expected public region reported by the regional proxy egress preflight. Set the US-CA lane to California only after its proxy public IP is actually California-based."
  type        = map(string)
  default = {
    "us-west-1" = "California"
  }

  validation {
    condition = length(setsubtract(
      toset(keys(var.expected_egress_region_by_region)),
      toset(["eu-central-1", "eu-west-1", "us-west-1"])
    )) == 0
    error_message = "expected_egress_region_by_region supports only eu-central-1, eu-west-1, and us-west-1."
  }
}

variable "vpc_config_by_region" {
  description = "Optional existing VPC attachment for each regional Lambda. Omit a region to preserve AWS-managed public egress."
  type = map(object({
    security_group_ids = list(string)
    subnet_ids         = list(string)
  }))
  default = {}
}

variable "vpc_endpoint_config_by_region" {
  description = "Existing per-region VPC topology for NAT-free scanner AWS-service endpoints. The route table is only used for the S3 gateway endpoint; NAT routes remain outside this stack until a separately authorized migration step."
  type = map(object({
    vpc_id                   = string
    route_table_ids          = list(string)
    subnet_ids               = list(string)
    lambda_security_group_id = string
  }))
  default = {}

  validation {
    condition = length(setsubtract(
      toset(keys(var.vpc_endpoint_config_by_region)),
      toset(["eu-central-1", "eu-west-1", "us-west-1"])
    )) == 0
    error_message = "vpc_endpoint_config_by_region supports only eu-central-1, eu-west-1, and us-west-1."
  }
}

variable "tags" {
  description = "Additional tags for scanner resources."
  type        = map(string)
  default     = {}
}
