# Validation Ops Runbook

This runbook covers the validation runtime lane only. It is not the primary `certscore.ai` production web path.

Preferred production target:

- AWS ECS/Fargate for the validation ops web surface, validation worker, and validation scheduler
- AWS ElastiCache for the validation BullMQ lane
- Vercel remains the primary `certscore.ai` public web host

Legacy paths in this document remain useful for debugging and rollback, but the active replacement plan is the AWS stack under [infra/aws/validation](/Users/benmasek/WC01/infra/aws/validation) with cutover steps in [docs/validation-aws-cutover-runbook.md](/Users/benmasek/WC01/docs/validation-aws-cutover-runbook.md).

- primary product web production stays on the Vercel `consentcheck-site` project with root `apps/web`
- validation can use a separate Vercel surface with `APP_FLAVOR=validation_ops`
- validation worker and scheduler run outside the primary web deployment lane
- separate Redis for validation queues
- shared PostgreSQL database initially

## 1. Prerequisites

- apply migration [0045_validation_pipeline.sql](/Users/benmasek/WC01/packages/db/migrations/0045_validation_pipeline.sql)
- provision a separate Redis instance for validation
- create the validation domain and keep it separate from the primary `certscore.ai` production host
- prepare a VM with Docker or Node 20 + pnpm
- set the validation crawler contact/identity copy you want exposed on the public root page

## 2. Validation Surface Deploy

Deploy the same `apps/web` app to a separate Vercel project or environment intended for validation operations, with:

- `APP_FLAVOR=validation_ops`
- `NEXT_PUBLIC_APP_URL=https://<validation-domain>`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- provider credentials as needed for Better Auth
- `VALIDATION_REDIS_URL`
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
set -a
source apps/web/.env.local
set +a
PROJECT_ID=<project-id> REGION=us-central1 ./deploy-validation.sh
```

This builds the validation-worker Dockerfile and pushes an image intended for the validation VM.

## 4. Validation Worker VM

Create an env file on the VM such as `/etc/validation-worker.env` with:

- `DATABASE_URL`
- `DATABASE_SSL_MODE` when your Postgres provider requires non-default SSL behavior
- `OPENAI_API_KEY`
- `VALIDATION_REDIS_URL`
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

If using Docker:

```bash
docker pull <image-uri>

  docker run -d \
  --name validation-worker \
  --restart unless-stopped \
  --env-file /etc/validation-worker.env \
  <image-uri> \
  pnpm --filter @website-signal-risk-scanner/validation-worker start

docker run -d \
  --name validation-scheduler \
  --restart unless-stopped \
  --env-file /etc/validation-worker.env \
  <image-uri> \
  pnpm --filter @website-signal-risk-scanner/validation-worker start:scheduler
```

If running directly on the VM:

```bash
pnpm --filter @website-signal-risk-scanner/validation-worker start
pnpm --filter @website-signal-risk-scanner/validation-worker start:scheduler
```

For the Cloud Run worker-pool path, prefer `deploy-validation-worker.sh` over hand-built commands. Keep the revision environment aligned to the portable storage and database contract so a fresh rollout does not inherit stale bindings.

Before trusting any validation deployment change, run:

- `pnpm ops:check:deploy`
- `bash ./deploy-validation-worker.sh` only from an authenticated GCloud shell with the intended project selected

## 5. Validation Runtime Checks

Run these before trusting the deployment:

- `pnpm check-env:validation`
- `pnpm check-runtime:validation`

Expected results:

- validation worker env is complete
- validation Redis connectivity passes
- validation tables are reachable in PostgreSQL
- Playwright Chromium launches

Main-app production note:

- the primary Vercel app should use `VALIDATION_OPS_BASE_URL` to link admins to the dedicated validation host
- the primary Vercel app should not keep `VALIDATION_REDIS_URL` after AWS cutover
- web-side validation BullMQ access now requires `VALIDATION_REDIS_URL` explicitly and does not fall back to `REDIS_URL`

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
