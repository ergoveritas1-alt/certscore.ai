# CertScore.ai choice-confirmation stage breakdown — October 30, 2026

Choice confirmation remains the next priority after the retained first-layer
repairs. The October 29 retained sample has 26 unconfirmed initial Accept
registrations and 14 unconfirmed initial Reject registrations. Those counts do
not identify a runtime cause. The separately retained confirmation benchmark's
two source-hash-bound regression fixtures demonstrate another important case:
initial registration can remain unconfirmed while a terminal decision is verified.
They are not new confirmations in the October 29 sample.

The pending API/Pulse confirmation summary omitted control resolution, completed
click and completed observation. Its merged diagnostic inventory also lost the
initial/terminal phase boundary and did not expose truncation. This made it
harder to identify which stage needs investigation without reopening a packet.

The existing optional `choice_confirmation_summary.v1` now has additive optional
`executionStages` and `phaseDiagnostics` objects. Current producers emit both;
older summaries remain valid. Execution stages come from the canonical stage
engine. For historical projections without a persisted execution assessment,
the same canonical execution assessor already used by API execution supplies
the assessment from validated retained evidence. No stored record is rewritten.

Initial and terminal diagnostic arrays come from the canonical stage engine.
Legacy or missing phase inventories remain null. A retained empty inventory
remains an empty array. The retained truncation flag stays explicit, with null
when unavailable. A receipt-missing reason at one checkpoint is not treated as
proof that a receipt remained absent for the entire path. Reasons alone never
verify a decision or establish its cause.

Focused regressions cover source-bound retained Accept/Reject terminal decisions,
interrupted observations after completed clicks, historical missing execution,
phase chronology, truncation, nullable/false/empty states and API/Pulse/OpenAPI
serialization. Existing action, source, target and timing validation stays in
place. Scores, findings, registration, eligibility and confirmation thresholds
are unchanged. Existing CMP runtime repairs remain rollout-held.

Run `pnpm test:retained-audit-fixes` for the combined local check and its immutable
source/log-hash receipt. Dashboard inputs, source pins, published snapshots,
production-audit checkpoint and scheduled invocation accounting are untouched.
The audit dashboard must pass its existing source/contract review before adopting
the pending public export shape; this change does not repin or publish it.

Local paid usage is $0. Estimated future marginal serialization/response overhead
for this extension is below $0.05/month at 100,000 scans, including bounded phase
arrays. No new storage/retention, SDK read, wait, model/API call, cloud task,
scan, target visit, privacy action, deployment or capture-budget increase.

The next runtime step is a source-bound review of unresolved readiness, category
and receipt blockers where the original witnesses are retained. Missing original
witnesses remain unavailable. No confirmation-rate improvement is claimed by
this diagnostic projection change.
