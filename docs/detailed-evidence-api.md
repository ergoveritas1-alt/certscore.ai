# Detailed Evidence API parity

The on-demand report-evidence endpoint projects the same persisted report inputs and shared presentation helpers as the website. It creates no observations, findings, score effects, model calls, scanner work, or storage writes.

- `GET /api/v2/scans/{scanId}/report-evidence?section=cmp`: all 13 CMP criterion outcomes, source hash and retained prominence, request and cookie-name comparisons.
- `section=cms`: verified platform/version declarations, plugins, existing catalogue matches, advisory qualifications and source provenance. Unavailable CMS evidence remains null.
- `section=consent`: CMP audit plus existing first-layer controls and action-path projections. Visibility and consent registration stay independent.
- Other existing sections retain policy passages, accessibility examples, runtime inventories and connection evidence. Full report-evidence exports include the shared projection alongside the existing retained report content.

`detailedEvidence` version `certscore.detailed-evidence.v1` supplies section titles, recaps, display badges, numeric counts, concise row copy, actual rendered correction steps and shared report anchors. A row's `source.field` and `source.rowId` identify its retained evidence in the exported document. Shared targets identify the full evidence location on the report; a focused response can link to another section without returning it. Use source statuses for integrations and display labels for presentation. Audit rows do not automatically enter the canonical findings list.

The additional `cmpAudit` and `cmsSecurity` fields preserve safe structured support separately from display text. Existing canonical assessment/finding statuses, policy excerpts and accessibility payloads are unchanged. Raw diagnostic JSON, private document state, cookie values and deduction values are excluded from the new projection. Missing, malformed, mismatched or unusable evidence does not become a negative observation. No-go reports omit the additional audit projection. `cmpAudit.inspectionSupport` records CertScore inspector coverage independently of each criterion: an unsupported inspector does not establish that the CMP lacks a feature. This metadata does not restore the removed preference-support label in the website.

The SDK exposes generated standalone types, `getReportEvidencePage`, and bounded `getReportEvidence` reconstruction. Reconstruction rejects mixed snapshots, incomplete pages, invalid string chunks, unresolved/cyclic references and unsafe object paths. It makes no scan requests. MCP OAuth and Light use the same evidence endpoint and section selectors. Their ordinary bundles carry optional deep-section navigation, with existing navigation taking priority at tight byte limits.

Released October 13, 2026 (October 14 UTC) on AWS ECS/Fargate from `959292e886c814b651c14f633ef15052dd3ab89b`, with SDK 0.2.16 and hosted/npm MCP 0.2.27. See the [production release verification](certscore-v2/releases/2026-10-13-detailed-evidence-production-verification.md). The estimated incremental transfer and formatting cost is below $1/month at 100,000 on-demand evidence reads; no recurring scanner or model spend is added. The retained SITS full projection adds 33,763 bytes before response deduplication in the local saved-scan verification. Existing pagination and read quotas are preserved.

Regenerate and verify the public type mirrors with:

```sh
pnpm exec tsx scripts/sync-detailed-evidence-contract.ts
pnpm exec tsx scripts/sync-detailed-evidence-contract.ts --check
```
