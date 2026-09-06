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
  "crawlOptions": { "maxPages": 200, "concurrency": 1, "waitSeconds": 5 }
}
```

`maxPages` includes the homepage. Missing options use validated server defaults;
null, nonfinite, fractional integer fields, unknown fields and out-of-range values
are rejected. Authorized single-page requests ignore inactive crawl settings.
Unauthorized callers cannot configure crawling, even while disabling it.
API-key/Pulse/MCP creation cannot enable it; use the eligible authenticated web
session endpoint. Existing sharing and report viewing permissions are unchanged.

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
| Concurrency | 1 | 1–3; `CERTSCORE_FULL_SITE_MAX_CONCURRENCY` (ceiling configurable 1–6) |
| Wait between starts | 5 seconds | 5–300 seconds; `CERTSCORE_FULL_SITE_MIN_WAIT_SECONDS` (minimum configurable 1–60) |
| Discovered candidates | 5000 | `CERTSCORE_FULL_SITE_MAX_DISCOVERED_URLS`, up to 20000 and at least the configured target ceiling |
| Crawl wall clock | 4 hours | `CERTSCORE_FULL_SITE_MAX_SECONDS`, 300–86400 seconds |
| Retries | 1 | `CERTSCORE_FULL_SITE_MAX_RETRIES`, 0–2 |
| Sitemap documents | 25 | Bounded traversal, no external entity expansion |
| Discovery response | 2 MiB | Bounded streaming read, 10-second request deadline |
| Query variants / section targets | 20 / 50 | Conservative trap limits; each exclusion remains inspectable |
| Retry backoff | Increasing, up to 900 seconds | Longer Retry-After stops that crawl while retaining the shared site's full requested pause |

The inventory collector retains the existing 15-second tiny or 35-second standard
module budget and the homepage's actual fast/full passive protocol. It has a
37-second observation abort, bounded artifact/control calls, and the existing
75-second Lambda hard timeout. A 90-second worker lease exceeds that hard timeout;
it cannot be recycled while the crashed invocation may still run. `pageSeconds`
in the persisted safety policy is a 45-second envelope, not a new observation
window or an extra wait. No additional model calls, screenshots, consent actions,
heavy-resource stubbing or provisioned capacity are introduced.

## Execution and safety

Migration `0194_full_site_resource_crawls.sql` adds crawl, page, attempt and shared
site-safety records. Homepage readiness remains independent of crawl readiness.
The validation worker consumes verified homepage canonical evidence, discovers
targets and publishes page jobs to the existing three regional FIFO queues.
Each page uses its own FIFO group, allowing requested concurrency above one.
No new queues or scanner service are required.

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
and scroll. API/MCP scan resources add a bounded full-site reference to the same
inventory endpoint; they do not embed all raw events. Exports retain scope,
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

Release requires the migration and coordinated web, validation worker and three
regional Lambda code updates through the repository's AWS workflow. The existing
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
