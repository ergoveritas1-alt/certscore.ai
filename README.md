# CertScore

CertScore (`certscore.ai`) is a production-minded MVP for scanning public websites for potential accessibility, privacy, cookie, policy, and disclosure risk signals. It is a risk signal and monitoring product, not a legal certification platform.

## Monorepo structure

```text
website-signal-risk-scanner/
├─ apps/
│  ├─ web/
│  └─ validation-worker/
├─ packages/
│  ├─ shared/
│  ├─ web-bot-auth/
│  ├─ db/
│  └─ ui/
├─ docs/
├─ .env.example
├─ turbo.json
├─ package.json
└─ pnpm-workspace.yaml
```

## Workspace packages

- `apps/web`: product-facing web app and control-plane workflows
- `apps/validation-worker`: active validation runtime owned by `WC01`
- `packages/shared`: shared constants, types, validators, scoring config, and scheduling helpers
- `packages/web-bot-auth`: server-only Web Bot Auth signing and key-directory helpers
- `packages/db`: PostgreSQL query helpers, migrations, seed SQL, and env helpers
- `packages/ui`: reusable UI primitives

## Repo boundary

`WC01` is now the product/control-plane repo.

- product web flows, scan creation, reporting, and validation stay here
- the standalone scanner runtime now lives in `WS01`
- scanner operational changes, crawler identity work, and scanner deploy flow should originate in `WS01`

## What the MVP includes

- public homepage with preview scan funnel
- Better Auth with Google OAuth and email/password login flows
- organization bootstrap and protected workspace routes
- domain management, plan limits, and client grouping
- DB-backed scan creation with scanner-service claiming
- crawl/discovery, accessibility, privacy, and legal heuristics
- deterministic scoring, canonical report payloads, and authenticated report UI
- scanner-generated PDF generation and upload
- regression summaries and scheduled rescans
- lightweight branding for reports and PDFs

## Environment variables

This monorepo should use [apps/web/.env.local](/Users/benmasek/WC01/apps/web/.env.local) as the single local development runtime env:

- copy [apps/web/.env.example](/Users/benmasek/WC01/apps/web/.env.example) to [apps/web/.env.local](/Users/benmasek/WC01/apps/web/.env.local)

Use [.env.example](/Users/benmasek/WC01/.env.example) only as a reference template for shared keys. Do not rely on a root `.env.local` for app runtime configuration.

Recommended environment split inside `WC01`:

- local web + local validation runtime: dedicated dev PostgreSQL database plus S3-compatible storage
- production web + production validation runtime: dedicated production PostgreSQL database plus S3-compatible storage

Do not point localhost at the production database or production auth credentials unless you are intentionally testing production behavior.

Required for the web app:

- `NEXT_PUBLIC_APP_URL`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `REDIS_URL`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Required for the validation runtime in `WC01`:

- `DATABASE_URL`
- `VALIDATION_REDIS_URL` or `REDIS_URL`
- `OPENAI_API_KEY`

Optional but recommended:

- `WORKER_CONCURRENCY`
- `PLAYWRIGHT_BROWSERS_PATH`
- `VALIDATION_OPENAI_MODEL`
- `VALIDATION_NANO_MODEL`
- `WEB_BOT_AUTH_ENABLED`
- `WEB_BOT_AUTH_PRIVATE_KEY_PEM`
- `WEB_BOT_AUTH_SIGNATURE_AGENT_URL`

## Local development setup

Use Node 20 or Node 22 LTS for local development. Node 25 is not supported here and can fail DNS resolution for app routes and external service calls on localhost.

1. Install dependencies:
   - `pnpm install`
2. Copy the environment template:
   - `cp apps/web/.env.example apps/web/.env.local`
3. Start a dedicated PostgreSQL instance for local development.
4. Apply the SQL migrations from [packages/db/migrations](/Users/benmasek/WC01/packages/db/migrations).
5. Seed local development data when needed with [packages/db/seed/0001_dev_seed.sql](/Users/benmasek/WC01/packages/db/seed/0001_dev_seed.sql).
6. Configure Better Auth provider settings:
   - Google OAuth if enabled
   - email/password and verification settings as needed
7. Configure auth redirect URLs:
   - use the stable callback alias exposed by the app:
   - `http://localhost:3000/auth/callback`
   - `http://127.0.0.1:3000/auth/callback`
   - `https://certscore.ai/auth/callback`
   - the app forwards that route to Better Auth's internal callback handler
8. Keep local and production auth isolated:
   - local `NEXT_PUBLIC_APP_URL` should be `http://localhost:3000`
   - local database and auth secrets should come from the dev environment
   - production secrets should exist only in Vercel / worker deployment settings
9. Create the S3-compatible bucket referenced by `S3_BUCKET`.
10. Provision Redis for app queues:
   - set `REDIS_URL` for the web runtime
   - set `VALIDATION_REDIS_URL` for the validation worker, or let it fall back to `REDIS_URL` if both runtimes intentionally share one Redis instance
11. Install Playwright Chromium for the validation runtime:
   - `pnpm --filter @website-signal-risk-scanner/validation-worker exec playwright install chromium`
12. Start validation local development with a watched validation worker:
   - `pnpm dev:validation`
13. Start the main local app by itself when needed:
   - `pnpm --filter @website-signal-risk-scanner/web dev`
14. Use `WS01` when you need the standalone scanner locally.
15. Start the standalone scanner locally against the same dev database and storage env as `localhost:3000`:
   - `pnpm dev:scanner:local`
16. Use the combined local runner only when you want web + validation together in `WC01`:
   - `pnpm dev:all`
