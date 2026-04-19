data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "tls_certificate" "github_actions_oidc" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  prefix                  = var.project_name
  azs                     = length(var.availability_zones) > 0 ? var.availability_zones : slice(data.aws_availability_zones.available.names, 0, 2)
  nat_gateway_count       = min(max(var.nat_gateway_count, 1), length(local.azs))
  public_subnet_cidrs     = [for index, _az in local.azs : cidrsubnet(var.vpc_cidr, 4, index)]
  private_subnet_cidrs    = [for index, _az in local.azs : cidrsubnet(var.vpc_cidr, 4, index + 8)]
  create_certificate      = var.validation_domain_name != "" && var.existing_certificate_arn == "" && var.hosted_zone_id != ""
  certificate_arn         = var.existing_certificate_arn != "" ? var.existing_certificate_arn : local.create_certificate ? aws_acm_certificate.validation[0].arn : null
  validation_ops_base_url = var.validation_domain_name != "" ? "https://${var.validation_domain_name}" : "http://${aws_lb.validation.dns_name}"
  common_tags             = merge(var.tags, { Project = local.prefix, ManagedBy = "terraform", Stack = "validation" })
  validation_redis_url    = "rediss://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.validation.primary_endpoint_address}:${var.redis_port}"
  web_container_environment = concat(
    [
      { name = "APP_FLAVOR", value = "validation_ops" },
      { name = "NEXT_PUBLIC_APP_URL", value = local.validation_ops_base_url },
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "HOSTNAME", value = "0.0.0.0" },
      { name = "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED", value = var.next_public_auth_google_enabled },
      { name = "CERTSCORE_ADMIN_EMAILS", value = var.certscore_admin_emails },
      { name = "S3_BUCKET", value = var.s3_bucket },
      { name = "S3_REGION", value = var.s3_region },
      { name = "WEB_BOT_AUTH_ENABLED", value = var.web_bot_auth_enabled },
      { name = "WEB_BOT_AUTH_EXPIRES_SECONDS", value = var.web_bot_auth_expires_seconds },
      { name = "WEB_BOT_AUTH_INCLUDE_NONCE", value = var.web_bot_auth_include_nonce }
    ],
    var.s3_endpoint != "" ? [{ name = "S3_ENDPOINT", value = var.s3_endpoint }] : [],
    var.s3_force_path_style != "" ? [{ name = "S3_FORCE_PATH_STYLE", value = var.s3_force_path_style }] : [],
    var.web_bot_auth_signature_agent_url != "" ? [{ name = "WEB_BOT_AUTH_SIGNATURE_AGENT_URL", value = var.web_bot_auth_signature_agent_url }] : [],
    var.validation_tranco_source_url != "" ? [{ name = "VALIDATION_TRANCO_SOURCE_URL", value = var.validation_tranco_source_url }] : []
  )
  worker_container_environment = concat(
    [
      { name = "NODE_ENV", value = "production" },
      { name = "S3_BUCKET", value = var.s3_bucket },
      { name = "S3_REGION", value = var.s3_region },
      { name = "VALIDATION_PIPELINE_ENABLED", value = var.validation_pipeline_enabled },
      { name = "VALIDATION_SCHEDULER_POLL_MINUTES", value = var.validation_scheduler_poll_minutes },
      { name = "VALIDATION_DEFAULT_RUN_MODE", value = var.validation_default_run_mode },
      { name = "VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES", value = var.validation_default_sample_interval_minutes },
      { name = "VALIDATION_OPENAI_MODEL", value = var.validation_openai_model },
      { name = "VALIDATION_TRANCO_MIN_RANK", value = tostring(var.validation_tranco_min_rank) },
      { name = "VALIDATION_TRANCO_MAX_RANK", value = tostring(var.validation_tranco_max_rank) },
      { name = "WORKER_CONCURRENCY", value = var.worker_concurrency },
      { name = "LLM_ENRICHMENT_ENABLED", value = var.llm_enrichment_enabled },
      { name = "PLAYWRIGHT_BROWSERS_PATH", value = var.playwright_browsers_path }
    ],
    var.s3_endpoint != "" ? [{ name = "S3_ENDPOINT", value = var.s3_endpoint }] : [],
    var.s3_force_path_style != "" ? [{ name = "S3_FORCE_PATH_STYLE", value = var.s3_force_path_style }] : [],
    var.validation_tranco_source_url != "" ? [{ name = "VALIDATION_TRANCO_SOURCE_URL", value = var.validation_tranco_source_url }] : []
  )
  web_container_secrets = concat(
    [
      { name = "DATABASE_URL", valueFrom = var.database_url_secret_arn },
      { name = "BETTER_AUTH_SECRET", valueFrom = var.better_auth_secret_arn },
      { name = "VALIDATION_REDIS_URL", valueFrom = aws_secretsmanager_secret.validation_redis_url.arn },
      { name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.validation_redis_url.arn },
      { name = "S3_ACCESS_KEY_ID", valueFrom = var.s3_access_key_id_secret_arn },
      { name = "S3_SECRET_ACCESS_KEY", valueFrom = var.s3_secret_access_key_secret_arn }
    ],
    var.google_client_id_secret_arn != "" ? [{ name = "GOOGLE_CLIENT_ID", valueFrom = var.google_client_id_secret_arn }] : [],
    var.google_client_secret_secret_arn != "" ? [{ name = "GOOGLE_CLIENT_SECRET", valueFrom = var.google_client_secret_secret_arn }] : [],
    var.web_bot_auth_private_key_secret_arn != "" ? [{ name = "WEB_BOT_AUTH_PRIVATE_KEY_PEM", valueFrom = var.web_bot_auth_private_key_secret_arn }] : []
  )
  worker_container_secrets = [
    { name = "DATABASE_URL", valueFrom = var.database_url_secret_arn },
    { name = "OPENAI_API_KEY", valueFrom = var.openai_api_key_secret_arn },
    { name = "VALIDATION_REDIS_URL", valueFrom = aws_secretsmanager_secret.validation_redis_url.arn },
    { name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.validation_redis_url.arn },
    { name = "S3_ACCESS_KEY_ID", valueFrom = var.s3_access_key_id_secret_arn },
    { name = "S3_SECRET_ACCESS_KEY", valueFrom = var.s3_secret_access_key_secret_arn }
  ]
  task_secret_arns = compact(concat(
    [
      var.database_url_secret_arn,
      var.better_auth_secret_arn,
      var.openai_api_key_secret_arn,
      var.s3_access_key_id_secret_arn,
      var.s3_secret_access_key_secret_arn,
      aws_secretsmanager_secret.validation_redis_url.arn
    ],
    var.google_client_id_secret_arn != "" ? [var.google_client_id_secret_arn] : [],
    var.google_client_secret_secret_arn != "" ? [var.google_client_secret_secret_arn] : [],
    var.web_bot_auth_private_key_secret_arn != "" ? [var.web_bot_auth_private_key_secret_arn] : []
  ))
}

