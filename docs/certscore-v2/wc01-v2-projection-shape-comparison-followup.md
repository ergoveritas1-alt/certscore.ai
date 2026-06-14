# WC01 v2 Unified-Finding/Checklist Projection Shape Comparison Follow-up

Internal follow-up only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Implemented a fixture-only WC01 v2 unified-finding/checklist projection shape comparison stage inside `@certscore/report-adapter`.

The stage reads a `Wc01V2ConcernPolicyShapeComparison` artifact and emits a `Wc01V2ProjectionShapeComparison` JSON artifact plus a Markdown summary. It checks whether the two currently reviewed non-sensitive families have enough fixture-only shape information for future unified-finding, checklist projection, and evidence packet design.

This stage does not create unified findings, checklist rows, report rows, executive output, top findings, scoring output, regulatory-lens output, API/MCP/export output, app UI, persistence, or customer-facing copy.

## Command Usage

```bash
pnpm v2:wc01-projection-shape-compare \
  --concern-policy-shape ./artifacts/example/Wc01V2ConcernPolicyShapeComparison.json \
  --out ./artifacts/example/Wc01V2ProjectionShapeComparison.json \
  --summary ./artifacts/example/Wc01V2ProjectionShapeComparison.summary.md
```

Help command:

```bash
pnpm v2:wc01-projection-shape-compare --help
```

## Implementation Summary

Added:

- `packages/certscore-report-adapter/src/wc01-v2-projection-shape-comparison.ts`
- `packages/certscore-report-adapter/src/wc01-v2-projection-shape-comparison-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-projection-shape-comparison.ts`
- `packages/certscore-report-adapter/src/wc01-v2-projection-shape-comparison.test.ts`

Updated:

- `packages/certscore-report-adapter/src/index.ts`
- `packages/certscore-report-adapter/package.json`
- `package.json`

New root command:

```bash
pnpm v2:wc01-projection-shape-compare
```

## Output Shape

The comparison output includes:

- `packetVersion`
- `sourceConcernPolicyShapePath`
- `comparedFamilies`
- `proposedConcernPolicyKeys`
- `proposedUnifiedFindingKeys`
- `proposedChecklistRowKeys`
- `projectionInputRequirements`
- `missingProjectionInputs`
- `projectionGateTable`
- `evidencePacketCoverage`
- `unifiedFindingShapeReadiness`
- `checklistProjectionShapeReadiness`
- `evidencePacketReadiness`
- `blockedReasons`
- `warnings`
- `recommendation`
- closed-default flags

Closed-default flags remain:

| Flag | Value |
|---|---:|
| productionEligible | false |
| persistEligible | false |
| concernPolicyCallEligible | false |
| unifiedFindingEligible | false |
| checklistProjectionEligible | false |
| customerFacingEligible | false |
| explicitApprovalRequired | true |

## Example Result

Generated from:

- `artifacts/example/Wc01V2ConcernPolicyShapeComparison.json`

Generated:

- `artifacts/example/Wc01V2ProjectionShapeComparison.json`
- `artifacts/example/Wc01V2ProjectionShapeComparison.summary.md`

Compared families:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Draft unified finding keys:

- `v2.pre_consent_tracking.unified_finding_candidate_draft`
- `v2.pre_consent_cookie_storage.unified_finding_candidate_draft`

Draft checklist row keys:

- `v2.pre_consent_tracking.checklist_row_candidate_draft`
- `v2.pre_consent_cookie_storage.checklist_row_candidate_draft`

Result:

| Metric | Value |
|---|---:|
| compared families | 2 |
| missing projection input count | 0 |
| blocked reason count | 0 |
| warning count | 2 |
| unified finding shape readiness | fixture_reviewable |
| checklist projection shape readiness | fixture_reviewable |
| evidence packet readiness | fixture_reviewable |
| recommendation | projection_shape_reviewable_fixture_only |

The warnings are expected fixture-only cautions:

- projection shape comparison does not create unified findings
- checklist row keys are draft strings only

## Projection Input Coverage

`pre_consent_tracking` covered:

- concern policy key
- policy decision readiness
- suppression readiness
- copy review readiness
- source evidence refs
- display-safe excerpt refs
- consent-state context
- confidence and directness
- purpose basis
- evidence gate coverage
- blocked surfaces
- draft unified finding key
- draft checklist row key
- vendor or endpoint context

`pre_consent_cookie_storage` covered:

- concern policy key
- policy decision readiness
- suppression readiness
- copy review readiness
- source evidence refs
- display-safe excerpt refs
- consent-state context
- confidence and directness
- purpose basis
- evidence gate coverage
- blocked surfaces
- draft unified finding key
- draft checklist row key
- party and storage context
- storage type

## Fail-Closed Behavior

The stage fails closed or rejects input for:

- unsupported concern-policy shape version
- malformed concern-policy shape artifact
- concern-policy shape comparison with blocked reasons
- concern-policy shape comparison that is not reviewable as fixture-only
- open concern-policy shape eligibility flags
- missing policy keys
- missing policy input requirements
- non-reviewable policy decision, suppression, or copy-review readiness
- missing source refs
- missing display-safe excerpt refs
- missing consent-state context
- missing confidence or directness
- missing purpose basis
- missing evidence gate coverage
- missing blocked surfaces
- missing vendor or endpoint context for tracking
- missing party/storage context for cookie-storage
- raw blocked fields
- forbidden status mapping
- legal-conclusion wording

Blocked input produces diagnostic blocked reasons while the comparison artifact remains closed by default.

## Verification

Commands run:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-projection-shape-compare --help
pnpm v2:wc01-projection-shape-compare \
  --concern-policy-shape ./artifacts/example/Wc01V2ConcernPolicyShapeComparison.json \
  --out ./artifacts/example/Wc01V2ProjectionShapeComparison.json \
  --summary ./artifacts/example/Wc01V2ProjectionShapeComparison.summary.md
```

Results:

- report-adapter tests: 227 passed
- report-adapter typecheck: passed
- CLI help: passed
- example artifact generation: passed

## Guardrail Scan

Guardrail wording/raw-field scan was run against:

- this follow-up doc
- generated projection shape comparison JSON
- generated projection shape comparison Markdown

Result:

- no forbidden status token matches
- no raw blocked field-name matches
- no legal-style term matches

## Explicit Non-goals

- no app UI
- no persistence
- no production integration
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no checklist rows
- no report rows
- no executive summaries
- no top findings
- no scoring output
- no regulatory-lens output
- no API/MCP/export output
- no customer-facing copy
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`

## Recommendation

Create a decision note accepting this projection shape comparison as internal readiness evidence before considering any further design step.

Do not proceed to app UI, persistence, production integration, production concern policy calls, report/checklist/executive/scoring/regulatory/API/export output, or customer-facing copy.
