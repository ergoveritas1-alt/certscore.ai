locals {
  result_dlq_name       = "${var.result_queue_name}-dlq"
  dispatch_queue_name   = "${var.project_name}-production-dispatch.fifo"
  dispatch_dlq_name     = "${var.project_name}-production-dispatch-dlq.fifo"
  failure_queue_name    = "${var.project_name}-async-failures"
  artifact_prefix       = trimsuffix(var.artifact_prefix, "/")
  vpc_endpoints_enabled = var.vpc_endpoint_config != null
  endpoint_security_group_name = (
    var.region == "us-west-1"
    ? "certscore-v2-dag-us-ca-vpc-endpoint-sg"
    : "${var.project_name}-vpc-endpoints-${var.region}"
  )
  ecr_lifecycle_rules = jsondecode(var.region == "us-west-1" ? jsonencode([
    {
      rulePriority = 1
      description  = "Expire untagged images after 1 day"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 1
      }
      action = { type = "expire" }
    },
    {
      rulePriority = 2
      description  = "Keep the 15 most recent tagged images"
      selection = {
        tagStatus      = "tagged"
        tagPatternList = ["*"]
        countType      = "imageCountMoreThan"
        countNumber    = 15
      }
      action = { type = "expire" }
    }
    ]) : jsonencode([{
      rulePriority = 1
      description  = "Remove untagged scanner images after 14 days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 14
      }
      action = { type = "expire" }
  }]))
  base_environment = {
    CERTSCORE_POST_REFUSAL_REJECT_WORKER_ENABLED                   = "0"
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET                        = var.artifact_bucket
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR                           = "/tmp/certscore-v2-dag-lambda"
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX                        = local.artifact_prefix
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE               = var.accept_language
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE                        = var.locale
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS                = "false"
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID                   = var.timezone_id
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT                    = "Mozilla/5.0 (compatible; ConsentCheckBot/1.0; +https://consentcheck.site/bot)"
    CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE           = "none"
    CERTSCORE_CONSENT_LATE_GEOMETRY_SHADOW_ENABLED                 = "1"
    CERTSCORE_V2_DAG_LAMBDA_EVIDENCE_DIAGNOSTIC_MODE               = "webmd"
    CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE                     = "sharded"
    CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_MODE             = "always"
    CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS       = "15000"
    CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS = "15000"
    CERTSCORE_V2_DAG_LAMBDA_REQUIRE_REGIONAL_EGRESS                = "true"
    CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY                   = "1"
    CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE                 = "cmp_safe"
    CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV                             = "local"
    CERTSCORE_CHROMIUM_EXECUTABLE_PATH                             = "/usr/bin/chromium"
    SCANNER_CRAWLER_NAME                                           = "ConsentCheckBot"
    SCANNER_CRAWLER_PUBLIC_URL                                     = "https://consentcheck.site/bot"
    WEB_BOT_AUTH_ENABLED                                           = "1"
    WEB_BOT_AUTH_EXPIRES_SECONDS                                   = "60"
    WEB_BOT_AUTH_INCLUDE_NONCE                                     = "1"
    WEB_BOT_AUTH_SIGNATURE_AGENT_URL                               = "https://consentcheck.site/.well-known/http-message-signatures-directory"
  }
}

data "aws_vpc" "scanner" {
  count = local.vpc_endpoints_enabled ? 1 : 0
  id    = var.vpc_endpoint_config.vpc_id
}

resource "terraform_data" "vpc_endpoint_dns_guard" {
  count = local.vpc_endpoints_enabled ? 1 : 0

  input = {
    vpc_id      = var.vpc_endpoint_config.vpc_id
    region      = var.region
    route_table = join(",", var.vpc_endpoint_config.route_table_ids)
    subnet      = join(",", var.vpc_endpoint_config.subnet_ids)
  }

  lifecycle {
    precondition {
      condition = (
        length(var.vpc_endpoint_config.route_table_ids) > 0 &&
        length(var.vpc_endpoint_config.subnet_ids) > 0 &&
        data.aws_vpc.scanner[0].enable_dns_support &&
        data.aws_vpc.scanner[0].enable_dns_hostnames
      )
      error_message = "NAT-free scanner endpoints require at least one Lambda route table and subnet, plus VPC DNS support and DNS hostnames."
    }
  }
}

resource "aws_security_group" "vpc_endpoints" {
  count = local.vpc_endpoints_enabled ? 1 : 0

  name        = local.endpoint_security_group_name
  description = "Private AWS service endpoints for scanner Lambda"
  vpc_id      = var.vpc_endpoint_config.vpc_id

  ingress {
    description     = "Lambda-endpoints"
    protocol        = "tcp"
    from_port       = 443
    to_port         = 443
    security_groups = [var.vpc_endpoint_config.lambda_security_group_id]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = local.endpoint_security_group_name
    Project = "CertScore"
    Purpose = "private-service-endpoints"
  }
}

resource "aws_vpc_endpoint" "s3" {
  count = local.vpc_endpoints_enabled ? 1 : 0

  vpc_id            = var.vpc_endpoint_config.vpc_id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = var.vpc_endpoint_config.route_table_ids
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowRetainedEvidenceObjects"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject", "s3:PutObject"]
        Resource  = "arn:aws:s3:::${var.artifact_bucket}/${local.artifact_prefix}/*"
      },
      {
        Sid       = "AllowRetainedEvidencePrefixListing"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:ListBucket"]
        Resource  = "arn:aws:s3:::${var.artifact_bucket}"
        Condition = {
          StringLike = {
            "s3:prefix" = ["${local.artifact_prefix}/*"]
          }
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name    = "${var.project_name}-s3-endpoint-${var.region}"
    Purpose = "scanner-retained-evidence"
  })

  depends_on = [terraform_data.vpc_endpoint_dns_guard]
}

