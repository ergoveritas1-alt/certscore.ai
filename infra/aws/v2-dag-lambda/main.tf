data "aws_caller_identity" "current" {}

data "aws_secretsmanager_secret_version" "web_bot_auth_private_key" {
  provider  = aws.us_west
  secret_id = var.web_bot_auth_private_key_secret_id
}

locals {
  function_name     = "${var.project_name}-lambda"
  result_queue_name = "${var.project_name}-production-results"
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "CertScore"
    Service   = "v2-dag-lambda"
  })
  regions = {
    eu_central_1 = "eu-central-1"
    eu_west_1    = "eu-west-1"
    us_west_1    = "us-west-1"
  }
  artifact_buckets = {
    for key, region in local.regions :
    key => "${var.project_name}-artifacts-${region}-${data.aws_caller_identity.current.account_id}"
  }
  queue_arns = flatten([
    for region in values(local.regions) : [
      "arn:aws:sqs:${region}:${data.aws_caller_identity.current.account_id}:${var.project_name}-results",
      "arn:aws:sqs:${region}:${data.aws_caller_identity.current.account_id}:${local.result_queue_name}",
      "arn:aws:sqs:${region}:${data.aws_caller_identity.current.account_id}:${local.result_queue_name}-dlq",
      "arn:aws:sqs:${region}:${data.aws_caller_identity.current.account_id}:${var.project_name}-async-failures"
    ]
  ])
  dispatch_queue_arns = [
    for region in values(local.regions) :
    "arn:aws:sqs:${region}:${data.aws_caller_identity.current.account_id}:${var.project_name}-production-dispatch.fifo"
  ]
  scanner_shared_environment = {
    CERTSCORE_V2_DAG_LAMBDA_EGRESS_REFLECTOR_CONNECT_HOST = var.egress_reflector_connect_host
    WEB_BOT_AUTH_PRIVATE_KEY_PEM                          = data.aws_secretsmanager_secret_version.web_bot_auth_private_key.secret_string
  }
}

resource "aws_iam_role" "scanner" {
  name = "${var.project_name}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy" "scanner" {
  name = "${var.project_name}-policy"
  role = aws_iam_role.scanner.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "WriteScannerLogs"
        Effect = "Allow"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = [
          for region in values(local.regions) :
          "arn:aws:logs:${region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.function_name}:*"
        ]
      },
      {
        Sid      = "SendScannerResults"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = local.queue_arns
      },
      {
        Sid    = "ConsumeRegionalScannerDispatches"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:ChangeMessageVisibility",
          "sqs:GetQueueAttributes"
        ]
        Resource = local.dispatch_queue_arns
      },
      {
        Sid    = "UseRetainedEvidenceObjects"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject"]
        Resource = [
          for bucket in values(local.artifact_buckets) :
          "arn:aws:s3:::${bucket}/${trimsuffix(var.artifact_prefix, "/")}/*"
        ]
      },
      {
        Sid    = "ListRetainedEvidencePrefix"
        Effect = "Allow"
        Action = ["s3:ListBucket"]
        Resource = [
          for bucket in values(local.artifact_buckets) :
          "arn:aws:s3:::${bucket}"
        ]
        Condition = {
          StringLike = {
            "s3:prefix" = ["${trimsuffix(var.artifact_prefix, "/")}/*"]
          }
        }
      },
      {
        Sid    = "InvokeScannerShards"
        Effect = "Allow"
        Action = ["lambda:InvokeFunction"]
        Resource = [
          for region in values(local.regions) :
          "arn:aws:lambda:${region}:${data.aws_caller_identity.current.account_id}:function:${var.project_name}-*"
        ]
      },
      {
        Sid    = "ManageVpcNetworkInterfaces"
        Effect = "Allow"
        Action = [
          "ec2:AssignPrivateIpAddresses",
          "ec2:CreateNetworkInterface",
          "ec2:DeleteNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:UnassignPrivateIpAddresses"
        ]
        Resource = "*"
      }
    ]
  })
}

module "eu_central_1" {
  source = "./modules/regional-scanner"
  providers = {
    aws = aws
  }

