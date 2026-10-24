# CertScore.ai Gimbal availability diagnostic

October 23, 2026. Owner-approved local implementation/tests and one bounded
passive original-route visit. The visit is consumed. No deployment, flag changes,
AWS invocations, SDK calls, privacy actions or external-form visits occurred.

## Result

The exact `https://gimbal.com/` → `https://infillion.com/` 301 route was verified
with native TLS, HTTP 200 and the same final document loader before and after
the snapshot. At the checkpoint the document was still `loading`, and the own
`window.OneTrust` property was **absent**. Method discovery therefore stopped at
`root_unavailable`, before any method/prototype inspection. This run's failure
was not an accessor or method-depth rejection.

Neither of the two exact OneTrust URLs had usable completed Resource Timing
evidence. Both remain `unknown`: this does not distinguish a request not yet
started from an unfinished request or missing timing data. It does not establish
that either script was blocked or failed. The absence of the own global while
the document is loading supports delayed initialization, without identifying
its root cause or proving permanent API absence. Inherited globals were not
inspected or promoted into available SDK proof.

| Checkpoint | Elapsed from capture start |
| --- | ---: |
| Chromium launched | 390 ms |
| Original-route navigation started | 567 ms |
| Final document committed | 1,493 ms |
| Availability snapshot started | 2,602 ms |
| Snapshot and document binding verified | 2,609 ms |
| Cleanup completed | 2,626 ms |

The snapshot began 1,109 ms after final commit and took approximately 0.2 ms.
The full capture stayed within 2,750 ms. Browser Resource Timing uses its own
time origin, retained explicitly; it is not mixed with host elapsed offsets.
These are local diagnostic timings, not production Lambda measurements.

## Implemented and verified locally

Diagnostic files are under
`artifacts/gimbal-availability-diagnostic-2026-10-23/`:

- `availability-snapshot.ts`: one own-global descriptor read, at most three
  method levels, no accessor invocation, zero SDK calls. Two exact Resource
  Timing lookups retain at most one entry each and a duplicate indicator. No
  SDK objects, category state, cookie values, payloads or whole-resource logs.
- `diagnostic-bounds.ts`: same-document/loader/frame checks, absolute deadline,
  zero-call/action checks and snapshot byte/time acceptance limits.
- `live-availability.ts`: original-route guard, public-network checks, native
  TLS, contact holds, blocked extra windows/subframe navigation, one snapshot
  at deadline minus 150 ms and unchanged cleanup reserve. An exclusive receipt
  is written before launch; another execution cannot reuse the visit.
- `availability-snapshot.test.ts`: **26 passing offline tests** covering root
  absence/types, own/inherited/accessor boundaries, callable class methods,
  prototype limits, zero SDK/action/accessor invocation, exact timing lookups,
  absent/invalid/duplicate entries, atomic overruns, byte limits, changed
  documents and late-result rejection. Focused strict TypeScript check passed.

The evaluation shares the approved 10 ms cooperative processing/serialization
limit and 2,048-byte metadata cap within the 32,000-byte packet limit. Native
atomic browser operations are not preemptible by the stopwatch; overrun results
are discarded and the outer capture abort remains in place. No additional
wait, retry of a public visit, API polling or category read was introduced.

Two local preparation errors preceded the visit: an unresolved package import,
then a stale compiled v1 contract rejected the v3 route during guard setup.
The second preparation attempt launched Chromium but failed before navigation
or public target validation; its elapsed time was 782 ms. Both failure logs and
the pre-navigation receipt/result are retained separately. Source resolution
was corrected with the repository's `tsconfig.base.json`, and dispatch-schema
validation now occurs offline before reserving a visit or opening Chromium.
Only the subsequent `visit-attempt-gimbal-availability.json` run navigated to
the public site. Its output is `visit-gimbal-availability.json`; it was not
retried. Run source with `TSX_TSCONFIG_PATH=tsconfig.base.json`; do not bypass or
remove the consumed visit receipt.

## Flags, budgets and next authorization

**Keep flags unchanged.** Enabling a gate cannot make the site's global appear
earlier. In this visit even final commit occurred after the existing roughly
1,350 ms action-readiness cutoff. A late passive callable result would still
not establish enough time for authorized Settings actions and their verification.
There is no newly observed non-GPP state or successful opt-out in this result.

The inactive scoped canary could later measure the deployed Lambda behavior,
but would be an experiment, not an initialization fix. Deployment and activation
still require separate explicit approval and the existing immutable-release,
budget and two-slot gate preflight. No flag change is recommended as a remedy
for the current evidence. Further public visits, wider lookup, longer waits,
SDK/category reads, a non-GPP adapter or external-form work are not authorized
by this diagnostic's completion.

Current Lambda memory and topology are unchanged; no worker or lane was added.
The existing $10/month incremental allowance within $50 is unchanged. This
local diagnostic adds **$0 recurring AWS cost** and retains only local artifacts.
Production capture, scoring, findings and historical evidence are unchanged.

`verification.json` records source/output hashes, test results, packet sizes,
timing and the one-visit/zero-call boundaries for review. The prior reasoning is
in `gimbal-getter-retained-review-2026-10-23.md`.
