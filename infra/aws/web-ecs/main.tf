data "aws_caller_identity" "current" {}

data "aws_secretsmanager_secret" "oauth_jwt" {
  name = "certscore/oauth-jwt-secret"
}

data "tls_certificate" "github_actions_oidc" {
  url = "https://token.actions.githubusercontent.com"
}

check "s3_static_credentials_are_paired" {
  assert {
    condition = (
      trimspace(var.s3_access_key_id_secret_arn) == "" && trimspace(var.s3_secret_access_key_secret_arn) == ""
      ) || (
      trimspace(var.s3_access_key_id_secret_arn) != "" && trimspace(var.s3_secret_access_key_secret_arn) != ""
    )
    error_message = "s3_access_key_id_secret_arn and s3_secret_access_key_secret_arn must be configured together."
  }
}

locals {
  prefix                      = var.project_name
  vpc_id                      = var.existing_vpc_id
  public_subnets              = var.public_subnet_ids
  private_subnets             = var.private_subnet_ids
  certificate_arn             = trimspace(var.existing_certificate_arn) != "" ? var.existing_certificate_arn : null
  mcp_certificate_arn         = trimspace(var.mcp_certificate_arn) != "" ? var.mcp_certificate_arn : null
  create_cluster              = trimspace(var.existing_ecs_cluster_name) == ""
  ecs_cluster_name            = local.create_cluster ? aws_ecs_cluster.web[0].name : var.existing_ecs_cluster_name
  common_tags                 = merge(var.tags, { Project = local.prefix, ManagedBy = "terraform", Stack = "web-ecs" })
  v2_dag_lambda_function_name = "certscore-v2-dag-local-lambda"
  v2_dag_lambda_regions = {
    eu_de      = "eu-central-1"
    eu_ie      = "eu-west-1"
    california = "us-west-1"
  }
  v2_dag_lambda_queue_urls = {
    for key, region in local.v2_dag_lambda_regions :
    key => "https://sqs.${region}.amazonaws.com/${data.aws_caller_identity.current.account_id}/certscore-v2-dag-local-production-results"
  }
  v2_dag_lambda_artifact_object_arns = [
    for region in values(local.v2_dag_lambda_regions) :
    "arn:aws:s3:::certscore-v2-dag-local-artifacts-${region}-${data.aws_caller_identity.current.account_id}/v2-dag-lambda/local/*"
  ]
  web_secret_arns = compact([
    var.database_url_secret_arn,
    var.better_auth_secret_arn,
    var.google_client_id_secret_arn,
    var.google_client_secret_secret_arn,
    var.openai_api_key_secret_arn,
    var.s3_access_key_id_secret_arn,
    var.s3_secret_access_key_secret_arn,
    var.gmail_smtp_user_secret_arn,
    var.gmail_smtp_app_password_secret_arn,
    var.feedback_to_email_secret_arn,
    var.privacy_request_to_email_secret_arn,
    var.stripe_secret_key_secret_arn,
    var.stripe_webhook_secret_secret_arn,
    var.bx01_observed_signal_ingest_token_secret_arn,
    data.aws_secretsmanager_secret.oauth_jwt.arn
  ])
  base_environment = concat(
    [
      { name = "APP_FLAVOR", value = var.app_flavor },
      { name = "BUILD_RUNTIME_TARGET", value = var.build_runtime_target },
      { name = "DATABASE_SSL_MODE", value = var.database_ssl_mode },
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "HOSTNAME", value = "0.0.0.0" },
      { name = "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED", value = var.next_public_auth_google_enabled },
      { name = "CERTSCORE_ADMIN_EMAILS", value = var.certscore_admin_emails },
      { name = "CERTSCORE_CHROME_EXTENSION_STORE_URL", value = var.certscore_chrome_extension_store_url },
      { name = "CERTSCORE_AUTH_ACCESS_RESTRICTED", value = "false" },
      { name = "CERTSCORE_AUTH_ALLOWED_EMAILS", value = var.certscore_auth_allowed_emails != "" ? var.certscore_auth_allowed_emails : var.certscore_admin_emails },
      { name = "CERTSCORE_PUBLIC_ACCOUNT_CREATION_ENABLED", value = "true" },
      { name = "CERTSCORE_SELF_SERVE_PURCHASING_ENABLED", value = "true" },
      { name = "CERTSCORE_V2_DAG_LAMBDA_ENABLED", value = "true" },
      { name = "CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE", value = "sharded" },
      { name = "CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV", value = "production" },
      { name = "CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME", value = local.v2_dag_lambda_function_name },
      { name = "CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL", value = local.v2_dag_lambda_queue_urls.eu_de },
      { name = "CERTSCORE_V2_DAG_LAMBDA_EU_DE_ENABLED", value = "true" },
      { name = "CERTSCORE_V2_DAG_LAMBDA_EU_DE_FUNCTION_NAME", value = local.v2_dag_lambda_function_name },
      { name = "CERTSCORE_V2_DAG_LAMBDA_EU_DE_RESULT_QUEUE_URL", value = local.v2_dag_lambda_queue_urls.eu_de },
      { name = "CERTSCORE_V2_DAG_LAMBDA_EU_IE_ENABLED", value = "true" },
      { name = "CERTSCORE_V2_DAG_LAMBDA_EU_IE_FUNCTION_NAME", value = local.v2_dag_lambda_function_name },
      { name = "CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL", value = local.v2_dag_lambda_queue_urls.eu_ie },
      { name = "CERTSCORE_V2_DAG_LAMBDA_US_WEST_ENABLED", value = "true" },
      { name = "CERTSCORE_V2_DAG_LAMBDA_US_WEST_FUNCTION_NAME", value = local.v2_dag_lambda_function_name },
      { name = "CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL", value = local.v2_dag_lambda_queue_urls.california },
      { name = "FULL_SCAN_QUEUE_ALLOW_DEGRADED_HEARTBEAT", value = tostring(var.full_scan_queue_allow_degraded_heartbeat) },
      { name = "FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS", value = tostring(var.full_scan_allow_production_load_test_dns_bypass) },
      { name = "S3_BUCKET", value = var.s3_bucket },
      { name = "S3_REGION", value = var.s3_region }
    ],
    var.s3_endpoint != "" ? [{ name = "S3_ENDPOINT", value = var.s3_endpoint }] : [],
    var.s3_force_path_style != "" ? [{ name = "S3_FORCE_PATH_STYLE", value = var.s3_force_path_style }] : []
  )
  base_secrets = concat(
    [
      { name = "DATABASE_URL", valueFrom = var.database_url_secret_arn },
      { name = "BETTER_AUTH_SECRET", valueFrom = var.better_auth_secret_arn },
      { name = "GMAIL_SMTP_USER", valueFrom = var.gmail_smtp_user_secret_arn },
      { name = "GMAIL_SMTP_APP_PASSWORD", valueFrom = var.gmail_smtp_app_password_secret_arn },
      { name = "FEEDBACK_TO_EMAIL", valueFrom = var.feedback_to_email_secret_arn }
    ],
    var.s3_access_key_id_secret_arn != "" && var.s3_secret_access_key_secret_arn != "" ? [
      { name = "S3_ACCESS_KEY_ID", valueFrom = var.s3_access_key_id_secret_arn },
      { name = "S3_SECRET_ACCESS_KEY", valueFrom = var.s3_secret_access_key_secret_arn }
    ] : [],
    var.billing_alert_to_email_secret_arn != "" ? [{ name = "BILLING_ALERT_TO_EMAIL", valueFrom = var.billing_alert_to_email_secret_arn }] : [],
    var.google_client_id_secret_arn != "" ? [{ name = "GOOGLE_CLIENT_ID", valueFrom = var.google_client_id_secret_arn }] : [],
    var.google_client_secret_secret_arn != "" ? [{ name = "GOOGLE_CLIENT_SECRET", valueFrom = var.google_client_secret_secret_arn }] : [],
    var.openai_api_key_secret_arn != "" ? [{ name = "OPENAI_API_KEY", valueFrom = var.openai_api_key_secret_arn }] : [],
    var.privacy_request_to_email_secret_arn != "" ? [{ name = "PRIVACY_REQUEST_TO_EMAIL", valueFrom = var.privacy_request_to_email_secret_arn }] : []
    ,
    var.stripe_secret_key_secret_arn != "" ? [{ name = "STRIPE_SECRET_KEY", valueFrom = var.stripe_secret_key_secret_arn }] : [],
    var.stripe_webhook_secret_secret_arn != "" ? [{ name = "STRIPE_WEBHOOK_SECRET", valueFrom = var.stripe_webhook_secret_secret_arn }] : [],
    var.bx01_observed_signal_ingest_token_secret_arn != "" ? [{ name = "BX01_OBSERVED_SIGNAL_INGEST_TOKEN", valueFrom = var.bx01_observed_signal_ingest_token_secret_arn }] : [],
    [{ name = "CERTSCORE_OAUTH_JWT_SECRET", valueFrom = data.aws_secretsmanager_secret.oauth_jwt.arn }]
  )
  certscore_base_url = local.certificate_arn != null ? "https://${var.certscore_domain_name}" : "http://${aws_lb.web.dns_name}"
}

