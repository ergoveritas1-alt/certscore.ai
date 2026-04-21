# AWS Web ECS/Fargate Cutover Plan

This runbook is the concrete AWS cutover path for the public web tier in the current WC01 account and region.

It follows the accepted decision in [docs/aws-web-postgres-connectivity-decision.md](/Users/benmasek/WC01/docs/aws-web-postgres-connectivity-decision.md).

The repo scaffold for this path lives in [infra/aws/web-ecs/README.md](/Users/benmasek/WC01/infra/aws/web-ecs/README.md).

## Target shape

Use ECS/Fargate for the web-serving runtime and keep PostgreSQL on private AWS network paths.

Recommended target:

1. one ECS/Fargate service for `certscore.ai`
2. one ECS/Fargate service for `consentcheck.site`
3. one shared ALB or equivalent edge layer with separate host routing
4. private subnets for the ECS tasks
5. security-group based database access from the ECS tasks to RDS
6. runtime secrets injected through AWS Secrets Manager, not baked into build artifacts

## Why ECS/Fargate is the current-region candidate

The WC01 AWS account already has a working ECS/Fargate validation stack in `us-west-1`, including:

- an ECS cluster
- private-subnet task networking
- ECR repositories
- ALB ingress
- task-definition secret injection

That makes ECS/Fargate the fastest production-credible path for the public web stack in the same account and region.

App Runner is not the primary path here because the existing WC01 resources are in `us-west-1`, and App Runner is not available there.

## Required runtime inputs

Per public host, provide:

- `BUILD_RUNTIME_TARGET=ecs-fargate`
- `NEXT_PUBLIC_APP_URL`
- `APP_FLAVOR=certscore`
- `DATABASE_URL`
- `DATABASE_READ_URL` when used
- `DATABASE_SSL_MODE`
- `BETTER_AUTH_SECRET`
- `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT` when required
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE` when required
- `GMAIL_SMTP_USER`
- `GMAIL_SMTP_APP_PASSWORD`
- `FEEDBACK_TO_EMAIL`
- `PRIVACY_REQUEST_TO_EMAIL`
- `CERTSCORE_ADMIN_EMAILS`

Optional per feature:

- `OPENAI_API_KEY`
- `VALIDATION_NANO_MODEL`
- `GOOGLE_CUSTOM_SEARCH_API_KEY`
- `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`

## Networking plan

### VPC

Prefer a dedicated or clearly isolated application VPC with:

- at least two Availability Zones
- private subnets for ECS tasks
- public subnets only for ALB ingress
- NAT only if the runtime actually needs outbound internet access

The current validation stack already demonstrates this pattern and should be the first reference point for the public web stack.

### PostgreSQL

Move database ingress from public IP allowlists to security-group based access.

Target shape:

- RDS remains reachable on private AWS paths
- the ECS web task security group is allowed to connect to PostgreSQL on `5432`
- public IPv4 database ingress is removed for the web-serving lane once ECS is live

Avoid treating the current public-IP allowlist posture as the finished AWS design.

### Outbound internet

Make external dependencies explicit before cutover:

- Gmail SMTP
- Google OAuth and Google APIs
- any external S3-compatible endpoint if not using native AWS S3

If those remain required, size NAT and route policy accordingly.

## Deployment model

Each public host should have its own ECS service because:

- `NEXT_PUBLIC_APP_URL` is host-specific
- auth callback and trusted-origin behavior is host-specific
- rollout and rollback should stay independent

Recommended naming:

1. `certscore-ai-web`
2. `consentcheck-site-web`

## Build and image strategy

Use one container image built from `apps/web`, then run separate ECS services with host-specific runtime env.

Required image characteristics:

- `HOSTNAME=0.0.0.0`
- `PORT` bound to the container listener port
- runtime env and secrets passed in the ECS task definition

Recommended artifact flow:

1. build the web image from Git
2. push to ECR
3. register a new task definition revision
4. roll each ECS service to that revision

## Secret strategy

Use Secrets Manager-backed task definition secrets for:

- database URLs
- Better Auth secret
- Google OAuth secrets
- S3 credentials
- Gmail credentials
- model API keys

Before any cutover, validate the runtime env contract with:

```bash
pnpm --filter @website-signal-risk-scanner/web check-env:amplify-runtime
```

The script name is Amplify-oriented because it validates the merged runtime env contract already used in the repo, but the same contract must hold for ECS runtime env.

## Health gates before DNS cutover

For each ECS-backed host, verify:

1. the ALB or service URL loads
2. `/api/version` returns the intended git sha
3. `/api/version` reports the correct external `appUrl`
4. login works
5. Google auth works if enabled
6. `/api/full-scan` returns `202`
7. authenticated dashboard routes load
8. report pages load
9. artifact-backed downloads work

Then run host-level checks against the ECS target URLs:

```bash
LIVE_BASE_URL=<certscore-target-url> \
SECONDARY_BASE_URL=<consentcheck-target-url> \
EXPECTED_LIVE_RUNTIME_TARGET=ecs-fargate \
EXPECTED_SECONDARY_RUNTIME_TARGET=ecs-fargate \
pnpm ops:check:live
```

Set `BUILD_RUNTIME_TARGET=ecs-fargate` on both ECS services so `/api/version` and the deployment checks report the correct serving platform.

## DNS cutover sequence

1. provision or reuse the ECS cluster, private subnets, ALB, and security groups
2. wire database access through security groups, not public IP allowlists
3. create the missing public-web runtime secrets in Secrets Manager
4. deploy the image revision to both ECS services
5. validate the ALB or target URLs directly
6. run runtime env validation
7. treat both services as production-ready only after they pass the same host and revision gates as the public domains
8. re-run host checks against `certscore.ai` and `consentcheck.site`

## Rollback

If any gate fails:

- keep the current public ECS deployment serving traffic, or
- if a bad rollout already reached production, move traffic back to the last healthy ECS revision immediately
- keep the ECS services as rehearsal targets until the failure is fixed

Use ECS service rollback or task definition promotion as the current web rollback path.

## Operator checklist

1. provision the public web ECS/Fargate stack in `us-west-1`
2. attach private database access through security groups
3. create and inject the missing web secrets
4. deploy both web services
5. run env validation
6. run host validation
7. cut DNS
8. verify again on public hosts

## Non-goals

This runbook does not claim:

- that the public web ECS stack is already provisioned
- that DB ingress has already been migrated off public IP allowlists
- that `certscore.ai` or `consentcheck.site` are already serving from AWS

Those remain the next implementation steps.
