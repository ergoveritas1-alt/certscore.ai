# Product analytics

CertScore uses first-party analytics to understand product usage and improve reliability. Users can opt out at any time.

We record limited structured events such as pages, actions, forms, scans, reports, performance, and errors. Events may include normalized routes, coarse technical context, opaque session/actor IDs, and a canonical scan ID.

Scan evidence stays in the canonical scan system. We do not record passwords, tokens, keystrokes, form contents, arbitrary page text, payment information, precise persistent location, raw IP addresses, or session replay recordings.

Opting out stops linkable journey events and clears browser analytics identifiers. Essential security, service, scan, API, MCP, and reliability telemetry may continue. Optional Google analytics requires approval.

Raw events target 90-day retention. The admin dashboard is `/app/admin/analytics`; it shows activity, sessions, actors, routes, features, outcomes, and recent events. It does not measure off-site impressions or searches that never reach CertScore.

## SEO acquisition reporting (September 14, 2026)

Google collection is restricted to production builds on `certscore.ai` or `www.certscore.ai` and still requires analytics consent. The tag ignores referral attribution only when the parsed referrer hostname is exactly `accounts.google.com`; ordinary Google Search and other referral sources remain eligible. This affects future attribution and does not rewrite historic sessions.

For acquisition, use landing-page paths and source/medium rather than the generic page title. Exclude app/admin, auth, preview/report, and other product-result routes from a *marketing page* comparison; do not remove the later scan-completion events from a session-level conversion analysis. A customer visiting the app is not automatically internal staff. First-party Admin Analytics already distinguishes external/staff traffic and remains the product-outcome reference for that segmentation.

In GA4, `scan_completed` is an outcome key event. `scan_started`, `contact_clicked`, and generic `form_submit` remain diagnostic events but are no longer key events. Existing purchase and qualified/converted-lead definitions remain intact. `registration_completed` and `first_scan_completed` have source instrumentation but were absent from the property's last 28 days of received events on September 14; do not report them as verified live conversions. The browser campaign domain ordinal is not a lifetime account-wide activation count, and the visible registration marker path is password-specific. Validate an authorized real signup/completion before using those events as a universal account funnel. Do not manufacture conversions to populate GA.

The property has an Internal Traffic exclusion filter in Testing mode. Keep it in Testing until its matches are verified against known staff activity; do not guess an IP range or activate a permanent exclusion based on geography. Production-only tag guards prevent local testing from loading GA independently of that filter.

Use Search Console for search impressions and clicks, with matching complete date windows. Keep a fixed set of query/page groups for before/after comparison. Record deployment date and the GA configuration change date separately; aggregate key-event counts across the configuration change are not directly comparable.

The live Google tag also has a saved unwanted-referral condition: **Referral domain exactly matches `accounts.google.com`**, verified by reopening the editor. This matches the repository bootstrap behavior. The GA key-event changes above were saved and verified in the live property; website source changes require the normal AWS web release.

The saved GA comparison **Organic search — guide landings** selects `Session default channel group exactly matches Organic Search` AND `Landing page + query string contains /guides/`. It retains downstream session activity. It is specifically a guide comparison, not a verified external-only or whole-site marketing cohort. Apply it to acquisition and outcome reports; use first-party staff segmentation separately.

### Post-release comparison record

Record the web release SHA/date and Search Console's recrawl dates before selecting the first complete 28-day post-change window. Compare it with the preceding complete 28 days using identical country/device/search-type filters. Retain query-level rows, including zero-click rows, for the fixed query groups `gdpr compliance checker`, `gdpr scanner`, `gdpr website scanner`, `bulk website scanner for gdpr`, and the observed cookie/Reject queries. For the consolidated guide, sum the old three URLs and the destination in the baseline so a URL migration is not mistaken for growth.

| Cohort | Baseline window | Post-change window | Impressions / clicks / CTR / position | Completed scans | Verified external registrations / first scans |
| --- | --- | --- | --- | --- | --- |
| GDPR scanner solution and fixed GDPR query group | Pending export | Pending recrawl + 28 days | Pending | Pending | Unverified until funnel validation |
| Cookie consent scanner solution | Pending export | Pending recrawl + 28 days | Pending | Pending | Unverified until funnel validation |
| Consolidated pre-consent guide family | Pending export | Pending recrawl + 28 days | Pending | Pending | Unverified until funnel validation |
| Reject walkthrough and audit checklist | Pending export | Pending recrawl + 28 days | Pending | Pending | Unverified until funnel validation |

Use the dated audit in `outputs/seo-audit-2026-09-14/seo-audit.md` as the initial snapshot, not a substitute for matching exports. Keep missing conversion data as unavailable rather than zero. Report totals and per-query changes together; changing query mix, seasonality and consent coverage prevent a clean causal claim from a simple before/after comparison.

### Contextual guide scan forms (September 26, 2026)

The GA/Meta before-consent, third-party cookie checker, and website consent audit
checklist guides embed the existing preview scan form with topic-specific guidance.
The closing action returns to that form and explains how to review another website
after the first report. These prompts do not enable a specialized test or full-site
coverage. Scan behavior, quotas, and per-scan cost remain unchanged; added fixed
infrastructure cost is $0/month. Any additional user-requested scans retain their
ordinary usage cost.

Evaluate these three landing routes as a fixed cohort using permitted linked fresh
starts and browser-observed completions, with canonical outcomes as a cross-check.
Report second-domain milestones separately with the limitations below. Record the
actual release date before starting a comparison; a source commit is not a release.
At the observed traffic volume, treat changes as directional rather than a
statistically established conversion lift.

### Scan journey measurement (September 26, 2026)

The standard website URL form records a fresh accepted scan in bounded, tab-local
journey state (at most 20 scan IDs, expiring after 24 hours). A ready canonical
report consumes that marker once to emit `scan_completed`; a full-site report
waits for the existing full-site response to report completed with no active pages.
This is a browser-observed completion funnel, not the authoritative total of server
completions. Use canonical scan records for total outcomes, including users who
leave before opening their report. Historical totals are not backfilled.

Fresh submissions include the canonical scan ID on first-party `scan_started`
events while retaining the landing route. Current public `/scan/:id` and legacy
`/scano/:id` paths also resolve scan IDs. Existing stored campaign attribution is
available on later first-party journey events; no new attribution storage is added.
Authenticated operational events continue to omit optional campaign/session identity
under the existing ingestion policy. Unknown audiences remain unknown.

Sample/shared report views, reused results, repeated mounts, reloads, and stale or
unmatched journeys do not count as fresh completions. Missing or inaccessible journey
storage fails closed. Opt-out clears pending journey state and prevents new linkable
conversion events. Google/Umami dispatch and campaign-domain milestones still require
analytics consent. Domain milestones emit only when a new first or second domain
is completed, not on repeated scans of the same domain. These remain campaign-linked,
browser-local milestones, not lifetime account activation or a server retention metric.
The separate extension flow and legacy server-action submission forms are not newly
attributed by this standard-form journey marker.

Cost estimate at the September 19–25 measured web volume (14 scans/week): fewer than
150 additional bounded event rows/month, expected below $0.01/month using existing
infrastructure and retention. No new scan, model call, polling request, service,
capacity, or retention period is introduced. Reassess before a material volume expansion.
