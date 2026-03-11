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

This monorepo should use separate environment files per app in local development:

- copy [apps/web/.env.example](/Users/benmasek/WC01/apps/web/.env.example) to [apps/web/.env.local](/Users/benmasek/WC01/apps/web/.env.local)
- copy [apps/worker/.env.example](/Users/benmasek/WC01/apps/worker/.env.example) to [apps/worker/.env.local](/Users/benmasek/WC01/apps/worker/.env.local)

Use [.env.example](/Users/benmasek/WC01/.env.example) only as a reference template for shared keys. Do not rely on a single root `.env.local` for app runtime configuration.

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
   - `cp apps/worker/.env.example apps/worker/.env.local`
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
12. Start the worker:
   - `pnpm --filter @website-signal-risk-scanner/worker dev`
13. Run a scheduler sweep manually when needed:
   - `pnpm --filter @website-signal-risk-scanner/worker scheduler:sweep`

## Development verification

Use these commands before shipping changes:

- `pnpm turbo run typecheck`
- `pnpm turbo run build`

## Runtime validation tooling

Use these lightweight checks before first deployment validation:

- `pnpm --filter @website-signal-risk-scanner/web check-env`
- `pnpm --filter @website-signal-risk-scanner/worker check-env`
- `pnpm --filter @website-signal-risk-scanner/worker check-runtime`

Use these runtime smoke helpers:

- `pnpm --filter @website-signal-risk-scanner/worker scheduler:sweep`
- `pnpm --filter @website-signal-risk-scanner/worker smoke:scheduler`

The full runtime QA sequence is documented in [docs/runtime-validation.md](/Users/benmasek/WC01/docs/runtime-validation.md).

## Production deployment

### Vercel web app

- deploy `apps/web`
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
