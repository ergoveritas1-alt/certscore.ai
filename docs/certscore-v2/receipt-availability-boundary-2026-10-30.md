# CertScore.ai receipt-availability boundary — October 30, 2026

Choice confirmation remains the highest unresolved investigation priority.
Existing runtime repairs are integrated locally and rollout-held; retained replay
does not demonstrate a stable production gain. A specific remaining collector
defect reduces the evidence available for that investigation: an already-read
receipt over 2,048 characters returns before its availability row is recorded.
The envelope marks truncation, but loses which input was present and limited.

The shared Accept/Reject collector now retains availability-only metadata for
that input when the existing limits allow. The row is available, factsLimited,
and opaque (or retains its existing API/configuration format marker), with no
category facts, value hash or newly derived setter identity. Existing exact cookie
identity may remain as source metadata. The value is not copied into the dedupe
signature, hashed, interpreted or retained. The truncation flag remains true.

Missing, measured-empty and oversized inputs stay distinct. A missing read is
unavailable; an observed empty value retains its exact empty-value hash; an
oversized value is available but its value semantics and freshness are unknown.
Availability-only deduplication is not a claim that two omitted values are equal.

The original eight-observation, sixteen-fact, 32-inspection phase limits,
four-millisecond cooperative processing limit, 7,000-character observation guard
and 8,192-byte compact envelope cap remain unchanged. New metadata uses existing
inspection/output capacity. A later in-budget value can replace availability-only
markers when output capacity is full; these markers cannot replace retained
bounded-value evidence. Eviction or any other exhaustion stays explicitly
truncated. No underlying storage snapshot, receipt decoder or decision proof is
changed or removed.

This remains `consent_receipt_capture.v1`, diagnosticOnly. Its existing optional
value hash already represents unavailable value proof. Confirmation, completion,
registration, source/control checks, scoring and findings do not consume these
metadata rows as consent witnesses. Unknown/unsupported inputs remain unconfirmed.

New boundary tests cover both actions, empty/missing/oversized values, exact
limits, redaction, value-proof omission, deduplication, phases, output priority,
CPU limits, navigation, cancellation and closure. Existing owned browser fixtures
also exercise valid, missing, mixed, partial, stale, terminal and unsupported
receipts. Added oversized CookieYes cases retain available/limited input while
remaining unconfirmed with completed observation. Removing optional capture still
preserves canonical execution. These are synthetic owned controls, not public
scans or claims about the frequency of this defect in the retained sample.

The retained historical packets cannot reconstruct omitted raw oversized values,
so no affected-site or confirmation-recovery count is inferred. Initial and
terminal confirmation remain separate. Existing consent and CMP rollout holds
remain; no historical rewrite or production inventory completion is claimed.

The combined local gate now includes both receipt suites (32 selected files),
plus the existing five typechecks. Browser fixtures require temporary localhost
servers and Chromium; sandbox permission does not authorize public traffic.
Run `pnpm test:retained-audit-fixes` for an immutable source/log-hash receipt.

Local paid usage is $0. Future marginal bounded metadata/processing overhead is
estimated below $0.10/month at 100,000 scans, not measured billing. Existing row,
byte, capture and retention allowances do not increase. No public rescan, target
visit, privacy-choice action on a public site, model/API call, cloud query/task,
new service, capacity, deployment or flag change. Dashboard pins, historical
snapshots, latest, production checkpoint, schedule and unique invocation
accounting remain unchanged. Future audit source adoption still requires its
existing source/contract review and validated publication gate.
