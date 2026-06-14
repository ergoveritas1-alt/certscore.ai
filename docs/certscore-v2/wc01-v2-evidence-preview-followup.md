# WC01 v2 Evidence Preview Follow-Up

## Executive Summary

Implemented the dry-run-only WC01 v2 evidence preview stage inside `@certscore/report-adapter`.

The preview reads saved `Wc01V2ManualReviewerPacket` artifacts plus explicit upstream artifact roots, resolves safe source refs and display-safe excerpt IDs where available, and writes internal `Wc01V2EvidencePreviewPacket` artifacts plus Markdown summaries.

This remains artifact-only and non-persistent. It does not add app UI, call production concern policy, persist normalized concerns, create unified findings, create report/checklist/executive/top-finding/scoring/regulatory-lens output, create customer-facing copy, or map anything to `gap_observed`.

## Pipeline Position

```text
Wc01V2ShadowProjection
-> Wc01V2AllowlistDryRun
-> Wc01V2ConcernPolicyInputDraft
-> Wc01V2ConcernPolicySimulationDryRun
-> V2NormalizedConcernCandidateDraft
-> Wc01V2ConcernPolicyComparisonDryRun
-> Wc01V2ManualReviewerPacket
-> Wc01V2EvidencePreviewPacket
```

## Implementation Summary

Added:

- `packages/certscore-report-adapter/src/wc01-v2-evidence-preview.ts`
- `packages/certscore-report-adapter/src/wc01-v2-evidence-preview-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-evidence-preview.ts`
- `packages/certscore-report-adapter/src/wc01-v2-evidence-preview.test.ts`

Updated:

- `packages/certscore-report-adapter/src/index.ts`
- `packages/certscore-report-adapter/package.json`
- `package.json`

Added root command:

```bash
pnpm v2:wc01-evidence-preview
```

Supported modes:

```bash
pnpm v2:wc01-evidence-preview \
  --reviewer-packet ./artifacts/example/Wc01V2ManualReviewerPacket.json \
  --artifact-root ./artifacts/example-upstream \
  --out ./artifacts/example/Wc01V2EvidencePreviewPacket.json
```

```bash
pnpm v2:wc01-evidence-preview \
  --reviewer-packet-dir ./artifacts/v2-wc01-reviewer-packets-edge-consent \
  --artifact-root ./artifacts/v2-wc01-reviewer-packets-edge-consent \
  --artifact-root ./artifacts/v2-wc01-concern-policy-comparison-edge-consent \
  --artifact-root ./artifacts/v2-wc01-normalized-concern-adapter-edge-consent \
  --artifact-root ./artifacts/v2-wc01-shadow-edge-consent \
  --artifact-root ./artifacts/v2-shadow-projection-edge-consent \
  --out-dir ./artifacts/v2-wc01-evidence-preview-edge-consent
```

## Sample Result

Hotjar edge-cohort sample:

- Source URL: `https://hotjar.com`
- Queue items: 3
- Resolved display-safe excerpts: 31
- Resolved source refs: 457
- Unresolved evidence refs: 1,558
- Redaction warnings: 4
- Sensitive-context items: 3
- Production eligible: false
- Top-finding eligible: false
- Gap eligible: false

The unresolved refs are mostly display-safe excerpt IDs that are not present in the searched upstream artifacts, often because upstream outputs carry many IDs while display-safe excerpt collections are capped. The preview keeps these unresolved instead of inventing or expanding evidence.

## Batch Results

| Cohort | Input files | Succeeded | Failed | Queue items | Resolved excerpts | Resolved source refs | Unresolved evidence refs | Redaction warnings | Sensitive-context items | Guardrail failures | Malformed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Expanded | 10 | 10 | 0 | 11 | 116 | 3,133 | 10,613 | 242 | 0 | 0 | 0 |
| Stress | 12 | 12 | 0 | 11 | 96 | 2,101 | 7,527 | 133 | 2 | 0 | 0 |
| Edge | 30 | 30 | 0 | 34 | 324 | 2,371 | 8,841 | 441 | 11 | 0 | 0 |
| Policy-stress | 20 | 20 | 0 | 25 | 226 | 1,467 | 5,633 | 242 | 23 | 0 | 0 |
| Total | 72 | 72 | 0 | 81 | 762 | 9,072 | 32,614 | 1,058 | 36 | 0 | 0 |

## Availability Notes

The preview is strong enough to give reviewers bounded evidence text where the upstream artifact retains matching display-safe excerpts, and source-ref traceability where safe source ref IDs can be resolved.

Known limitation: unresolved evidence refs remain high across some sites. This is not a sanitizer failure and not a promotion path. It means the preview could not find a matching safe evidence object for every ID in the reviewer packet and therefore failed closed for those refs.

Redaction warnings mean the preview encountered a long opaque value while producing bounded internal preview text and replaced it with `<redacted_opaque_value>`. The warning is retained so reviewers can see that redaction happened.

## Guardrail Results

Generated preview artifacts were scanned for forbidden gap status tokens, raw blocked field names, and legal-conclusion terms.

Result: no matches.

All preview outputs preserve:

- `productionEligible: false`
- `topFindingEligible: false`
- `gapEligible: false`
- no persistence
- no production concern policy calls
- no unified findings
- no report/checklist/executive/scoring mutation
- no customer-facing copy

## Test Coverage

Verification passed:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-evidence-preview --help
```

Test coverage includes:

- valid lookup by `sourceRefId` and `displaySafeExcerptId`
- missing source refs and excerpts remain unresolved
- ambiguous evidence lineage fails closed
- unsupported or malformed reviewer packets fail closed
- raw blocked fields are rejected
- long opaque values are redacted in bounded preview output
- sensitive-context categories remain review metadata only
- single-file and batch output generation
- batch mode continues across malformed inputs
- import-boundary checks preventing production policy/report/checklist/executive/scoring/shared scan detail imports

## Reviewer Trial Readiness

The evidence preview is ready for a third internal manual reviewer trial focused on evidence usability.

Recommended trial focus:

- whether resolved bounded excerpt text is enough for evidence adjudication
- whether unresolved evidence refs are acceptable as fail-closed gaps in the preview
- whether redaction warnings are understandable to reviewers
- whether high-volume sites need upstream excerpt-retention tuning before reviewer workflows

The preview should remain internal and artifact-only until reviewers confirm whether this rehydration shape is sufficient.

## Explicit Non-Goals

- no app UI
- no persistence
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no report/checklist/executive/top-finding/scoring/regulatory-lens output
- no customer-facing copy
- no `gap_observed` mapping
- no legal-conclusion language
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
