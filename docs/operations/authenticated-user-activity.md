# Authenticated user activity

Authenticated `/app` activity is operational telemetry, independent of optional
analytics consent. The ingestion endpoint resolves the actor from the server
session; browser-provided actor IDs never establish authenticated identity.
Page/scan/report views, navigation, controls, forms, engagement, and errors use
the existing bounded event contract. Scan submissions and API/MCP actions retain
their existing server-side request records.

Opted-out public/marketing events remain anonymous. Operational events omit
optional actor/session IDs, campaign attribution, and entry-route attribution.
No form contents, credentials, or report contents are retained. The existing
90-day retention and platform-admin access checks apply. Historical anonymous
rows are not backfilled by inference.

Admin Users → User activity shows a paginated event timeline with timestamps,
actions, routes/controls, scan IDs and links, outcomes, and Browser/Server source.
Expandable details expose retained event IDs, UTC timestamps, confirmation time,
coarse browser/OS/device/viewport, language/country, form/control IDs, and
collection basis. Missing historical fields remain explicitly unrecorded.
The existing submissions and API summaries remain available. Admin Events search
also matches exact scan IDs.

Browser events are client-reported observations, attributed to the authenticated
sender; they are not proof that a server operation succeeded. Historical
`server_route` records are presented as **Page requested**, including in aggregate
view accounting, without rewriting their stored events. They may include prefetches.
New server document requests exclude RSC and prefetch traffic. They retain a
`page_requested` event and a bounded technical context derived from request headers;
raw user-agent strings and IP addresses are not stored.

For allowlisted app pages, the response carries an expiring HMAC proof bound to
request UUID, timestamp, exact path, and authenticated user. When that path is
visible, the browser sends the proof through the existing operational endpoint.
Verification resolves the current authenticated user, checks the proof and path,
and idempotently merges confirmation into the same event row. Either arrival order
is supported. Confirmed requests display **Browser-confirmed view** and
**Server + browser**. Confirmation establishes visible-page browser execution, not
that the content was read. An absent confirmation does not establish non-viewing.
There is no persistent visitor identifier or cross-account proof reuse.

Browser navigation events still cover soft navigation and cached back/forward
visits. Initial authenticated loads use the request/confirmation pair. Delivery
retries reuse the same proof/event identity. Browser delivery remains best-effort
(for example, a closed tab or blocked JavaScript can prevent it).

Exact links use an explicit allowlist of static app routes and UUID resource paths.
Queries and fragments are discarded before persistence. Navigation clicks may retain
a separately labelled destination; a click is not evidence of a completed visit.
Historical exact links are available only for static routes or scan routes with a
separately retained scan ID. Other missing resource IDs are never inferred.

## Deployment and verification

Apply `0202_authenticated_page_context.sql` before deploying the web changes through
the repository's AWS release flow. It adds nullable `page_path` and `target_path`
columns, without backfilling history. The existing `0201_public_page_requests.sql`
provides the shared confirmation column. Public proof remains separately signed
and anonymous. These changes do not alter 90-day retention or provision capacity.

Focused tests cover allowlisting/redaction, legacy source labels, proof binding and
expiry, authenticated ingestion, forged headers and prefetch exclusion, and real
PostgreSQL arrival ordering/idempotency. `scripts/test-authenticated-activity.ts`
exercises the actual browser component, ingestion handler, SQL and details renderer
against local PostgreSQL, including hidden-page and different-route rejection.
Run the browser harness with `PUBLIC_PAGE_TEST_DATABASE_URL` pointing to a local
PostgreSQL database; it uses temporary tables only.

The September 15, 2026 read-only traffic sample contained 452 authenticated server
page requests in seven days (about 2,000/month). One small confirmation per initial
request plus bounded metadata is estimated **below $1/month** at this traffic.
This estimate was disclosed before implementation; there is no capacity or retention
increase. It should be revisited if authenticated document traffic grows materially.

## Mobile first-scan onboarding — October 22, 2026

Empty Scan History now links to the existing Overview scan form and the sample
report. The form has a labelled URL input, a separate touch-sized submit button,
and secondary scan options. Active trial copy on Overview and Modify Plan uses
existing quota reads, including workspace overrides and consumed allowance.
An exhausted allowance never displays the “No upgrade is needed” reassurance.
No plan limit, quota enforcement, scan dispatch, report policy or deployment configuration changes.

Existing click events now identify empty-history actions, account navigation,
scan allowance, scan options and submission. The `website_scan` form reports its
own `form_submitted` event only after its client gates pass; the generic tracker
skips submission for forms declaring `data-analytics-submit="manual"`, preserving
ordinary React server-action form tracking. `form_started` remains generic.
Bounded `form_failed` features are `scan_validation:website_required`,
`scan_validation:search_results_confirmation_required` and
`scan_validation:server_rejected`. These are browser-reported outcomes; canonical
server request records still establish scan acceptance. No form values, URLs or
server error text are added to telemetry, and historical events are unchanged.

The change mainly names existing events. A small number of new validation events
is estimated below $1/month at the observed authenticated traffic (approximately
2,000 document requests/month in the existing baseline). No retention, capacity,
paid-service call or per-scan capture increase. Reassess the telemetry estimate
if traffic grows materially. This estimate was disclosed before implementation.

Verification: web typecheck; focused analytics/navigation tests; and
`scripts/test-first-scan-onboarding.ts`, which renders actual components with
intercepted local server boundaries and checks mobile/desktop layout, quota copy,
confirmation gates, repeated rejection, event deduplication and redaction.
Run from the repo root:

```bash
mkdir -p tmp/first-scan-onboarding
pnpm --filter @website-signal-risk-scanner/web exec tailwindcss -c tailwind.config.ts -i app/globals.css -o ../../tmp/first-scan-onboarding/styles.css
pnpm exec tsx scripts/test-first-scan-onboarding.ts
```

All browser HTTP in this harness is intercepted at `http://localhost:3000`;
it does not submit a real scan, contact production, or require test accounts.
