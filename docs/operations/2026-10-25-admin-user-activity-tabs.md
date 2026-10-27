# CertScore.ai admin user activity tabs

Local implementation, October 25, 2026. The owner requested separate Scan activity
and Logged-in activity tabs, with Scan activity selected by default, after a slow
visit to the per-user Activity page.

## Observations

The inspected account had 622 associated scans and approximately 36,000 retained
activity events. The original page awaited eight data queries and rendered both
tables together. Recent production request-summary queries took 279–358 ms and
API-route aggregation took 276–325 ms. A fresh browser reload displayed the
activity heading in 1,087 ms during this investigation. The longer reported delay
was not reproduced, so these observations do not establish its complete cause.

## Changes

- Scan activity is the default. Only the selected tab's data is fetched and
  rendered; links do not prefetch the other tab or linked scan reports.
- Normal first-page reads fall from eight queries to six for Scan activity and
  three for Logged-in activity. Account information remains on both tabs.
- The heading and tab navigation render outside the selected data's Suspense
  boundary, keeping navigation available while that tab loads.
- Both tables preserve their own page and page-size parameters across tab
  changes. An out-of-range page rereads only that table's bounded rows, rather
  than repeating account, summary and count queries.
- The read path no longer attempts scan-request table/index creation. The table
  remains owned by the existing checked-in migration and write-side initialization.
- Platform-admin authorization, user predicates, stable row ordering, the
  90-day event window and existing page-size caps remain unchanged. Inactive data
  is absent from the typed response, not represented by synthetic zero counts.

## Verification and cost

74 focused tests passed, with one existing test skipped. New runtime tests execute
the real loader with guarded database adapters: inactive-history queries throw,
authorization precedes reads, missing users stop early, pagination retries are
bounded, and query counts match the selected tab. Web TypeScript checking passed.

A local browser fixture rendered the actual page and loader with database/auth
adapters and plain-link navigation. Default selection, both tab transitions,
scan/event pagination and preserved positions passed. This checks rendered
behavior and query selection, not deployed Next.js streaming or AWS latency.
Diagnostic logs, fixture requests and a screenshot are under
`/tmp/certscore-user-activity-loading/`, outside Git.

Expected recurring infrastructure cost increase: $0. The change removes queries,
markup and read-path schema work without adding capacity, storage or background
jobs. No deployment, migration, new scan or production data rewrite was performed.

## Full-site page-count correction

The owner subsequently reported incorrect page counts in Scan activity. The
per-user table still read `scans.pages_scanned`, which represents the starting-page
assessment for the newer full-site crawl path and commonly remains 1. The earlier
main Admin Scans column already had a separate crawl count, but that change had
not been applied to the per-user activity loader.

Both tables now share `ADMIN_FULL_SITE_PAGES_SCANNED_SQL`. It counts completed and
partial `full_site_pages` rows through the existing `(scan_id, status)` index.
The homepage is already one row; failed, blocked, excluded and unfinished rows
are not counted. A missing crawl uses the original scan count; an existing crawl
with zero captures remains zero. This matches the full-site report's operational
scanned-page count without loading its evidence or rebuilding the report.

Executing the actual shared SQL in local PostgreSQL against 1,056 checksum-verified
retained page rows matched the earlier cotp.group reports: EU-DE 270, EU-IR 171.
Fixtures also verified ordinary single-page scans, partial captures and zero-page
crawls. All 57 focused tests and web TypeScript checking passed. The selected
Scan activity path still makes six queries; Logged-in activity does not read
page counts. No deployment or historical rewrite was performed.

The additional indexed lookup for each visible user-activity scan row is estimated
below $1/month at normal admin usage, with no added request, capacity or storage.
This supersedes the $0 incremental-cost estimate above for this additional fix.
