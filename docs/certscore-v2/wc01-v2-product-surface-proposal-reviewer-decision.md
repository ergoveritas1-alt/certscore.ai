# WC01 v2 Product Surface Proposal Reviewer Decision

Internal decision summary only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Decision: **A. Accept proposal pattern as-is; keep blocked.**

The WC01 v2 product-surface proposal artifact pattern is accepted for structured internal proposal review. The pattern remains blocked and does not approve implementation, product surface behavior, production integration, or customer-facing output.

The accepted scope is narrow:

- the artifact pattern may be reused for internal proposal review
- the two current examples remain the review baseline
- no additional examples are needed unless reviewers request a specific family

This decision does not approve app UI, persistence, production integration, production concern policy calls, persisted normalized concerns, unified findings, report/checklist/executive/scoring/regulatory/API/export output, or customer-facing copy.

## Decision Table

| Reviewer question | Answer | Notes |
|---|---|---|
| Is the proposal shape understandable? | Yes | The artifact inventory, closed-default flags, and fail-closed reason are clear. |
| Is `limited_admin_internal_preview` appropriate for internal-only review? | Yes | It is appropriate as a first proposed surface because it remains internal and review-scoped. |
| Is `pre_consent_tracking` an appropriate first allowed family? | Yes | It is narrow, high-signal, and already exercised in the v2 internal pipeline. |
| Is `pre_consent_cookie_storage` an appropriate first allowed family? | Yes | It is a useful paired example because it is related but distinct enough to test the pattern. |
| Are blocked families and contexts complete enough? | Yes | Complete enough for artifact-pattern review. Recheck before any future implementation proposal. |
| Are evidence requirements sufficient for artifact-pattern review? | Yes | Sufficient for this internal pattern review. Future implementation would need separate criteria. |
| Are guardrails sufficient? | Yes | The closed defaults and blocked-surface behavior are explicit. |
| Is copy posture sufficiently closed? | Yes | `draft_internal_only` and no user-visible wording are the right posture. |
| Is the approval metadata gap clear? | Yes | The fail-closed reason makes the missing approval state clear. |
| Should this pattern be reused? | Yes | Reuse internally for structured proposal review. |
| Should more examples be created? | No, not now | The two examples are enough unless reviewers request a specific additional family. |

## Accepted Pattern

Accepted internal proposal pattern:

```text
Wc01V2ProductSurfaceProposalDraft
```

Proposed future surface:

```text
limited_admin_internal_preview
```

Accepted examples:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Both examples remain closed by default:

| Check | Result |
|---|---|
| Implementation status | `not_approved` |
| Production eligible | `false` |
| Customer-facing eligible | `false` |
| Explicit approval required | `true` |
| Fail-closed reason | `explicit_approval_metadata_missing_for_blocked_surface` |

The fail-closed reason remains expected until explicit approval metadata exists. It should continue to block implementation and product-surface movement.

## What Is Approved

Only the following is approved:

- reuse of the artifact pattern for structured internal proposal review

The proposal pattern may be used to organize future internal review discussions. It cannot create product output.

## What Is Not Approved

This decision does not approve:

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

## Future Approval Metadata Required

Before any implementation proposal, a separate approval metadata artifact must include:

- named product owner approval
- named policy owner approval
- named copy owner approval
- named engineering owner approval
- approved target surface
- approved evidence families
- approved blocked families
- approved copy posture
- rollback/suppression plan
- guardrail scan result
- explicit implementation proposal ID/path

Approval metadata should record scope, owner role, artifact references, decision timestamp, limitations or conditions, and rollback/suppression ownership.

Approval metadata alone should not create implementation, product output, or customer-facing output. It should only be an input to a separate implementation proposal.

## Next Operating Recommendation

Stop creating examples unless reviewers request a specific additional family.

Use the two accepted examples as the current review baseline:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

The next real step is external/product/policy validation or explicit approval-metadata design, not implementation.

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
