# CertScore.ai Gimbal request/lifecycle diagnostic

October 23, 2026. Owner-authorized local implementation, offline tests and exactly
one passive original-route visit. That visit is consumed. No deployment, flag
change, Lambda invocation, SDK call, privacy action or external-form visit.

## Result

The final HTML completed, while all three reviewed first-party script requests
were still pending at the collection checkpoint. This narrows the current
readiness gap to an unfinished page-loading stage; it does not establish the
cause of the script delays or prove their execution dependencies.

All times below are host callback offsets from the start of this visit, including
browser launch. Guard phases are unique URL/main-frame correlations, not joined
Network/Fetch request identities or network-phase measurements.

| Event/resource | Observed timing/state |
| --- | --- |
| Browser launch / setup ready | 472 / 562 ms |
| Original navigation / final commit | 565 / 1,329 ms |
| Original document | One verified HTTP 301 to the exact authorized target |
| Final HTML | Request 883; HTTP 200 response 1,325; finished 1,416 ms |
| Bricks | Parser request 1,414; guard pending/validated 1,884; still pending at 2,601 ms |
| Splide | Parser request 1,414; guard pending/validated 1,885; still pending at 2,601 ms |
| Search UI | Parser request 1,414; guard pending/validated 1,885; still pending at 2,601 ms |
| OneTrust stub / exact banner | No selected request observed; unknown |
| DOMContentLoaded / load | No matching loader-bound event observed before freeze |
| Terminal snapshot | Started 2,601 ms: document loading; own OneTrust global absent |
| Verification / capture plus cleanup | 2,606 / 2,626 ms |

The HTML finished 87 ms after commit, 1,185 ms before the checkpoint. Each named
script was pending for 1,187 ms at freeze, without a retained response or terminal
event. The 470–471 ms between request observation and guard notification, followed
by another 716–717 ms to freeze, are elapsed intervals rather than diagnosed
network stages. Guard validation itself rounded to zero milliseconds. This does
not prove that routing, DNS, the server or browser scheduling caused the delay.
The three requests overlap; their durations must not be added.

The earlier retained trace completed these scripts much sooner. Neither trace
can establish a permanent site behavior, and historical completion/state must
not be substituted into this visit. The passive terminal checkpoint does not
extend the authorized action-readiness window or establish opt-out readiness.

## Implementation and verification

Local diagnostic sources and evidence are in
`artifacts/gimbal-request-lifecycle-2026-10-23/`:

- `collector.ts`: seven exact resource roles, 32 candidate inspections maximum,
  first response/terminal events, redirect ordinals, frame/loader verification,
  unique guard correlations, two lifecycle events and listener teardown.
- `snapshot.ts`: one terminal readiness/own-descriptor read. No SDK methods,
  accessors, cookie reads, bodies, headers, DOM inventory or Resource Timing reads.
- `live-request-lifecycle.ts`: existing production setup helper and native TLS,
  contact-hold, public-network and exact-route guards; exclusive attempt receipt;
  before/after loader checks and unchanged absolute deadlines.
- `collector.test.ts`: 26 passing offline tests covering delayed HTML/scripts,
  duplicates, redirect identity reuse, frame/loader mismatch, lifecycle filtering,
  first-event retention, shared processing/byte/candidate/deadline caps, late
  events and zero SDK/accessor execution. All seven ordinary slots fit 2 KiB.
- `tests.log` and `typecheck.log`: 26/26 pass; focused TypeScript check passes.
- `attempt-gimbal-request-lifecycle.json` and `visit-gimbal-request-lifecycle.json`:
  the exclusive receipt and retained result. No retry occurred.
- `verification.json`: evidence/source hashes, measured sizes, limits and
  unchanged production-helper hashes.

The visit inspected 14 candidates, retained seven role slots and reported
approximately 1.24 ms combined cooperative processing. Diagnostic metadata stayed
within 2,048 bytes and the packet within 32,000 bytes. The 2,750 ms capture,
150 ms terminal reserve and existing 250 ms cleanup reserve were unchanged.
Cooperative timing rejects over-budget evidence; it does not preempt native work.
All observations are local diagnostic material, not canonical scan findings.

## Cost and further approval

Incremental recurring AWS cost is **$0**. The current 3,008 MB Lambda, six-lane
topology, scan budgets and shared $10/month within $50 allowance are unchanged.
No production runtime instrumentation was added by this task.

No flag change is recommended: enabling action dispatch would not resolve these
unfinished page requests, and this visit establishes no new action readiness.
The next cost-neutral step is retained-code/evidence analysis of the existing
routing chain. A further live visit, additional network-phase diagnostics or
profiling requires separate approval. Blocking/reordering resources, relaxing
guards, larger workers, longer budgets, SDK/state reads, actions, external forms,
canary activation, deployment and flag changes remain outside this authorization.
