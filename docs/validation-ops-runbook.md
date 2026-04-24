# Validation Ops Runbook

This runbook covers the validation runtime lane only. It is not the primary `certscore.ai` production web path.

Preferred production target:

- AWS ECS/Fargate for the validation ops web surface, validation worker, and validation scheduler
- AWS ECS/Fargate remains the primary public web host for `certscore.ai`

The active validation path is the AWS stack under [infra/aws/validation](/Users/benmasek/WC01/infra/aws/validation) with rollout steps in [docs/validation-aws-cutover-runbook.md](/Users/benmasek/WC01/docs/validation-aws-cutover-runbook.md).

- primary product web production stays on the ECS/Fargate public web lane with root `apps/web`
- validation uses a separate AWS validation ops surface with `APP_FLAVOR=validation_ops`
- validation worker and scheduler run outside the primary web deployment lane
- shared PostgreSQL database initially

## 1. Prerequisites

- apply migration [0045_validation_pipeline.sql](/Users/benmasek/WC01/packages/db/migrations/0045_validation_pipeline.sql)
- create the validation domain and keep it separate from the primary `certscore.ai` production host
- prepare AWS validation infrastructure, task definitions, and Secrets Manager bindings
- set the validation crawler contact/identity copy you want exposed on the public root page

## 2. Validation Surface Deploy

Deploy the same `apps/web` app to the dedicated AWS validation ops surface, with:

- `APP_FLAVOR=validation_ops`
- `NEXT_PUBLIC_APP_URL=https://<validation-domain>`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- provider credentials as needed for Better Auth
- `CERTSCORE_ADMIN_EMAILS`
- optional `WEB_BOT_AUTH_PRIVATE_KEY_PEM`
- optional `WEB_BOT_AUTH_SIGNATURE_AGENT_URL`
- optional `WEB_BOT_AUTH_EXPIRES_SECONDS`
- optional `WEB_BOT_AUTH_INCLUDE_NONCE`
- optional `WEB_BOT_AUTH_ENABLED=1`

Recommended checks before deploy:

- `pnpm check-env:validation`
- `pnpm --filter @website-signal-risk-scanner/web typecheck`

After deploy:

- `/` should show the crawler identity page
- `/crawler` should show the public crawler identity and Verified Bot details
- `/.well-known/http-message-signatures-directory` should return a signed JWKS response when key material is configured
- `/app` should require login and platform-admin access

## 3. Validation Worker Image

Build and publish the validation worker image:

```bash
pnpm --filter @website-signal-risk-scanner/validation-worker typecheck
pnpm test:scan-pipeline
git push origin main
```

The active deploy path publishes the validation worker image through the AWS validation deployment workflow.

## 4. Validation Worker ECS Services

Configure the worker and scheduler ECS task definitions with:

- `DATABASE_URL`
- `DATABASE_SSL_MODE` when your Postgres provider requires non-default SSL behavior
- `OPENAI_API_KEY`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- optional `S3_ENDPOINT`
- optional `S3_FORCE_PATH_STYLE`
- `VALIDATION_PIPELINE_ENABLED=1`
- `VALIDATION_SCHEDULER_POLL_MINUTES=1`
- `VALIDATION_DEFAULT_RUN_MODE=manual`
- `VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES=20`
- `VALIDATION_OPENAI_MODEL=gpt-5.4`
- `VALIDATION_TRANCO_MIN_RANK=1000`
- `VALIDATION_TRANCO_MAX_RANK=100000`
- optional `VALIDATION_TRANCO_SOURCE_URL`
- optional `VALIDATION_CRAWLER_PUBLIC_URL`
- optional `WEB_BOT_AUTH_ENABLED=1`
- optional `WEB_BOT_AUTH_PRIVATE_KEY_PEM`
- optional `WEB_BOT_AUTH_SIGNATURE_AGENT_URL=https://consentcheck.site/.well-known/http-message-signatures-directory`
- optional `WEB_BOT_AUTH_EXPIRES_SECONDS=300`
- optional `WEB_BOT_AUTH_INCLUDE_NONCE=0`
- optional `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`

Run the worker and scheduler as separate ECS services that start:

```bash
pnpm --filter @website-signal-risk-scanner/validation-worker start
pnpm --filter @website-signal-risk-scanner/validation-worker start:scheduler
```

Before trusting any validation deployment change, run:

- `pnpm ops:check:deploy`
- `pnpm check-env:validation-cutover`

## 5. Validation Runtime Checks

Run these before trusting the deployment:

- `pnpm check-env:validation`
- `pnpm check-env:validation-cutover`
- `pnpm check-runtime:validation`

Expected results:

- validation worker env is complete
- validation tables are reachable in PostgreSQL
- Playwright Chromium launches

Main-app production note:

- the primary web app should use `VALIDATION_OPS_BASE_URL` to link admins to the dedicated validation host
- the primary web app should use host-based routing to the dedicated validation surface instead of local validation controls

## 6. First-Run Validation

1. Open the validation domain root page and confirm the public crawler identity page renders.
2. Log in with a platform-admin account.
3. Confirm `/app` shows:
   - mode selector
   - interval selector
   - pipeline pause/resume control
   - target inventory
4. Add a manual target such as `example.com`.
5. Start a manual run.
6. Confirm:
   - a `validation_runs` row is created
   - the validation worker consumes `validation.collect`
   - the scan completes
   - the rank and verdict jobs run
   - the run detail page shows automated findings, GPT analysis, and agreement scores
7. Open `/app/issues` and confirm rule analytics are populated.

## 7. Automatic Mode Validation

1. Switch mode to `automatic`.
2. Leave interval at `20 minutes` or choose another preset.
3. Confirm the setting persists after refreshing the page.
4. Confirm the scheduler writes a new run only when due.
5. Confirm switching back to `manual` stops new automatic claims but still allows manual starts.

## 8. Circuit Breaker Validation

Test both pause paths:

- env hard stop:
  - set `VALIDATION_PIPELINE_ENABLED=0`
  - restart worker/scheduler
  - confirm no new runs start
- UI admin pause:
  - uncheck pipeline enabled in the UI and save
  - confirm manual start is blocked
  - confirm scheduler does not claim new targets

Check `validation_audit_events` after each change.
