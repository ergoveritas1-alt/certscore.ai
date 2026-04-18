# Deploying CertScore to Vercel and GCP

This repo is split across platforms:

- `apps/web` deploys to Vercel.
- scanner runtime now lives in the standalone `WS01` repo and deploys through its own GCP VM flow.
- validation worker runtime remains a separate worker-style deploy path.

## 1. Push the monorepo to Git

Initialize the repo locally if needed:

```bash
git init
git checkout -b codex/init-deploy
git add .
git commit -m "Initial import"
```

Create a remote repository, then add and push:

```bash
git remote add origin <repo-url>
git push -u origin codex/init-deploy
```

## 2. Deploy the web app to Vercel

Import the repository into Vercel and configure:

- Root directory: `apps/web`
- Install command: `pnpm install`
- Build command: `pnpm build`

After the repo is connected, prefer Git-based deploys for web changes:

- make the change in the repo root
- `git add` the intended files
- commit with a clear message
- push `main` to GitHub so Vercel deploys production from Git

Use `npx vercel deploy --prod` only as a manual fallback when you intentionally need a direct CLI deployment.

Set the production environment variables in Vercel:

- `NEXT_PUBLIC_APP_URL`
- `DATABASE_URL`
- `DATABASE_READ_URL` when you use a dedicated read replica
- `DATABASE_SSL_MODE` when your Postgres provider requires non-default SSL behavior
- `BETTER_AUTH_SECRET`
- `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` when OAuth is enabled
- `REDIS_URL`
- `VALIDATION_REDIS_URL` when validation uses a dedicated Redis
- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT` when using a non-AWS S3-compatible provider
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE` when required by the storage provider

Optional variables depend on the features you intend to enable.

## 2a. Production cutover checklist

Before declaring production healthy, confirm this exact rollout contract:

1. Vercel production env matches the portable contract above and no legacy `SUPABASE_*` variables remain in active use.
2. The production database already has the merged `packages/db/migrations` applied.
3. The Better Auth tables exist in production PostgreSQL:
   - `better_auth_users`
   - `better_auth_sessions`
   - `better_auth_accounts`
   - `better_auth_verifications`
4. The configured S3 bucket already exists and the supplied credentials can read and write it.
5. Google OAuth provider settings, if enabled, point to `/auth/callback` on the production domain.
6. Users are told they must sign in again after cutover because Supabase sessions are not preserved.

If any of those are untrue, fix them before treating the deployment as complete.

## 3. Deploy scanner runtime separately

The primary scanner worker is no longer deployed from `WC01`.

Use the `WS01` repo for:

- scanner runtime deploys
- scanner scheduler deploys
- scanner crawler identity changes
- scanner VM/service operations

`WC01` should only assume that scanner work is claimed through the shared database contract.

## 4. Run the scanner scheduler separately

The scanner scheduler also lives in `WS01`, not in this repo. `WC01` should treat scanner queue pickup and schedule sweeps as external scanner-service responsibilities.

## 5. Point the production domain to Vercel

Add the new domain in the Vercel project, apply the DNS records Vercel gives you, then update:

- Better Auth site URL
- Better Auth redirect URLs using the app callback alias, such as `https://<domain>/auth/callback`
- Google OAuth redirect settings if Google login is enabled

## 6. Validate production

Validate in this order:

1. web app loads on the Vercel domain
2. login and callback flow work
3. preview and full scan requests persist in the database as queued work
4. the standalone scanner service claims and executes scans
5. report data persists in PostgreSQL and storage artifacts persist in S3-compatible object storage
6. PDFs generate
7. the standalone scanner scheduler path runs successfully

## 7. Monitor production runtime health

The repo includes a lightweight production ops monitor:

```bash
pnpm ops:monitor:prod
```

It checks:

- validation worker heartbeat freshness from PostgreSQL-backed settings
- scanner service heartbeat freshness from PostgreSQL-backed settings
- Cloud Run readiness for `certscore-validation-worker`

If `GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD`, and `OPS_ALERT_TO_EMAIL` are configured, it will email an alert and exit non-zero when a runtime is stale or not ready.

## Validation Ops sibling deploy

The validation-only deployment uses a different topology:

- Vercel deploy of `apps/web` with `APP_FLAVOR=validation_ops`
- separate Redis via `VALIDATION_REDIS_URL`
- separate VM for `start:validation` and `start:validation:scheduler`
- optional worker image build via [`deploy-validation.sh`](/Users/benmasek/WC01/deploy-validation.sh)

For the Cloud Run validation worker pool path, prefer `deploy-validation-worker.sh` with Secret Manager-backed bindings rather than shell-exporting prod secrets into the deploy command.

See [docs/validation-ops-runbook.md](/Users/benmasek/WC01/docs/validation-ops-runbook.md) for the full setup and runtime validation sequence.
