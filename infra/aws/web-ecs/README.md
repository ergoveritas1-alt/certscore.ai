# AWS Web ECS/Fargate Scaffold

This directory is the infrastructure entry point for the public web ECS/Fargate cutover path documented in [docs/aws-web-ecs-cutover-plan.md](/Users/benmasek/WC01/docs/aws-web-ecs-cutover-plan.md).

It now contains a deployable baseline stack, but it still needs real account inputs before apply.

## Purpose

The current repo decision is:

- keep public web production on AWS ECS/Fargate
- use this stack as the checked-in infrastructure path for `certscore.ai` in `us-west-1`
- do not provision, claim, or deploy `consentcheck.site` from WC01

This directory exists to hold the AWS infrastructure for `certscore.ai` using:

- an ECS/Fargate service
- ALB ingress
- private PostgreSQL connectivity
- runtime secret injection

## What this stack does

The baseline stack provisions:

- one ALB for the public web surface
- one ECS security group for web tasks
- one ECR repository for the shared `apps/web` image
- one ECS service for `certscore.ai` and `mcp.certscore.ai`
- one task definition containing the web container and lightweight MCP HTTP sidecar
- IAM roles for ECS runtime and GitHub Actions deploys

The stack expects you to supply an existing VPC and existing public and private subnets. The current fastest practical path is to place the public web stack in the same VPC as RDS so database access can be granted by security group instead of public IP allowlists.

## Existing AWS pattern this stack copies

The first implementation reference is the existing validation stack in [infra/aws/validation](/Users/benmasek/WC01/infra/aws/validation), which already proves:

- ECS/Fargate works in the WC01 AWS account
- ECR-backed deploys work
- private-subnet task networking works
- task-definition secrets are the right runtime injection mechanism

The public web stack reuses that shape where practical instead of inventing a second pattern.

## Known current-account values

The current AWS account has two relevant VPCs:

- validation ECS VPC:
  - `vpc-0d2263b8f7dabdfa4`
  - this is where the validation stack runs today
  - it does not have a route to the RDS/default VPC
- RDS/default VPC:
  - `vpc-0f249d7ab389f8d1f`
  - subnets:
    - `subnet-053d0eaa45152d300`
    - `subnet-000adac289b27c3ac`
  - DB security group:
    - `sg-0f2219d488cc6c482`

There is no VPC peering or transit gateway between those VPCs. Because of that, the validation VPC is the wrong place for the public web stack if the app still needs direct PostgreSQL access.

The default example now targets the RDS/default VPC because that is the fastest route to a working AWS cutover in the current account.

## Inputs the future stack will require

### Global infrastructure inputs

- `aws_region`
- `project_name`
- `github_actions_subjects`
- optional `github_actions_extra_ecr_repository_arns` when the shared GitHub deploy role also needs to build validation or scanner images
- VPC selection inputs or CIDR for a new VPC
- public subnet ids for ALB ingress
- private subnet ids for ECS tasks
- optional existing ECS cluster name if reusing a cluster instead of creating a new one
- optional `assign_public_ip` for transitional deployments in public/default subnets
- security-group ids when reusing existing network controls
- database security group id for SG-based PostgreSQL access

### Web service inputs

- service name for `certscore.ai`
- custom domain name
- existing ACM certificate ARN for the public host
- immutable MCP sidecar image tag from the `certscore-web-mcp` ECR repository

The MCP HTTP runtime shares the CertScore web task ENI and Fargate allocation. The ALB keeps separate target groups for ports 3000 and 3004, so the web and MCP health checks and host routing remain independent without a second ECS task or public IPv4 address.

### Runtime config inputs

- `BUILD_RUNTIME_TARGET=ecs-fargate`
- `NEXT_PUBLIC_APP_URL`
- `APP_FLAVOR`
- `DATABASE_SSL_MODE`
- optional `DATABASE_READ_URL`
- auth toggles
- admin allowlist
- S3 bucket and region settings

### Secret inputs

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- optional Google OAuth secrets
- S3 credentials
- Gmail credentials
- `FEEDBACK_TO_EMAIL`
- optional `BILLING_ALERT_TO_EMAIL`
- optional `PRIVACY_REQUEST_TO_EMAIL`
- optional model API keys

## Minimum outputs the finished stack should produce

- ALB DNS name for the public web surface
- ECS cluster name
- ECS service name for `certscore.ai`
- deploy role ARN for GitHub Actions
- ECR repository URL for the public web image
- security group ids for the ECS web tasks

## Required validation flow after implementation

After the actual infrastructure exists, the operator flow should be:

1. apply this stack with real ACM and secret inputs
2. build and push a web image revision
3. update or force-roll the CertScore ECS service
4. run:

```bash
pnpm --filter @website-signal-risk-scanner/web check-env:amplify-runtime
```

The runtime config sets `BUILD_RUNTIME_TARGET=ecs-fargate` so the version and deployment checks report the correct serving platform.

5. validate the ECS target URLs directly
6. run host-level checks with `pnpm ops:check:live`
7. treat the ECS services as the production lane only after they pass the same host and revision gates as the public domains

## What is still missing before apply

This stack is not enough by itself. The current account still needs:

- a decision on whether to keep the initial ECS tasks in default/public DB-VPC subnets with `assign_public_ip = true` or first build dedicated private app subnets plus NAT
- Terraform execution from a shell that has `terraform` installed

## Related repo documents

- [docs/aws-web-postgres-connectivity-decision.md](/Users/benmasek/WC01/docs/aws-web-postgres-connectivity-decision.md)
- [docs/aws-web-ecs-cutover-plan.md](/Users/benmasek/WC01/docs/aws-web-ecs-cutover-plan.md)
- [docs/aws-web-cutover-checklist.md](/Users/benmasek/WC01/docs/aws-web-cutover-checklist.md)
- [infra/aws/validation/README.md](/Users/benmasek/WC01/infra/aws/validation/README.md)
