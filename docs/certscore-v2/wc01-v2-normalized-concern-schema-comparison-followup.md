# WC01 v2 Normalized Concern Schema Comparison Follow-up

## Executive Summary

Implemented a fixture-only WC01 v2 normalized-concern schema comparison stage inside `@certscore/report-adapter`.

The stage reads a `Wc01V2ProductionIntegrationCandidate` artifact and emits a `Wc01V2NormalizedConcernSchemaComparison` JSON artifact plus a Markdown summary. It compares the two currently reviewed non-sensitive families against the expected WC01 normalized-concern shape without importing, calling, or writing into production WC01 paths.

This remains internal-only, artifact-only, non-persistent, and closed by default.

## Command Usage

```bash
pnpm v2:wc01-normalized-concern-schema-compare \
  --candidate ./artifacts/example/Wc01V2ProductionIntegrationCandidate.json \
  --out ./artifacts/example/Wc01V2NormalizedConcernSchemaComparison.json \
  --summary ./artifacts/example/Wc01V2NormalizedConcernSchemaComparison.summary.md
```

Help command:

```bash
pnpm v2:wc01-normalized-concern-schema-compare --help
```

## Implementation Summary

Added:

- `packages/certscore-report-adapter/src/wc01-v2-normalized-concern-schema-comparison.ts`
- `packages/certscore-report-adapter/src/wc01-v2-normalized-concern-schema-comparison-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-normalized-concern-schema-comparison.ts`
- `packages/certscore-report-adapter/src/wc01-v2-normalized-concern-schema-comparison.test.ts`

Updated:

- `packages/certscore-report-adapter/src/index.ts`
- `packages/certscore-report-adapter/package.json`
- `package.json`

New root command:

```bash
pnpm v2:wc01-normalized-concern-schema-compare
```

## Output Shape

The comparison output includes:

- `packetVersion`
- `sourceCandidatePath`
- `comparedFamilies`
- `proposedNormalizedConcernTypes`
- `proposedConcernPolicyKeys`
- `requiredFieldsPresent`
- `missingFields`
- `extraFields`
- `fieldMappingTable`
- `evidenceRequirementCoverage`
- `concernPolicyReadiness`
- `unifiedFindingReadiness`
- `checklistProjectionReadiness`
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

- `artifacts/example/Wc01V2ProductionIntegrationCandidate.json`

Generated:

- `artifacts/example/Wc01V2NormalizedConcernSchemaComparison.json`
- `artifacts/example/Wc01V2NormalizedConcernSchemaComparison.summary.md`

Compared families:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Result:

| Metric | Value |
|---|---:|
| compared families | 2 |
| missing field count | 0 |
| blocked reason count | 0 |
| warning count | 3 |
| concern policy readiness | fixture_reviewable |
| unified finding readiness | fixture_reviewable |
| checklist projection readiness | fixture_reviewable |
| recommendation | schema_shape_reviewable_fixture_only |

The three warnings are expected fixture-only cautions:

- schema comparison does not call production concern policy
- unified finding and checklist keys are draft-only strings
- candidate review metadata is outside the core normalized-concern shape

## Field Coverage

`pre_consent_tracking` covered:

- family
- source evidence refs
- display-safe excerpt refs
- consent-state context
- vendor or endpoint attribution
- purpose basis
- confidence and directness
- exclusions applied
- unresolved-ref disposition
- rollback/suppression hints
- blocked surfaces

`pre_consent_cookie_storage` covered:

- family
- source evidence refs
- display-safe excerpt refs
- consent-state context
- party and storage context
- storage type
- purpose exclusions
- confidence and directness
- unresolved-ref disposition
- rollback/suppression hints
- blocked surfaces

Extra draft fields retained for review context:

- `approvalMetadata`
- `copyPosture`
- `proposedChecklistRowKey`
- `proposedUnifiedFindingKey`

These are comparison metadata only and are not production projection output.

## Fail-Closed Behavior

The stage fails closed or rejects input for:

- unsupported candidate artifact version
- malformed candidate artifact
- open root eligibility flags
- open candidate eligibility flags
- missing source refs
- missing display-safe excerpt refs
- missing consent-state context
- missing confidence or directness
- sensitive-context candidates
- unresolved refs that affect evidence sufficiency
- missing cookie/storage context for cookie-storage candidates
- raw blocked fields
- forbidden status mapping
- legal-conclusion wording

Blocked input produces diagnostic blocked reasons while the comparison artifact remains closed by default.

## Verification

Commands run:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-normalized-concern-schema-compare --help
pnpm v2:wc01-normalized-concern-schema-compare \
  --candidate ./artifacts/example/Wc01V2ProductionIntegrationCandidate.json \
  --out ./artifacts/example/Wc01V2NormalizedConcernSchemaComparison.json \
  --summary ./artifacts/example/Wc01V2NormalizedConcernSchemaComparison.summary.md
```

Results:

- report-adapter tests: 210 passed
- report-adapter typecheck: passed
- CLI help: passed
- example artifact generation: passed

## Guardrail Scan

Guardrail wording/raw-field scan was run against:

- this follow-up doc
- generated schema comparison JSON
- generated schema comparison Markdown

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
- no report rows
- no checklist rows
- no executive summaries
- no top findings
- no scoring output
- no regulatory-lens output
- no API/MCP/export output
- no customer-facing copy
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`

## Recommendation

Continue with design or fixture-only artifact work only. The next reasonable decision is either:

- continue design only, or
- implement an internal-only production integration candidate comparison object if explicitly requested.

Do not proceed to app UI, persistence, production integration, report/checklist/executive/scoring/regulatory/API/export output, production concern policy calls, or customer-facing copy.
