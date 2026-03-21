# CertScore

CertScore (`certscore.ai`) is a production-minded MVP for scanning public websites for potential accessibility, privacy, cookie, policy, and disclosure risk signals. It is a risk signal and monitoring product, not a legal certification platform.

## Monorepo structure

```text
website-signal-risk-scanner/
├─ apps/
│  ├─ web/
│  └─ worker/
├─ packages/
│  ├─ shared/
│  ├─ db/
│  └─ ui/
├─ docs/
├─ .env.example
├─ turbo.json
├─ package.json
└─ pnpm-workspace.yaml
```

## Workspace packages

- `apps/web`: Next.js App Router marketing site, auth flows, dashboard, reports, and server actions
- `apps/worker`: BullMQ worker, crawl/audit/scoring/report pipeline, PDF generation, and scheduler sweep
- `packages/shared`: shared constants, types, validators, scoring config, and scheduling helpers
- `packages/db`: Supabase clients and database env helpers
- `packages/ui`: reusable UI primitives

## What the MVP includes

- public homepage with preview scan funnel
- Supabase auth with Google OAuth and magic link login
- organization bootstrap and protected workspace routes
- domain management, plan limits, and client grouping
- BullMQ queue processing with a single worker service
- crawl/discovery, accessibility, privacy, and legal heuristics
- deterministic scoring, canonical report payloads, and authenticated report UI
- worker-side PDF generation and upload
- regression summaries and scheduled rescans
- lightweight branding for reports and PDFs

## Environment variables

This monorepo should use [apps/web/.env.local](/Users/benmasek/WC01/apps/web/.env.local) as the single local development runtime env:

- copy [apps/web/.env.example](/Users/benmasek/WC01/apps/web/.env.example) to [apps/web/.env.local](/Users/benmasek/WC01/apps/web/.env.local)
- copy [apps/web/.env.validation.example](/Users/benmasek/WC01/apps/web/.env.validation.example) to [apps/web/.env.validation.local](/Users/benmasek/WC01/apps/web/.env.validation.local) for the validation-only web app

Use [.env.example](/Users/benmasek/WC01/.env.example) only as a reference template for shared keys. Do not rely on a root `.env.local` for app runtime configuration.

Recommended environment split:

- local web + local worker: dedicated dev Supabase project
- production web + production worker: dedicated prod Supabase project

Do not point localhost at the production Supabase auth project unless you are intentionally testing production auth behavior.

Required for the web app:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `SUPABASE_STORAGE_BUCKET`

Required for the worker:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `SUPABASE_STORAGE_BUCKET`

Optional but recommended:

- `WORKER_CONCURRENCY`
- `PLAYWRIGHT_BROWSERS_PATH`
- `RESEND_API_KEY`
- `OPENAI_API_KEY`

Compatibility note:

- Older environments may still use `SUPABASE_STORAGE_BUCKET_REPORTS`. The hardening pass keeps that as a fallback, but `SUPABASE_STORAGE_BUCKET` is now the canonical variable for report PDF storage.

## Local development setup

1. Install dependencies:
   - `pnpm install`
2. Copy the environment template:
   - `cp apps/web/.env.example apps/web/.env.local`
   - `cp apps/web/.env.validation.example apps/web/.env.validation.local`
3. Create a dedicated Supabase dev project.
4. Apply the SQL migrations from [packages/db/migrations](/Users/benmasek/WC01/packages/db/migrations).
5. In Supabase Auth, enable:
   - Google OAuth
   - Email magic links
6. Configure auth redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `http://127.0.0.1:3000/auth/callback`
   - `https://certscore.ai/auth/callback`
7. Keep local and production auth isolated:
   - local `NEXT_PUBLIC_APP_URL` should be `http://localhost:3000`
   - local Supabase keys should come from the dev project
   - production Supabase keys should exist only in Vercel / worker deployment settings
8. Create the storage bucket referenced by `SUPABASE_STORAGE_BUCKET`.
9. Provision a Redis instance and set `REDIS_URL`.
10. Install Playwright Chromium for the worker:
   - `pnpm --filter @website-signal-risk-scanner/worker playwright:install`
11. Start the web app:
   - `pnpm --filter @website-signal-risk-scanner/web dev`
12. Start the validation web app on a separate port when needed:
   - `pnpm dev:validation:web`
13. Start the worker:
   - `pnpm --filter @website-signal-risk-scanner/worker dev`
14. Run a scheduler sweep manually when needed:
   - `pnpm --filter @website-signal-risk-scanner/worker scheduler:sweep`

## Development verification

Use these commands before shipping changes:

- `pnpm turbo run typecheck`
- `pnpm turbo run build`

Accessibility-specific validation:

