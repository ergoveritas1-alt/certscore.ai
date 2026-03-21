# Validation Ops Runbook

This runbook covers the new validation-only deployment lane:

- `apps/web` deployed to Vercel with `APP_FLAVOR=validation_ops`
- validation worker and scheduler running on a separate VM
- separate Redis for validation queues
- shared Supabase project initially

## 1. Prerequisites

- apply migration [0045_validation_pipeline.sql](/Users/benmasek/WC01/packages/db/migrations/0045_validation_pipeline.sql)
- provision a separate Redis instance for validation
- create the new domain in Vercel
- prepare a VM with Docker or Node 20 + pnpm
- set the validation crawler contact/identity copy you want exposed on the public root page

## 2. Validation Web Deploy

Deploy the same `apps/web` app to Vercel, but with:

- `APP_FLAVOR=validation_ops`
- `NEXT_PUBLIC_APP_URL=https://<validation-domain>`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VALIDATION_REDIS_URL`
- `CERTSCORE_ADMIN_EMAILS`

Recommended checks before deploy:

- `pnpm --filter @website-signal-risk-scanner/web check-env:validation`
- `pnpm --filter @website-signal-risk-scanner/web typecheck`

After deploy:

- `/` should show the crawler identity page
- `/app` should require login and platform-admin access

## 3. Validation Worker Image

Build and publish the validation worker image:

```bash
set -a
source apps/web/.env.local
set +a
PROJECT_ID=<project-id> REGION=us-central1 ./deploy-validation.sh
```

This builds the existing worker Dockerfile and pushes an image intended for the validation VM.

## 4. Validation Worker VM

Create an env file on the VM such as `/etc/validation-worker.env` with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `VALIDATION_REDIS_URL`
- `VALIDATION_PIPELINE_ENABLED=1`
- `VALIDATION_SCHEDULER_POLL_MINUTES=1`
- `VALIDATION_DEFAULT_RUN_MODE=manual`
- `VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES=20`
- `VALIDATION_OPENAI_MODEL=gpt-5.4`
- `VALIDATION_TRANCO_MIN_RANK=1000`
- `VALIDATION_TRANCO_MAX_RANK=100000`
- optional `VALIDATION_TRANCO_SOURCE_URL`
- optional `VALIDATION_CRAWLER_PUBLIC_URL`
- optional `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`

If using Docker:

```bash
docker pull <image-uri>

docker run -d \
  --name validation-worker \
  --restart unless-stopped \
  --env-file /etc/validation-worker.env \
  <image-uri> \
  pnpm --filter @website-signal-risk-scanner/worker start:validation

docker run -d \
  --name validation-scheduler \
  --restart unless-stopped \
  --env-file /etc/validation-worker.env \
  <image-uri> \
  pnpm --filter @website-signal-risk-scanner/worker start:validation:scheduler
```

If running directly on the VM:

```bash
pnpm --filter @website-signal-risk-scanner/worker start:validation
pnpm --filter @website-signal-risk-scanner/worker start:validation:scheduler
```

## 5. Validation Runtime Checks

Run these before trusting the deployment:

- `pnpm --filter @website-signal-risk-scanner/web check-env:validation`
- `pnpm --filter @website-signal-risk-scanner/worker check-env:validation`
- `pnpm --filter @website-signal-risk-scanner/worker check-runtime:validation`

Expected results:

- validation web env is complete
- validation worker env is complete
- validation Redis connectivity passes
- validation tables are reachable in Supabase
- Playwright Chromium launches

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
