# Detailed Evidence API parity

The on-demand report-evidence endpoint projects the same persisted report inputs and shared presentation helpers as the website. It creates no observations, findings, score effects, model calls, scanner work, or storage writes.

- `GET /api/v2/scans/{scanId}/report-evidence?section=cmp`: all 13 CMP criterion outcomes, source hash and retained prominence, request and cookie-name comparisons.
- `section=cms`: verified platform/version declarations, plugins, existing catalogue matches, advisory qualifications and source provenance. Unavailable CMS evidence remains null.
- `section=consent`: CMP audit plus existing first-layer controls and action-path projections. Visibility and consent registration stay independent.
- `section=policy`: policy/cookie disclosures plus typed `privacyAuditEvidence` (verified choice links, unverified candidates, retained notice passages and provenance). California-focused reports include the matching `privacy` display section. Controls were not exercised; notice topics are retained passages, not a completeness assessment.
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

The October 14 follow-up is live from `94399fef7c45f348ef27da535198f783670f61f2`, with SDK 0.2.17 and MCP 0.2.28. It adds California privacy-choice evidence to shared/full and focused policy exports, preserves typed MCP proof during compaction, and simplifies legacy display summaries without changing assessments. See [follow-up production verification](certscore-v2/releases/2026-10-14-detailed-evidence-fixes-production-verification.md).

### CMP inventory tables

`cmpAudit.rows[].supportingEvidence.inventory` optionally carries bounded,
value-free table evidence:

- `services`: service `name` and `source` (`cmp_api_inventory` or `labelled_control`).
- `declarations`: cookie/pattern `name`, `purpose`, `duration`, and declaration `source`.
- `cookies`: observed `name`, `matchedPattern` (null means no match), and
  `observedIn` (`before_choice`, `after_accept`, or both).

Each list is capped at 100 entries. Match results use the canonical deterministic
wildcard comparison; a match indicates declaration coverage, not correct consent
handling. Before-choice and confirmed-Accept observations remain distinct.
Names, purposes and durations are retained text; missing fields remain empty in
JSON and display as “Not listed.” Cookie values, document tokens and unrelated
runtime diagnostics are excluded.

These optional fields flow through the persisted CMP assessment, normalized
concern policy, and shared report projection. API report-evidence pages, SDK
reconstruction and MCP evidence pages carry the same fields. Missing historical
lists are not reconstructed from counts. Existing assessments and source hashes
remain unchanged on read; older retained bundles require an explicit verified
materialization to add supplemental table evidence.
