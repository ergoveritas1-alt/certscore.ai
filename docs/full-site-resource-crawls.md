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
Except for the owner-approved low-resolution form snapshots and their image-safety reviews described below, no additional model calls, screenshots, consent actions, heavy-resource stubbing
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
Expired dispatch leases stop the crawl with `dispatch_admission_timeout`, fail the
unclaimed page, and cancel queued siblings. They never requeue indefinitely.
Admission rechecks parent cancellation/failure before any browser starts. Control
requests use the existing regional egress proxy and retain their current deadlines.
Expired worker leases consume the
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
until this rollout is complete. The September 7, 2026 owner-authorized production
activation sets this switch in the checked-in web/materializer and validation
deployment configuration after the coordinated release. Role eligibility and
per-crawl opt-in remain enforced. The existing
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

### Scan detail progress checks

The scan detail card uses `/api/scans/:scanId/full-site/progress` for a small,
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

### Dispatch configuration failures

The scheduler stops crawls with `dispatch_queue_unavailable` before reserving
page work when their region has no configured dispatch queue. The normal sweep
cancels queued/dispatching pages and preserves retained homepage evidence. The
results page labels the attempt unsuccessful and explains the configuration
failure. This guard does not add infrastructure or scan invocations.

Local full-site testing is available with `CERTSCORE_FULL_SITE_LOCAL_EXECUTION=1`
in `apps/web/.env.local`. Start the existing local scan stack, including its
validation worker. The worker uses isolated child processes to run the same
inventory handler and collector, then saves artifacts through local storage and
the existing token-bound finish endpoint. Page limits, pacing, leases, checksum
verification and report projection are shared with the production path. Leaving
the browser does not affect these processes. The mode is ignored in production.

The crawl is labeled Local and records `localExecution` in its policy metadata.
The region remains part of the requested baseline configuration, but local page
traffic originates from the development machine; this mode does not verify
regional behavior or Lambda resource constraints. The homepage uses its existing
configured execution path. No cloud inventory invocations or recurring capacity
are added by local mode. The failed historical attempt remains stopped.

### Report QA follow-up

Full-site exports include every inventory row in JSON. PDF includes up to 500
resource rows with an explicit limit notice and directs larger inventories to
JSON. Child controls preload the existing verified page graphs through shared
reads, show positive distinct-child counts, and reserve vendor alignment space
when absent. Estimated incremental read cost is below $1/month at 1,000 views
of three-page reports; local testing adds no cloud cost. Larger cohorts need
cost reassessment. No additional scans or model calls are introduced.

The owner selected one deduction per distinct site finding, with affected pages
attached rather than repeated deductions. `full-site-distinct-findings.v2` now
combines the persisted canonical homepage checklist with eligible additional-page
storage, tracking, session replay, fingerprinting, sensitive-surface tracking and embed checklist rows. It verifies retained artifact hashes and
page/configuration/attempt identity, validates typed runtime events, constructs
normalized concerns, applies concern policy and projects the checklist before
using the [canonical scoring policy](scoring-policy.md) identity deductions and family caps. Cookie identities and
tracking vendors are deduplicated across pages. Unknown, malformed and incomplete
additional-page evidence cannot create deductions. Consent controls, policy and action assessments remain homepage-scoped. Additional runtime categories reuse the homepage evidence adapters and require typed retained runtime evidence; missing or failed module evidence remains limited and neutral. The report explicitly states the assessed scope.

The evidence-bound score and page provenance are saved in the crawl's policy JSON
and reused by the report and full-site JSON/PDF downloads. No homepage score or
homepage report projection is rewritten. Limited results use a bounded ten-minute
process cache instead of persistent storage. Added artifact reads and one small
result write are estimated below $1/month at 1,000 three-page reports; local
testing has no paid-service usage. Reassess costs for larger cohorts. No extra
scanner invocations or model calls are used.

The summary also shows Non-essential and Review counts for cookies/storage and
requests. Cookie/storage counts use distinct identities; request counts use
retained event counts to match the request total. These inventory classifications
are separate from the verified evidence required for score deductions.

### Browser navigation and progress

