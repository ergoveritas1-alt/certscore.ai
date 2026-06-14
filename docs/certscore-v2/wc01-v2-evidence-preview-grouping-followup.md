# WC01 v2 Evidence Preview Grouping Follow-Up

## Executive Summary

Implemented representative grouping, top-N Markdown display, compact unresolved-ref summaries, and clearer warning categories for internal `Wc01V2EvidencePreviewPacket` artifacts.

The evidence preview stage remains artifact-only and non-persistent. It does not add app UI, call production concern policy, persist normalized concerns, create unified findings, create report/checklist/executive/top-finding/scoring/regulatory-lens output, create customer-facing copy, or map anything to a forbidden gap status.

## Implementation Summary

Updated:

- `packages/certscore-report-adapter/src/wc01-v2-evidence-preview.ts`
- `packages/certscore-report-adapter/src/wc01-v2-evidence-preview-output.ts`
- `packages/certscore-report-adapter/src/wc01-v2-evidence-preview.test.ts`

Added to each queue item:

- `representativeEvidenceGroups`
- deterministic safe group keys
- top-N representative excerpts per group
- top-N representative source refs per group
- total resolved excerpt/source-ref/unresolved/warning counts per group

Updated Markdown summaries:

- representative groups are shown before unresolved/warning tables
- group rows are capped to the top 12 groups per queue item
- omitted group counts are preserved in a compact row
- unresolved refs are summarized by queue item, reason, and ref type
- warnings are summarized by category and display disposition

## Cohort Results

| Cohort | Input files | Succeeded | Failed | Queue items | Resolved excerpts | Resolved source refs | Representative groups | Unresolved refs | Warning entries | Sensitive-context items | Guardrail failures | Malformed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Expanded | 10 | 10 | 0 | 11 | 116 | 3,133 | 223 | 10,613 | 27 | 0 | 0 | 0 |
| Stress | 12 | 12 | 0 | 11 | 96 | 2,101 | 199 | 7,527 | 26 | 2 | 0 | 0 |
| Edge | 30 | 30 | 0 | 34 | 324 | 2,371 | 444 | 8,841 | 79 | 11 | 0 | 0 |
| Policy-stress | 20 | 20 | 0 | 25 | 226 | 1,467 | 294 | 5,633 | 56 | 23 | 0 | 0 |
| Total | 72 | 72 | 0 | 81 | 762 | 9,072 | 1,160 | 32,614 | 188 | 36 | 0 | 0 |

## Top-N Behavior

JSON output keeps the full safe detail:

- full `resolvedEvidenceExcerpts`
- full `resolvedSourceRefs`
- full `unresolvedEvidenceRefs`
- full `representativeEvidenceGroups`

Markdown output is intentionally compact:

- top 12 representative groups per queue item
- top 5 representative excerpts per group
- top 10 representative source refs per group
- one omitted-count row when a queue item has more groups in JSON

This preserves auditability while making high-volume summaries readable.

## Unresolved Refs By Reason

| Reason | Count |
|---|---:|
| `excerpt_id_not_found` | 20,462 |
| `ambiguous_lineage` | 12,152 |

No `source_ref_id_not_found`, `unsafe_to_display`, or `artifact_not_found` unresolved reasons appeared in the regenerated cohort summaries.

Interpretation:

- `excerpt_id_not_found` means a referenced display-safe excerpt ID was not present in the searched safe artifacts.
- `ambiguous_lineage` means multiple non-equivalent safe objects matched a source ref, so the preview omitted that ref fail-closed.

## Warnings By Category

| Category | Count |
|---|---:|
| `ambiguous_lineage_fail_closed` | 81 |
| `evidence_not_found_fail_closed` | 76 |
| `source_ref_url_redacted` | 31 |

The previous large redaction-warning count is now clearer because warnings are aggregated by category and count. The warning entries distinguish whether evidence was displayed with redaction or omitted fail-closed.

No regenerated cohort emitted `bounded_excerpt_value_redacted`, `source_ref_label_redacted`, `opaque_value_redacted`, `opaque_query_param_name_redacted`, or `unresolved_ref_not_displayed` warning entries. Those categories remain available for future artifacts that trigger them.

## High-Volume Site Examples

### `weather.com`

- Queue items: 2
- Resolved excerpts: 24
- Resolved source refs: 2,499
- Representative groups: 108
- Unresolved refs: 8,207
- Warning entries: 5

The Markdown now shows the highest-volume unresolved groups and source-ref groups first, then a compact omitted-groups row. This is substantially more usable than the previous flat source-ref list, while JSON keeps all 108 groups.

### `segment.com`

- Queue items: 3
- Resolved excerpts: 26
- Resolved source refs: 259
- Representative groups: 43
- Unresolved refs: 1,051
- Warning entries: 7

The warning table now separates fail-closed unresolved refs from displayed-with-redaction URL refs. This makes the earlier redaction-warning noise easier to interpret.

### `plannedparenthood.org`

- Queue items: 3
- Resolved excerpts: 29
- Resolved source refs: 249
- Representative groups: 40
- Unresolved refs: 906
- Warning entries: 7

Sensitive-context review remains explicit. The grouped view keeps reproductive-health context review internal-only while surfacing representative evidence and compact unresolved counts.

### `greenhouse.com`

- Queue items: 2
- Resolved excerpts: 22
- Resolved source refs: 293
- Representative groups: 44
- Unresolved refs: 1,229
- Warning entries: 5

Employment / HR sensitive-context items are easier to inspect because the top groups expose the largest unresolved buckets and highest-volume source-ref hosts before the smaller groups.

## Guardrail Results

Generated preview artifacts were scanned for forbidden gap status tokens, raw blocked field names, and legal-conclusion terms.

Result: no matches.

All regenerated preview outputs preserve:

- `productionEligible: false`
- `topFindingEligible: false`
- `gapEligible: false`
- no persistence
- no production concern policy calls
- no unified findings
- no report/checklist/executive/scoring mutation
- no customer-facing copy

## Verification

Passed:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-evidence-preview --help
```

Regenerated:

- `artifacts/v2-wc01-evidence-preview-expanded-fresh-registry`
- `artifacts/v2-wc01-evidence-preview-stress-fresh-registry`
- `artifacts/v2-wc01-evidence-preview-edge-consent`
- `artifacts/v2-wc01-evidence-preview-policy-stress-consent`

## Reviewer Trial Readiness

This is ready for a fourth internal reviewer trial.

Recommended trial focus:

- whether top-N group summaries reduce high-volume review friction
- whether omitted-group rows give enough confidence that JSON preserves full detail
- whether warning categories are understandable without additional reviewer training
- whether unresolved refs remain acceptable fail-closed behavior after grouping

## Explicit Non-Goals

- no app UI
- no persistence
- no production integration
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no report/checklist/executive/top-finding/scoring/regulatory-lens output
- no customer-facing output
- no forbidden gap-status mapping
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
