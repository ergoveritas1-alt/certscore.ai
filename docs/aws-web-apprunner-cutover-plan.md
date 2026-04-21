# AWS Web App Runner Cutover Plan

This runbook is the concrete execution path if the team wants the public web tier in AWS before the app is redesigned to remove direct PostgreSQL dependency from critical SSR flows.

It follows the accepted decision in [docs/aws-web-postgres-connectivity-decision.md](/Users/benmasek/WC01/docs/aws-web-postgres-connectivity-decision.md).

The repo scaffold for this path lives in [infra/aws/web-apprunner/README.md](/Users/benmasek/WC01/infra/aws/web-apprunner/README.md).

## Target shape

Use an AWS web-serving runtime with explicit VPC egress and keep PostgreSQL private.

Recommended target:

1. one App Runner service for `certscore.ai`
2. one App Runner service for `consentcheck.site`
3. one VPC connector spanning at least two private subnets
4. private PostgreSQL reachable from those subnets
5. secrets injected through AWS Secrets Manager or SSM-backed runtime configuration, not checked-in build artifacts

## Why App Runner is the candidate

App Runner explicitly documents VPC egress support through a VPC connector.

Source:

- [AWS App Runner VPC egress](https://docs.aws.amazon.com/apprunner/latest/dg/network-vpc.html)

That makes it a better fit than Amplify Hosting for the current `apps/web` runtime, which still depends on direct PostgreSQL access for critical SSR routes.

## Required runtime inputs

Per web service, provide:

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

Use a VPC with:

- at least two Availability Zones
- private subnets for App Runner egress attachment
- route table path that permits outbound access only as needed

### PostgreSQL

Prefer:

- private RDS or an equivalent private PostgreSQL endpoint in AWS
- security-group rules that only allow connections from the App Runner VPC connector path or other explicitly approved application security groups

Avoid:

- broad public database ingress for web SSR

### Outbound internet

If the web app needs outbound internet for Gmail SMTP, S3-compatible external providers, or Google APIs, make that explicit in the subnet routing and egress policy.

Do not assume “private DB access” means “no other outbound dependency exists.”

## Deployment model

Each public host should have its own App Runner service because:

- `NEXT_PUBLIC_APP_URL` must be host-specific
- auth callback/trusted-origin behavior is host-specific
- independent rollout and rollback is cleaner

Recommended naming:

1. `certscore-ai-web`
2. `consentcheck-site-web`

## Build and image strategy

Use one container image built from `apps/web`, then deploy separate services with host-specific runtime env.

Required image characteristics:

- `HOSTNAME=0.0.0.0`
- `PORT` bound to the App Runner container port
- runtime env passed at service deploy time

## Secret strategy

Use runtime secret injection, not build-time embedding, for:

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

The script name is Amplify-oriented because it validates the merged runtime env contract already used in the repo, but the same contract is what the App Runner service must satisfy.

## Health gates before DNS cutover

For each App Runner service, verify:

1. the service URL loads
2. `/api/version` returns the intended git sha
3. `/api/version` reports the correct external `appUrl`
4. login works
5. Google auth works if enabled
6. `/api/full-scan` returns `202`
7. authenticated dashboard routes load
8. report pages load
9. artifact-backed downloads work

Then run host-level checks against the App Runner service URLs:

```bash
LIVE_BASE_URL=<certscore-service-url> \
SECONDARY_BASE_URL=<consentcheck-service-url> \
EXPECTED_LIVE_RUNTIME_TARGET=unknown \
EXPECTED_SECONDARY_RUNTIME_TARGET=unknown \
pnpm ops:check:live
```

If `/api/version` is extended later to recognize the chosen AWS runtime explicitly, update the expected runtime target at that time.

## DNS cutover sequence

1. deploy the image revision to both App Runner services
2. validate the service URLs directly
3. validate runtime env with the checker above
4. point custom domains at the App Runner services
5. re-run host checks against `certscore.ai` and `consentcheck.site`
6. keep the GCP VM lane ready until rollback confidence is established

## Rollback

If any gate fails:

- leave DNS on the current GCP VM host, or
- if already cut, move DNS back immediately
- keep the App Runner services as rehearsal targets only

Use [docs/deploy-gcp-vm.md](/Users/benmasek/WC01/docs/deploy-gcp-vm.md) as the current web rollback path.

## Operator checklist

1. provision private PostgreSQL access in AWS
2. provision App Runner VPC egress
3. provision runtime secrets
4. deploy both web services
5. run env validation
6. run host validation
7. cut DNS
8. verify again on public hosts

## Non-goals

This runbook does not claim:

- that App Runner is already provisioned
- that the current repo has an AWS web Terraform stack
- that public web has already moved to AWS

Those remain future implementation work.