- `pnpm --filter @website-signal-risk-scanner/worker typecheck`
- `node --import tsx --test /Users/benmasek/WC01/apps/worker/src/scan/accessibility-validation.test.ts`
- `pnpm --filter @website-signal-risk-scanner/worker benchmark:accessibility:assert`

The live benchmark assertion command uses `apps/web/.env.local` and will execute real scans against the demo workspace.

## CI accessibility validation

GitHub Actions workflow: [.github/workflows/accessibility-validation.yml](/Users/benmasek/WC01/.github/workflows/accessibility-validation.yml)

- `worker-accessibility-tests` runs on pushes to `main`, pull requests, and manual dispatch. It installs Chromium, typechecks the worker, and runs the deterministic accessibility validation tests.
- `live-accessibility-benchmark` runs after the deterministic job and executes `pnpm benchmark:accessibility:assert` only when these repository secrets are configured: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, and `SUPABASE_STORAGE_BUCKET`.
- If those secrets are missing, the live benchmark job is skipped and only the deterministic accessibility validation job runs.

## Runtime validation tooling

Use these lightweight checks before first deployment validation:

- `pnpm --filter @website-signal-risk-scanner/web check-env`
- `pnpm --filter @website-signal-risk-scanner/web check-env:validation`
- `pnpm --filter @website-signal-risk-scanner/worker check-env`
- `pnpm --filter @website-signal-risk-scanner/worker check-env:validation`
- `pnpm --filter @website-signal-risk-scanner/worker check-runtime`
- `pnpm --filter @website-signal-risk-scanner/worker check-runtime:validation`

Use these runtime smoke helpers:

- `pnpm --filter @website-signal-risk-scanner/worker scheduler:sweep`
- `pnpm --filter @website-signal-risk-scanner/worker smoke:scheduler`

The full runtime QA sequence is documented in [docs/runtime-validation.md](/Users/benmasek/WC01/docs/runtime-validation.md).
The validation pipeline design and deployment shape are documented in [docs/validation-pipeline-plan.md](/Users/benmasek/WC01/docs/validation-pipeline-plan.md).
The validation crawler deployment and VM runbook is documented in [docs/validation-ops-runbook.md](/Users/benmasek/WC01/docs/validation-ops-runbook.md).

## Production deployment

### Vercel web app

- prefer Git-based deploys for production web changes
- stage the intended files, commit them, and push `main` to GitHub
- treat the connected Vercel project as the primary production deploy path
- do not deploy from `apps/web`
- use `npx vercel deploy --prod` from the repo root only as a manual fallback when a direct Vercel CLI deploy is intentionally needed
- configure the web environment variables from the shared list above
- use only production Supabase URL and keys in Vercel
- ensure Supabase Auth redirects include the production callback on `certscore.ai`

### GCP worker pool

- deploy `apps/worker`
- configure the worker environment variables from the list above
- use only production Supabase URL and keys in the worker host
- install Playwright Chromium in the deploy image or build step
- deploy the worker as a Cloud Run Worker Pool or use [`deploy.sh`](/Users/benmasek/WC01/deploy.sh)
- run exactly one production worker instance unless you intentionally scale concurrency

### Supabase

- create a production project separate from local development
- apply all migrations in order
- enable Google OAuth and email magic links
- configure the production site URL and production redirect URLs only
- create the report storage bucket referenced by `SUPABASE_STORAGE_BUCKET`

### Redis

- create a Redis database
- set `REDIS_URL` in both web and worker environments

### Scheduler

Recommended production trigger:

- run the scheduler sweep every hour

Command:

- `pnpm --filter @website-signal-risk-scanner/worker scheduler:sweep`

This can be invoked by a Cloud Run Job or any equivalent scheduler.

## Deployment readiness checklist

- Environment variables configured
- Supabase project created
- Supabase migrations applied
- Supabase auth providers configured
- Supabase storage bucket created
- Redis connection working
- Playwright browsers installed
- Worker process running
- Scheduler cron configured
- First domain scanned successfully
- Report generated successfully
- PDF export generated successfully

## First production validation

After deployment, validate in this order:

1. run the env and runtime checks above
2. verify login and organization bootstrap
3. verify preview scan flow
4. verify full scan completion
5. verify findings, scores, and report persistence
6. verify PDF export
7. verify regression on a second scan
8. verify the hourly scheduler sweep path

## Operational notes

- The worker owns crawl, auditing, scoring, reporting, PDF generation, and scheduled sweep logic.
- PDF generation failures do not invalidate the scan or web report.
- Regression calculation failures do not invalidate the scan or report.
- The app validates critical env vars at runtime and now fails fast with clearer messages when required configuration is missing.

## References

- [Supabase Next.js server-side auth guide](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase social login guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase passwordless magic link guide](https://supabase.com/docs/guides/auth/auth-email-passwordless?language=js&queryGroups=language)
