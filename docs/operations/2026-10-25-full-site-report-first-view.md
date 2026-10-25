# CertScore.ai compact report first view

Local implementation, October 25, 2026. The owner selected on-demand supporting
details plus preparation of the first view during completion. No deployment,
scan, email delivery, feature-flag change or historical evidence rewrite was
performed. The earlier three-second worker-start cutoff is unchanged.

## Retained loading investigation

For `e0ea2156-d00f-4204-99d4-45cbbf51b932` (`cotp.group`, 270 scanned pages),
retained web logs show full-report requests taking 85,632 ms and 50,593 ms.
Overview assembly took 3,471 ms and 4,976 ms. The inventory/relationship stage
accounted for 57,805 ms and 24,496 ms. These are observed server stages, not
isolated database, browser rendering or network timings.

The serialized full report was 7,129,281 bytes; gzip was 608,860 bytes. It exceeded
the existing 524,288-byte cache entry limit, so repeated requests rebuilt the
report. The old completion notification path also assembled supporting details.

## Implemented behavior

- The initial authenticated report request uses `view=overview`. It returns the
  canonical saved score, complete priority findings, distinct inventory counts,
  form counts, hidden-link summary, coverage, timing and page limitations.
- Policy-text lookup, relationship-graph verification, detailed resource rows,
  form rows and bulk page evidence remain on the existing supporting-details
  path. They load when requested. Existing exports retain their full data.
- Evidence links load the supporting view, open collapsed ancestors and focus
  the requested section. Restored detailed reports retain working filters.
- The existing token-bound completion job prepares the compact view before
  notification delivery. It replaces that job's larger report assembly, rather
  than adding another job. Preparation can complete even if SMTP configuration
  is unavailable; existing claim, retry and delivery protections remain.
- The durable cache validates the scan/source fingerprint, runtime revision and
  compressed checksum. Overview and full-report entries share the existing
  128 slots, 512 KiB per-entry cap and 24-hour lifetime: at most 64 MiB of live
  compressed payloads globally. No schema or capacity change is needed.
- Changed inputs invalidate prepared views. Temporary evidence-read failures
  prevent durable and browser overview caching, including shared score loads.
  Concurrent readers in one process share an in-progress overview build.
- The optional browser entry is limited to 500,000 characters and one hour,
  bound to the scan and signed-in cache scope. Storage/quota errors fall back to
  the authenticated read path.

Existing historical reports prepare their compact view on first read. Expiry,
slot collisions or eviction require preparation again. The bounded shared cache
is an optimization; it is not a permanent report archive or a readiness gate.
Scores, classification rules, finding eligibility, provenance and capture budgets
remain canonical and unchanged. Omitted details are deferred, not empty evidence.

## Validation and cost

62 focused tests passed for overview/full-report parity, skipped supporting
reads, cold-process reuse, concurrent readers, changed sources, transient failures,
cache integrity/size/expiry/scope, rollout/access/throttle gates, completion claims,
existing stream/cooldown behavior, executive display and forms. Web TypeScript
checking passed. Local browser verification used the actual workspace component
with isolated fixtures: first open made one overview request and zero detail
requests, expansion made one detail request, refreshing the saved overview made
zero requests, and an incoming form anchor loaded and focused its section.
Sorting after restoring the detailed browser entry made a full-detail request,
with no overview request. The final workspace/cache regression subset passed
again after the restore-path check.

### Complete cotp.group retained replay

The owner subsequently requested testing against the original cotp.group scan.
A bounded read-only manifest recovered the 19 records missing from the earlier
CloudWatch export. All 559 discovered page rows matched their database payload
checksums and were restored in the original creation/id order. The complete crawl
and saved starting-page projection were also retrieved with chunk-count and
checksum validation. No new scan or historical write was performed.

The replay ran the actual report-input, canonical saved-score reader, overview,
full-report assembly and compressed-cache code. The saved starting-page projection
passed its original SHA-256/size checks, and the historical site score retained
its source binding and `full-site-distinct-findings.v7` policy. Assertions required
zero artifact rereads and zero score writes. Database reads used the verified
exported rows; source-fingerprint/cache queries used an in-memory database stand-in.
Supporting policy and relationship-graph I/O was omitted from the full-view replay,
so this does not verify those live I/O paths or measure production latency.

The overview and full path matched exactly for summary/state, coverage, timing,
finalization timestamp, score/version, complete priority findings, distinct
inventory counts/classifications, form count/coverage and failed-page details.
The retained results remained score 77, 270 scanned pages, three capture
limitations, three original priority findings, five services, 790 requests,
four cookies/storage entries, 620 embedded frames and 186 forms.

