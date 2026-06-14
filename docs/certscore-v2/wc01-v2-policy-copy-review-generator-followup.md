# WC01 v2 Policy/Copy Review Generator Follow-Up

Internal implementation follow-up only. Not customer-facing report output.

## Executive Summary

Implemented the artifact-only WC01 v2 policy/copy review artifact generator inside `@certscore/report-adapter`.

The generator reads a `Wc01V2PolicyCopyReviewInput.json` artifact and emits:

- `Wc01V2PolicyCopyReviewArtifact.json`
- `Wc01V2PolicyCopyReviewArtifact.summary.md`

The output remains internal-only and non-persistent. It does not approve implementation, app UI, persistence, production integration, customer-facing output, production concern policy calls, persisted normalized concerns, unified findings, report rows, checklist rows, executive summaries, top findings, scoring output, regulatory-lens output, API/MCP/export output, or customer-facing copy.

## Implementation Summary

Added:

- `packages/certscore-report-adapter/src/wc01-v2-policy-copy-review-artifact.ts`
- `packages/certscore-report-adapter/src/wc01-v2-policy-copy-review-artifact-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-policy-copy-review-artifact.ts`
- `packages/certscore-report-adapter/src/wc01-v2-policy-copy-review-artifact.test.ts`

Updated:

- `packages/certscore-report-adapter/src/index.ts`
- `packages/certscore-report-adapter/package.json`
- `package.json`
- `docs/certscore-v2/README.md`
- `AGENTS.md`

Added root command:

```bash
pnpm v2:wc01-policy-copy-review
```

## Command Usage

```bash
pnpm v2:wc01-policy-copy-review \
  --input ./artifacts/example/Wc01V2PolicyCopyReviewInput.json \
  --out ./artifacts/example/Wc01V2PolicyCopyReviewArtifact.json
```

By default, the command writes `Wc01V2PolicyCopyReviewArtifact.summary.md` next to the JSON output. Use `--summary <path>` to choose a summary path or `--no-summary` to skip Markdown output.

## Input Shape

Input artifact:

```text
Wc01V2PolicyCopyReviewInput.json
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
- `confidenceBand`
- `directness`
- `familyEvidenceContext`
- `allowedInternalPhrasing`
- `blockedPhrasingPatterns`
- `policyCopyDecisions`
- `unresolvedRefsDisposition`
- `redactionSanitization`
- `caveats`
- `coverageLimitations`

## Output Shape

Output artifact:

```text
Wc01V2PolicyCopyReviewArtifact.json
```

The artifact records:

- grouped evidence preview and reviewer log paths
- site/domain and queue item metadata
- candidate family and reviewer action
- sensitive-context category labels
- safe evidence and excerpt refs
- confidence/directness
- family evidence context
- allowed internal phrasing
- blocked phrasing patterns
- policy/copy owner decisions
- unresolved-ref disposition
- redaction/sanitization status
- caveats and coverage limitations
- policy/copy outcome
- allowed internal next step
- blocked reasons
- guardrail flags

Closed defaults are hard-coded:

```json
{
  "sensitiveContextIsRoutingMetadataOnly": true,
  "productionEligible": false,
  "customerFacingEligible": false,
  "explicitApprovalRequired": true
}
```

## Fail-Closed Behavior

The generator records blocked reasons when:

- sensitive-context categories are missing
- evidence refs are missing
- excerpt refs are missing
- family evidence context is missing
- allowed internal phrasing is missing
- blocked phrasing patterns are missing
- policy-owner internal review approval is missing
- copy-owner internal review approval is missing
- unresolved refs block review
- redaction/sanitization did not pass
- reviewer action is `needs_more_evidence`, `rejected_overbroad`, or `internal_only`

Unsupported input versions, unsupported sensitive-context categories, unsupported reviewer actions, unsupported confidence/directness values, unsupported policy/copy decisions, raw blocked fields, forbidden status mapping, and legal-conclusion wording fail closed during parsing or validation.

## Test Results

Passed:

```bash
pnpm --filter @certscore/report-adapter test
```

Coverage added for:

- valid internal policy/copy review artifact
- hard-false production/customer-facing eligibility
- sensitive-context routing metadata flag
- missing policy/copy owner approvals
- missing safe evidence refs and excerpt refs
- missing sensitive-context categories and family context
- unresolved-ref blockers
- reviewer action routing
- redaction/sanitization failures
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
pnpm v2:wc01-policy-copy-review --help
```

## Guardrail Scan Results

Guardrail coverage is enforced in parser and output tests:

- raw blocked fields are rejected
- forbidden status mapping is rejected
- legal-conclusion wording is rejected
- output summary preserves closed-default flags
- sensitive context remains routing metadata only
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
