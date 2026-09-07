# Full site resource crawls

Full site is an explicit, session-authenticated opt-in for persisted organization
members with the `admin` or `advanced` role. It performs the existing homepage
audit, then visits additional public targets independently for resource inventory.
The homepage score and canonical concern, policy, finding and checklist pipelines
are unchanged. Additional-page consent, CMP, action, policy, GDPR transparency and
transport assessments are **Not assessed**.

## Creation and controls

The existing full-scan form, dashboard queue form and rescan form use
`GET /api/full-scan/options` to obtain trusted eligibility and the same policy used
by server validation. The checkbox defaults off; nested fields are absent while
off. An example session-authenticated `POST /api/full-scan` request is:

```json
{
  "domain": "https://example.com/",
  "fullSite": true,
  "crawlOptions": { "maxPages": 200, "concurrency": 4, "waitSeconds": 5 }
}
```

`maxPages` includes the homepage. Missing options use validated server defaults;
null, nonfinite, fractional integer fields, unknown fields and out-of-range values
are rejected. Authorized single-page requests ignore inactive crawl settings.
Unauthorized callers cannot configure crawling, even while disabling it.
API-key/Pulse/MCP creation cannot enable it; use the eligible authenticated web
session endpoint. The private server-only `CERTSCORE_FULL_SITE_INTERNAL_ENABLED=1`
switch must also be enabled on the web control plane and validation worker. It
is disabled by default, cannot be supplied in a request, and is never returned
to the browser, SDK, public API or MCP. Inventory viewing and exports require
an eligible authenticated browser session; ordinary homepage reports remain shareable.

The persisted parent configuration and current membership are checked again at
page-worker admission. Queue messages carry only a contract version, page/attempt
IDs and an unguessable, one-use attempt credential. They cannot supply a target,
role, callback, region override or crawl settings. Revoked membership stops the
crawl. Max pages 1 retains the homepage inventory context but does not extract
crawl links, fetch robots/sitemaps or dispatch children. OFF adds no crawl context
or child work and preserves the existing homepage dispatch payload.

## Policy and settings

The policy lives in `packages/shared/src/full-site-crawl.ts`; the web server
serializes it to the UI and persists its validated snapshot with the parent.

| Setting | Default | Allowed range / environment control |
| --- | --- | --- |
| Max pages | 10 | 1–500; `CERTSCORE_FULL_SITE_DEFAULT_PAGES`, `CERTSCORE_FULL_SITE_MAX_PAGES` (ceiling configurable 10–2000) |
| Concurrency | 4 | 1–12; `CERTSCORE_FULL_SITE_MAX_CONCURRENCY` may lower the ceiling to 4–12 |
| Wait between starts | 5 seconds | 5–300 seconds; `CERTSCORE_FULL_SITE_MIN_WAIT_SECONDS` (minimum configurable 1–60) |
| Discovered candidates | 5000 | `CERTSCORE_FULL_SITE_MAX_DISCOVERED_URLS`, up to 20000 and at least the configured target ceiling |
| Crawl wall clock | 14400 seconds (4 hours) | `CERTSCORE_FULL_SITE_MAX_SECONDS`, 300–86400 seconds |
| Retries | 1 | `CERTSCORE_FULL_SITE_MAX_RETRIES`, 0–2 |
| Sitemap documents | 25 | Bounded traversal, no external entity expansion |
| Discovery response | 2 MiB | Bounded streaming read, 10-second request deadline |
| Query variants / section targets | 20 / 50 | Conservative trap limits; each exclusion remains inspectable |
| Retry backoff | Increasing, up to 900 seconds | Longer Retry-After stops that crawl while retaining the shared site's full requested pause |

The inventory collector retains the existing 15-second tiny or 35-second standard
module budget and the homepage's actual fast/full passive protocol. It has a
20-second observation abort and a dedicated inventory Lambda with a **25-second
hard timeout**. A **30-second worker lease** exceeds that hard timeout. The worker
reserves four seconds for bounded parallel artifact writes and its completion
callback; a slow admission call can reduce the observation window. Deadline-limited
observations remain partial or failed. `pageSeconds` records the 20-second maximum.
The existing homepage Lambda keeps its 75-second timeout and observation protocol.
No additional model calls, screenshots, consent actions, heavy-resource stubbing
or provisioned capacity are introduced.

## Execution and safety

Migration `0194_full_site_resource_crawls.sql` adds crawl, page, attempt and shared
site-safety records. Homepage readiness remains independent of crawl readiness.
The validation worker consumes verified homepage canonical evidence, discovers
targets and publishes page jobs to the existing three regional FIFO queues.
Each page uses its own FIFO group, allowing requested concurrency above one.
The existing handler asynchronously forwards the credential to the regional
`-inventory` Lambda and returns without browser work or waiting. The dedicated
worker uses the same image, network, role and artifact store, with async retries
disabled; persisted leases control recovery. No new queue is required.