Full-site execution belongs to the background validation worker and persisted
crawl/page jobs, not the results page. Leaving or closing the page cancels only
its pending report reads. The worker continues within the existing crawl limits.
On mount, tab focus, visibility restoration, or browser Back/Forward restoration,
the workspace fetches current persisted progress with caching disabled. Its
elapsed clock uses the original crawl start time and never restarts on return.
This does not introduce scanner invocations or change polling frequency.


### Collection surfaces and low-resolution form snapshots

Owner approved form-snapshot capture/storage cost on September 6, 2026, then
requested lower-resolution captures. Planning estimate: $20–$100 per million
snapshots, assuming small JPEGs and 30-day retention; actual cost depends on
volume, existing evidence retention, image size, and review/capture latency.
Images share the existing evidence artifact and its retention policy; this
change adds no browser invocation, consent/form action, retry, provisioned
capacity, or scoring effect.

`CollectionSurfaceInventory` is retained by the runtime-evidence lane and by
each additional-page inventory worker. The existing main-document inventory
limits remain 10 forms, 20 fields per form, 60 fields per page, and 250 inspected
controls. Omitted candidates remain explicitly limited. Hidden controls,
iframe contents, and controls revealed only by interaction are not covered.
Snapshots cover native/ARIA form containers; unassociated controls have no
verified form container and retain an unavailable image state.

The full-site report shows **Collection surfaces (forms)** below Resource
details: one row per retained form on each page, metadata, captured-page URL,
expandable fields, and View form for verified retained images. Form, type, field
count, method, destination, captured page, and snapshot status columns sort in
both directions. Field counts sort numerically; expanded rows retain their
identity when ordering changes. Duplicate forms
on different pages remain separate. Missing legacy inventories are unknown,
not zero-form observations. Failed/withheld/uncaptured images are unavailable;
old reports are not rescanned or supplied synthetic screenshots.

`certscore.collection-surface-snapshot.v1` binds each crop to its form reference,
exact observed document URL, and inventory hash. Captured controls must retain
their DOM position, element/input type, label, required state, and native/ARIA
container relationship. Form values are masked. Crops are JPEG quality 45,
resized without enlargement to at most 640 × 960, capped at 96 KB. Capture and
parallel image-safety review share a 2.5-second optional budget inside the
existing page deadline. Failures never erase field evidence or add findings.

Approved image bytes are retained only in the verified evidence JSON; compact
report rows retain metadata only. Publication validates inventory/source
binding and image byte hashes. View form uses the existing authenticated,
role-gated, rate-limited full-site API, validates the scan/page/attempt and
retained artifact hash, and serves only the approved JPEG with private,
no-store headers. The homepage uses its retained canonical bundle; additional
pages use their exact successful attempt artifact. No public image URL is
created. The Lambda/ZIP packaging includes sharp and its platform libraries.

### Observed network destinations

The data-transfer cell presents observed server countries and network operators;
provider headquarters and transfer-mechanism registry context remain separate in
the details. These are descriptive inventory facts, without score or finding effects.
An address associated with a browser response may be a CDN edge or cached response
metadata; it does not establish storage location or onward processing.

New response capture binds the server address to the Playwright response/request
object and retains request and redirect identity. It no longer pairs addresses by
URL queues. Service-worker responses are explicitly neutral; graph evidence keeps
its existing exact CDP cache/service-worker metadata. No additional network probe,
model call, browser session, retry or observation window is introduced.

Country and ASN lookup uses local MMDB readers, a bounded 2,048-entry cache and one
shared in-flight lookup per IP. Country registration is not substituted for physical
server location. Missing, stale, unmatched databases preserve the IP and explicit
coverage states. Database build dates identify successful lookup provenance.
Typed optional summaries survive crawl compaction and cross-page aggregation with
20-destination limits and explicit truncation. Old evidence remains old: no country
is synthesized, no historical source hashes are modified, and full coverage is not
claimed for the older evidence-file fallback. Services use the same retained summaries
as resources; there are no new per-service evidence-file reads.

