# CertScore.ai C2 GPC proof-capture diagnostics

October 23, 2026. Local continuation of the owner-requested audit backlog. No deployment, live scan, historical report rewrite or additional browser work.

## Problem and change

The original GPC supplemental capture reports `retentionDropped` as the difference between all completed proofs and the selected final rows. This combines proofs filtered out because they belong to an earlier main-document loader with current-document proofs evicted by the 32-proof cap. An unsupported body is a completed inspection with unresolved content, not a failed inspection or a dropped proof.

New captures use `gpc_request_capture.v2` and retain the original total counters plus `gpc_request_capture_diagnostics.v1`:

- `documentFilterApplied`: whether the producer selected a final loader.
- `obsoleteDocumentDropped`: completed proofs removed by that loader filter.
- `capEvicted`: remaining completed proofs removed by the existing recipient-prioritized cap.
- `bodyOutcomes`: counts of absent, complete, unavailable, limited and unsupported bodies across all completed proofs before filtering or eviction.
- `failureOutcomes`: counts of a missing proof result and an exception during capture. Exception messages and rejected values are not retained.

The contract reconciles the split with `retentionDropped`, the body totals with completed proofs and the failure totals with `failed`. Counts are bounded by 48. A positive cap-eviction count requires 32 retained rows. Retained rows must be consistent with the body totals. The diagnostics are required for v2 and forbidden on v1; old packets are neither upgraded nor populated with guessed counters.

Filtering is an operational action, not proof of signal delivery. A limited session can retain filtering diagnostics when verified `mainDocument` evidence is unavailable. Such diagnostics do not create document, request, collection, purpose or GPC proof. Where verified main-document identity exists, filtered rows must agree with it.

## Preserved behavior

Candidate selection, 48 inspection slots, shared header reads, 32 detailed proofs, recipient prioritization, same-request restriction retention and terminal freezing are unchanged. Missing or unsupported supplemental proof does not cancel independently qualifying URL evidence. Actual restrictions survive eviction and remain local to the original request.

No parser recipe, vendor qualification, finding, scoring policy, retention period or customer-facing copy changes. All downstream findings continue through the canonical retained assessment, concern, policy and finding/checklist pipeline. No raw bodies, headers, field names, identifiers or exception messages are added to retention.

## Evidence and verification

Frozen cohort: `20261023T184455Z-manual-307d8d57`.

The retained audit checks 308 GPC supplemental captures: 537 inspections, 517 retained proofs, 14 failed inspections, four pending inspections, zero skipped inspections and two dropped proofs. All 1,233 integrity, schema, historical-preservation and count checks pass. There are 43 unsupported retained proofs across 19 scans.

FlyTeam (`bbeb9ffd-d5ce-48ea-8c4a-8f9b44076704`) has six completed proofs and four retained proofs. Six completed proofs cannot trigger a 32-proof cap, so the original algorithm establishes that its two drops were document filtering. This is an inference from the original producer and retained counts; discarded identities and body outcomes cannot be recovered and are not written into its historical packet.

Synthetic regressions cover six-proof document filtering, combined document filtering and cap eviction, distinct-recipient retention, pending/failed/unavailable/unsupported distinctions, late callbacks, inconsistent counters, historical v1 reads, incomplete sessions and restriction preservation after eviction. The focused capture suites pass 35 tests; the contract suite passes 661. Contract, scan-core and web typechecks pass. Historical verification passes 5,279 checks across 341 completed scans with no scoring changes.

Artifacts and scripts: `artifacts/c2-proof-diagnostics-2026-10-23/`.

## Remaining C2 coverage work

C2 remains open for source-reviewed unsupported collector formats. The retained unsupported body values are unavailable; a parser expansion cannot be verified against invented reconstructions of those requests. Reddit accounts for 24 of the 43 unsupported GPC proofs in this cohort. Additional supported envelopes require exact endpoint/source review and positive and negative bounded-parser fixtures. Synthetic success must remain distinct from a demonstrated recovered production finding. The separate unsupported Reject Mixpanel proof remains unresolved.

## Cost

Only a fixed, small diagnostics object is added per GPC capture; counts require one pass through at most 48 already captured proofs. No request/header reads, waits, retries, visits, model calls, worker changes or capacity increases. Expected incremental processing and retained metadata cost is below $0.50/month at 100,000 scans/month and 30-day retention. Production remains unchanged until separate deployment authorization.
