# WC01 v2 Production Readiness Gate Generator Follow-Up

Internal implementation follow-up only. Not customer-facing report output.

## Executive Summary

Implemented the artifact-only WC01 v2 production readiness gate draft generator inside `@certscore/report-adapter`.

The generator reads a `Wc01V2ProductionReadinessGateInput.json` artifact and emits:

- `Wc01V2ProductionReadinessGateDraft.json`
- `Wc01V2ProductionReadinessGateDraft.summary.md`

The output remains internal-only and non-persistent. It does not approve implementation, app UI, persistence, production integration, customer-facing output, production concern policy calls, persisted normalized concerns, unified findings, report rows, checklist rows, executive summaries, top findings, scoring output, regulatory-lens output, API/MCP/export output, or customer-facing copy.

## Implementation Summary

Added:

- `packages/certscore-report-adapter/src/wc01-v2-production-readiness-gate-draft.ts`
- `packages/certscore-report-adapter/src/wc01-v2-production-readiness-gate-draft-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-production-readiness-gate-draft.ts`
- `packages/certscore-report-adapter/src/wc01-v2-production-readiness-gate-draft.test.ts`

Updated:

- `packages/certscore-report-adapter/src/index.ts`
- `packages/certscore-report-adapter/package.json`
- `package.json`
- `docs/certscore-v2/README.md`
- `AGENTS.md`

Added root command:

```bash
pnpm v2:wc01-production-readiness-gate
```

## Command Usage

```bash
pnpm v2:wc01-production-readiness-gate \
  --input ./artifacts/example/Wc01V2ProductionReadinessGateInput.json \
  --out ./artifacts/example/Wc01V2ProductionReadinessGateDraft.json
```

By default, the command writes `Wc01V2ProductionReadinessGateDraft.summary.md` next to the JSON output. Use `--summary <path>` to choose a summary path or `--no-summary` to skip Markdown output.

## Input Shape

Input artifact:

```text
Wc01V2ProductionReadinessGateInput.json
```

Required input sections include:

- `inputVersion`
- `sourcePreviewPacketPath`
- `sourceReviewerLogPath`
- `siteDomain`
- `queueItemId`
- `candidateFamily`
- `reviewerAction`
- `sensitiveContextCategories`
- `evidenceRefs`
- `excerptRefs`
- `unresolvedRefCount`
- `redactionWarningCount`
- `guardrailScanResult`
- `gateResults`
- `approvalRecord`
- `rollbackSuppressionPlan`

Optional source references include:

- `sourcePolicyCopyReviewArtifact`

## Output Shape

Output artifact:

```text
Wc01V2ProductionReadinessGateDraft.json
```

The draft records:

- source evidence preview and reviewer log paths
- site/domain and queue item metadata
- candidate family and reviewer action
- sensitive-context category labels
- safe evidence and excerpt refs
- unresolved-ref and warning counts
- individual gate results
- overall gate outcome
- allowed internal next step
- blocked reasons
- approval record
- rollback/suppression plan
- guardrail flags

Closed defaults are hard-coded:

```json
{
  "productionEligible": false,
  "customerFacingEligible": false,
  "explicitApprovalRequired": true
}
```

## Fail-Closed Behavior

The generator records blocked reasons when:

- required gates are missing
- evidence refs are missing
- excerpt refs are missing
- the guardrail scan failed
- rollback/suppression plan details are incomplete
- the approval record is missing
- sensitive-context categories are present without a policy/copy review artifact
- any gate failed or was not evaluated
- reviewer action is `needs_more_evidence`, `rejected_overbroad`, or `internal_only`

Unsupported input versions, unsupported gates, unsupported reviewer actions, raw blocked fields, forbidden status mapping, and legal-conclusion wording fail closed during parsing or validation.

## Test Results

Passed:

```bash
pnpm --filter @certscore/report-adapter test
```

Coverage added for:

- valid internal production-readiness gate draft
- hard-false production/customer-facing eligibility
- policy/copy reviewer action routing
- missing refs and evidence follow-up blocks
- overbroad reviewer action blocks
- guardrail failures
- not-evaluated gates and internal holds
- missing required gates and approval records
- unsupported/malformed artifacts
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
pnpm v2:wc01-production-readiness-gate --help
```

## Guardrail Scan Results

Guardrail coverage is enforced in parser and output tests:

- raw blocked fields are rejected
- forbidden status mapping is rejected
- legal-conclusion wording is rejected
- output summary preserves closed-default flags
- import-boundary test confirms no production report/checklist/executive/scoring/regulatory/shared scan detail imports

This follow-up doc was also scanned with the standard wording/raw-field guardrail pattern.

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
