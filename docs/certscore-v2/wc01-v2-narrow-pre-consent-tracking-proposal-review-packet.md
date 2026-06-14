# WC01 v2 Narrow Pre-Consent Tracking Proposal Review Packet

Internal policy/product review packet only. Not implementation approval. Not customer-facing report output.

## Executive Summary

One concrete WC01 v2 product-surface proposal example now exists for review.

The example proposes a future surface class of:

```text
limited_admin_internal_preview
```

The allowed family is:

```text
pre_consent_tracking
```

The proposal remains closed by default:

```json
{
  "implementationStatus": "not_approved",
  "productionEligible": false,
  "customerFacingEligible": false,
  "explicitApprovalRequired": true
}
```

It is also fail-closed with:

```text
explicit_approval_metadata_missing_for_blocked_surface
```

That fail-closed state is expected and desired. The packet asks reviewers whether this is the right internal artifact shape to reuse, not whether to implement a product surface.

## Artifact Summary

Source input:

```text
docs/certscore-v2/examples/Wc01V2ProductSurfaceProposalInput.narrow-pre-consent-tracking.example.json
```

Generated draft:

```text
artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.json
```

Generated summary:

```text
artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.summary.md
```

Command used:

```bash
pnpm v2:wc01-product-surface-proposal \
  --input ./docs/certscore-v2/examples/Wc01V2ProductSurfaceProposalInput.narrow-pre-consent-tracking.example.json \
  --out ./artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.json \
  --summary ./artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.summary.md
```

Closed-default flags:

| Flag | Value |
|---|---|
| `implementationStatus` | `not_approved` |
| `productionEligible` | `false` |
| `customerFacingEligible` | `false` |
| `explicitApprovalRequired` | `true` |

Guardrail flags:

| Guardrail | Value |
|---|---|
| `noAppUi` | `true` |
| `noPersistence` | `true` |
| `noProductionIntegration` | `true` |
| `noProductionConcernPolicyCall` | `true` |
| `noPersistedNormalizedConcerns` | `true` |
| `noUnifiedFindings` | `true` |
| `noReportChecklistExecutiveScoringRegulatoryOutput` | `true` |
| `noApiMcpExportOutput` | `true` |
| `noCustomerFacingCopy` | `true` |
| `noLegalConclusionLanguage` | `true` |
| `noForbiddenStatusMapping` | `true` |
| `noRawBlockedFields` | `true` |

## Proposal Scope

| Scope item | Value |
|---|---|
| Surface class | `limited_admin_internal_preview` |
| Allowed family | `pre_consent_tracking` |
| Blocked families / contexts | 17 |
| Sensitive context required | `false` |
| Sensitive-context categories | none |
| Copy posture | `draft_internal_only` |
| User-visible wording status | `no_user_visible_wording` |
| Evidence requirements | 11 |
| Guardrail requirements | 17 |
| Approval requirements | 5 pending |

Blocked families and contexts:

- `pre_consent_cookie_storage`
- `session_replay_behavioral_analytics`
- `third_party_vendors_observed`
- `consent_banner_observed_or_not_observed`
- `unresolved_endpoint_review`
- `policy_runtime_alignment`
- `consent_flow_delta_or_persistence`
- `tag_management`
- `consent_management`
- `security`
- `performance_monitoring`
- `customer_support`
- `infrastructure`
- `fraud_bot`
- `rum`
- `live_chat`
- `sensitive_context`

## Fail-Closed Status

The generated draft includes this fail-closed reason:

```text
explicit_approval_metadata_missing_for_blocked_surface
```

This is expected because `limited_admin_internal_preview` is a blocked/high-risk surface class in the taxonomy unless explicit approval metadata exists.

For this review packet, that fail-closed reason is useful. It confirms the proposal can describe a future internal/admin surface while still preventing implementation, UI, persistence, production mapping, or customer-facing output from being treated as approved.

The proposed review decision should therefore focus on:

- whether the artifact shape is understandable
- whether the family scope is narrow enough
- whether blocked families and contexts are complete enough
- whether the approval metadata required before any next step is clear

## Review Questions

Policy/product reviewers should answer:

| Question | Reviewer notes |
|---|---|
| Is `limited_admin_internal_preview` the right first proposal surface? |  |
| Is `pre_consent_tracking` the right first allowed family? |  |
| Are the 17 blocked families and contexts complete enough? |  |
| Are evidence requirements sufficient for this proposal shape? |  |
| Are guardrail requirements sufficient for this proposal shape? |  |
| Is `draft_internal_only` the right copy posture? |  |
| Should this remain blocked until explicit approval metadata exists? |  |
| What approval metadata would be required before any implementation proposal? |  |

Minimum approval metadata to consider later:

- evidence owner decision and scope
- policy owner decision and scope
- copy owner decision and scope
- product owner decision and scope
- engineering owner decision and scope
- timestamped artifact reference
- explicit statement that approval is for the proposal shape only unless separately stated
- suppression or rollback owner

## Decision Options

| Option | Decision |
|---|---|
| A | Accept proposal shape as an internal artifact pattern, keep blocked. |
| B | Revise proposal shape before reuse. |
| C | Choose a different first family. |
| D | Choose a different first surface. |
| E | Stop product-surface proposal work. |

Recommended default:

```text
A. Accept proposal shape as internal artifact pattern, keep blocked.
```

Rationale:

- The example is concrete and reviewable.
- The first allowed family is narrow.
- Sensitive context is excluded.
- The surface remains blocked.
- All eligibility flags remain false.
- The fail-closed reason is expected for this surface class.
- The artifact does not create product behavior.

## Reviewer Decision Table

| Reviewer | Decision option | Required changes | Approval metadata required later? | Notes |
|---|---|---|---|---|
| Evidence owner |  |  |  |  |
| Policy owner |  |  |  |  |
| Copy owner |  |  |  |  |
| Product owner |  |  |  |  |
| Engineering owner |  |  |  |  |

## Explicit Non-Goals

This review packet does not approve or create:

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
