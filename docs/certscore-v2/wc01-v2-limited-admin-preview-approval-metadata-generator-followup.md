# WC01 v2 Limited Admin Preview Approval Metadata Generator Follow-Up

## Executive Summary

The artifact-only limited admin preview approval metadata generator is implemented for WC01 v2. It reads a fixture-only `Wc01V2ProjectionShapeComparison` artifact and emits `Wc01V2LimitedAdminPreviewApprovalMetadata` JSON plus an optional Markdown summary.

This generator does not approve implementation. It keeps the proposed `limited_admin_internal_preview` surface closed by default until explicit owner approvals and an implementation proposal exist.

## Implementation Summary

Added the internal metadata generator in `@certscore/report-adapter`:

- `packages/certscore-report-adapter/src/wc01-v2-limited-admin-preview-approval-metadata.ts`
- `packages/certscore-report-adapter/src/wc01-v2-limited-admin-preview-approval-metadata-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-limited-admin-preview-approval-metadata.ts`
- `packages/certscore-report-adapter/src/wc01-v2-limited-admin-preview-approval-metadata.test.ts`

Added the root command:

```bash
pnpm v2:wc01-limited-admin-preview-approval-metadata
```

The implementation is artifact-only, non-persistent, and does not import production report, checklist, executive, scoring, regulatory, persistence, unified finding, production concern policy, or shared scan detail paths.

## Command Usage

```bash
pnpm v2:wc01-limited-admin-preview-approval-metadata \
  --projection-shape ./artifacts/example/Wc01V2ProjectionShapeComparison.json \
  --out ./artifacts/example/Wc01V2LimitedAdminPreviewApprovalMetadata.json \
  --summary ./artifacts/example/Wc01V2LimitedAdminPreviewApprovalMetadata.summary.md
```

Help command:

```bash
pnpm v2:wc01-limited-admin-preview-approval-metadata --help
```

## Input And Output Shape

Input:

- `Wc01V2ProjectionShapeComparison.json`

Output:

- `Wc01V2LimitedAdminPreviewApprovalMetadata.json`
- `Wc01V2LimitedAdminPreviewApprovalMetadata.summary.md`

The output records:

- target surface class: `limited_admin_internal_preview`
- allowed families: `pre_consent_tracking`, `pre_consent_cookie_storage`
- blocked families and contexts
- owner approval placeholders
- access-control, data-handling, evidence, copy, sensitive-context, guardrail, and rollback requirements
- fail-closed reasons
- closed-default eligibility flags

## Generated Example Result

Example artifacts generated:

- `artifacts/example/Wc01V2LimitedAdminPreviewApprovalMetadata.json`
- `artifacts/example/Wc01V2LimitedAdminPreviewApprovalMetadata.summary.md`

Observed result:

| Field | Value |
|---|---:|
| target surface class | `limited_admin_internal_preview` |
| approval status | `incomplete` |
| implementation status | `not_approved` |
| allowed families | 2 |
| blocked families and contexts | 17 |
| owner approvals | 5 missing |
| fail-closed reasons | `implementation_proposal_missing`, `owner_approvals_missing` |
| production eligible | false |
| persist eligible | false |
| concern policy call eligible | false |
| unified finding eligible | false |
| checklist projection eligible | false |
| customer-facing eligible | false |
| explicit approval required | true |

## Fail-Closed Behavior

The generator fails closed when the source projection shape is unsupported, malformed, missing required projection inputs, contains unsupported families, carries blocked source reasons, or has open eligibility flags.

Even with a clean fixture-only projection-shape comparison, the generated metadata remains incomplete because owner approvals and an implementation proposal are intentionally absent.

Expected fail-closed reasons for the current example:

- `implementation_proposal_missing`
- `owner_approvals_missing`

## Verification

Commands run:

```bash
node --import tsx --test packages/certscore-report-adapter/src/wc01-v2-limited-admin-preview-approval-metadata.test.ts
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-limited-admin-preview-approval-metadata --help
pnpm v2:wc01-limited-admin-preview-approval-metadata \
  --projection-shape ./artifacts/example/Wc01V2ProjectionShapeComparison.json \
  --out ./artifacts/example/Wc01V2LimitedAdminPreviewApprovalMetadata.json \
  --summary ./artifacts/example/Wc01V2LimitedAdminPreviewApprovalMetadata.summary.md
```

Results:

- focused metadata tests: 8 passed
- report-adapter tests: 235 passed
- report-adapter typecheck: passed
- CLI help: passed
- example artifact generation: passed

## Guardrail Scan Result

The follow-up doc and generated example artifacts were scanned for forbidden status terms, raw blocked field names, and legal-conclusion wording. No matches were found.

## Explicit Non-Goals

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
- no legal-conclusion language
- no forbidden status mapping
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`

## Recommendation

Use this generator as the next closed-default approval metadata checkpoint for any future limited internal admin preview proposal. The next step should be a policy/product/evidence/engineering review decision on the approval metadata shape, not app UI, persistence, production integration, or customer-facing output.
