# Deploy `certscore.ai` And `consentcheck.site` With AWS Amplify

This is the preferred web deployment path for `apps/web`.

## Topology

- Create two separate AWS Amplify Hosting apps in the same AWS region.
- Point both apps at the same GitHub repository and the same branch.
- Use `apps/web` as the monorepo app root for both apps.
- Keep the public hosts separate:
  - `certscore.ai`
  - `consentcheck.site`
- Let Amplify deploy on Git push instead of running direct VM or Vercel production deploys.

This matches AWS Amplify's monorepo support, which requires `appRoot` and `AMPLIFY_MONOREPO_APP_ROOT` to match for monorepo apps, and its unified-webhook model, which supports multiple Amplify apps from one repository in the same region. Sources:

- [AWS Amplify monorepo build settings](https://docs.aws.amazon.com/amplify/latest/userguide/monorepo-configuration.html)
- [AWS Amplify unified webhooks](https://docs.aws.amazon.com/amplify/latest/userguide/unified-webhooks.html)
- [AWS Amplify Next.js SSR hosting](https://docs.aws.amazon.com/amplify/latest/userguide/deploy-nextjs-app.html)

## Repo prerequisites

The repo now includes the expected Amplify build inputs:

- [amplify.yml](/Users/benmasek/WC01/amplify.yml)
- [/.npmrc](/Users/benmasek/WC01/.npmrc)

Important details:

- `.npmrc` sets `node-linker=hoisted`, which AWS documents as required for pnpm monorepo builds on Amplify.
- `amplify.yml` writes only non-secret app settings into `apps/web/.env.production` before `next build`.
- `BUILD_RUNTIME_TARGET=amplify` is injected so `/api/version` and runtime audits can identify the host correctly.

## Create the two Amplify apps

Create one Amplify app for each public hostname:

1. `certscore-ai-web`
2. `consentcheck-site-web`

For each app:

1. Connect the GitHub repository.
2. Choose the production branch.
3. Mark it as a monorepo app.
4. Set the app root to `apps/web`.
5. Confirm Amplify sets `AMPLIFY_MONOREPO_APP_ROOT=apps/web`.
6. Keep the checked-in `amplify.yml` as the build spec.

## Environment configuration

Set these non-secret variables per Amplify app:

- `NEXT_PUBLIC_APP_URL`
- `APP_FLAVOR`
- `VALIDATION_OPS_BASE_URL` when needed
- `BUILD_RUNTIME_TARGET=amplify`

Recommended values:

- `certscore.ai` app:
  - `NEXT_PUBLIC_APP_URL=https://certscore.ai`
  - `APP_FLAVOR=certscore`
- `consentcheck.site` app:
  - `NEXT_PUBLIC_APP_URL=https://consentcheck.site`
  - `APP_FLAVOR=certscore`

Secrets and sensitive server-side config must be handled separately and verified before DNS cutover:

- `DATABASE_URL`
- `DATABASE_READ_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `S3_*`
- `GMAIL_SMTP_*`
- any other credential-bearing server variables

AWS documents that Next.js server-side code does not automatically see Amplify build environment variables, and that writing values into `.env.production` makes them readable from deployment artifacts. Because of that, the checked-in buildspec intentionally limits what it writes into `.env.production` to non-secret values only. Source:

- [AWS Amplify SSR environment variables](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html)

Inference from the docs:

- You should treat secret wiring as a separate cutover checkpoint, not as something the checked-in `amplify.yml` safely solves by itself.

## Domains and DNS

Associate the custom domains in Amplify:

- attach `certscore.ai` and optional `www.certscore.ai` to the CertScore Amplify app
- attach `consentcheck.site` and optional `www.consentcheck.site` to the ConsentCheck Amplify app

Use Amplify-managed certificates unless you have a reason to bring your own ACM setup.

## Verification

After each app finishes building:

1. Check the Amplify preview or production URL loads successfully.
2. Verify `/api/version` returns `runtimeTarget: amplify`.
3. Verify `appUrl` matches the intended hostname.
4. Verify auth callbacks and login pages use the correct host origin.
5. Run:

```bash
pnpm ops:check:deploy
pnpm ops:check:live
```

Use the default live check for lane and host health.
Use the explicit latest-revision check only when you are validating that public traffic has caught up to local `main`:

```bash
EXPECTED_LIVE_GIT_SHA=$(git rev-parse main) pnpm ops:check:live
```

Optional host-specific verification:

```bash
LIVE_BASE_URL=https://certscore.ai \
SECONDARY_BASE_URL=https://consentcheck.site \
LIVE_LABEL='CertScore host' \
SECONDARY_LABEL='ConsentCheck host' \
EXPECTED_LIVE_RUNTIME_TARGET=amplify \
EXPECTED_SECONDARY_RUNTIME_TARGET=amplify \
pnpm ops:check:live
```

The default deployment audit reads [config/deployment-topology.json](/Users/benmasek/WC01/config/deployment-topology.json).
While the VM lane remains authoritative, that file should continue to say `gcp-vm`.
Before or during cutover rehearsal, override the runtime targets and host URLs explicitly when validating Amplify-managed URLs.

## Cutover sequence

1. Deploy both Amplify apps from the desired Git revision.
2. Verify both apps are healthy on their Amplify-managed URLs.
3. Verify `/api/version` on both apps reports the intended git sha.
4. Update custom domain associations and DNS.
5. Re-run live checks against `certscore.ai` and `consentcheck.site`.
6. Keep the legacy GCP VM and Vercel paths available only until rollback confidence is no longer needed.

## Rollback

If Amplify cutover fails:

- keep DNS on the current serving hosts
- use [docs/deploy-gcp-vm.md](/Users/benmasek/WC01/docs/deploy-gcp-vm.md) for the legacy VM rollback path
- keep any Vercel linkage only as a temporary fallback, not the preferred steady state