resource "aws_vpc" "validation" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, { Name = "${local.prefix}-vpc" })
}

resource "aws_internet_gateway" "validation" {
  vpc_id = aws_vpc.validation.id

  tags = merge(local.common_tags, { Name = "${local.prefix}-igw" })
}

resource "aws_subnet" "public" {
  for_each = { for index, az in local.azs : az => { cidr = local.public_subnet_cidrs[index], index = index } }

  vpc_id                  = aws_vpc.validation.id
  cidr_block              = each.value.cidr
  availability_zone       = each.key
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, { Name = "${local.prefix}-public-${each.value.index + 1}" })
}

resource "aws_subnet" "private" {
  for_each = { for index, az in local.azs : az => { cidr = local.private_subnet_cidrs[index], index = index } }

  vpc_id            = aws_vpc.validation.id
  cidr_block        = each.value.cidr
  availability_zone = each.key

  tags = merge(local.common_tags, { Name = "${local.prefix}-private-${each.value.index + 1}" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.validation.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.validation.id
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-public-rt" })
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  count = local.nat_gateway_count

  domain = "vpc"

  tags = merge(local.common_tags, { Name = "${local.prefix}-nat-eip-${count.index + 1}" })
}

resource "aws_nat_gateway" "validation" {
  count = local.nat_gateway_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = values(aws_subnet.public)[count.index].id

  tags = merge(local.common_tags, { Name = "${local.prefix}-nat-${count.index + 1}" })

  depends_on = [aws_internet_gateway.validation]
}

resource "aws_route_table" "private" {
  for_each = aws_subnet.private

  vpc_id = aws_vpc.validation.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.validation[min(index(local.azs, each.key), local.nat_gateway_count - 1)].id
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-private-rt-${index(local.azs, each.key) + 1}" })
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}

resource "aws_security_group" "alb" {
  name        = "${local.prefix}-alb"
  description = "Public ingress for validation ops web"
  vpc_id      = aws_vpc.validation.id

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
  description = "Validation ECS task networking"
  vpc_id      = aws_vpc.validation.id

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

resource "aws_security_group" "redis" {
  name        = "${local.prefix}-redis"
  description = "Validation ElastiCache access"
  vpc_id      = aws_vpc.validation.id

  ingress {
    from_port       = var.redis_port
    to_port         = var.redis_port
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-redis-sg" })
}

resource "aws_lb" "validation" {
  name               = substr(replace("${local.prefix}-alb", "/[^a-zA-Z0-9-]/", "-"), 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [for subnet in values(aws_subnet.public) : subnet.id]

  tags = merge(local.common_tags, { Name = "${local.prefix}-alb" })
}

resource "aws_lb_target_group" "web" {
  name        = substr(replace("${local.prefix}-web", "/[^a-zA-Z0-9-]/", "-"), 0, 32)
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.validation.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-399"
    path                = "/crawler"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-web-tg" })
}

resource "aws_lb_listener" "http_redirect" {
  count = local.certificate_arn != null ? 1 : 0

  load_balancer_arn = aws_lb.validation.arn
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

resource "aws_lb_listener" "http_forward" {
  count = local.certificate_arn == null ? 1 : 0

  load_balancer_arn = aws_lb.validation.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_lb_listener" "https" {
  count = local.certificate_arn != null ? 1 : 0

  load_balancer_arn = aws_lb.validation.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = local.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_route53_record" "validation_alias" {
  count = var.validation_domain_name != "" && var.hosted_zone_id != "" ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.validation_domain_name
  type    = "A"

  alias {
    evaluate_target_health = true
    name                   = aws_lb.validation.dns_name
    zone_id                = aws_lb.validation.zone_id
  }
}

resource "aws_acm_certificate" "validation" {
  count = local.create_certificate ? 1 : 0

  domain_name       = var.validation_domain_name
  validation_method = "DNS"

  tags = merge(local.common_tags, { Name = "${local.prefix}-validation-cert" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "certificate_validation" {
  for_each = local.create_certificate ? {
    for dvo in aws_acm_certificate.validation[0].domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.hosted_zone_id
}

resource "aws_acm_certificate_validation" "validation" {
  count = local.create_certificate ? 1 : 0

  certificate_arn         = aws_acm_certificate.validation[0].arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${local.prefix}/web"
  retention_in_days = 30
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.prefix}/worker"
  retention_in_days = 30
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "scheduler" {
  name              = "/ecs/${local.prefix}/scheduler"
  retention_in_days = 30
  tags              = local.common_tags
}

resource "aws_ecr_repository" "web" {
  name                 = "${local.prefix}-ops-web"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecr_repository" "worker" {
  name                 = "${local.prefix}-worker"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecs_cluster" "validation" {
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
        Resource = local.task_secret_arns
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
        Resource = [
          aws_ecr_repository.web.arn,
          aws_ecr_repository.worker.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeClusters",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:DescribeTasks",
          "ecs:ListTasks",
          "ecs:UpdateService"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "random_password" "redis_auth_token" {
  length           = 32
  special          = true
  override_special = "!&#$^<>-"
}

resource "aws_elasticache_subnet_group" "validation" {
  name       = "${local.prefix}-redis-subnets"
  subnet_ids = [for subnet in values(aws_subnet.private) : subnet.id]

  tags = local.common_tags
}

resource "aws_elasticache_parameter_group" "validation" {
  name        = "${local.prefix}-redis7"
  family      = "redis7"
  description = "Validation queue parameter group"

  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_replication_group" "validation" {
  replication_group_id       = replace(substr(local.prefix, 0, 36), "_", "-")
  description                = "Validation queue for CertScore"
  engine                     = "redis"
  engine_version             = var.redis_engine_version
  node_type                  = var.redis_node_type
  port                       = var.redis_port
  subnet_group_name          = aws_elasticache_subnet_group.validation.name
  security_group_ids         = [aws_security_group.redis.id]
  parameter_group_name       = aws_elasticache_parameter_group.validation.name
  num_cache_clusters         = var.redis_num_cache_clusters
  automatic_failover_enabled = var.redis_num_cache_clusters > 1
  multi_az_enabled           = var.redis_num_cache_clusters > 1
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth_token.result
  apply_immediately          = true

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "validation_redis_url" {
  name_prefix = "${local.prefix}-validation-redis-url-"
  description = "Validation queue rediss URL for ECS services"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "validation_redis_url" {
  secret_id     = aws_secretsmanager_secret.validation_redis_url.id
  secret_string = local.validation_redis_url
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.prefix}-ops-web"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.web_cpu)
  memory                   = tostring(var.web_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "validation-ops-web"
      image     = "${aws_ecr_repository.web.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]
      environment = local.web_container_environment
      secrets     = local.web_container_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.web.name
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

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.prefix}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.worker_cpu)
  memory                   = tostring(var.worker_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name        = "validation-worker"
      image       = "${aws_ecr_repository.worker.repository_url}:${var.image_tag}"
      essential   = true
      command     = ["pnpm", "--filter", "@website-signal-risk-scanner/validation-worker", "start"]
      environment = local.worker_container_environment
      secrets     = local.worker_container_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.worker.name
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

resource "aws_ecs_task_definition" "scheduler" {
  family                   = "${local.prefix}-scheduler"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.scheduler_cpu)
  memory                   = tostring(var.scheduler_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name        = "validation-scheduler"
      image       = "${aws_ecr_repository.worker.repository_url}:${var.image_tag}"
      essential   = true
      command     = ["pnpm", "--filter", "@website-signal-risk-scanner/validation-worker", "start:scheduler"]
      environment = local.worker_container_environment
      secrets     = local.worker_container_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.scheduler.name
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

resource "aws_ecs_service" "web" {
  name                   = "${local.prefix}-ops-web"
  cluster                = aws_ecs_cluster.validation.id
  task_definition        = aws_ecs_task_definition.web.arn
  desired_count          = var.web_desired_count
  launch_type            = "FARGATE"
  enable_execute_command = true

  network_configuration {
    assign_public_ip = false
    security_groups  = [aws_security_group.ecs_tasks.id]
    subnets          = [for subnet in values(aws_subnet.private) : subnet.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "validation-ops-web"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  health_check_grace_period_seconds = 90

  depends_on = [aws_lb_listener.http_redirect, aws_lb_listener.http_forward, aws_lb_listener.https]

  tags = local.common_tags
}

resource "aws_ecs_service" "worker" {
  name                   = "${local.prefix}-worker"
  cluster                = aws_ecs_cluster.validation.id
  task_definition        = aws_ecs_task_definition.worker.arn
  desired_count          = var.worker_desired_count
  launch_type            = "FARGATE"
  enable_execute_command = true

  network_configuration {
    assign_public_ip = false
    security_groups  = [aws_security_group.ecs_tasks.id]
    subnets          = [for subnet in values(aws_subnet.private) : subnet.id]
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = local.common_tags
}

resource "aws_ecs_service" "scheduler" {
  name                   = "${local.prefix}-scheduler"
  cluster                = aws_ecs_cluster.validation.id
  task_definition        = aws_ecs_task_definition.scheduler.arn
  desired_count          = var.scheduler_desired_count
  launch_type            = "FARGATE"
  enable_execute_command = true

  network_configuration {
    assign_public_ip = false
    security_groups  = [aws_security_group.ecs_tasks.id]
    subnets          = [for subnet in values(aws_subnet.private) : subnet.id]
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = local.common_tags
}