Provision IPLocate Country/ASN MMDB files with `scripts/install-iplocate.ts` (see
`config/iplocate/README.md`). Free downloads require no per-IP fee or API call.
The owner selected IPLocate with attribution on `/terms#third-party-data`, not
repeated on reports. Data uses CC BY-SA 4.0; report fields are selected and
reformatted, and the third-party license continues to govern these fields.
Legacy MaxMind source identifiers remain readable without relabeling.

Database files are ignored by Git and included in scanner image/ZIP builds when
provisioned before building. Restart processes after an update. CI also needs
files supplied before the image build; a source checkout alone has no databases.
No scheduled download or production deployment is enabled by this change.
There is no scan-time network lookup or database download. One local file load
per new process is reused for all lookups; warm Lambda invocations reuse readers.
The free GitHub mirror can lag the daily provider releases; stale files fail closed.

Incremental compute estimate (not a measured latency result): 10–50 ms at about 3 GB
is roughly $0.05–$0.25 per 100,000 enrichment executions. Full-site pages and enabled
runtime lanes can each execute enrichment. Additional compact metadata is bounded;
no extra S3 operations or retention period are introduced. Database image storage,
updates and cold-start effects remain to be measured with the selected real data;
no new recurring update service has been enabled.

Local benchmark (September 7, 2026, Node 22; not a Lambda performance guarantee):
the September 7 IPLocate Country and ASN files total 96,199,783 bytes (~92 MiB).
Opening both took 24.8 ms and added 92.7 MiB RSS. Across 10,000 mixed IPv4/IPv6
addresses, direct Country+ASN lookup pairs averaged 0.0028 ms, p95 0.0069 ms.
This includes misses and measures the reader, not complete scan latency. Warm
processes reuse readers; the separate IP result cache further avoids repeated work.
No provisioned capacity, external per-IP API, or new recurring updater is enabled.

Efficiency policy: keep one lazily opened reader pair per process, with 512 decoded
records per reader and a 2,048-entry LRU of IP results (including misses). Concurrent
requests share an in-flight lookup. Expiry is bounded by the precise database age
limit and the next UTC day; database replacement still requires process restart.
Public-IP CIDR constants are pre-parsed once. Late finalized response callbacks do
not start enrichment. Non-network lanes/unused processes do not load the files.
The database image layer precedes application code so unchanged database content
can be reused across code releases. These optimizations add $0 recurring cost;
no Lambda memory setting, provisioned concurrency, API, or service is added.

A repeatable offline benchmark is available:
`pnpm exec tsx --tsconfig tsconfig.base.json scripts/benchmark-iplocate.ts`.
With the current files, first lookup including opening both files took 17.6 ms;
10,000 unique synthetic IPv4/IPv6 IPs averaged 0.0052 ms through the full enricher,
and warm repeated-IP calls averaged 0.0030 ms. These measurements include validation
and wrapper overhead. A separate 20,000-IP comparison of decoder caches reduced
retained heap growth from 2.75 MiB (10,000 entries per reader) to 0.50 MiB (512),
with direct lookup means 0.0015 vs 0.0017 ms. Results vary by machine/cohort.

Recommended release operations: fetch/validate a database pair outside scan time,
reuse the same pair across regions, and include it in normal scanner releases.
Review freshness weekly and release before the 30-day limit. Avoid downloading on
each invocation, per-IP APIs, centralized cache services, or daily scanner rebuilds
solely for geolocation updates. Automatic refresh/release is not enabled here.

### Full-site finalization and user cancellation

Discovery processes rendered links only from completed or partial page observations.
The scheduler's finalization barrier uses the same eligibility predicate. Links
retained on failed or blocked error pages neither expand discovery nor block
completion. Page limits still count attempts; failures remain failures and retain
their limitations and evidence.

The report distinguishes pages processed from succeeded, partial, and failed or
blocked pages. Once discovery and the page budget are settled, it shows
“Finalizing results”; after 60 seconds from the latest persisted scheduled-page
completion it shows “Finalization delayed” with an explanation. This is operational
status only, derived during existing report reads. It creates no evidence, score,
additional poll, model call, or scan invocation.