resource "aws_security_group" "alb" {
  name        = "${local.prefix}-alb"
  description = "Public ingress for CertScore and ConsentCheck web"
  vpc_id      = local.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-alb-sg" })
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${local.prefix}-ecs"
  description = "Public web ECS task networking"
  vpc_id      = local.vpc_id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "ALB access to isolated MCP service"
    from_port       = 3004
    to_port         = 3004
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-ecs-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "database_from_ecs" {
  count = trimspace(var.database_security_group_id) != "" ? 1 : 0

  security_group_id            = var.database_security_group_id
  referenced_security_group_id = aws_security_group.ecs_tasks.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "Public web ECS access"
}

resource "aws_lb" "web" {
  name               = substr(replace("${local.prefix}-alb", "/[^a-zA-Z0-9-]/", "-"), 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = local.public_subnets
  idle_timeout       = 600
  # Request attribution trusts the ALB-observed peer at the right edge of XFF.
  # Pin append mode so caller-supplied values cannot replace that peer address.
  xff_header_processing_mode = "append"

  dynamic "access_logs" {
    for_each = trimspace(var.alb_access_logs_bucket) != "" ? [1] : []
    content {
      bucket  = var.alb_access_logs_bucket
      enabled = true
      prefix  = var.alb_access_logs_prefix
    }
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-alb" })
}

resource "aws_wafv2_web_acl" "public" {
  count = var.enable_waf ? 1 : 0

  name  = "${local.prefix}-public"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-common-rules"
    priority = 10

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.prefix}-aws-common-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "source-ip-rate-limit"
    priority = 20

    action {
      block {}
    }

    statement {
      rate_based_statement {
        aggregate_key_type = "IP"
        limit              = var.waf_rate_limit
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.prefix}-source-ip-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.prefix}-public-waf"
    sampled_requests_enabled   = true
  }

  tags = local.common_tags
}

resource "aws_wafv2_web_acl_association" "public_alb" {
  count = var.enable_waf ? 1 : 0

  resource_arn = aws_lb.web.arn
  web_acl_arn  = aws_wafv2_web_acl.public[0].arn
}

moved {
  from = aws_lb_target_group.mcp
  to   = aws_lb_target_group.mcp_legacy
}

resource "aws_lb_target_group" "certscore" {
  name        = substr(replace("${local.prefix}-certscore", "/[^a-zA-Z0-9-]/", "-"), 0, 32)
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = local.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-399"
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-certscore-tg" })
}

resource "aws_lb_target_group" "mcp_legacy" {
  name        = substr(replace("${local.prefix}-mcp", "/[^a-zA-Z0-9-]/", "-"), 0, 32)
  port        = 3004
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = local.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-399"
    path                = "/healthz"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-mcp-tg" })
}

resource "aws_lb_target_group" "mcp_service" {
  name        = substr(replace("${local.prefix}-mcp-service", "/[^a-zA-Z0-9-]/", "-"), 0, 32)
  port        = 3004
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = local.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-399"
    path                = "/healthz"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-mcp-service-tg" })
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = local.certificate_arn != null ? "redirect" : "forward"

    dynamic "redirect" {
      for_each = local.certificate_arn != null ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }

    dynamic "forward" {
      for_each = local.certificate_arn == null ? [1] : []
      content {
        target_group {
          arn = aws_lb_target_group.certscore.arn
        }
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count = local.certificate_arn != null ? 1 : 0

  load_balancer_arn = aws_lb.web.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = local.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.certscore.arn
  }
}

resource "aws_lb_listener_certificate" "mcp" {
  count = local.certificate_arn != null && local.mcp_certificate_arn != null ? 1 : 0

  listener_arn    = aws_lb_listener.https[0].arn
  certificate_arn = local.mcp_certificate_arn
}

resource "aws_lb_listener_rule" "mcp_host" {
  count = local.certificate_arn != null ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mcp_service.arn
  }

  condition {
    host_header {
      values = [var.mcp_domain_name]
    }
  }
}

resource "aws_lb_listener_rule" "mcp_http_host" {
  count = local.certificate_arn == null ? 1 : 0

  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mcp_service.arn
  }

  condition {
    host_header {
      values = [var.mcp_domain_name]
    }
  }
}

