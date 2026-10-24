# CertScore.ai Gimbal document-guard timing diagnostic

October 23, 2026. Owner-approved local implementation/tests and one passive
original-route visit within the six-second diagnostic cap. That visit is
consumed; no retry or replacement visit occurred.

## Result

Navigation took **762 ms**, compared with 2,644 ms in the previous category
visit and 727 ms in the earlier six-second initialization visit. The slow
navigation did not recur. Capture and cleanup completed at **5,889 ms**.

| Existing document-guard stage | Pause | Validation start/end | Continuation send/ack |
| --- | ---: | ---: | ---: |
| Original request | 492 ms | 492 / 596 ms | 596 / 597 ms |
| Original redirect response | 800 ms | 800 / 836 ms | 836 / 837 ms |
| Destination request | 838 ms | 838 / 840 ms | 840 / 841 ms |
| Destination response | 1,244 ms | Not performed by this stage | 1,244 / 1,245 ms |

All times are host callback offsets. Original Network request was observed at
491 ms, public guard pending at 599 ms and validated at 601 ms. Thus **104 ms
of this visit's 108 ms pre-public-guard interval** was spent awaiting existing
document public-network validation. This measures the whole validation call,
including resolver work and scheduling; it is not a DNS wire-time measurement.
The other existing validations took 36 and 2 ms. Every continuation command
acknowledgment took 1 ms. There is no retained stalled continuation in this run.

This confirms the previous diagnostic's blind spot was real, but cannot
retroactively attribute its unmeasured 1,875 ms interval to DNS or validation.
One faster visit does not establish a latency distribution or a production
Lambda performance result. No guard removal, settled-DNS reuse, production
budget increase or flag activation is justified. Stop live iteration here
unless Gimbal specifically warrants another separately authorized investigation.

Final HTTP 200 committed at 1,252 ms; HTML finished at 1,311 ms. DOMContentLoaded
was observed at 2,720 ms and load at 3,806 ms. All five exact CMP resource slots
finished. At the sole 5,853 ms snapshot, the document was complete and the own
OneTrust descriptor held an object. No getter, category state or action readiness
was tested. That object presence is not proof of opt-out registration or honoring.

## Implementation and limits

Local sources are in `artifacts/gimbal-document-guard-diagnostic-2026-10-23/`.
The adapter wraps the existing redirect guard's event callback, validation
function and CDP sends without changing production code. It delegates each
existing command and validation once, adds no CDP subscriptions or commands,
and introduces no DNS lookup, retry, cache, extra visit or wait. It records
pause, validation start/end/failure, continuation send/acknowledgment/failure
and blocked outcomes. Synchronous callback context binds validation to its
document stage; command outcomes retain their own Fetch request ID and stage.
Fetch IDs are not treated as Network request IDs. The retained exact-route proof
independently binds the original and destination Fetch IDs.

Four fixed document-stage slots share the existing collector's **10 ms**
cooperative processing and **2,048-byte** output budget. Duplicate timing
bindings become explicitly limited; unknown, foreign and post-freeze events do
not create timing proof. Diagnostic failures cannot bypass or interrupt the
security guard. Existing 32-candidate and seven-resource limits remain. CMP
resource rows retain role and outcome rather than detailed timing to fit the
document timing data within the same cap. The overall packet cap stays 32,000
bytes. Processing overruns are discarded, not promoted to observed evidence.

The existing passive descriptor-only snapshot is reused, with **zero SDK calls**.
The six-second local deadline, existing terminal and cleanup reserves, isolated
context, original-route authorization, fresh public validations, native TLS,
contact hold checks, subframe navigation protection and document/loader checks
are preserved. No external form or privacy action was attempted.

## Verification, cost and remaining approvals

**46 offline tests and focused TypeScript checking passed.** Tests compare
instrumented and uninstrumented guard command/validation transcripts for success,
validation rejection, changed destination DNS, deadline, protocol failure,
unauthorized route, wrong ancestry, subframe, duplicate response and telemetry
failure. Existing resource/snapshot tests and new shared processing, deadline,
freeze, byte and ambiguity tests also pass.

The retained verification manifest confirms unchanged runtime helper, observer,
contract and Lambda handler hashes; one exclusive attempt receipt; verified
native-TLS original-route redirect; same final document loader; and the caps.
Observed usage: **26 candidates, 1.87 ms processing, 1,476 diagnostic bytes,
2,422 packet bytes**. Snapshot verification completed at 5,863 ms.

SDK calls, privacy actions, external-form visits and AWS invocations: **zero**.
Incremental recurring AWS cost: **$0**. Current Lambda configuration, six-lane
topology, production scan budgets and shared $10/month within $50 allowance
remain unchanged. No deployment, flag change or canary activation occurred.

No additional approval was needed to complete this grant. Any further live
visit, SDK/category-state read, action, time/worker/guard-policy change, deployment
or flag activation needs separate authorization. No such expansion is proposed
as a fix on this evidence.
