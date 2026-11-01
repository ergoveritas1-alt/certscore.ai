# CertScore.ai choice receipt availability projection — October 30, 2026

Choice confirmation remains the highest unresolved priority after the local
first-layer repairs. October 29's retained 190-report sample has 26 unconfirmed
initial Accept registrations and 14 unconfirmed initial Reject registrations.
Those figures are neither diagnoses nor proof of missing receipts. Further
runtime recovery from old packets is constrained by inputs never retained.
Existing CMP runtime repairs remain rollout-held.

A concrete remaining break occurs after capture: optional diagnostic receipt
availability is retained in the verified action packet but omitted from its
report projection and public confirmation summary. Consequently the recent
bounded oversized-receipt repair cannot explain availability through that path.

The canonical packet-to-report materializers now derive
`consent_receipt_availability.v1` from the existing validated capture. It binds
the aggregate to the action and original packet SHA-256. The shared stage engine
preserves it, and API/Pulse confirmation projections expose it. The standalone
public contract and OpenAPI document the same optional nullable field. Pulse's
public projection version advances to v7; no historical export is rewritten.

Baseline, initial and terminal phases retain separate counts for receipt inputs
and configuration inputs: retained, available, unavailable, limited and value
proof retained. Counts describe retained observations, not distinct cookies or
all attempted reads. The explicit coverage marker is
`retained_observations_only`. Zero retained rows never establishes that a phase
was checked or a receipt absent. Missing capture or source hash produces no
aggregate; public confirmation represents unavailable history as null. A
retained empty capture has measured zero row counts, with cancellation,
document stability, processing limits and truncation explicit.

Raw receipt values, category facts, cookie/storage identities, path hashes,
value hashes, event times and provider names are not copied into the aggregate.
The original eight-row capture cap is preserved across all phase/source groups.
Schemas reject inconsistent counts, overflow, invalidated positive rows,
unexpected fields, wrong source hashes and cross-action attachment.

These diagnostic counts are not consumed as consent witnesses. They do not
change control resolution, click/observation completion, initial registration,
terminal verification, notifications, eligibility, findings or scoring. The
same canonical evidence/concern/policy pipeline remains in use. No SDK read,
action, wait, scan budget or semantic confirmation threshold changes.

Tests reuse 26 hash/size-verified owned packets retained from the earlier local
receipt tests, including missing, mixed, preexisting, oversized and confirmed
receipts. The portable fixture preserves those synthetic packets and their
original source hashes. A controlled comparison with optional diagnostics
removed keeps every other canonical projection field identical. All 26 completed
observations and six verified decisions remain unchanged; both oversized cases
remain unconfirmed. Their availability/limitation metadata survives API and
Pulse serialization. Historical retained terminal fixtures still have unknown
receipt availability. No production confirmation gain or affected-site count
is inferred from the owned fixtures.

Run `pnpm test:retained-audit-fixes` for the focused combined gate, including
packet materializers, aggregate boundaries, API/Pulse/OpenAPI and historical
compatibility, with five typechecks and immutable source/log-hash receipts.
The dashboard's source/contract adoption remains review-gated. No repinning or
publication is included; existing snapshots/latest, audit checkpoints, release
state, schedule, project, model/reasoning and unique invocation accounting remain
unchanged.

Local paid usage is $0. Expected incremental aggregate serialization, storage
and transfer is below $0.20/month at 100,000 scans with unchanged retention;
observed aggregates stay below 2,048 bytes. This is an estimate, not measured
billing. No new public visit, rescan, cloud query/task, model/API call, privacy
action, capacity, paid retention, flag change or deployment is performed.

The next operational step remains a separately reviewed rollout/validation of
the held consent candidate. This diagnostic repair alone does not justify that
rollout or establish a confirmation-rate improvement.
