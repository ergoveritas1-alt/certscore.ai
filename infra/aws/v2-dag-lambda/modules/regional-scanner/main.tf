locals {
  result_dlq_name    = "${var.result_queue_name}-dlq"
  failure_queue_name = "${var.project_name}-async-failures"
  artifact_prefix    = trimsuffix(var.artifact_prefix, "/")
  base_environment = {
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET                        = var.artifact_bucket
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR                           = "/tmp/certscore-v2-dag-lambda"
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX                        = local.artifact_prefix
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE               = var.accept_language
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE                        = var.locale
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS                = "false"
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID                   = var.timezone_id
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT                    = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
    CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE           = "none"
    CERTSCORE_V2_DAG_LAMBDA_EVIDENCE_DIAGNOSTIC_MODE               = "webmd"
    CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE                     = "sharded"
    CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_MODE             = "always"
    CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS       = "15000"
    CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS = "15000"
    CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY                   = "1"
    CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE                 = "cmp_safe"
    CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV                             = "local"
    CERTSCORE_CHROMIUM_EXECUTABLE_PATH                             = "/usr/bin/chromium"
  }
}

resource "aws_ecr_repository" "scanner" {
  name                 = "${var.project_name}-lambda"
  image_tag_mutability = "MUTABLE"

  encryption_configuration {
    encryption_type = "AES256"
  }

  image_scanning_configuration {
    scan_on_push = true
  }
  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "scanner" {
  repository = aws_ecr_repository.scanner.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Remove untagged scanner images after 14 days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 14
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = var.artifact_bucket
  force_destroy = false
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    id     = "retained-evidence-storage-hygiene"
    status = "Enabled"
    filter { prefix = "${local.artifact_prefix}/" }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
}

resource "aws_sqs_queue" "result_dlq" {
  name                      = local.result_dlq_name
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  tags                      = var.tags
}

resource "aws_sqs_queue" "results" {
  name                       = var.result_queue_name
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 900
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.result_dlq.arn
    maxReceiveCount     = var.result_redrive_max_receive_count
  })
  tags = var.tags

  lifecycle {
    # AWS supports the live 1 MiB setting, but provider v5 still validates the
    # historical 256 KiB ceiling. Preserve the live value until provider v6.
    ignore_changes = [max_message_size]
  }
}

resource "aws_sqs_queue_redrive_allow_policy" "results" {
  queue_url = aws_sqs_queue.result_dlq.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.results.arn]
  })
}

resource "aws_sqs_queue" "async_failures" {
  name                       = local.failure_queue_name
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 60
  sqs_managed_sse_enabled    = true
  tags                       = var.tags

  lifecycle {
    ignore_changes = [max_message_size]
  }
}

resource "aws_cloudwatch_log_group" "scanner" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "scanner" {
  function_name                  = var.function_name
  role                           = var.role_arn
  package_type                   = "Image"
  image_uri                      = var.image_uri
  memory_size                    = var.memory_size
  timeout                        = 900
  reserved_concurrent_executions = var.reserved_concurrent_executions

  ephemeral_storage { size = 512 }

  environment {
    variables = merge(local.base_environment, var.environment_variables)
  }

  dynamic "vpc_config" {
    for_each = var.vpc_config == null ? [] : [var.vpc_config]
    content {
      security_group_ids = vpc_config.value.security_group_ids
      subnet_ids         = vpc_config.value.subnet_ids
    }
  }

  depends_on = [aws_cloudwatch_log_group.scanner]
  tags       = var.tags

  lifecycle {
    # Routine deploys promote a verified digest directly. Terraform owns the
    # function configuration and uses image_uri only for bootstrap/import.
    ignore_changes = [image_uri]
  }
}

resource "aws_lambda_function_event_invoke_config" "scanner" {
  function_name                = aws_lambda_function.scanner.function_name
  maximum_event_age_in_seconds = 60
  maximum_retry_attempts       = 0
  destination_config {
    on_failure { destination = aws_sqs_queue.async_failures.arn }
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.function_name}-${var.region}-errors"
  alarm_description   = "Scanner Lambda returned errors in ${var.region}."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = aws_lambda_function.scanner.function_name }
  alarm_actions       = var.alarm_actions
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${var.function_name}-${var.region}-throttles"
  alarm_description   = "Scanner Lambda was throttled in ${var.region}."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = aws_lambda_function.scanner.function_name }
  alarm_actions       = var.alarm_actions
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "old_results" {
  alarm_name          = "${var.result_queue_name}-${var.region}-oldest-message"
  alarm_description   = "WC01 has not ingested a scanner result within five minutes in ${var.region}."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 300
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { QueueName = aws_sqs_queue.results.name }
  alarm_actions       = var.alarm_actions
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "result_dlq" {
  alarm_name          = "${local.result_dlq_name}-${var.region}-messages"
  alarm_description   = "Scanner results failed WC01 ingestion repeatedly in ${var.region}."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { QueueName = aws_sqs_queue.result_dlq.name }
  alarm_actions       = var.alarm_actions
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "async_failures" {
  alarm_name          = "${local.failure_queue_name}-${var.region}-messages"
  alarm_description   = "Asynchronous scanner invocations failed in ${var.region}."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { QueueName = aws_sqs_queue.async_failures.name }
  alarm_actions       = var.alarm_actions
  tags                = var.tags
}
