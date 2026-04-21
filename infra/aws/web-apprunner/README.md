# AWS Web App Runner Scaffold

This directory is the infrastructure scaffold for the public web cutover path documented in [docs/aws-web-apprunner-cutover-plan.md](/Users/benmasek/WC01/docs/aws-web-apprunner-cutover-plan.md).

It is intentionally a planning scaffold, not a finished production stack.

## Purpose

The current repo decision is:

- keep public web production on the GCP VM lane
- if the web tier must move to AWS before the SSR workload is redesigned away from direct PostgreSQL access, target a web-serving runtime with explicit VPC egress

This directory exists to hold the eventual AWS infrastructure for:

1. `certscore.ai`
2. `consentcheck.site`

using:

- App Runner services
- VPC egress
- private PostgreSQL connectivity
- runtime secret injection

## Why this is a scaffold and not a finished Terraform stack

The repo does not currently have enough checked-in cloud facts to safely create a production-ready web stack automatically, including:

- the exact PostgreSQL host target and ownership model
- the exact AWS account and VPC topology for the web tier
- the custom-domain and certificate ownership plan
- the final secret ARNs and rotation policy
- the desired container build-and-publish workflow for the public web image

Until those are concrete, pretending to have a finished Terraform stack would be noise.

## Inputs the future stack will require

### Global infrastructure inputs

- `aws_region`
- `project_name`
- `github_actions_subjects`
- `vpc_cidr`
- `availability_zones`
- `private_subnet_ids` if reusing an existing VPC instead of creating one
- `security_group_ids` if reusing existing network controls

### Per-host web service inputs

- service name for `certscore.ai`
- service name for `consentcheck.site`
- custom domain name
- Route53 hosted zone id
- existing ACM certificate ARN if not creating certificates in-stack

### Runtime config inputs

- `NEXT_PUBLIC_APP_URL`
- `APP_FLAVOR`
- `DATABASE_SSL_MODE`
- optional `DATABASE_READ_URL`
- auth toggles
- admin allowlist
- S3 bucket/region/endpoint flags

### Secret inputs

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- optional Google OAuth secrets
- S3 credentials
- Gmail credentials
- optional model API keys

## Minimum outputs the finished stack should produce

- App Runner service URL for `certscore.ai`
- App Runner service URL for `consentcheck.site`
- VPC connector identifier
- custom-domain validation status or domain association details
- deploy role ARN for GitHub Actions
- ECR repository URL for the public web image if the stack owns that repository

## Required validation flow after implementation

After the actual infrastructure exists, the operator flow should be:

1. deploy a web image revision
2. inject runtime configuration and secrets
3. run:

```bash
pnpm --filter @website-signal-risk-scanner/web check-env:amplify-runtime
```

4. validate the App Runner service URLs directly
5. run host-level checks with `pnpm ops:check:live`
6. cut DNS only after the App Runner services pass the same gates as the current VM lane

## Related repo documents

- [docs/aws-web-postgres-connectivity-decision.md](/Users/benmasek/WC01/docs/aws-web-postgres-connectivity-decision.md)
- [docs/aws-web-apprunner-cutover-plan.md](/Users/benmasek/WC01/docs/aws-web-apprunner-cutover-plan.md)
- [docs/aws-web-cutover-checklist.md](/Users/benmasek/WC01/docs/aws-web-cutover-checklist.md)
