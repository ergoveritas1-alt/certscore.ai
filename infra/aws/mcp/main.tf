data "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  prefix           = var.project_name
  enable_serving   = var.enable_dedicated_serving_layer
  create_cluster   = trimspace(var.existing_ecs_cluster_name) == ""
  ecs_cluster_name = local.create_cluster ? aws_ecs_cluster.mcp[0].name : var.existing_ecs_cluster_name
  common_tags      = merge(var.tags, { Project = local.prefix, ManagedBy = "terraform", Stack = "mcp-ecs" })
  mcp_public_url   = "https://${var.mcp_domain_name}"
  mcp_secret_arns  = compact([var.jwt_signing_secret_arn])
  mcp_environment = [
    { name = "BUILD_RUNTIME_TARGET", value = "ecs-fargate" },
    { name = "CERTSCORE_BASE_URL", value = var.certscore_base_url },
    { name = "CERTSCORE_REQUEST_TIMEOUT_MS", value = tostring(var.certscore_request_timeout_ms) },
    { name = "CORS_ALLOWED_ORIGINS", value = var.cors_allowed_origins },
    { name = "MCP_PUBLIC_URL", value = local.mcp_public_url },
    { name = "NODE_ENV", value = "production" },
    { name = "OAUTH_ISSUER", value = var.oauth_issuer },
    { name = "PORT", value = "3004" },
    { name = "SESSION_MAX_COUNT", value = tostring(var.session_max_count) },
    { name = "SESSION_TTL_SECONDS", value = tostring(var.session_ttl_seconds) }
  ]
  mcp_secrets = [
    { name = "CERTSCORE_OAUTH_JWT_SECRET", valueFrom = var.jwt_signing_secret_arn }
  ]
}

resource "aws_security_group" "alb" {
  count = local.enable_serving ? 1 : 0

  name        = "${local.prefix}-alb"
  description = "Public ingress for CertScore MCP"
  vpc_id      = var.existing_vpc_id

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
  count = local.enable_serving ? 1 : 0

  name        = "${local.prefix}-ecs"
  description = "MCP ECS task networking"
  vpc_id      = var.existing_vpc_id

  ingress {
    from_port       = 3004
    to_port         = 3004
    protocol        = "tcp"
    security_groups = [aws_security_group.alb[0].id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-ecs-sg" })
}

resource "aws_lb" "mcp" {
  count = local.enable_serving ? 1 : 0

  name               = substr(replace("${local.prefix}-alb", "/[^a-zA-Z0-9-]/", "-"), 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb[0].id]
  subnets            = var.public_subnet_ids
  idle_timeout       = 600

  tags = merge(local.common_tags, { Name = "${local.prefix}-alb" })
}

resource "aws_lb_target_group" "mcp" {
  count = local.enable_serving ? 1 : 0

  name        = substr(replace("${local.prefix}-tg", "/[^a-zA-Z0-9-]/", "-"), 0, 32)
  port        = 3004
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.existing_vpc_id

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

  tags = merge(local.common_tags, { Name = "${local.prefix}-tg" })
}

resource "aws_lb_listener" "http" {
  count = local.enable_serving ? 1 : 0

  load_balancer_arn = aws_lb.mcp[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  count = local.enable_serving ? 1 : 0

  load_balancer_arn = aws_lb.mcp[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.existing_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mcp[0].arn
  }
}

resource "aws_cloudwatch_log_group" "mcp" {
  name              = "/ecs/${local.prefix}/mcp"
  retention_in_days = 30
  tags              = local.common_tags
}

resource "aws_ecr_repository" "mcp" {
  name                 = local.prefix
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
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

resource "aws_ecs_cluster" "mcp" {
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
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
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
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = local.mcp_secret_arns
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
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "task_exec" {
  name = "${local.prefix}-ecs-exec"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel"
      ]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role" "github_actions_deploy" {
  name = "${local.prefix}-github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = data.aws_iam_openid_connect_provider.github_actions.arn
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
    }]
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
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = aws_ecr_repository.mcp.arn
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
          "ecs:UpdateService"
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.execution.arn, aws_iam_role.task.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:DescribeTargetHealth",
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

resource "aws_ecs_task_definition" "mcp" {
  family                   = local.prefix
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.mcp_cpu)
  memory                   = tostring(var.mcp_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "mcp-http"
      image     = "${aws_ecr_repository.mcp.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [{
        containerPort = 3004
        hostPort      = 3004
        protocol      = "tcp"
      }]
      environment = local.mcp_environment
      secrets     = local.mcp_secrets
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3004/healthz').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))\""]
        interval    = 30
        retries     = 3
        startPeriod = 20
        timeout     = 5
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

resource "aws_ecs_service" "mcp" {
  count = local.enable_serving ? 1 : 0

  name                   = local.prefix
  cluster                = local.ecs_cluster_name
  task_definition        = aws_ecs_task_definition.mcp.arn
  desired_count          = var.mcp_desired_count
  launch_type            = "FARGATE"
  enable_execute_command = true

  network_configuration {
    assign_public_ip = var.assign_public_ip
    security_groups  = [aws_security_group.ecs_tasks[0].id]
    subnets          = var.private_subnet_ids
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.mcp[0].arn
    container_name   = "mcp-http"
    container_port   = 3004
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  health_check_grace_period_seconds = 60

  depends_on = [aws_lb_listener.http, aws_lb_listener.https]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "mcp_no_healthy_targets" {
  count = local.enable_serving ? 1 : 0

  alarm_name          = "${local.prefix}-no-healthy-targets"
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
    LoadBalancer = aws_lb.mcp[0].arn_suffix
    TargetGroup  = aws_lb_target_group.mcp[0].arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "mcp_unhealthy_targets" {
  count = local.enable_serving ? 1 : 0

  alarm_name          = "${local.prefix}-unhealthy-targets"
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
    LoadBalancer = aws_lb.mcp[0].arn_suffix
    TargetGroup  = aws_lb_target_group.mcp[0].arn_suffix
  }

  tags = local.common_tags
}
