# Report finalization follow-up: local readiness, October 8, 2026

Baseline application: `90e6f90a`. Implementation branch:
`codex/report-finalization-timing`. Production verification is required before
claiming measured latency savings.

## What the existing production logs establish

The prior owned canary `6b5add38-dac1-4e03-a154-6f83706406bd` recorded its result
at approximately 20:39:32.264 UTC and persisted its report at 20:39:36.970 UTC.
An initially scan-ID-filtered query omitted timing records without scan IDs.
A bounded unfiltered window revealed these phases in the same report stream:

- Validation input loading: 629 ms, including slow database reads.
- Terminal policy-review join: 1,009 ms. Its existing code downloads and
  verifies the canonical bundle a second time after ingestion already verified
  it. This is a retained/cached review join, not evidence of a fresh model call.
- Web remote artifact loading: 1,293 ms. The bundle and manifest begin together;
  bundle read takes 1,115 ms and manifest read takes 657 ms.
- Web materialization: 661 ms.
- Web publication endpoint's report-projection phase: 2,675 ms total.

These phases overlap and must not be summed as independent savings. The gap
was not a single four-second sleep. New measurements must distinguish worker
input readiness, publication scheduling, artifact reads and final projection.

## Implemented changes

1. Reuse ingestion's original verified canonical-bundle bytes during terminal
   policy review. Identity includes the complete URI, SHA-256 and byte length.
   The cache is bounded to 8 MiB, 32 entries and five minutes, with LRU eviction.
   Caller buffers are isolated. Oversized bundles use the ordinary uncached
   path; the existing 20 MiB review limit remains. Schema validation remains
   required on every review load. Cache hits cannot bypass evidence, ownership,
   topic, concern or projection gates.
2. Reuse regional S3 clients in the validation artifact readers and policy
   loader, avoiding repeated connection setup while retaining the SDK's
   credential refresh and existing region selection. Injected/local clients
   continue their ordinary behavior.
3. Fix timing inventories in all three consumers: scanner retained-result
   replay, web and validation. Preserve historical four/five-lane summaries and
   current six-lane summaries. Require the core consent/runtime/policy/Reject
   inventory, allow independent GPC/Accept entries, and reject duplicates,
   malformed/unknown rows or missing required lanes. This is operational
   telemetry only, with no evidence, finding or score effect.
4. Add scan IDs to artifact/publication timing logs and bounded worker timing
   records for canonical-input waiting, scheduling and HTTP publication. No
   token, policy text, cookie value, query value or body is logged.

No new lane, model call, observation window, public-site request, retry,
deadline, report regeneration, scoring rule or provisioned capacity is added.
The canonical source-generation checks, nonblocking cross-process publication
lock and atomic final persistence guard remain unchanged.

## Verification and cost

Focused tests cover byte/hash/URI identity, caller mutation isolation, expiry,
byte/entry limits, schema enforcement after cache hits, ingestion cache priming,
historical and current lane inventories, retained-result replay and stale-source
publication. Cache tests are added to the normal validation pipeline test command.
Exact-revision release gates and production verification are recorded separately.

Estimated additional timing metadata is approximately 3 KB per scan. Combined
database metadata and bounded diagnostic logging are estimated below
**$0.25/month at 100,000 scans**, within the existing allocated database and
worker capacity. This below-$1 increase was disclosed before deployment.
The cache adds no reserved capacity or persistent retention and reduces repeated
S3 reads. Owned-canary testing and bounded production reads are estimated below
$0.50 once. SITS remains on its diagnostic-contact hold and is not contacted.