# Keep the isolated target group associated with the ALB before the production
# host rule moves. This enables a staged ECS service cutover without routing
# public requests to an empty target group.
resource "aws_lb_listener_rule" "mcp_staging_association" {
  count = local.certificate_arn != null ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 101

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mcp_service.arn
  }

  condition {
    host_header {
      values = ["mcp-staging.invalid"]
    }
  }
}

resource "aws_lb_listener_rule" "mcp_http_staging_association" {
  count = local.certificate_arn == null ? 1 : 0

  listener_arn = aws_lb_listener.http.arn
  priority     = 101

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mcp_service.arn
  }

  condition {
    host_header {
      values = ["mcp-staging.invalid"]
    }
  }
}

resource "aws_cloudwatch_log_group" "certscore" {
  name              = "/ecs/${local.prefix}/certscore"
  retention_in_days = 30
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "mcp" {
  name              = "/ecs/${local.prefix}/mcp"
  retention_in_days = 30

  lifecycle {
    prevent_destroy = true
  }

  tags = local.common_tags
}

resource "aws_ecr_repository" "web" {
  name                 = "${local.prefix}-web"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecr_repository" "mcp" {
  name                 = var.mcp_ecr_repository_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = local.common_tags
}

resource "aws_ecr_lifecycle_policy" "web" {
  repository = aws_ecr_repository.web.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 14 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 14
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 10
        description  = "Keep only the newest 20 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "mcp" {
  repository = aws_ecr_repository.mcp.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 14 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 14
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 10
        description  = "Keep only the newest 20 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = { type = "expire" }
      }
    ]
  })
}

