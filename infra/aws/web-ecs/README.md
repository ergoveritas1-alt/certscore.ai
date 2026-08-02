# AWS Web ECS/Fargate Scaffold

The public application load balancer explicitly uses `append` handling for
`X-Forwarded-For`. The web runtime therefore treats the rightmost valid entry
as the caller observed by the ALB. Keep this setting aligned with
`apps/web/lib/request-source-ip.ts` and its spoofing-chain tests.

This directory is the infrastructure entry point for the public web ECS/Fargate cutover path documented in [docs/aws-web-ecs-cutover-plan.md](/Users/benmasek/WC01/docs/aws-web-ecs-cutover-plan.md).

It now contains a deployable baseline stack, but it still needs real account inputs before apply.

## Terraform state

Production state uses the partial S3 backend declared in `versions.tf`. Copy
`backend.hcl.example` outside the repository, fill in the versioned state
bucket, and initialize with locking enabled:

```bash
terraform init -backend-config=/secure/path/web-ecs.backend.hcl
```

For an existing local state, back it up and run the same command with
`-migrate-state`. Do not run an apply until the remote state contains the
existing production resources. Local state, plan files, and real tfvars are
ignored by the repository.

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
- optional AWS WAF managed common rules and a source-IP rate limit
- optional ALB access logging to a preconfigured S3 log bucket
- one ECS security group for web tasks
- one ECR repository for the shared `apps/web` image
- one autoscaled ECS service for `certscore.ai`
- one isolated single-task ECS service for the process-resident MCP HTTP transport
- separate web and MCP task roles and deployment boundaries
- IAM roles for ECS runtime and GitHub Actions deploys

The stack expects you to supply an existing VPC and existing public and private subnets. The current fastest practical path is to place the public web stack in the same VPC as RDS so database access can be granted by security group instead of public IP allowlists.

The example enables WAF with the AWS common managed rules in count mode and the
source-IP rate rule in blocking mode. Review sampled managed-rule matches before
changing the common rule group to blocking, especially for MCP JSON requests.
ALB access logging remains disabled until `alb_access_logs_bucket` names a bucket
whose policy permits regional Elastic Load Balancing log delivery.

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
- immutable MCP service image tag from the `certscore-web-mcp` ECR repository

The MCP HTTP runtime uses an isolated ECS service and task role. Its transport
keeps active protocol sessions in process memory, so the service intentionally
runs exactly one task and uses stop-before-start deployments. This avoids
cross-task `invalid_session` failures and prevents the public MCP container from
inheriting the web task's Lambda, SQS, and S3 permissions. A future move above
one MCP task requires a stateless or externally coordinated transport contract;
do not raise its desired count while sessions remain process-resident.

The hosted service is built from tracked `apps/mcp` and `packages/certscore-mcp-auth` source by `.github/workflows/mcp-aws-ecs-deploy.yml`. That workflow pushes a Git-SHA image to `certscore-web-mcp`, registers a new MCP-only task-definition revision, verifies OAuth metadata and authenticated `tools/list`, and automatically rolls back to the previous task definition if production verification fails.

Manual rollback keeps the prior task definition and immutable image available:

```bash
aws ecs update-service \
  --region us-west-1 \
  --cluster certscore-web-cluster \
  --service certscore-web-mcp \
  --task-definition <previous-certscore-web-mcp-revision> \
  --force-new-deployment
```

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
- optional S3 credentials only for non-AWS S3-compatible development storage;
  AWS ECS uses the scoped task role and SDK credential provider chain
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
