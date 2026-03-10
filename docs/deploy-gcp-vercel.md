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

Set the production environment variables in Vercel:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_URL`
- `SUPABASE_STORAGE_BUCKET`

Optional variables depend on the features you intend to enable.

## 3. Build and push the worker image

Build from the repo root using the worker Dockerfile:

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/<project-id>/certscore/worker:latest -f apps/worker/Dockerfile .
```

## 4. Deploy the worker to Cloud Run Worker Pools

Cloud Run Worker Pools are intended for continuous background work and do not expose a public URL. At the time of writing, Google documents this feature as Preview.

```bash
gcloud beta run worker-pools deploy certscore-worker \
  --image us-central1-docker.pkg.dev/<project-id>/certscore/worker:latest \
  --region us-central1 \
  --set-env-vars NODE_ENV=production \
  --set-secrets NEXT_PUBLIC_SUPABASE_URL=NEXT_PUBLIC_SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,NEXT_PUBLIC_SUPABASE_ANON_KEY=NEXT_PUBLIC_SUPABASE_ANON_KEY:latest,UPSTASH_REDIS_URL=UPSTASH_REDIS_URL:latest,SUPABASE_STORAGE_BUCKET=SUPABASE_STORAGE_BUCKET:latest
```

Add any optional worker secrets you need, such as `OPENAI_API_KEY` or `RESEND_API_KEY`.

## 5. Run the scheduler hourly

The scheduler entrypoint is:

```bash
pnpm --filter @website-signal-risk-scanner/worker start:scheduler
```

Use a Cloud Run Job or a separate scheduled container target that runs this command once per execution.

## 6. Point the production domain to Vercel

Add the new domain in the Vercel project, apply the DNS records Vercel gives you, then update:

- Supabase Site URL
- Supabase redirect URLs such as `https://<domain>/auth/callback`
- Google OAuth redirect settings if Google login is enabled

## 7. Validate production

Validate in this order:

1. web app loads on the Vercel domain
2. login and callback flow work
3. preview scan works
4. full scan reaches the worker
5. report data persists in Supabase
6. PDFs generate
7. the hourly scheduler path runs successfully