| Measurement | Result |
| --- | --- |
| Previous observed full-report JSON | 7,129,281 bytes |
| New complete first-view JSON | 65,817 bytes; 99.08% smaller |
| Previous observed full-report gzip | 608,860 bytes; above the 524,288-byte cap |
| New first-view gzip / saved cache entry | 11,555 bytes; within the unchanged cap |
| Uncached overview assembly, three local runs | 596.5 / 578.7 / 543.5 ms |
| Prepared-view reads across fresh modules, five local runs | 0.39–2.07 ms; no page or projection reread |
| Local full assembly, excluding policy/graph I/O | 3,968 ms |

The actual React workspace rendered the retained cotp.group overview in the
browser with one overview request and zero detail requests. Two fresh browser
scopes displayed it at 246 ms and 163 ms after local navigation. Opening Forms
made one detail request and exposed all 186 retained rows while keeping the score
and overview counts unchanged. Reloading restored the compact browser entry in
170 ms with zero overview/detail requests. No browser console errors occurred.
These browser timings include a local development bundle and preassembled local
responses, not the production shell, authentication, AWS database or network.

Machine-readable measurements and the first-view screenshot are retained locally
under `/tmp/certscore-report-load-investigation/cotp-results.json` and
`cotp-first-view.png`. The complete private replay inputs stay outside Git.

Expected net recurring AWS cost increase: $0. The implementation reuses the
existing completion workflow, compute capacity and bounded cache, and removes
supporting-detail reads from completion and ordinary report opening. It adds no
browser work, model calls, provisioned capacity, paid service or larger retention
allowance. Read-only production diagnostics used temporary repository-controlled
ECS SQL tasks; they do not create recurring capacity. Bulk diagnostic extraction
was bounded after an initially slow query; it does not run in the product path.

Production latency improvement remains unmeasured until a separately authorized
AWS deployment. This change does not promise a particular seconds-to-load target.

### Second cotp.group retained replay: EU-IR

The second requested scan, `29ca78cf-bc59-43d5-a10b-a92c7466cdd7`, retained
497 discovered page records and 171 scored pages. Every exported page matched
its database checksum and the ordered manifest; the crawl and starting-page
projection also passed chunk-count and checksum validation. The actual canonical
reader retained the source-bound `full-site-distinct-findings.v12` score, with
zero artifact rereads and zero historical score writes.

Retained production logs recorded an uncached full-report request at 115,610 ms:
76,336 ms in overview assembly, 29,265 ms in inventory/relationships, 777 ms in
policy/inventory preparation and 185 ms in page reading. Unlike the earlier
EU-DE example, this full report fit the existing cache and was saved successfully
at `2026-10-25T21:26:44.774109+00:00`. These stage measurements do not isolate
individual database queries or explain every millisecond of the total.

The checksum-verified production cache entry provided an exact full-report
reference. Fifteen assertions matched the new first view to that reference:
summary, network counts/classifications, coverage, timing, finalization timestamp,
score policy/value/scope, scored/limited pages, complete priority findings,
assessed storage, form count/coverage and failed-page details. Results remained
score 92, 171 scanned pages, two priority findings, four capture limitations,
five services, 444 requests, three cookies/storage entries, 277 embedded frames
and 76 forms. The two findings remain `Pre-consent storage classification review`
and `Outdated transfer framework referenced`.

| Measurement | Result |
| --- | --- |
| Checksum-verified production full-report JSON | 4,089,454 bytes |
| New first-view JSON | 33,539 bytes; 99.18% smaller |
| Production full-report gzip | 350,015 bytes; already within the existing cap |
| New first-view gzip / saved cache entry | 6,030 bytes |
| Uncached overview assembly, three local runs | 363.3 / 319.8 / 316.0 ms |
| Prepared-view reads across fresh modules, five local runs | 0.27–1.51 ms; no page or projection reread |

The actual React workspace displayed the prepared local first view in 252 ms,
with one overview request and zero detail requests. Expanding Forms made one
detail request, using the original production report as its response, and rendered
all 76 retained forms. Score and overview counts stayed unchanged. Reloading
restored the compact browser entry in 159 ms with zero overview/detail requests.
Expanding capture limitations worked from the compact entry. No browser console
errors occurred. The four retained failures were HTTP 404s on discovered URLs
ending in `/[`, not worker-start acknowledgment failures.

These are local replay and development-browser timings with preassembled HTTP
responses and in-memory database/cache adapters. Live production shell, auth,
database and network latency remain unmeasured. Supporting policy/relationship
I/O was omitted from the local full-assembly path; exact parity and browser detail
expansion separately used the saved production full report. The compact path made
no policy/relationship calls. No deployment, new scan, email, flag change or
historical write occurred. Incremental recurring AWS cost remains $0.

Private inputs, checksum metadata, machine-readable replay/browser measurements
and the screenshot are retained outside Git under
`/tmp/certscore-report-euir-replay/`. Diagnostic output was compressed, indexed
and paced after bulk CloudWatch output was truncated; the successful export
required all chunks and all 497 manifest checksums before replay.
