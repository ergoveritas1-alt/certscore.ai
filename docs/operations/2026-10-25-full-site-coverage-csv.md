# CertScore.ai full-site coverage CSV — October 25, 2026

The Coverage popup now links to an authenticated, on-demand CSV of every retained
discovered page. Report filters and pagination do not limit the export. This is
the discovered URL inventory, not a claim that every URL on the website is known.
Active scans export their current state.

The 17 columns include requested/final URL, readable coverage status, issue/reason,
HTTP status, capture scope, attempt count, discovery source, UTC timestamps,
recorded page status, reason codes, crawl status/stop reason, page/scan IDs and
export time. Starting-page baseline and additional-page resource inventory remain
distinct scopes. Complete capture does not imply exhaustive testing or compliance.
Final URL is the last column. Rows show complete captures first, then capture
issues, blocked/failed outcomes, unknown outcomes, interrupted attempts, active or
pending pages, robots.txt restrictions, other crawl stops, page-limit exclusions,
crawl-safety exclusions, other excluded URLs and outside-scope URLs. Discovery
order is preserved within each priority.

Outcomes distinguish complete/partial/problem captures, unavailable results,
blocked/failed attempts, robots.txt disallow versus unverified robots.txt or an
excessive crawl delay, scope and URL exclusions, crawl safety limits, page/time
limits, cancellation and other stops. Queued, waiting-for-worker/retry and active
pages remain nonfinal. An attempted or previously captured page is not mislabeled
as never scanned. Unknown outcome/reason codes remain explicit. No findings or
score effects are created or changed.

The endpoint uses the existing full-site browser eligibility, rollout,
report-availability and read-quota checks. A single parameterized metadata query
reads all page rows and crawl state together without loading full evidence,
resource inventories or scoring projections. URL query values are redacted using
the existing display policy. CSV cells are quoted and formula-neutralized; UTF-8
includes a BOM. The response is private/no-store and uses gzip when accepted.
There is no rescan, added retained artifact, schema migration or production change.

Verification: nine focused tests passed, including status/reason distinctions,
redaction, spreadsheet-safe values, all-row exports, unavailable/access-denied and
throttled requests, and compressed/uncompressed responses. Web TypeScript passed.
An actual localhost browser download for retained scan
`4439217e-5d92-4f45-b86a-d351a983039d` contained all 727 distinct page IDs:
10 complete captures, 224 page-limit exclusions, 121 crawl-safety exclusions,
369 outside-scope URLs, two other excluded URLs and one robots.txt disallow.

Estimated recurring increment: below $1/month for 100,000 typical compressed
downloads, using existing web/database capacity and no additional storage or
scanner work. The measured 727-row file was 344,001 bytes uncompressed and
31,419 bytes gzipped (about 3.15 GB transferred for 100,000 comparable downloads).
Larger or unusually frequent exports scale with response size and request volume;
this estimate is not a spending cap. No deployment was performed.
