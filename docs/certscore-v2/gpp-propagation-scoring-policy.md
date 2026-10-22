# Verified GPP propagation inconsistencies

Owner-authorized local implementation, October 21, 2026. California-only:
**one 5-point deduction per scan, capped at 5**, separate from the shared
recipient-based choice-enforcement family. Repeated requests, endpoints and
recipients do not increase this effect. No deployment or historical rewrite is
authorized. EU, Reject and recipient eligibility/counts remain unchanged.

## Evidence and canonical flow

Existing verified original GPC worker bytes -> typed
`requests.gppPropagation` / `gpp_propagation_evidence.v1` -> persisted v3 GPC
assessment -> normalized `privacy.gpp_propagation_inconsistency` concern ->
`california-gpp-propagation.v1` concern policy -> separate
`gpp_propagation_inconsistency` unified finding -> California score, reports,
API and Admin projections. A newly applied effect is labeled
`california-regulatory-posture.v13-gpp`; assessments without the new evidence
packet retain their original interpretation. Reading an old assessment does
not invoke a new decoder or materialize propagation evidence.

Only existing successful, exactly attributed advertising collection requests
are inspected (at most 100). Require original-byte verification, producer/session
binding, same-document request hash/timestamp and Sec-GPC proof, main-document
header and navigator delivery, and representative GPC access. Positive events
may survive unrelated incomplete comparison coverage; unavailable, failed,
changed-target or unbound evidence remains neutral.

Two positive inconsistencies qualify:

1. A bounded, canonically decoded request header lacks a supported applicable
   section explicitly named by that same request's `gpp_sid` (7 or 8). The sole
   decoder failure must be `applicable_section_missing`; unknown scopes,
   malformed headers, missing IDs, ambiguous duplicates and decode limits do
   not become findings.
2. Both literal request parameters `gpp=` and `gpp_sid=` are explicitly empty
   after the most recent prior retained GPP transition in the same document
   reported a supported loaded/ready section with GPC=true. Retain the exact
   prior state hash, section and producer timestamp. Its state hash must verify;
   a later readback, invalidated state, missing parameter, absent history or
   another session cannot supply this proof. The earlier state is temporal
   evidence of availability, not an assertion of unchanged state at request time.

Request rows retain evidence IDs, timestamps, reason codes and applicable
sections, with corroborating CMP references when required. Contract validation
binds them to the retained recipient/request diagnostics; WC01 applies the
score only through the reportable concern-policy/unified finding and matching
scan identity. The scorer verifies the exact policy/version/5-point effect and
applies it once, even if duplicate packets are supplied. Source-hash mismatch,
missing navigator proof or a non-representative visit cannot qualify.

An IAB US Privacy opt-out declaration still neutralizes that request under the
recipient-collection policy. It does not repair an independently verified GPP
propagation inconsistency. This separate risk signal is not proof of unrestricted
sale/sharing, actual downstream use, recipient culpability or a legal violation.
Customer findings present factual recipients and visit-relative timestamps,
without deduction explanations, formulas or point breakdowns.

## Budgets and cost

No new browser work, Options/Manage interaction, SDK show/open calls, lane,
invocation, navigation, model call, retry, wait, worker size or retention period.
The assessment uses only already-retained requests and bounded state history.
Additional bounded compute/metadata is estimated below $0.50/month at 100,000
scans and 30-day retention, within the below-$1 preapproval. The replay and
measured packet sizes are retained in
`artifacts/gpp-propagation-scoring-2026-10-21/`.
