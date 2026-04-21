# AWS Web ECS/Fargate Scaffold

This directory is the infrastructure scaffold for the public web ECS/Fargate cutover path documented in [docs/aws-web-ecs-cutover-plan.md](/Users/benmasek/WC01/docs/aws-web-ecs-cutover-plan.md).

It is intentionally a planning scaffold, not a finished production stack.

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

## Why this is a scaffold and not a finished Terraform stack

The repo now has enough evidence to prefer ECS/Fargate over App Runner, but it still does not have enough checked-in cloud facts to safely create the full public web stack automatically, including:

- the final VPC and subnet reuse decision
- the final ALB and listener layout
- the exact RDS security-group migration sequence
- the full set of Secrets Manager ARNs for the public web hosts
- the final Route53 and ACM ownership plan

Until those are concrete, pretending to have a finished Terraform stack would be noise.

## Existing AWS pattern to copy

The first implementation reference should be the existing validation stack in [infra/aws/validation](/Users/benmasek/WC01/infra/aws/validation), which already proves:

- ECS/Fargate works in the WC01 AWS account
- ECR-backed deploys work
- private-subnet task networking works
- task-definition secrets are the right runtime injection mechanism

The public web stack should reuse that shape where practical instead of inventing a second pattern.

## Inputs the future stack will require

### Global infrastructure inputs

- `aws_region`
- `project_name`
- `github_actions_subjects`
- VPC selection inputs or CIDR for a new VPC
- public subnet ids for ALB ingress
- private subnet ids for ECS tasks
- security-group ids when reusing existing network controls

### Per-host web service inputs

- service name for `certscore.ai`
- service name for `consentcheck.site`
- custom domain name
- Route53 hosted zone id
- existing ACM certificate ARN if not creating certificates in-stack

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
- optional model API keys

## Minimum outputs the finished stack should produce

- ALB or service URL for `certscore.ai`
- ALB or service URL for `consentcheck.site`
- ECS cluster name
- ECS service names for both public hosts
- deploy role ARN for GitHub Actions
- ECR repository URL for the public web image
- security group ids for the ECS web tasks

## Required validation flow after implementation

After the actual infrastructure exists, the operator flow should be:

1. build and push a web image revision
2. update the ECS task definition with runtime config and secrets
3. roll both ECS services
4. run:

```bash
pnpm --filter @website-signal-risk-scanner/web check-env:amplify-runtime
```

The runtime config for both services should also set `BUILD_RUNTIME_TARGET=ecs-fargate` so the version and deployment checks report the correct serving platform.

5. validate the ECS target URLs directly
6. run host-level checks with `pnpm ops:check:live`
7. cut DNS only after the ECS services pass the same gates as the current VM lane

## Related repo documents

- [docs/aws-web-postgres-connectivity-decision.md](/Users/benmasek/WC01/docs/aws-web-postgres-connectivity-decision.md)
- [docs/aws-web-ecs-cutover-plan.md](/Users/benmasek/WC01/docs/aws-web-ecs-cutover-plan.md)
- [docs/aws-web-cutover-checklist.md](/Users/benmasek/WC01/docs/aws-web-cutover-checklist.md)
- [infra/aws/validation/README.md](/Users/benmasek/WC01/infra/aws/validation/README.md)
