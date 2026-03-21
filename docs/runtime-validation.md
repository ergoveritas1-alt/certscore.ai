# Runtime Validation

This document is the practical first-deployment QA sequence for CertScore (`certscore.ai`). It is optimized for validating the real runtime path, not just static build success.

## 1. Environment readiness

Run these first:

- `pnpm --filter @website-signal-risk-scanner/web check-env`
- `pnpm --filter @website-signal-risk-scanner/worker check-env`
- `pnpm --filter @website-signal-risk-scanner/worker check-runtime`
- `pnpm --filter @website-signal-risk-scanner/worker exec node --enable-source-maps --import tsx ./scripts/check-consent-schema-cache.ts`

Expected result:

- web env check passes
- worker env check passes
- Redis connectivity passes
- Supabase service-role DB access passes
- Supabase storage bucket access passes
- Playwright Chromium launch passes
- Supabase REST recognizes the new consent snapshot/runtime columns

If a check fails:

- missing env var: update `apps/web/.env.local` or deployment settings
- Redis failure: verify `REDIS_URL` and network access
- Supabase DB failure: verify service-role key and apply migrations
- storage failure: create the bucket referenced by `SUPABASE_STORAGE_BUCKET`
- Chromium failure: run `pnpm --filter @website-signal-risk-scanner/worker playwright:install`
- schema cache failure: in the correct Supabase project, run `NOTIFY pgrst, 'reload schema';` and restart the project/API if the REST layer is still stale

## 2. Auth validation

1. Open `/login`.
2. Verify the page loads and both login options render.
3. Test Google OAuth.
4. Test email magic link.
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
   - BullMQ job is queued
   - worker logs show scan start
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

## 7. Scheduler validation

1. Set a domain to `daily`, `weekly`, or `monthly`.
2. Run:
   - `pnpm --filter @website-signal-risk-scanner/worker scheduler:sweep`
   - or `pnpm --filter @website-signal-risk-scanner/worker smoke:scheduler`
3. Confirm:
   - due domains create `scans` rows with `scan_type = scheduled`
   - scheduled scans enqueue onto the full-scan queue
   - active queued/running scans cause skip behavior instead of duplicates
4. Confirm scheduler-related events appear in `scan_events`.

## 8. Branding and client validation

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

## 9. What to watch in logs

Worker logs should show:

- worker startup summary
- Redis host and report bucket
- scan start
- crawl completion
- scoring completion
- report persistence
- PDF generation success or failure
- scheduler sweep counts

If a scan fails, check:

- scan detail page error message
- `scan_events` timeline
- worker logs for the failing stage

## 10. First production validation order

Use this order after deploying:

1. run `check-env` for web and worker
2. run `check-runtime` for worker
3. verify auth
4. verify preview scan
5. verify full scan
6. verify report render
7. verify PDF export
8. verify second scan regression
9. verify scheduler sweep
10. verify branding/client grouping
