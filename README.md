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

## MCP Light

CertScore.ai MCP Light is the no-auth, hosted three-tool integration for public website privacy scans. See the [agent installation guide](llms-install.md), [full Light installation reference](docs/mcp-light-install.md), and [MCP package guide](packages/certscore-mcp/README.md).

## Environment variables

This monorepo should use [apps/web/.env.local](apps/web/.env.local) as the single local development runtime env:

- copy [apps/web/.env.example](apps/web/.env.example) to [apps/web/.env.local](apps/web/.env.local)

Use [.env.example](.env.example) only as a reference template for shared keys. Do not rely on a root `.env.local` for app runtime configuration.

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
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Required for the validation runtime in `WC01`:

- `DATABASE_URL`
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

Use Node 22, 23, or 24 for local development. Node 20 is below the workspace engine floor, and Node 25 is not supported because it can fail DNS resolution for app routes and external service calls on localhost.

1. Install dependencies:
   - `pnpm install`
2. Copy the environment template:
   - `cp apps/web/.env.example apps/web/.env.local`
3. Start a dedicated PostgreSQL instance for local development.
4. Apply the SQL migrations from [packages/db/migrations](packages/db/migrations).
5. Seed local development data when needed with [packages/db/seed/0001_dev_seed.sql](packages/db/seed/0001_dev_seed.sql).
6. Configure Better Auth provider settings:
   - Google OAuth if enabled
   - email/password and verification settings as needed
7. Configure auth redirect URLs:
   - Google OAuth must allow Better Auth's provider callback route:
   - `http://localhost:3000/api/auth/callback/google`
   - `http://127.0.0.1:3000/api/auth/callback/google`
   - `https://certscore.ai/api/auth/callback/google`
   - `/auth/callback` is only an app alias route; it is not the redirect URI Better Auth initiates with Google
8. Keep local and production auth isolated:
   - local `NEXT_PUBLIC_APP_URL` should be `http://localhost:3000`
   - local database and auth secrets should come from the dev environment
   - production secrets should exist only in the active AWS/web or worker deployment settings
9. Create the S3-compatible bucket referenced by `S3_BUCKET`.
10. Install Playwright Chromium for the validation runtime:
   - `pnpm --filter @website-signal-risk-scanner/validation-worker exec playwright install chromium`
11. Start validation local development with a watched validation worker:
   - `pnpm dev:validation`
12. Start the main local app by itself when needed:
   - `pnpm --filter @website-signal-risk-scanner/web dev`
13. Use `WS01` when you need the standalone scanner locally.
14. Start the standalone scanner locally against the same dev database and storage env as `localhost:3000`:
   - `pnpm dev:scanner:local`
15. Use the combined local runner only when you want web + validation together in `WC01`:
   - `pnpm dev:all`
16. Run a validation scheduler sweep manually when needed:
   - `pnpm dev:validation:scheduler`

## Development verification

Use these commands before shipping changes:

- `pnpm turbo run typecheck`
- `pnpm turbo run build`

Validation-specific checks:

- `pnpm --filter @website-signal-risk-scanner/validation-worker typecheck`
- `pnpm test:scan-pipeline`

The scan pipeline test is deterministic and runs locally from `apps/validation-worker/src/validation/pipeline.test.ts`.

The normalized concern lifecycle in `WC01` is documented in [docs/normalized-concern-pipeline.md](docs/normalized-concern-pipeline.md).

## CI validation

GitHub Actions workflow: [.github/workflows/accessibility-validation.yml](.github/workflows/accessibility-validation.yml)

- `worker-scan-pipeline-tests` runs on pushes to `main`, pull requests, and manual dispatch. It installs Chromium, typechecks `validation-worker`, and runs `pnpm test:scan-pipeline`.
- `live-validation-smoke` runs after the deterministic job and executes `pnpm --filter @website-signal-risk-scanner/validation-worker smoke:validation` only when the runtime secrets are configured.
- If those secrets are missing, the live smoke job is skipped and only the deterministic scan pipeline job runs.

## Runtime validation tooling

Use these lightweight checks before first deployment validation:

- `pnpm dev:storage:local`
- `pnpm --filter @website-signal-risk-scanner/web check-env`
- `pnpm check-env:validation`
- `pnpm --filter @website-signal-risk-scanner/validation-worker check-env`
- `pnpm --filter @website-signal-risk-scanner/validation-worker check-runtime`

For local validation runs, `pnpm dev:storage:local` starts MinIO against the `apps/web/.env.local` S3 settings and creates the configured bucket when needed.
Run it alongside `pnpm dev:scanner:local` and `pnpm dev:validation:worker`.

Use this runtime smoke helper:

- `pnpm --filter @website-signal-risk-scanner/validation-worker scheduler`

The full runtime QA sequence is documented in [docs/runtime-validation.md](docs/runtime-validation.md).
The validation pipeline design and deployment shape are documented in [docs/validation-pipeline-plan.md](docs/validation-pipeline-plan.md).
The validation crawler deployment and VM runbook is documented in [docs/validation-ops-runbook.md](docs/validation-ops-runbook.md).
Cloudflare Verified Bot setup is documented in [docs/cloudflare-web-bot-auth.md](docs/cloudflare-web-bot-auth.md).

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

- the live public web deployment target is the AWS ECS/Fargate path for `certscore.ai`
- `consentcheck.site` is owned outside WC01 and must not be deployed by this repo
- `main` deploys through [.github/workflows/web-aws-ecs-deploy.yml](.github/workflows/web-aws-ecs-deploy.yml)
- run `pnpm ops:check:deploy` before or after topology changes to catch stale local assumptions
- run `pnpm ops:check:live` against the public hosts to verify runtime target and revision alignment after deploy
- treat [docs/aws-web-ecs-cutover-plan.md](docs/aws-web-ecs-cutover-plan.md) as the active web deployment runbook
- treat [docs/deploy-amplify.md](docs/deploy-amplify.md) as future-state reference material only

### Validation And Scanner Runtime

- do not use `WC01` for the primary scanner deploy path
- use `WS01` for scanner runtime deployment
- keep `WC01` deployment guidance scoped to web and validation only
- keep web production, validation worker, and scanner runtime as three distinct deployment paths
- use the AWS validation deployment lane for `WC01` validation runtime changes

### Database, Auth, and Storage

- create production PostgreSQL, Better Auth, and S3-compatible storage resources separate from local development
- apply all migrations in order
- configure the production site URL and production redirect URLs only
- create the report storage bucket referenced by `S3_BUCKET`

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
