# WC01 v2 Narrow Product-Surface Proposal Examples Decision

Internal decision note only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Decision: **Accept both proposal examples as valid internal artifact patterns, keep both blocked.**

Two narrow WC01 v2 product-surface proposal examples now exist:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Both examples use the proposed future surface class:

```text
limited_admin_internal_preview
```

Both remain closed by default:

| Check | Result |
|---|---|
| Implementation status | `not_approved` |
| Production eligible | `false` |
| Customer-facing eligible | `false` |
| Explicit approval required | `true` |
| Fail-closed reason | `explicit_approval_metadata_missing_for_blocked_surface` |

The fail-closed state is expected and desired. These examples validate the proposal artifact pattern only. They do not approve implementation or any product surface.

## Example Comparison

| Check | `pre_consent_tracking` | `pre_consent_cookie_storage` |
|---|---:|---:|
| Proposed surface class | `limited_admin_internal_preview` | `limited_admin_internal_preview` |
| Allowed families | 1 | 1 |
| Allowed family | `pre_consent_tracking` | `pre_consent_cookie_storage` |
| Blocked families / contexts | 17 | 17 |
| Evidence requirements | 11 | 13 |
| Guardrail requirements | 17 | 17 |
| Implementation status | `not_approved` | `not_approved` |
| Production eligible | `false` | `false` |
| Customer-facing eligible | `false` | `false` |
| Explicit approval required | `true` | `true` |
| Fail-closed reason | `explicit_approval_metadata_missing_for_blocked_surface` | `explicit_approval_metadata_missing_for_blocked_surface` |

Example artifacts:

| Family | Draft summary |
|---|---|
| `pre_consent_tracking` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.summary.md` |
| `pre_consent_cookie_storage` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-cookie-storage.summary.md` |

## Decision Record

The two examples are accepted as reusable internal artifact patterns.

Decision details:

- Accept the shape as reusable for internal proposal review.
- Keep both examples blocked until explicit approval metadata exists.
- Do not create more examples unless reviewers request additional coverage.
- Do not implement any surface.
- Do not create app UI, persistence, production integration, customer-facing output, production concern policy calls, persisted normalized concerns, unified findings, report rows, checklist rows, executive rows, top findings, scoring output, regulatory-lens output, or API/MCP/export output.

The examples may be used for policy/product/evidence/engineering review of the proposal pattern.

## Required Future Approval Metadata

Before any future implementation proposal, a separate artifact must include:

- named product approval
- named policy approval
- named copy approval
- named engineering approval
- target surface approval
- evidence family approval
- copy posture approval
- rollback/suppression plan
- guardrail scan result
- explicit implementation proposal

Approval metadata should include:

- owner name or role
- decision
- scope
- timestamp
- artifact reference
- limitations or conditions
- rollback/suppression owner

No approval metadata should be interpreted as implementation, production, or customer-facing approval unless a separate implementation proposal explicitly says so.

## Explicit Non-Goals

This decision does not approve or create:

- implementation
- app UI
- persistence
- production integration
- customer-facing output
- production concern policy calls
- persisted normalized concerns
- unified findings
- report/checklist/executive/top-finding/scoring/regulatory-lens output
- API/MCP/export output
- legal-conclusion language
- forbidden status mapping
- changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
