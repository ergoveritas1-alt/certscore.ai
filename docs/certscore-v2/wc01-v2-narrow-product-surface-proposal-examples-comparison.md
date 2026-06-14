# WC01 v2 Narrow Product-Surface Proposal Examples Comparison

Internal comparison note only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Two narrow WC01 v2 product-surface proposal examples now exist for internal pattern validation:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Both use the same proposed future surface class:

```text
limited_admin_internal_preview
```

Both remain closed by default, not approved, and fail-closed because explicit approval metadata is missing for the blocked surface class.

## Example Artifacts

| Family | Input | Draft | Summary |
|---|---|---|---|
| `pre_consent_tracking` | `docs/certscore-v2/examples/Wc01V2ProductSurfaceProposalInput.narrow-pre-consent-tracking.example.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.summary.md` |
| `pre_consent_cookie_storage` | `docs/certscore-v2/examples/Wc01V2ProductSurfaceProposalInput.narrow-pre-consent-cookie-storage.example.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-cookie-storage.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-cookie-storage.summary.md` |

## Side-By-Side Result

| Check | `pre_consent_tracking` | `pre_consent_cookie_storage` |
|---|---:|---:|
| Proposed surface class | `limited_admin_internal_preview` | `limited_admin_internal_preview` |
| Allowed families | 1 | 1 |
| Blocked families / contexts | 17 | 17 |
| Evidence requirements | 11 | 13 |
| Guardrail requirements | 17 | 17 |
| Implementation status | `not_approved` | `not_approved` |
| Production eligible | `false` | `false` |
| Customer-facing eligible | `false` | `false` |
| Explicit approval required | `true` | `true` |
| Fail-closed reason | `explicit_approval_metadata_missing_for_blocked_surface` | `explicit_approval_metadata_missing_for_blocked_surface` |

## Interpretation

The second example confirms that the proposal artifact pattern can represent another non-sensitive family while preserving the same blocked posture.

The cookie/storage example adds stricter evidence requirements for party context and purpose exclusions. It does not approve cookie/storage output, wording, UI, persistence, production integration, or customer-facing behavior.

## Recommended Use

Use these two examples for internal policy/product/evidence/engineering review of the artifact pattern.

Recommended decision remains:

```text
Accept the proposal shape as an internal artifact pattern, keep blocked.
```

Do not create more family examples unless reviewers request additional coverage.

## Explicit Non-Goals

This comparison does not approve or create:

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