  account_id                       = data.aws_caller_identity.current.account_id
  alarm_actions                    = lookup(var.alarm_actions_by_region, local.regions.eu_central_1, [])
  artifact_bucket                  = local.artifact_buckets.eu_central_1
  artifact_prefix                  = var.artifact_prefix
  environment_variables            = merge(lookup(var.environment_variables_by_region, "eu-central-1", {}), local.scanner_shared_environment)
  function_name                    = local.function_name
  image_uri                        = var.image_uris.eu_central_1
  locale                           = "de-DE"
  accept_language                  = "de-DE,de;q=0.9,en;q=0.8"
  timezone_id                      = "Europe/Berlin"
  expected_egress_region           = lookup(var.expected_egress_region_by_region, "eu-central-1", "")
  log_retention_days               = var.log_retention_days
  memory_size                      = var.memory_size
  project_name                     = var.project_name
  region                           = local.regions.eu_central_1
  reserved_concurrent_executions   = var.reserved_concurrent_executions
  result_queue_name                = local.result_queue_name
  result_redrive_max_receive_count = var.result_redrive_max_receive_count
  role_arn                         = aws_iam_role.scanner.arn
  tags                             = local.common_tags
  vpc_config                       = lookup(var.vpc_config_by_region, "eu-central-1", null)
  vpc_endpoint_config              = lookup(var.vpc_endpoint_config_by_region, "eu-central-1", null)
  depends_on                       = [aws_iam_role_policy.scanner]
}

module "eu_west_1" {
  source = "./modules/regional-scanner"
  providers = {
    aws = aws.eu_west
  }

  account_id                       = data.aws_caller_identity.current.account_id
  alarm_actions                    = lookup(var.alarm_actions_by_region, local.regions.eu_west_1, [])
  artifact_bucket                  = local.artifact_buckets.eu_west_1
  artifact_prefix                  = var.artifact_prefix
  environment_variables            = merge(lookup(var.environment_variables_by_region, "eu-west-1", {}), local.scanner_shared_environment)
  function_name                    = local.function_name
  image_uri                        = var.image_uris.eu_west_1
  locale                           = "en-IE"
  accept_language                  = "en-IE,en;q=0.9"
  timezone_id                      = "Europe/Dublin"
  expected_egress_region           = lookup(var.expected_egress_region_by_region, "eu-west-1", "")
  log_retention_days               = var.log_retention_days
  memory_size                      = var.memory_size
  project_name                     = var.project_name
  region                           = local.regions.eu_west_1
  reserved_concurrent_executions   = var.reserved_concurrent_executions
  result_queue_name                = local.result_queue_name
  result_redrive_max_receive_count = var.result_redrive_max_receive_count
  role_arn                         = aws_iam_role.scanner.arn
  tags                             = local.common_tags
  vpc_config                       = lookup(var.vpc_config_by_region, "eu-west-1", null)
  vpc_endpoint_config              = lookup(var.vpc_endpoint_config_by_region, "eu-west-1", null)
  depends_on                       = [aws_iam_role_policy.scanner]
}

module "us_west_1" {
  source = "./modules/regional-scanner"
  providers = {
    aws = aws.us_west
  }

  account_id                       = data.aws_caller_identity.current.account_id
  alarm_actions                    = lookup(var.alarm_actions_by_region, local.regions.us_west_1, [])
  artifact_bucket                  = local.artifact_buckets.us_west_1
  artifact_prefix                  = var.artifact_prefix
  environment_variables            = merge(lookup(var.environment_variables_by_region, "us-west-1", {}), local.scanner_shared_environment)
  function_name                    = local.function_name
  image_uri                        = var.image_uris.us_west_1
  locale                           = "en-US"
  accept_language                  = "en-US,en;q=0.9"
  timezone_id                      = "America/Los_Angeles"
  expected_egress_region           = lookup(var.expected_egress_region_by_region, "us-west-1", "")
  log_retention_days               = var.log_retention_days
  memory_size                      = var.memory_size
  project_name                     = var.project_name
  region                           = local.regions.us_west_1
  reserved_concurrent_executions   = var.reserved_concurrent_executions
  result_queue_name                = local.result_queue_name
  result_redrive_max_receive_count = var.result_redrive_max_receive_count
  role_arn                         = aws_iam_role.scanner.arn
  tags                             = local.common_tags
  vpc_config                       = lookup(var.vpc_config_by_region, "us-west-1", null)
  vpc_endpoint_config              = lookup(var.vpc_endpoint_config_by_region, "us-west-1", null)
  depends_on                       = [aws_iam_role_policy.scanner]
}
