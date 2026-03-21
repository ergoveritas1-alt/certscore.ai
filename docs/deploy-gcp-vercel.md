# Deploying CertScore to Vercel and GCP

This repo is split across platforms:

- `apps/web` deploys to Vercel.
- `apps/worker` deploys to a Cloud Run Worker Pool.
- the hourly scheduler runs as a Cloud Run Job or a second worker-oriented container entrypoint.

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
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `SUPABASE_STORAGE_BUCKET`

Optional variables depend on the features you intend to enable.

## 3. Build and deploy the worker

The repo includes a helper script that:

- creates the Artifact Registry repository if needed
- builds the worker image from the monorepo root
- deploys the worker to a Cloud Run Worker Pool
- refuses to run if `REDIS_URL` still points at `localhost` or the old Upstash host

```bash
PROJECT_ID=<project-id> REGION=us-central1 ./deploy.sh
```

Best practice:

- Vercel remains the source of truth for production web env vars.
- Cloud Run worker pools should bind sensitive worker values from GCP Secret Manager, not from a repo-local env file.
- The deploy scripts have production-safe defaults for non-secret Supabase/storage config, so a repo-local prod env file is no longer part of the normal deploy path.
- The worker pools should run under dedicated runtime service accounts rather than the default compute service account.

Optional values the script forwards if present:

- `SUPABASE_STORAGE_BUCKET_SCREENSHOTS`
- `SUPABASE_STORAGE_BUCKET_ARTIFACTS`
- `OPENAI_API_KEY`
- `LLM_ENRICHMENT_ENABLED`
- `LLM_ENRICHMENT_TIMEOUT_MS`
- `LLM_ENRICHMENT_MAX_ATTEMPTS`
- `LLM_ENRICHMENT_MAX_CHUNKS`
- `LLM_ENRICHMENT_FORCE_LAST_CHUNK`
- `RESEND_API_KEY`
- `SERVICE_ACCOUNT`

Cloud Run Worker Pools are intended for continuous background work and do not expose a public URL. At the time of writing, Google documents this feature as Preview.

## 4. Run the scheduler hourly

The scheduler entrypoint is:

```bash
pnpm --filter @website-signal-risk-scanner/worker start:scheduler
```

Use a Cloud Run Job or a separate scheduled container target that runs this command once per execution.

## 5. Point the production domain to Vercel

Add the new domain in the Vercel project, apply the DNS records Vercel gives you, then update:

- Supabase Site URL
- Supabase redirect URLs such as `https://<domain>/auth/callback`
- Google OAuth redirect settings if Google login is enabled

## 6. Validate production

Validate in this order:

1. web app loads on the Vercel domain
2. login and callback flow work
3. preview scan enqueues onto the shared Redis backend
4. the Cloud Run Worker Pool consumes preview and full scans
5. report data persists in Supabase
6. PDFs generate
7. the hourly scheduler path runs successfully

## Validation Ops sibling deploy

The validation-only deployment uses a different topology:

- Vercel deploy of `apps/web` with `APP_FLAVOR=validation_ops`
- separate Redis via `VALIDATION_REDIS_URL`
- separate VM for `start:validation` and `start:validation:scheduler`
- optional worker image build via [`deploy-validation.sh`](/Users/benmasek/WC01/deploy-validation.sh)

For the Cloud Run validation worker pool path, prefer `deploy-validation-worker.sh` with Secret Manager-backed bindings rather than shell-exporting prod secrets into the deploy command.

See [docs/validation-ops-runbook.md](/Users/benmasek/WC01/docs/validation-ops-runbook.md) for the full setup and runtime validation sequence.
