# AWS Web Cutover Checklist

This checklist is historical cutover material for the public web migration. The public web cutover is complete.

Current truth:

- public web production is healthy on AWS ECS/Fargate
- `certscore.ai` and `consentcheck.site` both serve from the AWS web stack
- Amplify is not the active production topology for the current SSR dependency shape

The checked-in runtime truth for deployment audits lives in [config/deployment-topology.json](/Users/benmasek/WC01/config/deployment-topology.json).
Keep that file aligned with reality whenever the authoritative live web lane changes.
Use `pnpm ops:check:live` for lane health and host correctness.
Use `EXPECTED_LIVE_GIT_SHA=$(git rev-parse main) pnpm ops:check:live` only when you want to assert that public prod has caught up to local `main`.
That file now distinguishes the long-term preferred web platform from the currently accepted AWS runtime path for the existing SSR dependency shape.
In the current AWS account and region, the accepted runtime path is `ecs-fargate`.

## Goal

This checklist originally tracked the move off the GCP VM lane. That migration goal has been completed with ECS/Fargate rather than Amplify.

The equivalent goal that was achieved was:

- login and session handling
- scan queue submission
- dashboard reads
- report rendering
- artifact access
- operational email flows

## Target apps

Historical note: this section reflects the earlier Amplify proposal, not the final production outcome.

Create two separate Amplify apps that both build from `apps/web`:

1. `certscore-ai-web`
2. `consentcheck-site-web`

Each app must have its own domain association and its own host-specific env values.

## Runtime dependencies the web app actually needs

The web runtime in `apps/web` currently depends on these classes of services.

### Required for baseline web runtime

- `NEXT_PUBLIC_APP_URL`
- `APP_FLAVOR`
- `DATABASE_URL`
- `DATABASE_READ_URL` when used
- `DATABASE_SSL_MODE` when required by the Postgres provider
- `BETTER_AUTH_SECRET`

### Required when Google auth is enabled

- `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Required for artifact-backed report and file operations

- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT` when using a non-AWS S3-compatible provider
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE` when required

### Required for outbound email features

- `GMAIL_SMTP_USER`
- `GMAIL_SMTP_APP_PASSWORD`
- `FEEDBACK_TO_EMAIL`
- `PRIVACY_REQUEST_TO_EMAIL` when not falling back to feedback email

### Required for admin and settings features

- `CERTSCORE_ADMIN_EMAILS`

### Required for optional settings or analysis features

- `GOOGLE_CUSTOM_SEARCH_API_KEY`
- `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`
- `OPENAI_API_KEY`
- `VALIDATION_NANO_MODEL`

### Validation-only or optional controls

- `VALIDATION_OPS_BASE_URL`
- `VALIDATION_TRANCO_SOURCE_URL`
- `VALIDATION_TRANCO_MIN_RANK`
- `VALIDATION_TRANCO_MAX_RANK`
- `VALIDATION_PIPELINE_ENABLED`

## Per-app non-secret Amplify configuration

Set these per Amplify app:

### `certscore-ai-web`

- `NEXT_PUBLIC_APP_URL=https://certscore.ai`
- `APP_FLAVOR=certscore`
- `BUILD_RUNTIME_TARGET=amplify`

### `consentcheck-site-web`

- `NEXT_PUBLIC_APP_URL=https://consentcheck.site`
- `APP_FLAVOR=certscore`
- `BUILD_RUNTIME_TARGET=amplify`

Keep `AMPLIFY_MONOREPO_APP_ROOT=apps/web`.

## Real cutover blocker

The repo and recent production work make the blocker explicit:

- Amplify-hosted SSR was not accepted as production because it could not safely satisfy the PostgreSQL connectivity requirement
- ECS/Fargate became the accepted AWS runtime because it could satisfy that requirement in the current account and region

Before DNS cutover, decide and implement one of these paths:

1. provide production-safe network access from the Amplify-serving runtime to PostgreSQL
2. move PostgreSQL behind private connectivity that the AWS-hosted runtime can use
3. redesign the web-serving path so public SSR no longer needs direct Postgres access for the critical routes

That decision has now been resolved in favor of ECS/Fargate.

## Amplify secret wiring checkpoint

The checked-in `amplify.yml` intentionally only writes non-secret values into `apps/web/.env.production`.

That means secrets must be handled as an explicit deployment concern. Before treating Amplify as production-ready, verify:

- Better Auth secret is available to server runtime
- database connection strings are available to server runtime
- S3 credentials are available to server runtime
- Gmail credentials are available to server runtime
- any search or model API keys required by enabled features are available to server runtime

Do not assume the checked-in buildspec alone solves this.

## Host-specific correctness checks

For each Amplify app, verify:

1. the Amplify-managed URL loads
2. `/api/version` returns:
   - `runtimeTarget: amplify`
   - the intended git sha
   - the correct host-specific `appUrl`
3. login works
4. Google auth works if enabled
5. `/api/full-scan` returns `202`
6. authenticated dashboard routes load
7. report pages load
8. artifact-backed downloads still work

## DNS cutover gate

Historical note: DNS has already been switched to the AWS ECS/Fargate web stack.

Only switch public DNS when all of the following are true for both target runtimes:

1. server-side secrets are confirmed wired
2. SSR can reach PostgreSQL safely
3. `/api/version` shows the expected runtime target for the lane being tested
4. `/api/full-scan` succeeds
5. login and auth callback flows succeed

## Rollback

If Amplify fails any gate above:

- move DNS back only if the active AWS web lane fails a critical gate
- use the current AWS web lane as the authoritative default unless an explicit rollback is required
- use `docs/deploy-gcp-vm.md` as the rollback path

## Immediate next step

The next implementation step is no longer public web cutover. It is broader AWS consolidation:

1. finish migrating remaining non-web runtime lanes to AWS where appropriate
2. retire legacy GCP and VM-only operational paths when rollback confidence is sufficient
3. keep [config/deployment-topology.json](/Users/benmasek/WC01/config/deployment-topology.json) aligned with the actual live runtime
