variable "account_id" { type = string }
variable "accept_language" { type = string }
variable "alarm_actions" { type = list(string) }
variable "artifact_bucket" { type = string }
variable "artifact_prefix" { type = string }
variable "environment_variables" {
  type      = map(string)
  sensitive = true
}
variable "function_name" { type = string }
variable "image_uri" { type = string }
variable "locale" { type = string }
variable "log_retention_days" { type = number }
variable "memory_size" { type = number }
variable "project_name" { type = string }
variable "region" { type = string }
variable "reserved_concurrent_executions" { type = number }
variable "result_queue_name" { type = string }
variable "result_redrive_max_receive_count" { type = number }
variable "role_arn" { type = string }
variable "tags" { type = map(string) }
variable "timezone_id" { type = string }
variable "expected_egress_region" {
  description = "Optional public egress region that the scanner preflight must observe through the regional proxy, such as California for the US-CA lane."
  type        = string
  default     = ""
}
variable "vpc_config" {
  type = object({
    security_group_ids = list(string)
    subnet_ids         = list(string)
  })
  default  = null
  nullable = true
}

variable "vpc_endpoint_config" {
  description = "Optional existing VPC topology used to provision NAT-free AWS service connectivity for the Lambda. This does not manage the Lambda subnet route or any NAT gateway."
  type = object({
    vpc_id                   = string
    route_table_ids          = list(string)
    subnet_ids               = list(string)
    lambda_security_group_id = string
    enable_logs_endpoint     = optional(bool, true)
  })
  default  = null
  nullable = true
}