resource "aws_ecs_cluster" "web" {
  count = local.create_cluster ? 1 : 0

  name = "${local.prefix}-cluster"

  configuration {
    execute_command_configuration {
      logging = "DEFAULT"
    }
  }

  tags = local.common_tags
}

resource "aws_iam_role" "execution" {
  name = "${local.prefix}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "${local.prefix}-execution-secrets"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = local.web_secret_arns
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role" "task" {
  name = "${local.prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role" "mcp_task" {
  name = "${local.prefix}-mcp-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "mcp_task_exec" {
  name = "${local.prefix}-mcp-ecs-exec"
  role = aws_iam_role.mcp_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "task_exec" {
  name = "${local.prefix}-ecs-exec"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"]
        Resource = "*"
      },
      {
        Sid    = "UseSharedArtifactBucket"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "arn:aws:s3:::${var.s3_bucket}/*"
      },
      {
        Sid      = "ListSharedArtifactBucket"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = "arn:aws:s3:::${var.s3_bucket}"
      },
      {
        Sid    = "InvokeRegionalV2DagLambda"
        Effect = "Allow"
        Action = "lambda:InvokeFunction"
        Resource = [
          for region in values(local.v2_dag_lambda_regions) :
          "arn:aws:lambda:${region}:${data.aws_caller_identity.current.account_id}:function:${local.v2_dag_lambda_function_name}"
        ]
      },
      {
        Sid    = "ReadRegionalV2DagLambdaHealth"
        Effect = "Allow"
        Action = [
          "lambda:GetFunctionConfiguration"
        ]
        Resource = [
          for region in values(local.v2_dag_lambda_regions) :
          "arn:aws:lambda:${region}:${data.aws_caller_identity.current.account_id}:function:${local.v2_dag_lambda_function_name}"
        ]
      },
      {
        Sid    = "ReadRegionalV2DagLambdaResults"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl"
        ]
        Resource = [
          for region in values(local.v2_dag_lambda_regions) :
          "arn:aws:sqs:${region}:${data.aws_caller_identity.current.account_id}:certscore-v2-dag-local-production-results"
        ]
      },
      {
        Sid      = "ReadRegionalV2DagLambdaArtifacts"
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = local.v2_dag_lambda_artifact_object_arns
      }
    ]
  })
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions_oidc.certificates[0].sha1_fingerprint]

  tags = local.common_tags
}

