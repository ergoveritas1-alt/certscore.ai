# WC01 v2 Concern-Policy Shape Comparison Follow-up

Internal follow-up only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Implemented a fixture-only WC01 v2 concern-policy shape comparison stage inside `@certscore/report-adapter`.

The stage reads a `Wc01V2NormalizedConcernSchemaComparison` artifact and emits a `Wc01V2ConcernPolicyShapeComparison` JSON artifact plus a Markdown summary. It checks whether the two currently reviewed non-sensitive families have the draft inputs a future WC01 concern policy would need, without importing or calling production WC01 concern policy.

This remains internal-only, artifact-only, non-persistent, and closed by default.

## Command Usage

```bash
pnpm v2:wc01-concern-policy-shape-compare \
  --schema-comparison ./artifacts/example/Wc01V2NormalizedConcernSchemaComparison.json \
  --out ./artifacts/example/Wc01V2ConcernPolicyShapeComparison.json \
  --summary ./artifacts/example/Wc01V2ConcernPolicyShapeComparison.summary.md
```

Help command:

```bash
pnpm v2:wc01-concern-policy-shape-compare --help
```

## Implementation Summary

Added:

- `packages/certscore-report-adapter/src/wc01-v2-concern-policy-shape-comparison.ts`
- `packages/certscore-report-adapter/src/wc01-v2-concern-policy-shape-comparison-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-concern-policy-shape-comparison.ts`
- `packages/certscore-report-adapter/src/wc01-v2-concern-policy-shape-comparison.test.ts`

Updated:

- `packages/certscore-report-adapter/src/index.ts`
- `packages/certscore-report-adapter/package.json`
- `package.json`

New root command:

```bash
pnpm v2:wc01-concern-policy-shape-compare
```

## Output Shape

The comparison output includes:

- `packetVersion`
- `sourceSchemaComparisonPath`
- `comparedFamilies`
- `proposedConcernPolicyKeys`
- `policyInputRequirements`
- `missingPolicyInputs`
- `policyGateTable`
- `evidenceGateCoverage`
- `decisionReadiness`
- `suppressionReadiness`
- `copyReviewReadiness`
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

- `artifacts/example/Wc01V2NormalizedConcernSchemaComparison.json`

Generated:

- `artifacts/example/Wc01V2ConcernPolicyShapeComparison.json`
- `artifacts/example/Wc01V2ConcernPolicyShapeComparison.summary.md`

Compared families:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Proposed policy keys:

- `v2.pre_consent_tracking.reviewed_non_sensitive`
- `v2.pre_consent_cookie_storage.reviewed_non_sensitive`

Result:

| Metric | Value |
|---|---:|
| compared families | 2 |
| missing policy input count | 0 |
| blocked reason count | 0 |
| warning count | 3 |
| decision readiness | fixture_reviewable |
| suppression readiness | fixture_reviewable |
| copy review readiness | fixture_reviewable |
| recommendation | concern_policy_shape_reviewable_fixture_only |

The three warnings are expected fixture-only cautions:

- concern-policy shape comparison does not call production concern policy
- policy keys are draft routing strings only
- comparison is limited to non-sensitive draft keys, with sensitive-context handling remaining separate

## Policy Input Coverage

`pre_consent_tracking` covered:

- policy key routing
- normalized concern type
- source evidence refs
- display-safe excerpt refs
- consent-state context
- confidence and directness
- supporting purpose basis
- diagnostic exclusions
- unresolved-ref disposition
- rollback/suppression hints
- blocked surfaces
- vendor or endpoint attribution

`pre_consent_cookie_storage` covered:

- policy key routing
- normalized concern type
- source evidence refs
- display-safe excerpt refs
- consent-state context
- confidence and directness
- supporting purpose basis
- diagnostic exclusions
- unresolved-ref disposition
- rollback/suppression hints
- blocked surfaces
- party and storage context
- storage type
- unsafe storage content exclusion

## Fail-Closed Behavior

The stage fails closed or rejects input for:

- unsupported schema comparison version
- malformed schema comparison artifact
- schema comparison with blocked reasons
- schema comparison that is not reviewable as fixture-only
- open schema comparison eligibility flags
- missing proposed policy keys
- missing proposed normalized concern types
- missing source refs
- missing display-safe excerpt refs
- missing consent-state context
- missing confidence or directness
- missing purpose basis or exclusion context
- missing rollback/suppression hints
- missing blocked surfaces
- missing vendor attribution for tracking
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
pnpm v2:wc01-concern-policy-shape-compare --help
pnpm v2:wc01-concern-policy-shape-compare \
  --schema-comparison ./artifacts/example/Wc01V2NormalizedConcernSchemaComparison.json \
  --out ./artifacts/example/Wc01V2ConcernPolicyShapeComparison.json \
  --summary ./artifacts/example/Wc01V2ConcernPolicyShapeComparison.summary.md
```

Results:

- report-adapter tests: 219 passed
- report-adapter typecheck: passed
- CLI help: passed
- example artifact generation: passed

## Guardrail Scan

Guardrail wording/raw-field scan was run against:

- this follow-up doc
- generated concern-policy shape comparison JSON
- generated concern-policy shape comparison Markdown

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

Continue fixture-only artifact work only. The next reasonable decision is either:

- create a decision note accepting this concern-policy shape comparison as internal readiness evidence, or
- add a fixture-only unified-finding/checklist projection shape comparison if explicitly requested.

Do not proceed to app UI, persistence, production integration, production concern policy calls, report/checklist/executive/scoring/regulatory/API/export output, or customer-facing copy.
