# AWS Web ECS/Fargate Scaffold

This directory is the infrastructure entry point for the public web ECS/Fargate cutover path documented in [docs/aws-web-ecs-cutover-plan.md](/Users/benmasek/WC01/docs/aws-web-ecs-cutover-plan.md).

It now contains a deployable baseline stack, but it still needs real account inputs before apply.

## Purpose

The current repo decision is:

- keep public web production on the GCP VM lane
- if the web tier must move to AWS before the SSR workload is redesigned away from direct PostgreSQL access, target ECS/Fargate in `us-west-1`

This directory exists to hold the eventual AWS infrastructure for:

1. `certscore.ai`
2. `consentcheck.site`

using:

- ECS/Fargate services
- ALB ingress
- private PostgreSQL connectivity
- runtime secret injection

## What this stack does

The baseline stack provisions:

- one ALB for the public web surface
- one ECS security group for web tasks
- one ECR repository for the shared `apps/web` image
- one or two ECS services, one per host
- separate task definitions for `certscore.ai` and `consentcheck.site`
- IAM roles for ECS runtime and GitHub Actions deploys

The stack expects you to supply an existing VPC and existing public and private subnets. That matches the fastest practical path in the current account, where the validation ECS VPC already exists and is known-good.

## Existing AWS pattern this stack copies

The first implementation reference is the existing validation stack in [infra/aws/validation](/Users/benmasek/WC01/infra/aws/validation), which already proves:

- ECS/Fargate works in the WC01 AWS account
- ECR-backed deploys work
- private-subnet task networking works
- task-definition secrets are the right runtime injection mechanism

The public web stack reuses that shape where practical instead of inventing a second pattern.

## Known current-account values

The current AWS account already has a usable ECS VPC shape for this stack:

- VPC: `vpc-0d2263b8f7dabdfa4`
- public subnets:
  - `subnet-0fb0456b74ccbe112`
  - `subnet-0d4049ad5b21905b3`
- private subnets:
  - `subnet-036b6ce080d5b7deb`
  - `subnet-0ecacb04207ce9cf8`

Those values are baked into [terraform.tfvars.example](/Users/benmasek/WC01/infra/aws/web-ecs/terraform.tfvars.example) as the default starting point because they match the live validation stack in `us-west-1`.

## Inputs the future stack will require

### Global infrastructure inputs

- `aws_region`
- `project_name`
- `github_actions_subjects`
- VPC selection inputs or CIDR for a new VPC
- public subnet ids for ALB ingress
- private subnet ids for ECS tasks
- optional existing ECS cluster name if reusing a cluster instead of creating a new one
- security-group ids when reusing existing network controls

### Per-host web service inputs

- service name for `certscore.ai`
- service name for `consentcheck.site`
- custom domain name
- existing ACM certificate ARN for the public hosts

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
- optional `PRIVACY_REQUEST_TO_EMAIL`
- optional model API keys

## Minimum outputs the finished stack should produce

- ALB DNS name for the public web surface
- ECS cluster name
- ECS service names for both public hosts
- deploy role ARN for GitHub Actions
- ECR repository URL for the public web image
- security group ids for the ECS web tasks

## Required validation flow after implementation

After the actual infrastructure exists, the operator flow should be:

1. apply this stack with real ACM and secret inputs
2. build and push a web image revision
3. update or force-roll both ECS services
4. run:

```bash
pnpm --filter @website-signal-risk-scanner/web check-env:amplify-runtime
```

The runtime config for both services sets `BUILD_RUNTIME_TARGET=ecs-fargate` so the version and deployment checks report the correct serving platform.

5. validate the ECS target URLs directly
6. run host-level checks with `pnpm ops:check:live`
7. cut DNS only after the ECS services pass the same gates as the current VM lane

## What is still missing before apply

This stack is not enough by itself. The current account still needs:

- an ACM certificate in `us-west-1` for the public hosts
- Secrets Manager entries for the Gmail and likely Google OAuth and contact-routing secrets
- a database security-group rule that allows the ECS task security group instead of the current public-IP allowlist path

## Related repo documents

- [docs/aws-web-postgres-connectivity-decision.md](/Users/benmasek/WC01/docs/aws-web-postgres-connectivity-decision.md)
- [docs/aws-web-ecs-cutover-plan.md](/Users/benmasek/WC01/docs/aws-web-ecs-cutover-plan.md)
- [docs/aws-web-cutover-checklist.md](/Users/benmasek/WC01/docs/aws-web-cutover-checklist.md)
- [infra/aws/validation/README.md](/Users/benmasek/WC01/infra/aws/validation/README.md)
