data "aws_caller_identity" "current" {}

data "tls_certificate" "github_actions_oidc" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  prefix           = var.project_name
  vpc_id           = var.existing_vpc_id
  public_subnets   = var.public_subnet_ids
  private_subnets  = var.private_subnet_ids
  certificate_arn  = trimspace(var.existing_certificate_arn) != "" ? var.existing_certificate_arn : null
  create_cluster   = trimspace(var.existing_ecs_cluster_name) == ""
  ecs_cluster_name = local.create_cluster ? aws_ecs_cluster.web[0].name : var.existing_ecs_cluster_name
  common_tags      = merge(var.tags, { Project = local.prefix, ManagedBy = "terraform", Stack = "web-ecs" })
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
    var.privacy_request_to_email_secret_arn
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
      { name = "S3_ACCESS_KEY_ID", valueFrom = var.s3_access_key_id_secret_arn },
      { name = "S3_SECRET_ACCESS_KEY", valueFrom = var.s3_secret_access_key_secret_arn },
      { name = "GMAIL_SMTP_USER", valueFrom = var.gmail_smtp_user_secret_arn },
      { name = "GMAIL_SMTP_APP_PASSWORD", valueFrom = var.gmail_smtp_app_password_secret_arn },
      { name = "FEEDBACK_TO_EMAIL", valueFrom = var.feedback_to_email_secret_arn }
    ],
    var.google_client_id_secret_arn != "" ? [{ name = "GOOGLE_CLIENT_ID", valueFrom = var.google_client_id_secret_arn }] : [],
    var.google_client_secret_secret_arn != "" ? [{ name = "GOOGLE_CLIENT_SECRET", valueFrom = var.google_client_secret_secret_arn }] : [],
    var.openai_api_key_secret_arn != "" ? [{ name = "OPENAI_API_KEY", valueFrom = var.openai_api_key_secret_arn }] : [],
    var.privacy_request_to_email_secret_arn != "" ? [{ name = "PRIVACY_REQUEST_TO_EMAIL", valueFrom = var.privacy_request_to_email_secret_arn }] : []
  )
  certscore_base_url = local.certificate_arn != null ? "https://${var.certscore_domain_name}" : "http://${aws_lb.web.dns_name}"
}

resource "aws_security_group" "alb" {
  name        = "${local.prefix}-alb"
  description = "Public ingress for CertScore web"
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

  tags = merge(local.common_tags, { Name = "${local.prefix}-alb" })
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

resource "aws_cloudwatch_log_group" "certscore" {
  name              = "/ecs/${local.prefix}/certscore"
  retention_in_days = 30
  tags              = local.common_tags
}

resource "aws_ecr_repository" "web" {
  name                 = "${local.prefix}-web"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
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
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = concat([aws_ecr_repository.web.arn], var.github_actions_extra_ecr_repository_arns)
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeClusters",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:DescribeTasks",
          "ecs:ListTasks",
          "ecs:RunTask",
          "ecs:UpdateService"
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "*"
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
      environment = concat(local.base_environment, [{ name = "NEXT_PUBLIC_APP_URL", value = local.certscore_base_url }])
      secrets     = local.base_secrets
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

  depends_on = [aws_lb_listener.http, aws_lb_listener.https]

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
