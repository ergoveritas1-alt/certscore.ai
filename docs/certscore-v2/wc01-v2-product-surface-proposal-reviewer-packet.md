# WC01 v2 Product Surface Proposal Reviewer Packet

Internal reviewer packet only. Not implementation approval. Not customer-facing report output.

## Executive Summary

This packet asks policy, product, evidence, and engineering reviewers to evaluate whether the WC01 v2 product-surface proposal artifact shape is understandable and reusable for future internal review.

Two accepted narrow examples are included:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Both examples use the proposed future surface class:

```text
limited_admin_internal_preview
```

Both examples remain blocked and not approved:

| Check | Result |
|---|---|
| Implementation status | `not_approved` |
| Production eligible | `false` |
| Customer-facing eligible | `false` |
| Explicit approval required | `true` |
| Fail-closed reason | `explicit_approval_metadata_missing_for_blocked_surface` |

Reviewers are being asked to review the proposal artifact pattern only. This packet does not approve implementation, app UI, persistence, production integration, customer-facing output, production concern policy calls, persisted concerns, unified findings, report/checklist/executive/scoring/regulatory/API/export output, or customer-facing copy.

Only two examples are included because the current decision is to validate the reusable pattern, not to expand the family set. Additional examples should be created only if reviewers request more coverage.

## Reviewer Objective

Reviewers should evaluate:

- whether the proposal artifact shape is understandable
- whether `limited_admin_internal_preview` is the right first proposed surface
- whether `pre_consent_tracking` and `pre_consent_cookie_storage` are appropriate first families
- whether blocked families and contexts are complete enough
- whether evidence requirements are sufficient
- whether guardrail requirements are sufficient
- whether fail-closed behavior is clear
- what approval metadata would be required before any implementation proposal

The expected output of this review is feedback on the artifact pattern. It is not approval to build or display anything.

## Artifact Inventory

| Family | Input path | Draft path | Summary path | Proposed surface class | Evidence requirement count | Blocked family/context count | Fail-closed reason |
|---|---|---|---|---|---:|---:|---|
| `pre_consent_tracking` | `docs/certscore-v2/examples/Wc01V2ProductSurfaceProposalInput.narrow-pre-consent-tracking.example.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.summary.md` | `limited_admin_internal_preview` | 11 | 17 | `explicit_approval_metadata_missing_for_blocked_surface` |
| `pre_consent_cookie_storage` | `docs/certscore-v2/examples/Wc01V2ProductSurfaceProposalInput.narrow-pre-consent-cookie-storage.example.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-cookie-storage.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-cookie-storage.summary.md` | `limited_admin_internal_preview` | 13 | 17 | `explicit_approval_metadata_missing_for_blocked_surface` |

Source review docs:

- `docs/certscore-v2/wc01-v2-product-surface-proposal-pattern-checkpoint.md`
- `docs/certscore-v2/wc01-v2-narrow-product-surface-proposal-examples-comparison.md`

## Review Instructions

Review summaries first:

- `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.summary.md`
- `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-cookie-storage.summary.md`

Open JSON only if the summaries are not enough to understand the proposal shape:

- `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.json`
- `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-cookie-storage.json`

Review boundaries:

- do not evaluate legal compliance
- do not approve customer-facing output
- do not approve production integration
- do not approve app UI or persistence
- do not approve report/checklist/executive/scoring/regulatory/API/export output
- treat this as internal artifact-pattern review only

## Reviewer Questions

Use yes/no plus notes.

| Question | Yes/No | Notes |
|---|---|---|
| Is the proposal shape understandable? |  |  |
| Is `limited_admin_internal_preview` appropriate for internal-only review? |  |  |
| Is `pre_consent_tracking` an appropriate first allowed family? |  |  |
| Is `pre_consent_cookie_storage` an appropriate first allowed family? |  |  |
| Are blocked families and contexts complete enough? |  |  |
| Are evidence requirements sufficient? |  |  |
| Are guardrails sufficient? |  |  |
| Is copy posture sufficiently closed? |  |  |
| Is the approval metadata gap clear? |  |  |
| Should this pattern be reused? |  |  |
| Should more examples be created? |  |  |

## Decision Options

Recommended default:

```text
A. Accept proposal pattern as-is; keep blocked.
```

Decision options:

| Option | Decision | Meaning |
|---|---|---|
| A | Accept proposal pattern as-is; keep blocked. | Pattern can be reused internally. No implementation approval. |
| B | Accept with minor doc refinements; keep blocked. | Pattern is acceptable after wording or summary improvements. No implementation approval. |
| C | Revise artifact fields before reuse. | Pattern needs structural changes before it is reused. |
| D | Add one more non-sensitive example before deciding. | Reviewers need one additional example before accepting the pattern. |
| E | Stop proposal-surface work. | Do not continue this internal proposal lane. |

## Approval Metadata Checklist

Before any future implementation proposal, an approval metadata artifact would need to include:

- named product owner approval
- named policy owner approval
- named copy owner approval
- named engineering owner approval
- approved target surface
- approved evidence families
- approved blocked families
- approved copy posture
- approved rollback/suppression plan
- approved guardrail scan result
- explicit implementation proposal ID/path

Approval metadata should also record:

- owner role and decision
- approval scope
- artifact references
- decision timestamp
- limitations or conditions
- rollback/suppression owner

Approval metadata alone should not create implementation or product output. It should only be an input to a separate implementation proposal.

## Explicit Non-Goals

This reviewer packet does not approve or create:

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