“Stop site crawl” is a same-origin, authenticated action restricted to the crawl's
original authorized admin/advanced user and organization. Cancellation locks the
same site keys and crawl row used by dispatch, invalidates queued/unclaimed jobs,
and leaves the initial audit and retained evidence intact. Already-active bounded
page visits may finish; they cannot retry or reopen the cancelled crawl. Late
homepage/discovery results cannot overwrite cancellation. Repeated Stop requests
are idempotent, and completed/stopped crawls retain their existing terminal state.
Cancelled crawls do not trigger a completion email. Full-site scoring remains
unavailable for a cancelled crawl; retained findings are not regenerated by Stop.

Regression coverage includes two successful pages plus eight HTTP failures with
error-page links, pending usable discovery links, ownership/organization/role
checks, late claims, active-result retention, cancellation during discovery,
repeated cancellation, and the finalization-delay display threshold. These changes
add no recurring infrastructure or per-scan model/browser costs.

The report also exposes each affected page's retained main-document HTTP status
under “pages with capture limitations — view reasons.” It distinguishes HTTP errors from
captures that could not be assessed despite a successful response or that lack a
retained status. This is descriptive only: rendered content accompanying HTTP 500
does not silently become a successful or scored page. Status fields reuse existing
page-choice rows; no additional evidence reads, scans, retries or model calls occur.

`http_error_rendered_inventory.v1` retains additional-page inventory as `partial`
when a 5xx response accompanies a completed, error-free passive capture of a
rendered HTML document. Require the final response URL and retained DOM URL to
match, a retained document identity, nonempty rendered text, a network-idle snapshot
after the response and within the capture window, and no canonical no-go text or
capture limitations. Preserve the actual HTTP status and `http_error` reason.
The checksum-bound source packet is unchanged. This does not prove the site is
healthy: partial positives are inventory only and cannot enter full-site scoring.
401/403/404/429, challenge/error bodies, absent or mismatched document evidence,
and interrupted captures keep their failure/blocked outcome. Homepage assessment
is unchanged. Existing stored failures are not silently reclassified on read.

The regression uses an actual Chromium visit to an HTML page served with HTTP 500,
plus malformed, mismatched, incomplete, authorization-error and error-body cases.
All eight September 8 incident captures were also replayed locally from retained,
checksum-verified evidence: each becomes partial, while the successful HTTP 200
comparison remains completed. No public rescans were required. At the observed
30-day volume (375 page rows, eight affected 5xx captures), retaining the previously
discarded inventory adds about 1.2 MB before compression, estimated below
$0.01/month for storage and response transfer. No new browser/model calls, retries,
waits, capacity, or retention periods are introduced.

The Lambda caller must pass a capture-failure hint only for an actual failed
capture or retained navigation timeout. An unconditional `collection_failure`
default vetoes the rendered-5xx eligibility gate even when browser capture
completed. The Lambda boundary regression now runs an actual HTTP 500 Chromium
capture through the caller's outcome derivation and inventory projection, and
checks aborted, missing-document, failed, and timed-out alternatives. Retained
incident packets are also replayed through that caller boundary with source hashes
verified; helper-only replay is not sufficient release verification.

Control-plane failures emit one bounded operational diagnostic with page/attempt
IDs, claim/finish operation, elapsed time, received HTTP status when available, and
error class. It excludes target URLs, tokens, error messages and response bodies.
This closes a diagnostic gap in the custom Lambda runtime, which posts uncaught
errors to the invocation API without logging them. Estimated log storage/ingestion
increase is below $0.01/month at the observed full-site crawl volume.

Inventory admission allows up to three seconds for the authenticated control-plane
claim, within the existing 24-second internal invocation budget and 25-second
Lambda hard limit. Slow admission reduces the remaining browser allowance; it
does not add a retry, invocation, or larger total deadline. A delayed-proxy
regression covers a two-second handshake and verifies fail-closed behavior.
The September 8 verification observed one unclaimed page alongside a 1.52-second
worker exit, consistent with the former 1.5-second admission deadline; the old
logs did not retain the exact network error. At the measured 30-day volume of
69 scheduled pages across 12 crawls, additional compute and existing capture
work enabled by this adjustment are conservatively estimated below $0.25/month,
within the preapproved cost threshold. At 100,000 ten-page crawls/month and a
10% admission-failure rate, additional browser compute could be $40–$50/month;
that scale requires a fresh cost review.
