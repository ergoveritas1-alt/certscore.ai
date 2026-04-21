# Legacy Fallback Fixed-Egress Deploy To GCP VMs

This document is now the rollback path, not the preferred web deploy path.

Current target topology:

- `apps/web` now serves production from the AWS ECS/Fargate web stack for both `certscore.ai` and `consentcheck.site`.
- scanner runtime now lives in the standalone `WS01` repo and deploys through its own GCP VM flow.
- validation worker runtime remains a separate worker-style deploy path.
- the checked-in deployment audit source of truth is [config/deployment-topology.json](/Users/benmasek/WC01/config/deployment-topology.json)

Legacy topology covered by this document:

- the GCP VM path in this document is a fallback rollback path only for `apps/web`
- it is no longer the authoritative production lane for the public web hosts

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

## 2. Deploy the web app to the fixed-egress VM

Use this section only if an AWS web rollback is required.

Build and publish the standalone web image for the VM lane:

```bash
bash ./deploy-web-vm.sh
```

For first-time bootstrap only, allow the script to create the Artifact Registry repository if it is truly missing:

```bash
ENSURE_ARTIFACT_REPOSITORY=1 bash ./deploy-web-vm.sh
```

The preferred production path is now:

1. make the change in the repo root
2. `git add` the intended files
3. commit with a clear message
4. push to `main`
5. let `.github/workflows/web-aws-ecs-deploy.yml` build the image, update the ECS web services, and run stabilization checks

For local operator-driven rollout, run:

```bash
DEPLOY_TO_VM=1 IMAGE_TAG=$(git rev-parse HEAD) bash ./deploy-web-vm.sh
```

The deploy script now:

- builds and publishes the web image to Artifact Registry
- invokes a root-owned deploy wrapper on the VM
- verifies the public `https://consentcheck.site/login` and `/api/health/database` routes

This requires the deploy principal to have:

- GCP access for Cloud Build, Artifact Registry, and Compute SSH
- non-interactive `sudo` for the single deploy wrapper command on the VM

GitHub Actions in this repo uses Workload Identity Federation, not a long-lived JSON key. The production workflow authenticates as:

- workload identity provider: `projects/375479222526/locations/global/workloadIdentityPools/github-actions/providers/github-actions-certscore-ai`
- deploy service account: `github-web-deploy-sa@certscore-ai.iam.gserviceaccount.com`

That service account is restricted to the `ergoveritas1-alt/certscore.ai` repository and is intended only for the web VM production workflow.
The checked-in [/.github/workflows/web-vm-deploy.yml](/Users/benmasek/WC01/.github/workflows/web-vm-deploy.yml) is rollback-only and no longer auto-runs on ordinary `apps/web` pushes to `main`.

The GitHub workflow builds the image directly with Docker on the runner and pushes it to Artifact Registry. Local operators can still use the default Cloud Build path, or force the runner-style path locally with:

```bash
BUILD_STRATEGY=docker bash ./deploy-web-vm.sh
```

Install the wrapper once on `certscore-web-prod`:

```bash
gcloud compute scp deploy/vm/install-web-deploy-wrapper.sh certscore-web-prod:~/install-web-deploy-wrapper.sh --zone us-central1-a
gcloud compute ssh certscore-web-prod --zone us-central1-a --command 'bash ~/install-web-deploy-wrapper.sh'
```

That installs:

- `/usr/local/bin/deploy-certscore-web`
- `/etc/sudoers.d/certscore-web-deploy`

The wrapper is intentionally narrow: it accepts a single image URI, restarts the `certscore-web` container with `/etc/certscore-web.env`, and verifies the local login and database health endpoints before returning success.

Set the production environment variables in `/etc/certscore-web.env` on the VM:

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

The reverse proxy and canonical host policy should match the checked-in [deploy/caddy/Caddyfile](/Users/benmasek/WC01/deploy/caddy/Caddyfile):

- terminate TLS on the VM
- serve `certscore.ai` directly
- redirect `www.certscore.ai` to `https://certscore.ai`
- expose only `80/443` publicly
- keep the PostgreSQL security group limited to the VM public IP

The VM deploy workflow assumes the Caddy config is already correct and persistent on the host. Treat Caddy updates as explicit topology changes, not part of routine app deploys.

## 2a. Production cutover checklist

Before declaring production healthy, confirm this exact rollout contract:

1. The VM env file matches the portable contract above and no legacy vendor-specific database, auth, or storage variables remain in active use anywhere in the serving path.
2. The production database already has the merged `packages/db/migrations` applied.
3. The Better Auth tables exist in production PostgreSQL:
   - `better_auth_users`
   - `better_auth_sessions`
   - `better_auth_accounts`
   - `better_auth_verifications`
4. The configured S3 bucket already exists and the supplied credentials can read and write it.
5. Google OAuth provider settings, if enabled, point to `/auth/callback` on the production domain.
6. Users are told they must sign in again after cutover because old hosted-session state is not preserved.

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

## 5. Point the production domain to the web VM

This is rollback-only guidance.

Update DNS so:

- `A @` points to the web VM public IP
- `www` either points at the same IP or CNAMEs to the apex

Then update:

- Better Auth site URL
- Better Auth redirect URLs using the app callback alias, such as `https://<domain>/auth/callback`
- Google OAuth redirect settings if Google login is enabled

## 6. Validate production

This validates the fallback VM lane, not the current primary production lane.

Validate in this order:

1. `https://certscore.ai` loads from the VM and returns `server: Caddy`
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

- VM deploy of `apps/web` with `APP_FLAVOR=validation_ops`
- separate Redis via `VALIDATION_REDIS_URL`
- separate VM for `start:validation` and `start:validation:scheduler`
- optional worker image build via [`deploy-validation.sh`](/Users/benmasek/WC01/deploy-validation.sh)

For the Cloud Run validation worker pool path, prefer `deploy-validation-worker.sh` with Secret Manager-backed bindings rather than shell-exporting prod secrets into the deploy command.
Pass `DATABASE_URL_SECRET_NAME`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID_SECRET_NAME`, and `S3_SECRET_ACCESS_KEY_SECRET_NAME`, and keep the worker pool revision aligned to the portable contract.

See [docs/validation-ops-runbook.md](/Users/benmasek/WC01/docs/validation-ops-runbook.md) for the full setup and runtime validation sequence.
