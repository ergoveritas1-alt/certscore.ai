# CertScore.ai recipient retention hardening

Owner-directed offline follow-up, October 22, 2026. No new public-site attempts, Options panels, deployment, historical report rewrite or SDK publication.

## Distinct collection pairs within existing caps

Busy-page compaction previously gave all collection traffic a shared priority. Enough repeated traffic from one recipient could evict a different recipient's successful request and response. A saturated fixture reproduced that loss before this change.

Compaction now protects one already-observed successful pair per distinct canonical recipient, up to 32 recipients within the existing request/response allowances. It reuses retained endpoint attributions and typed qualifications, without another vendor lookup, browser read, HTTP request or model call. Unique request/event identity, exactly one response, a retained successful status and an exact request/response URL match are required for this additional priority. Missing, failed, ambiguous or unattributed response facts cannot become success.

Navigation evidence and protected complete comparison intervals still outrank these pairs. Selection reserves their slots before adding recipients; repeated traffic fills remaining space through the existing priorities. The 140/100 and 80/60 request/response caps, original byte allowances and bounded comparison restoration remain unchanged. Selection creates no request, response, identity, confidence, finding or score effect. It does not change qualification or replace the canonical persisted assessment -> normalized concern -> concern policy -> unified finding/checklist -> scoring pipeline.

Full typed request proofs, actual processing restrictions and original interval counts/hashes remain intact. Historical bytes are not upgraded or rewritten. Retaining one representative does not establish complete vendor coverage or the absence of other recipients.

## Preserve incomplete packets after document drift

A second fixture reproduced a validation failure when a directly blocked request existed but the final main document was unverified after drift. Finalization added a current-document pre-transmission-block assertion while emitting a null main document, violating the retained contract and losing the packet.

Finalization now preserves the request with unknown delivery rather than asserting a block bound to an unverified terminal document. Verified stable-document blocks keep their original direct same-Request proof. No missing Sec-GPC header is invented, and neither a generic network failure nor diagnostic correlation becomes proof of enforcement. Finalization still freezes immediately without another read or wait.

## Evidence, budgets and results

The source-bound audit verified 80 available original/fresh GPC worker packets, containing 27 retained supplemental proofs. It found no positive supplemental proof orphaned from its raw request or response. This is an audit of those retained packets, not a global false-negative estimate.

All original 122 and 47 scan records and the ten fresh AWS results were replayed offline through canonical assessments and findings. CA assessments, recipient deduplication, EU entities and family totals are unchanged. No additional CA or EU deductions qualify from retained evidence in this pass. The preceding ten-site verification remains unchanged: four increases totaling 46 CA points against latest available evidence, Pella 33 lower in that visit, net +13. The six unreproduced Pella recipient/path pairs and SecurID's unreproduced HubSpot collection remain unresolved; absence and honoring are not established.

51 focused retention, completion, request-proof and canonical observation tests passed, including both originally failing regressions, missing/failed/conflicting response controls, stable blocked-request proof, navigation priority and comparison interval preservation. Scan-core and Lambda typechecks and the Lambda bundle passed. Original replay integrity checks and the 531 fresh downloaded artifact hashes were verified; sources and prior reports remain unchanged.

No allowance, timeout, retry, worker size, lane, model tier, retention period or infrastructure capacity was increased. Estimated incremental compute/storage below $0.50/month at 100,000 scans was disclosed before implementation under the owner's below-$1 preapproval. A local helper-only benchmark over 80 retained packets averaged about 0.015 ms per invocation across 8,000 calls; this is not a production latency or billing measurement. The function runs only when compaction is already required.

Receipts, immutable replay inputs, test logs, source hashes and internal review: `artifacts/recipient-retention-hardening-2026-10-22/`.