resource "aws_iam_role" "github_actions_deploy" {
  name = "${local.prefix}-github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = var.github_actions_subjects
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "${local.prefix}-github-actions-deploy"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
          "ecr:DescribeRepositories",
          "ecr:DescribeImageScanFindings",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = concat([aws_ecr_repository.web.arn, aws_ecr_repository.mcp.arn], var.github_actions_extra_ecr_repository_arns)
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeClusters",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:DescribeTasks",
          "ecs:ListTasks",
          "ecs:RegisterTaskDefinition",
          "ecs:RunTask",
          "ecs:UpdateService"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetHealth"
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = data.aws_secretsmanager_secret.oauth_jwt.arn
      },
      {
        Effect = "Allow"
        Action = ["iam:PassRole"]
        Resource = [
          aws_iam_role.execution.arn,
          aws_iam_role.task.arn,
          aws_iam_role.mcp_task.arn
        ]
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:FilterLogEvents",
          "logs:GetLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_ecs_task_definition" "certscore" {
  family                   = "${local.prefix}-certscore"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.web_cpu)
  memory                   = tostring(var.web_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "certscore-web"
      image     = "${aws_ecr_repository.web.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]
      environment = concat(local.base_environment, [
        { name = "NEXT_PUBLIC_APP_URL", value = local.certscore_base_url },
        { name = "STRIPE_PRICE_INDIVIDUAL_MONTHLY", value = var.stripe_price_individual_monthly },
        { name = "STRIPE_PRICE_STARTER_MONTHLY", value = var.stripe_price_individual_monthly },
        { name = "STRIPE_PRICE_PRO_MONTHLY", value = var.stripe_price_pro_monthly },
        { name = "STRIPE_BILLING_PORTAL_CONFIGURATION_ID", value = var.stripe_billing_portal_configuration_id },
        { name = "STRIPE_BILLING_PORTAL_RETURN_PATH", value = var.stripe_billing_portal_return_path }
      ])
      secrets = local.base_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.certscore.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  tags = local.common_tags
}

resource "aws_ecs_task_definition" "mcp" {
  family                   = "${local.prefix}-mcp"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.mcp_cpu)
  memory                   = tostring(var.mcp_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.mcp_task.arn

  container_definitions = jsonencode([
    {
      name                   = "mcp-http"
      image                  = "${aws_ecr_repository.mcp.repository_url}:${var.mcp_image_tag}"
      essential              = true
      readonlyRootFilesystem = true
      portMappings = [
        {
          containerPort = 3004
          hostPort      = 3004
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "CORS_ALLOWED_ORIGINS", value = "https://certscore.ai,https://www.certscore.ai,https://claude.ai,https://api.anthropic.com" },
        { name = "CERTSCORE_BASE_URL", value = "https://certscore.ai" },
        { name = "CERTSCORE_REQUEST_TIMEOUT_MS", value = "30000" },
        { name = "PORT", value = "3004" },
        { name = "SESSION_TTL_SECONDS", value = "1800" },
        { name = "BUILD_RUNTIME_TARGET", value = var.build_runtime_target },
        { name = "OAUTH_ISSUER", value = "https://certscore.ai" },
        { name = "MCP_PUBLIC_URL", value = "https://mcp.certscore.ai" },
        { name = "NODE_ENV", value = "production" },
        { name = "SESSION_MAX_COUNT", value = "500" }
      ]
      secrets = [
        { name = "CERTSCORE_OAUTH_JWT_SECRET", valueFrom = data.aws_secretsmanager_secret.oauth_jwt.arn }
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3004/healthz').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 20
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.mcp.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  tags = local.common_tags
}

resource "aws_ecs_service" "certscore" {
  name                   = "${local.prefix}-certscore"
  cluster                = local.ecs_cluster_name
  task_definition        = aws_ecs_task_definition.certscore.arn
  desired_count          = var.web_desired_count
  launch_type            = "FARGATE"
  enable_execute_command = true

  network_configuration {
    assign_public_ip = var.assign_public_ip
    security_groups  = [aws_security_group.ecs_tasks.id]
    subnets          = local.private_subnets
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.certscore.arn
    container_name   = "certscore-web"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  health_check_grace_period_seconds = 90

  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener.http, aws_lb_listener.https]

  tags = local.common_tags
}

resource "aws_ecs_service" "mcp" {
  name                               = "${local.prefix}-mcp"
  cluster                            = local.ecs_cluster_name
  task_definition                    = aws_ecs_task_definition.mcp.arn
  desired_count                      = 1
  launch_type                        = "FARGATE"
  enable_execute_command             = true
  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  network_configuration {
    assign_public_ip = var.assign_public_ip
    security_groups  = [aws_security_group.ecs_tasks.id]
    subnets          = local.private_subnets
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.mcp_service.arn
    container_name   = "mcp-http"
    container_port   = 3004
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  health_check_grace_period_seconds = 90

  depends_on = [
    aws_lb_listener.https,
    aws_lb_listener_rule.mcp_staging_association,
    aws_lb_listener_rule.mcp_http_staging_association
  ]

  tags = local.common_tags
}

resource "aws_appautoscaling_target" "certscore_web" {
  max_capacity       = var.web_autoscaling_max_capacity
  min_capacity       = var.web_autoscaling_min_capacity
  resource_id        = "service/${local.ecs_cluster_name}/${aws_ecs_service.certscore.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "certscore_web_cpu" {
  name               = "${local.prefix}-certscore-cpu-60"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.certscore_web.resource_id
  scalable_dimension = aws_appautoscaling_target.certscore_web.scalable_dimension
  service_namespace  = aws_appautoscaling_target.certscore_web.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.web_autoscaling_target_cpu
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "certscore_web_cpu_sustained" {
  alarm_name          = "${local.prefix}-certscore-web-cpu-sustained"
  alarm_description   = "CertScore web ECS CPU remained at or above 85% for two minutes."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions

  dimensions = {
    ClusterName = local.ecs_cluster_name
    ServiceName = aws_ecs_service.certscore.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_metric_filter" "scan_progress_status_requests" {
  name           = "${local.prefix}-scan-progress-status-requests"
  log_group_name = aws_cloudwatch_log_group.certscore.name
  pattern        = "{ $.event = \"scan.progress_status_request\" }"

  metric_transformation {
    name      = "ScanProgressStatusRequests"
    namespace = "CertScore/Web"
    value     = "1"
  }
}

resource "aws_cloudwatch_log_metric_filter" "scan_progress_report_visible_ms" {
  name           = "${local.prefix}-scan-progress-report-visible-ms"
  log_group_name = aws_cloudwatch_log_group.certscore.name
  pattern        = "{ $.event = \"scan.progress_report_visible\" && $.durationMs = * }"

  metric_transformation {
    name      = "ScanTerminalToReportVisibleMs"
    namespace = "CertScore/Web"
    value     = "$.durationMs"
  }
}

resource "aws_cloudwatch_log_metric_filter" "lambda_dispatch_total_ms" {
  name           = "${local.prefix}-lambda-dispatch-total-ms"
  log_group_name = aws_cloudwatch_log_group.certscore.name
  pattern        = "{ $.event = \"scan.lambda_dispatch_timing\" && $.dispatchTotalMs = * }"

  metric_transformation {
    name      = "ScanLambdaDispatchTotalMs"
    namespace = "CertScore/Web"
    value     = "$.dispatchTotalMs"
  }
}

resource "aws_cloudwatch_metric_alarm" "scan_progress_request_amplification" {
  alarm_name          = "${local.prefix}-scan-progress-request-amplification"
  alarm_description   = "Pending scan status requests exceeded the bounded polling envelope."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "ScanProgressStatusRequests"
  namespace           = "CertScore/Web"
  period              = 60
  statistic           = "Sum"
  threshold           = 120
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions

  depends_on = [aws_cloudwatch_log_metric_filter.scan_progress_status_requests]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "certscore_no_healthy_targets" {
  alarm_name          = "${local.prefix}-certscore-no-healthy-targets"
  alarm_description   = "CertScore public web target group has no healthy ALB targets."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Minimum"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.web.arn_suffix
    TargetGroup  = aws_lb_target_group.certscore.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "certscore_unhealthy_targets" {
  alarm_name          = "${local.prefix}-certscore-unhealthy-targets"
  alarm_description   = "CertScore public web target group has unhealthy ALB targets."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.web.arn_suffix
    TargetGroup  = aws_lb_target_group.certscore.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "mcp_no_healthy_targets" {
  alarm_name          = "${local.prefix}-mcp-no-healthy-targets"
  alarm_description   = "CertScore MCP target group has no healthy ALB targets."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Minimum"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.web.arn_suffix
    TargetGroup  = aws_lb_target_group.mcp_service.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "mcp_unhealthy_targets" {
  alarm_name          = "${local.prefix}-mcp-unhealthy-targets"
  alarm_description   = "CertScore MCP target group has unhealthy ALB targets."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.web.arn_suffix
    TargetGroup  = aws_lb_target_group.mcp_service.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "mcp_target_5xx" {
  alarm_name          = "${local.prefix}-mcp-target-5xx"
  alarm_description   = "CertScore MCP returned an elevated number of target 5xx responses."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.web.arn_suffix
    TargetGroup  = aws_lb_target_group.mcp_service.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "mcp_target_latency" {
  alarm_name          = "${local.prefix}-mcp-target-latency"
  alarm_description   = "CertScore MCP target response latency exceeded five seconds at p95."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  extended_statistic  = "p95"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.web.arn_suffix
    TargetGroup  = aws_lb_target_group.mcp_service.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_metric_filter" "mcp_auth_failures" {
  name           = "${local.prefix}-mcp-auth-failures"
  pattern        = "{ $.event = \"mcp_http.auth_failed\" }"
  log_group_name = "/ecs/certscore-web/mcp"

  metric_transformation {
    name      = "AuthenticationFailures"
    namespace = "CertScore/MCP"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "mcp_auth_failures" {
  alarm_name          = "${local.prefix}-mcp-auth-failures"
  alarm_description   = "CertScore MCP observed an elevated number of bearer-token authentication failures."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "AuthenticationFailures"
  namespace           = "CertScore/MCP"
  period              = 300
  statistic           = "Sum"
  threshold           = 20
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions

  tags = local.common_tags
}

resource "aws_cloudwatch_log_metric_filter" "mcp_session_capacity_evictions" {
  name           = "${local.prefix}-mcp-session-capacity-evictions"
  pattern        = "{ $.event = \"mcp_http.session_capacity_eviction\" }"
  log_group_name = "/ecs/certscore-web/mcp"

  metric_transformation {
    name      = "SessionCapacityEvictions"
    namespace = "CertScore/MCP"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "mcp_session_capacity_evictions" {
  alarm_name          = "${local.prefix}-mcp-session-capacity-evictions"
  alarm_description   = "CertScore MCP reached its bounded session capacity and evicted an existing session."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "SessionCapacityEvictions"
  namespace           = "CertScore/MCP"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions

  tags = local.common_tags
}