17. Run a validation scheduler sweep manually when needed:
   - `pnpm dev:validation:scheduler`

## Development verification

Use these commands before shipping changes:

- `pnpm turbo run typecheck`
- `pnpm turbo run build`

Validation-specific checks:

- `pnpm --filter @website-signal-risk-scanner/validation-worker typecheck`
- `pnpm test:scan-pipeline`

The scan pipeline test is deterministic and runs locally from `apps/validation-worker/src/validation/pipeline.test.ts`.

The normalized concern lifecycle in `WC01` is documented in [docs/normalized-concern-pipeline.md](/Users/benmasek/WC01/docs/normalized-concern-pipeline.md).

## CI validation

GitHub Actions workflow: [.github/workflows/accessibility-validation.yml](/Users/benmasek/WC01/.github/workflows/accessibility-validation.yml)

- `worker-scan-pipeline-tests` runs on pushes to `main`, pull requests, and manual dispatch. It installs Chromium, typechecks `validation-worker`, and runs `pnpm test:scan-pipeline`.
- `live-validation-smoke` runs after the deterministic job and executes `pnpm --filter @website-signal-risk-scanner/validation-worker smoke:validation` only when the runtime secrets are configured.
- If those secrets are missing, the live smoke job is skipped and only the deterministic scan pipeline job runs.

## Runtime validation tooling

Use these lightweight checks before first deployment validation:

- `pnpm --filter @website-signal-risk-scanner/web check-env`
- `pnpm check-env:validation`
- `pnpm --filter @website-signal-risk-scanner/validation-worker check-env`
- `pnpm --filter @website-signal-risk-scanner/validation-worker check-runtime`

Use this runtime smoke helper:

- `pnpm --filter @website-signal-risk-scanner/validation-worker scheduler`

The full runtime QA sequence is documented in [docs/runtime-validation.md](/Users/benmasek/WC01/docs/runtime-validation.md).
The validation pipeline design and deployment shape are documented in [docs/validation-pipeline-plan.md](/Users/benmasek/WC01/docs/validation-pipeline-plan.md).
The validation crawler deployment and VM runbook is documented in [docs/validation-ops-runbook.md](/Users/benmasek/WC01/docs/validation-ops-runbook.md).
Cloudflare Verified Bot setup is documented in [docs/cloudflare-web-bot-auth.md](/Users/benmasek/WC01/docs/cloudflare-web-bot-auth.md).

## Web Bot Auth

ConsentCheck can expose a signed HTTP Message Signatures key directory and sign outbound HTTP crawler requests for Cloudflare Verified Bot workflows.

Required configuration:

- `WEB_BOT_AUTH_ENABLED`
- `WEB_BOT_AUTH_PRIVATE_KEY_PEM`
- `WEB_BOT_AUTH_SIGNATURE_AGENT_URL`
- `WEB_BOT_AUTH_EXPIRES_SECONDS`
- `WEB_BOT_AUTH_INCLUDE_NONCE`

Common commands:

- `pnpm web-bot-auth:generate`
- `pnpm web-bot-auth:print`
- `pnpm web-bot-auth:test-request`
- `pnpm test:web-bot-auth`

## Production deployment

### Web runtime

- the primary production web path is Vercel Git deployment from `main`
- the canonical Vercel project is `consentcheck-site`
- the Vercel project root directory must stay `apps/web`
- prefer pushing reviewed commits to GitHub and letting Vercel create the production deployment from the connected repo
- do not treat repo-root `.vercel` linkage or the removed `apps/validation-web` path as valid production config
- use [deploy-web-vm.sh](/Users/benmasek/WC01/deploy-web-vm.sh) only as a fallback fixed-egress path when Vercel cannot reach required production dependencies and the team explicitly chooses the VM route
- if the VM route is active, terminate TLS and canonical-host routing with the checked-in [deploy/caddy/Caddyfile](/Users/benmasek/WC01/deploy/caddy/Caddyfile) and configure `/etc/certscore-web.env` on the host
- ensure Better Auth provider redirects include the production callback alias on `certscore.ai`
- redirect `www.certscore.ai` to `https://certscore.ai` unless there is a specific reason to serve both hosts directly

### GCP worker pool

- do not use `WC01` for the primary scanner deploy path
- use `WS01` for scanner runtime deployment
- keep `WC01` deployment guidance scoped to web and validation only

### Database, Auth, and Storage

- create production PostgreSQL, Better Auth, and S3-compatible storage resources separate from local development
- apply all migrations in order
- configure the production site URL and production redirect URLs only
- create the report storage bucket referenced by `S3_BUCKET`

### Redis

- create a Redis database
- set `REDIS_URL` for the web runtime
- set `VALIDATION_REDIS_URL` for the validation worker, or allow it to fall back to `REDIS_URL` when sharing one Redis instance is intentional

### Scheduler

Recommended production trigger:

- run the validation scheduler sweep every hour if the validation runtime is enabled

Command:

- `pnpm dev:validation:scheduler`

The primary scanner scheduler now lives in `WS01`.

## Deployment readiness checklist

- Environment variables configured
- PostgreSQL database created
- database migrations applied
- Better Auth providers configured
- S3-compatible storage bucket created
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

- The standalone scanner in `WS01` owns crawl, auditing, scoring, reporting, PDF generation, and scheduled sweep logic.
- PDF generation failures do not invalidate the scan or web report.
- Regression calculation failures do not invalidate the scan or report.
- The app validates critical env vars at runtime and now fails fast with clearer messages when required configuration is missing.

## References

- [Better Auth documentation](https://www.better-auth.com/)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)
- [Amazon S3 API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html)