The shared PostgreSQL admission transaction locks canonical registrable-site
keys, reserves distinct target slots, applies the smallest active concurrency
limit and largest requested/robots wait, and checks shared backoff. Both enqueue
reservations and worker starts are paced. This applies across organizations,
workers and EU-DE, EU-IR and California queues. It can be stricter than the ideal
requested schedule under cold starts or queue delay. Wait is between starts, not
after completion and not network latency. Queued homepage audits fence new crawl
starts; the durable homepage publisher waits for already-admitted child workers
to drain before running the existing homepage/consent topology.

Retries retain their original target slot; failures and blocked attempts consume
their slot. Terminal duplicate deliveries do not add observations. Only the
representative attempt is rolled up; attempt history remains separately retained.
Expired dispatch leases requeue bounded work; expired worker leases consume the
configured retry budget. Cancellation and wall-clock limits stop pending work.
Already admitted visits can finish inside their existing deadline; live reporting
continues until those workers terminate.

Fresh browser contexts use the homepage's Chromium context settings, region,
GPC-disabled no-action baseline, and passive protocol. Context fingerprints must
match before a visit is admitted to the aggregate. Top-level navigation is limited
to the final homepage host and observed same-site redirect aliases. Robots rules
are loaded for each admitted hostname and checked on navigation redirects too.
Ordinary public third-party subresources remain enabled. Existing public-network
and DNS/SSRF checks continue to protect targets, redirects and subresources.

Rendered homepage/child links and robots/sitemap indexes seed deterministic
section-balanced selection. Meaningful queries and hash-router routes are
preserved; tracking parameters and ordinary anchors are removed. Downloads,
action/authentication paths and sensitive queries are excluded. Repeated
normalized discoveries retain a bounded source/count history. SEO canonical tags
do not merge targets. Discoveries are fetch metadata, never browser evidence.

429 and Retry-After pause the shared site. Confirmed challenges stop overlapping
crawls without identity changes or challenge retries. Repeated main-document 403
responses stop the crawl; generic HTTP failures, navigation failures and resource
failures stay distinct. Challenge/error-page resources never become a clean
inventory for the intended target. Discovery failure stops additional dispatch
and leaves the homepage report available.

## Evidence, aggregation and report

Checksummed inventory and source packets live below the existing regional parent
artifact prefix and inherit its storage/lifecycle policy. Page observations and
compact classified identities are persisted independently. No cookie/storage
values or request-query values enter public summaries or details. Requested and
final display URLs retain query keys with values redacted; source packets remain
private. Every drill-down retains page, attempt, configuration and source hashes.

`aggregateFullSite` is the sole counting implementation, consumed by the server
report loader, paginated JSON detail endpoint and existing JSON/PDF export route:

- Service identity uses the canonical product/service ID, not vendor name.
- Cookie identity includes exact name, domain, path and partition.
- One identity on many pages remains one identity with many page occurrences.
- Genuine request events and iframe instances are counted separately; neither is
  added to service/cookie counts to create a grand resource total.
- Only comparable, fresh, no-action observations contribute. Homepage post-Accept,
  post-Reject and GPC conditions are excluded.
- Partial positive evidence contributes with its page limitations. Failed,
  blocked and unvisited pages have unavailable inventory counts, never absence.
- An incomplete or mismatched homepage baseline disables “Not observed on
  homepage” comparisons. Unknown and mixed categories remain visible.

The full-site header shows settings, actual coverage, restrictions, condition and
stop reason. The workspace opens on Resources with clickable summaries and
category bars, Beyond the homepage, Most widespread and Pages to review panels.
Resources and Pages provide search, typed filters, sorting, 50-row pagination and
lazy page evidence. Homepage audit remains a separate tab, with its existing score
labeled “Homepage audit score.” Live refresh preserves filters, selected evidence
and scroll. Public API/MCP scan resources and SDK contracts do not advertise
Full site or link to inventory. Eligible browser-session exports retain scope,
configuration, coverage, timing and page attribution.

Instrumented metrics include crawl/homepage timestamps, total wall time, homepage
audit duration, crawl elapsed time, per-page observation duration, completed-page
median/slowest duration with sample count, and measured admitted-worker peak.
Aggregate backoff duration and network load latency are not currently measured;
the report shows them as unavailable rather than inventing zeroes. Discovery
exhaustion, target-job completion and page-observation completeness are distinct.
“All discovered eligible targets attempted” does not claim that every website
page was discovered or successfully observed.

## Cost approval and release

The owner approved the planning estimate of **$0.002–$0.01 per additional page
attempt**, approximately **$0.40–$2 for a 200-target crawl**, or **$40–$200/month
for 100 such crawls**. The default 10-target crawl adds about **$0.02–$0.09**.
Actual spend depends on duration, retries and retained evidence volume. This uses
existing AWS Lambda/queue/storage infrastructure; no recurring provisioned
capacity or model API usage is added. Pricing basis: [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/).

