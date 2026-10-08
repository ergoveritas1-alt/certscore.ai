# Report publication handoff: October 8, 2026

Baseline application: `d2848c0c8bc9cddd877c091a0f8cf6ae257fa4a3`.
Scope: validation-worker orchestration only. Web, scanner runtime, evidence,
scoring, model review, observation windows and capacity are unchanged.

Completed release evidence: [production verification](2026-10-08-report-publication-handoff-production-verification.md).

## Problem and change

The previous production canary waited approximately 5.6 seconds for a validation
slot while another scan's report-publication HTTP call completed. The dispatcher
awaited that call after canonical derivation, despite the existing independent
finalization scheduler and durable publication recovery.

After canonical findings are saved, the worker checks that the existing recovery
path owns a pending request for a completed scan with a recent, verified,
production retained result and completed merge/derivation events. Only that path
may hand publication off without awaiting HTTP. The completion event and pending
request continue to share the existing atomic database statement.

Immediate handoffs are bounded to four and coalesced by scan ID. They use the
existing publisher, its shared per-scan in-flight map, two publication permits,
two separate trailing-persistence permits, token authorization, canonical-input
checks and final persistence/source guards. Saturation leaves the pending request
for the existing two-second indexed recovery sweep. Failures are caught and
logged without marking the pending request complete. Process exit loses only
the in-memory optimization; the existing durable owner remains.

Local, preview, old or unverifiable paths without that recovery owner retain the
previous awaited publication behavior. A failed recovery-owner lookup does not
admit a detached job. No new queue service, request type, model call, browser
lane, retry policy, deadline, publication path or infrastructure capacity is added.

## Local verification

The blocked-publication concurrency test proves that one sequential validation
slot processes four later derivations while the first two publications remain
blocked, without exceeding two active publications. Further tests cover
coalescing, admission saturation, failure/restart recovery, synchronous failure,
detached rejection handling, local/preview fallback and durable-source guards.
The new tests are included in the normal worker pipeline command.

Focused dispatcher/result/handoff/scheduler tests: 47 passed. Worker pipeline:
264 passed. Worker typecheck passed. Exact-source change-aware preflight and
production concurrent owned-canary results are recorded separately before any
general speed claim. Do not present the earlier 5.6-second delay as a guaranteed
per-scan saving.

## Deployment and cost

Deploy only validation through the canonical AWS helper and retain required CI,
runtime-base reuse and ECS health checks. No web or scanner rebuild is warranted.
Fresh verification uses only the owned `ergoveritas.com/testar1.html` fixture;
SITS remains on its diagnostic-contact hold.

Existing worker/database capacity and endpoint concurrency remain unchanged.
The added bounded handoff log is estimated below $0.05/month at 100,000 scans;
this below-$1 increase was disclosed before proceeding. The indexed recovery-
owner check uses the existing allocated database, with no paid request service.
Owned before/after tests and bounded production reads are estimated below
$0.50 once. No recurring capacity or retention change is introduced.
