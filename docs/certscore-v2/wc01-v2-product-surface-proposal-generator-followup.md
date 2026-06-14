# WC01 v2 Product Surface Proposal Generator Follow-Up

Internal implementation follow-up only. Not customer-facing report output.

## Executive Summary

Implemented the artifact-only WC01 v2 product surface proposal draft generator inside `@certscore/report-adapter`.

The generator reads a `Wc01V2ProductSurfaceProposalInput.json` artifact and emits:

- `Wc01V2ProductSurfaceProposalDraft.json`
- `Wc01V2ProductSurfaceProposalDraft.summary.md`

The output remains internal-only and non-persistent. It does not approve implementation, app UI, persistence, production integration, customer-facing output, production concern policy calls, persisted normalized concerns, unified findings, report rows, checklist rows, executive summaries, top findings, scoring output, regulatory-lens output, API/MCP/export output, or customer-facing copy.

## Implementation Summary

Added:

- `packages/certscore-report-adapter/src/wc01-v2-product-surface-proposal-draft.ts`
- `packages/certscore-report-adapter/src/wc01-v2-product-surface-proposal-draft-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-product-surface-proposal-draft.ts`
- `packages/certscore-report-adapter/src/wc01-v2-product-surface-proposal-draft.test.ts`

Updated:

- `packages/certscore-report-adapter/src/index.ts`
- `packages/certscore-report-adapter/package.json`
- `package.json`
- `docs/certscore-v2/README.md`
- `AGENTS.md`

Added root command:

```bash
pnpm v2:wc01-product-surface-proposal
```

## Command Usage

```bash
pnpm v2:wc01-product-surface-proposal \
  --input ./artifacts/example/Wc01V2ProductSurfaceProposalInput.json \
  --out ./artifacts/example/Wc01V2ProductSurfaceProposalDraft.json
```

By default, the command writes `Wc01V2ProductSurfaceProposalDraft.summary.md` next to the JSON output. Use `--summary <path>` to choose a summary path or `--no-summary` to skip Markdown output.

## Input Shape

Input artifact:

```text
Wc01V2ProductSurfaceProposalInput.json
```

Required input sections include:

- `inputVersion`
- `proposedSurfaceClass`
- `proposedSurfaceAudience`
- `proposedSurfacePurpose`
- `sourceReviewerWorkflowDocs`
- `allowedFamilies`
- `blockedFamilies`
- `sensitiveContextHandling`
- `copyPosture`
- `evidenceRequirements`
- `userVisibleWordingStatus`
- `guardrailRequirements`
- `approvalRequirements`
- `rollbackSuppressionPlan`

Optional source references include:

- `sourceProductionReadinessGateDraft`
- `sourcePolicyCopyReviewArtifact`
- `explicitApprovalMetadata`

## Output Shape

Output artifact:

```text
Wc01V2ProductSurfaceProposalDraft.json
```

The draft records:

- proposed surface class
- proposed audience and purpose
- source readiness/policy/reviewer references
- allowed and blocked families
- sensitive-context handling
- copy posture
- evidence requirements
- guardrail requirements
- approval requirements
- rollback/suppression plan
- fail-closed reasons
- guardrail flags

Closed defaults are hard-coded:

```json
{
  "implementationStatus": "not_approved",
  "productionEligible": false,
  "customerFacingEligible": false,
  "explicitApprovalRequired": true
}
```

## Fail-Closed Behavior

The generator records fail-closed reasons when:

- source production-readiness gate draft is missing
- sensitive-context policy/copy artifact is missing when sensitive context is required
- sensitive-context categories are missing when sensitive context is required
- evidence requirements are missing
- guardrail requirements are missing
- approval requirements are missing
- allowed and blocked families are both missing
- high-risk surface classes lack explicit approval metadata
- named-surface wording lacks copy-owner approval

Unsupported surface classes fail closed during parsing. Unsupported app UI and persistence surface classes are rejected because they are not valid taxonomy classes for this generator.

Incomplete rollback/suppression plans fail closed during validation.

## Test Results

Passed:

```bash
pnpm --filter @certscore/report-adapter test
```

Coverage added for:

- valid internal product proposal artifact
- missing approval requirements
- missing rollback/suppression plan
- customer-facing surface default block
- scoring, regulatory, API/export, and UI-like surface default block
- unsupported app UI and persistence classes
- missing sensitive-context handling
- closed defaults for implementation and eligibility flags
- raw blocked field rejection
- forbidden wording rejection
- forbidden status mapping rejection
- JSON and Markdown generation
- import-boundary checks against production report/checklist/executive/scoring/regulatory/shared scan detail paths

Passed:

```bash
pnpm --filter @certscore/report-adapter typecheck
```

Passed:

```bash
pnpm v2:wc01-product-surface-proposal --help
```

Smoke run:

- generated JSON and Markdown in a temporary directory
- confirmed `implementationStatus: not_approved`
- confirmed `productionEligible: false`
- confirmed `customerFacingEligible: false`
- confirmed `explicitApprovalRequired: true`

## Guardrail Scan Results

Guardrail coverage is enforced in parser and output tests:

- raw blocked fields are rejected
- forbidden status mapping is rejected
- legal-conclusion wording is rejected
- output summary preserves closed-default flags
- import-boundary test confirms no production report/checklist/executive/scoring/regulatory/shared scan detail imports

The follow-up doc was also scanned with the standard wording/raw-field guardrail pattern.

## Explicit Non-Goals

This implementation does not approve or create:

- app UI
- persistence
- production integration
- production concern policy calls
- persisted normalized concerns
- unified findings
- report/checklist/executive/top-finding/scoring/regulatory-lens output
- API/MCP/export output
- customer-facing copy
- legal-conclusion language
- forbidden status mapping
- changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