Release requires the migration, the Terraform-managed 25-second inventory function
in all three regions, and coordinated web, validation worker and Lambda code updates
through the repository's AWS workflow. `deploy-fast.ts` promotes the same verified
image digest to both homepage and inventory functions. Keep the private switch off
until this rollout is complete. The existing
dispatch publisher enablement/queue URLs are reused. Apply the migration first,
update all three regional Lambda handlers, then the web control plane, and finally
the validation publisher/scheduler. This prevents child jobs reaching an older
handler. The inventory worker's
`CERTSCORE_FULL_SITE_CONTROL_ORIGIN` defaults to `https://certscore.ai`; use a
separately reachable HTTPS control origin for an isolated deployment. No production
migration, deployment or verification scans were performed as part of local tests.

## Verification

Local verification passed 180 focused/regression tests plus the 201-page browser
harness. Web, validation-worker, scanner-core and Lambda type checks passed; the
shared/database builds, Lambda bundle and frozen offline lockfile install passed.

Focused tests cover role/options validation, ordinary payload compatibility,
normalization/robots/traps, atomic budgets, shared overlap limits, pacing,
Retry-After, duplicate delivery, membership revocation, crash recovery,
cancellation, identity/event aggregation and the 200-page case. Real Chromium
fixtures verify fresh contexts, normal scripts/images/frames, no policy retrieval
or consent click, redaction and exclusion of post-action network evidence.

The local UI harness uses real PostgreSQL report loading over 201 page records,
checks mixed/persistence filters, lazy evidence, export parity, bounded initial
payloads, admin/member/anonymous visibility, nested controls, live filter retention
and desktop/mobile layout. It does not contact production or public scan targets.

```sh
pnpm exec tsx --tsconfig tsconfig.base.json --test packages/shared/src/full-site-crawl.test.ts
pnpm exec tsx --tsconfig tsconfig.base.json --test packages/certscore-scan-core/src/full-site-inventory.test.ts
FULL_SITE_TEST_DATABASE_URL=postgresql://127.0.0.1:55491/full_site_test pnpm exec tsx --tsconfig tsconfig.base.json --test apps/validation-worker/src/full-site/scheduler.test.ts
FULL_SITE_TEST_DATABASE_URL=postgresql://127.0.0.1:55491/full_site_test NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig tsconfig.base.json scripts/test-full-site-report.ts
```

The last two commands require a disposable local PostgreSQL database named
`full_site_test`; the scheduler test creates its minimal fixture schema. Run them
sequentially. The remaining release verification is a deployed AWS queue/control
plane round trip after the coordinated release is separately authorized.


September 6 owner adjustments: concurrency defaults to 4 with a hard maximum of
12; wall clock defaults to 14400 seconds; observation/Lambda/lease limits are
20/25/30 seconds. The existing cost approval remains the planning envelope.
Async forwarding adds one invocation per child (about $0.004 per 20,000 pages,
excluding minimal routing compute); the shorter child timeout reduces the maximum
compute envelope. No reserved or provisioned capacity is added. Dedicated log
metadata is estimated below $1/month at the approved 100-crawl planning volume.

Robots policy is retained per permitted host before any child dispatch. A universal
Disallow with no Allow exception stops additional crawling without fetching any
sitemap; the report explains that the separate homepage audit is still shown.
Subset restrictions apply to discovered URLs, sitemap fetches and child main-document
redirects. Disallowed URLs remain visible as excluded and the report explicitly
states that coverage is restricted. Discovery redirects are not followed (fail
closed), and unavailable/unverifiable robots policy or excessive crawl delay stops
additional crawling with an explicit report limitation.

September 6 visibility restriction: use “Full site” only on the private scan option for eligible admin/advanced sessions. Site pages, report headings, accessible labels, PDFs and errors use neutral scan/report wording. Do not add marketing, navigation, pricing, help, API or MCP promotion for this capability. Internal identifiers and crawl behavior are unchanged.


Completion emails are owner-requested transactional notifications. Migration
0195 creates a durable delivery row only when a new crawl is created; historical
crawls are not backfilled. The validation scheduler dispatches notification work
independently of crawling, after completed/stopped crawls have no remaining page
jobs. Cancelled crawls do not send a completion email. A one-use hashed credential
lets the existing web control plane resolve the requesting user's account email
and canonical aggregate; callers cannot supply a recipient or summary.

The existing Gmail configuration sends a neutral “Your scan is complete” summary
of complete/partial/blocked page visits, distinct observed services/cookies,
request events, elapsed time, robots restrictions and a report link. No model
calls or new findings/scoring are introduced. Delivery has at most three dispatch
attempts. Failures before SMTP delivery can retry; ambiguous delivery or a crashed
sending process is retained as `uncertain` for operational review, without an
automatic duplicate. SMTP itself cannot promise exactly-once delivery.