resource "aws_vpc_endpoint" "sqs" {
  count = local.vpc_endpoints_enabled ? 1 : 0

  vpc_id              = var.vpc_endpoint_config.vpc_id
  service_name        = "com.amazonaws.${var.region}.sqs"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = var.vpc_endpoint_config.subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowRegionalScannerResultQueues"
      Effect    = "Allow"
      Principal = "*"
      Action    = ["sqs:SendMessage"]
      Resource = [
        "arn:aws:sqs:${var.region}:${var.account_id}:${var.project_name}-results",
        aws_sqs_queue.results.arn,
        aws_sqs_queue.result_dlq.arn,
        aws_sqs_queue.async_failures.arn,
      ]
    }]
  })

  tags = merge(var.tags, {
    Name    = "${var.project_name}-sqs-endpoint-${var.region}"
    Purpose = "scanner-result-publication"
  })

  depends_on = [terraform_data.vpc_endpoint_dns_guard]
}

resource "aws_vpc_endpoint" "logs" {
  count = local.vpc_endpoints_enabled && var.vpc_endpoint_config.enable_logs_endpoint ? 1 : 0

  vpc_id              = var.vpc_endpoint_config.vpc_id
  service_name        = "com.amazonaws.${var.region}.logs"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = var.vpc_endpoint_config.subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowRegionalScannerLogs"
      Effect    = "Allow"
      Principal = "*"
      Action    = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource  = "arn:aws:logs:${var.region}:${var.account_id}:log-group:/aws/lambda/${var.function_name}:*"
    }]
  })

  tags = merge(var.tags, {
    Name    = "${var.project_name}-logs-endpoint-${var.region}"
    Purpose = "scanner-logs"
  })

  depends_on = [terraform_data.vpc_endpoint_dns_guard]
}

resource "aws_vpc_endpoint" "lambda" {
  count = local.vpc_endpoints_enabled ? 1 : 0

  vpc_id              = var.vpc_endpoint_config.vpc_id
  service_name        = "com.amazonaws.${var.region}.lambda"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = var.vpc_endpoint_config.subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowRegionalScannerShardInvocations"
      Effect    = "Allow"
      Principal = "*"
      Action    = ["lambda:InvokeFunction"]
      Resource  = "arn:aws:lambda:${var.region}:${var.account_id}:function:${var.project_name}-*"
    }]
  })

  tags = merge(var.tags, {
    Name    = "${var.project_name}-lambda-endpoint-${var.region}"
    Purpose = "scanner-shard-invocation"
  })

  depends_on = [terraform_data.vpc_endpoint_dns_guard]
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
    rules = local.ecr_lifecycle_rules
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

  lifecycle {
    # AWS supports the live 1 MiB setting, but provider v5 still validates the
    # historical 256 KiB ceiling. Preserve the live value until provider v6.
    ignore_changes = [max_message_size]
  }
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

resource "aws_sqs_queue" "dispatch_dlq" {
  name                      = local.dispatch_dlq_name
  fifo_queue                = true
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  tags                      = var.tags
}

resource "aws_sqs_queue" "dispatch" {
  name                        = local.dispatch_queue_name
  fifo_queue                  = true
  content_based_deduplication = false
  message_retention_seconds   = 1209600
  visibility_timeout_seconds  = 900
  sqs_managed_sse_enabled     = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dispatch_dlq.arn
    maxReceiveCount     = 5
  })
  tags = var.tags
}

resource "aws_sqs_queue_redrive_allow_policy" "dispatch" {
  queue_url = aws_sqs_queue.dispatch_dlq.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.dispatch.arn]
  })
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
  timeout                        = 75
  reserved_concurrent_executions = var.reserved_concurrent_executions

  ephemeral_storage { size = 512 }

  environment {
    variables = merge(
      local.base_environment,
      var.environment_variables,
      var.expected_egress_region != "" ? {
        CERTSCORE_V2_DAG_LAMBDA_EXPECTED_EGRESS_REGION = var.expected_egress_region
      } : {}
    )
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

resource "aws_lambda_event_source_mapping" "dispatch" {
  event_source_arn = aws_sqs_queue.dispatch.arn
  function_name    = aws_lambda_function.scanner.arn
  batch_size       = 1
  enabled          = true

  depends_on = [aws_sqs_queue_redrive_allow_policy.dispatch]
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

resource "aws_cloudwatch_metric_alarm" "lambda_duration_warning" {
  alarm_name          = "${var.function_name}-${var.region}-duration-60s"
  alarm_description   = "Scanner Lambda invocation exceeded 60 seconds in ${var.region}. In /aws/lambda/${var.function_name}, filter v2_lambda_duration_warning or v2_lambda_invocation_started to correlate scan_id, aws_request_id, hostname, lane, and outcome."
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 60000
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  unit                = "Milliseconds"
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

resource "aws_cloudwatch_metric_alarm" "old_dispatches" {
  alarm_name          = "${local.dispatch_queue_name}-${var.region}-oldest-message"
  alarm_description   = "A regional scanner dispatch has waited at least five minutes in ${var.region}."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 300
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { QueueName = aws_sqs_queue.dispatch.name }
  alarm_actions       = var.alarm_actions
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "dispatch_dlq" {
  alarm_name          = "${local.dispatch_dlq_name}-${var.region}-messages"
  alarm_description   = "Regional scanner dispatches exhausted bounded retries in ${var.region}."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { QueueName = aws_sqs_queue.dispatch_dlq.name }
  alarm_actions       = var.alarm_actions
  tags                = var.tags
}
