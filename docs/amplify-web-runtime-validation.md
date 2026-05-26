# Amplify Web Runtime Validation

Historical reference only. `certscore.ai` production now uses AWS ECS/Fargate, and the CertScore Amplify app has been retired.

Use this only if an Amplify rehearsal is deliberately reintroduced for `apps/web`.

## Purpose

This check answers one narrow question:

Can the Amplify SSR runtime see the critical web environment contract after its `secrets` payload is merged into process env?

It is not a substitute for end-to-end host validation, but it catches the common failure mode where Amplify builds successfully and then fails at runtime because server secrets were not actually available.

## Command

Run from the repo root with the exact env shape that the Amplify runtime would see:

```bash
pnpm --filter @website-signal-risk-scanner/web check-env:amplify-runtime
```

The checker understands the existing Amplify secret merge path in code:

- plain environment variables
- `secrets` JSON payload merged into `process.env`

## What it validates

Critical required values:

- `NEXT_PUBLIC_APP_URL`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `GMAIL_SMTP_USER`
- `GMAIL_SMTP_APP_PASSWORD`
- `FEEDBACK_TO_EMAIL`

Conditionally required values:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` when `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`

Advisory values:

- `DATABASE_READ_URL`
- `DATABASE_SSL_MODE`
- `PRIVACY_REQUEST_TO_EMAIL`
- `APP_FLAVOR`
- `S3_ENDPOINT`
- `S3_FORCE_PATH_STYLE`

The check also attempts DNS resolution of the PostgreSQL hostname in `DATABASE_URL`.

That does not prove full network connectivity, but it catches a broken or private-only hostname before runtime traffic hits it.

## Historical cutover use

If Amplify is ever reintroduced, use this in order:

1. Verify Amplify app env and secret wiring.
2. Run `pnpm --filter @website-signal-risk-scanner/web check-env:amplify-runtime`.
3. Validate the Amplify-managed URL manually.
4. Run:

```bash
LIVE_BASE_URL=<amplify-url-for-certscore> \
SECONDARY_BASE_URL=<amplify-url-for-consentcheck> \
EXPECTED_LIVE_RUNTIME_TARGET=amplify \
EXPECTED_SECONDARY_RUNTIME_TARGET=amplify \
pnpm ops:check:live
```

5. Confirm `/api/full-scan` returns `202`.
6. Confirm login, dashboard, report pages, and artifact-backed routes work.

Only after those pass should traffic move away from the current ECS production lane.