Deploy migration 0195 before the updated web and validation worker. Existing web
Gmail secrets are reused; no worker mail credentials or new email provider are
needed. At the approved 100-crawl/month volume, incremental persisted state and
processing are estimated below $1/month; existing Gmail has no added per-message
service charge. No real emails were sent during local verification.

## Compact dashboard and homepage metadata (September 6, 2026)

The report opens on Homepage audit. Eligible authenticated report links use `/app/scans/:id`; authenticated public links redirect there. Crawl controls appear only within the authenticated Scan from menu and remain guarded independently by the server's private flag and admin/advanced membership check. Public forms and MCP/API credentials cannot launch this option.

Resources aggregates retained resource identities and events across independent visits. Pages attributes observations and coverage to individual URLs. “Observed on other pages” compares positive observations with the homepage visit; it is not proof of absence. Excluded links remain in export/scope accounting but are omitted from on-site page recommendations and the default page table. Inventory tables load bounded batches on scroll, show at most eight rows in the viewport, and do not expose search/filter forms or pagination buttons.

Every new homepage runtime scan can retain bounded `certscore.site-metadata.v1` declarations and same-origin WordPress asset indicators in its existing document read. The coordinator retains these separately as `runtimeMetadataSnapshots`; they never replace consent-owned DOM evidence. Verified source-hash-bound observations persist as `certscore.site-metadata-projection.v1` in runtime artifacts and are rendered under Site metadata. Legacy/unverified/missing metadata remains unavailable. WordPress version is shown only when explicitly declared in generator metadata; asset query versions are not WordPress version evidence. Industry reuses the existing estimated benchmark and is labelled estimated. None of these descriptive fields creates findings or affects score.

No new model calls, waits, network probes or browser invocations are added by metadata capture. Estimated incremental metadata storage is below $1/month at 100,000 scans/month and 30-day retention. The separate, owner-requested ErgoVeritas same-site embed canary is also estimated below $1/month at 100,000 visits.

### Additional-page relationship evidence

Owner approval on September 6, 2026 covers passive parent-child graph capture
within the previously approved $5/month ceiling at 10,000 additional pages/month.
Inventory visits now reuse the canonical runtime graph collector in the same
browser session. The existing 1,000-node, 2,000-edge and 128 KiB graph limits
apply; this adds no browser invocation, model call, capture window, or S3 object.
The local browser regression retained 35 nodes and 39 edges in 19,696 bytes.
Incremental monthly cost is expected to remain below the approved $5 ceiling:
10,000 capped graphs add at most 1.22 GiB/month to the existing artifact stream
(before inventory reference metadata). Storage accumulates according to the
existing retention policy; this estimate assumes the previously reviewed first
year and bounded on-demand graph reads. Production compute billing has not been
measured by this local validation. Re-estimate before increasing volume,
retention, graph limits, browser budgets, or read frequency.

The raw graph is retained in the existing page evidence artifact. Completion
verifies that artifact's hash/size, the graph's internal hash, and its exact
page/attempt capture identity before recording graph availability. Authenticated
reads repeat artifact and identity verification and use the canonical evidence
read-rate policy. Resource node references remain page-specific. The details
panel can load the graph for each selected page; graphs are never merged across
page visits. Missing or invalid graphs remain unavailable and do not change
inventory counts, findings, consent assessment, or scores. Legacy records are
not backfilled.

The report header uses non-interactive summary cells. “Site score” displays the
existing homepage diagnostic score with an explicit homepage scope. Additional
pages still receive inventory-only scans. Site identity and the next-scan form
are shared above both report tabs; the scan options use a Full site switch.

### Overview progress checks

The Overview scan card uses `/api/scans/:scanId/full-site/progress` for a small,
requester- and organization-scoped counters response. It checks every 15 seconds
while visible, permits one request at a time, aborts on navigation/backgrounding,
and stops when the crawl or homepage fails or reaches a terminal state. Failed
checks back off to 120 seconds and honor `Retry-After`. The route uses the canonical
status read quota and does not load artifacts, rebuild reports, or query history.

The bar counts processed pages and separately labels completed, partial, and
unsuccessful outcomes. Until discovery finishes, the requested page limit is an
upper bound. ETA is approximate, based on recorded page durations, effective
concurrency, and effective spacing; it is unavailable before a timed page outcome.
Active scans do not display 100% before terminal publication.

Estimated incremental cost: below $1/month on existing provisioned services for
1,000 scans/month viewed for ten minutes each (at most 40,000 small status checks).
No additional capacity, scan invocations, model calls, or retained evidence are
introduced. Cost and request volume scale with concurrent viewers and viewing time.
