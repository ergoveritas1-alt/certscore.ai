# Runtime Validation

This document is the practical first-deployment QA sequence for CertScore (`certscore.ai`). It is optimized for validating the real runtime path, not just static build success.

`WC01` no longer owns the primary scanner runtime. Use this document for:

- `WC01` web and validation runtime checks
- shared-database contract validation between `WC01` and the standalone scanner

Use `WS01` for scanner-runtime-specific deploy and operational validation.

## 1. Environment readiness

Run these first:

- `pnpm dev:storage:local`
- `pnpm --filter @website-signal-risk-scanner/web check-env`
- `pnpm --filter @website-signal-risk-scanner/web check-runtime`
- `pnpm --filter @website-signal-risk-scanner/validation-worker check-env`
- `pnpm --filter @website-signal-risk-scanner/validation-worker check-runtime`

Expected result:

- local MinIO starts against the `apps/web/.env.local` S3 endpoint when that endpoint is local
- the configured `S3_BUCKET` exists in local MinIO
- web env check passes
- web runtime check passes
- validation env check passes in `WC01`
- PostgreSQL access passes
- S3-compatible storage access passes
- Playwright Chromium launch passes
- required tables and columns are present in PostgreSQL
- Better Auth tables are present in PostgreSQL

If a check fails:

- missing env var: update `apps/web/.env.local` or deployment settings
- database failure: verify `DATABASE_URL` and apply migrations
- storage failure with `ECONNREFUSED` on `127.0.0.1:9000`: start `pnpm dev:storage:local`
- storage failure after MinIO is live: verify the bucket referenced by `S3_BUCKET`
- auth-table failure: apply the latest migrations and confirm the Better Auth tables exist in the active PostgreSQL database
- Chromium failure: run `pnpm --filter @website-signal-risk-scanner/validation-worker exec playwright install chromium` for `WC01` validation, or the equivalent `WS01` install flow for the standalone scanner

Local validation execution also requires the standalone scanner service from `WS01`:

- `pnpm dev:scanner:local`
- `pnpm dev:validation:worker`

## 2. Auth validation

1. Open `/login`.
2. Verify the page loads and the configured login options render.
3. Test Google OAuth if enabled.
4. Test email/password or verification flows as configured.
5. Confirm first login creates:
   - `users` row
   - `organizations` row
   - `organization_members` row
6. Confirm redirect to `/app`.

## 3. Preview scan validation

1. Open `/`.
2. Submit a public domain such as `example.com`.
3. Confirm a preview `scans` row is created with `scan_type = preview`.
4. Confirm the preview page transitions:
   - queued
   - running
   - completed
5. Confirm the signup CTA appears.

## 4. Full scan validation

1. Log in.
2. Add a domain from `/app/domains`.
3. Open the domain detail page.
4. Trigger a full scan.
5. Confirm:
   - `scans` row is created
   - scan status remains `queued` until the standalone scanner service claims it
   - scanner-service logs in `WS01` show scan start
   - scan transitions to `running`
   - scan transitions to `completed`
6. Confirm DB persistence:
   - `scan_pages` rows exist
   - `findings` rows exist
   - `risk_scores` row exists
   - `score_breakdowns` rows exist
   - `reports` row exists

## 5. Report and PDF validation

1. Open `/app/reports`.
2. Open the latest report.
3. Confirm the report renders:
   - score cards
   - executive summary
   - top risk drivers
   - categorized findings
4. Confirm PDF state is visible on the report page.
5. Wait for PDF generation.
6. Confirm:
   - `reports.pdf_status = generated`
   - `reports.pdf_path` is populated
   - download route works for the authenticated organization

## 6. Regression validation

1. Run a second full scan on the same domain.
2. Confirm a `scan_regressions` row is created for the newer scan.
3. Confirm the scan detail page shows:
   - new findings count
   - resolved findings count
   - persisted findings count
   - score delta
4. Confirm the report page shows the compact “Changes since previous scan” section.
5. For the first completed scan on a domain, confirm baseline messaging appears instead of a delta.

## 7. Signal enrichment validation

1. Run a full scan on a domain with likely public legal pages.
2. Open the scan detail page.
3. Confirm the “Signal enrichment workflow” card shows:
   - `Scanner`
   - `Nano Doc Retrieval`
   - `Nano Doc Signals`
   - `Merged Signals`
   - `Unified Findings`
4. Confirm:
   - `Actual mode` is `Parallelized` for new scans
   - `Merged signals` becomes `Ready`
   - `Findings` becomes `Ready`
5. Run:
   - `pnpm --filter @website-signal-risk-scanner/validation-worker inspect:signal-enrichment --scan-id <scan-id>`
6. Confirm the inspector reports:
   - document sources present for privacy/terms/cookie pages when available
   - nano signals persisted in `scan_signals`
   - workflow stage completion events
7. If the pipeline looks wrong, inspect:
   - `scan_document_sources`
   - `scan_signals`
   - `scan_events`

## 8. Scheduler validation

1. Set a domain to `daily`, `weekly`, or `monthly`.
2. Run:
   - the standalone scheduler flow in `WS01`
   - or the legacy compatibility sweep in `WC01` only when you are intentionally validating that carryover path
3. Confirm:
   - due domains create `scans` rows with `scan_type = scheduled`
   - scheduled scans are claimed by the standalone scanner service
   - active queued/running scans cause skip behavior instead of duplicates
4. Confirm scheduler-related events appear in `scan_events`.

## 9. Branding and client validation

1. Create a client in `/app/clients`.
2. Assign a domain to that client.
3. Update organization branding in `/app/settings`:
   - brand name
   - primary color
   - optional logo URL
4. Run a new scan.
5. Confirm the branding appears lightly in:
   - web report header
   - PDF header/footer

## 10. What to watch in logs

Relevant runtime logs should show:

- standalone scanner service startup and heartbeat behavior
- scan start
- nano document retrieval start/completion
- nano document enrichment start/completion
- signal merge completion
- unified finding derivation completion
- crawl completion
- scoring completion
- report persistence
- PDF generation success or failure
- scheduler sweep counts when applicable
- validation runtime startup if validation is enabled in `WC01`

If a scan fails, check:

- scan detail page error message
- `scan_events` timeline
- standalone scanner logs for the failing stage

## 11. First production validation order

Use this order after deploying:

1. run `check-env` for web and the relevant runtime paths
2. run `check-runtime` for the relevant runtime paths
3. verify auth
4. verify preview scan
5. verify full scan
6. verify signal enrichment workflow
7. verify report render
8. verify PDF export
9. verify second scan regression
10. verify scheduler sweep
11. verify branding/client grouping
