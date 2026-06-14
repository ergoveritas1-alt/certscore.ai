# WC01 v2 Limited Admin Preview Approval Metadata Decision

## Executive Summary

Decision: A. Accept the approval metadata pattern as-is; keep blocked.

The `Wc01V2LimitedAdminPreviewApprovalMetadata` pattern is accepted as a reusable internal approval checkpoint for future limited internal admin preview proposals. This acceptance applies only to the artifact pattern and review structure.

The example metadata remains incomplete, blocked, and closed by default. This decision does not approve implementation, app UI, persistence, production integration, product output, customer-facing output, production concern policy calls, persisted concerns, unified findings, report rows, checklist rows, executive rows, scoring output, regulatory-lens output, or API/MCP/export output.

## Reviewed Artifacts

| Artifact | Path |
|---|---|
| Generator follow-up | `docs/certscore-v2/wc01-v2-limited-admin-preview-approval-metadata-generator-followup.md` |
| Generated metadata JSON | `artifacts/example/Wc01V2LimitedAdminPreviewApprovalMetadata.json` |
| Generated metadata summary | `artifacts/example/Wc01V2LimitedAdminPreviewApprovalMetadata.summary.md` |

## Decision Table

| Review question | Decision | Notes |
|---|---|---|
| Is the metadata shape understandable? | yes | The artifact clearly separates source chain, owner approvals, access control, data handling, evidence requirements, copy posture, sensitive-context handling, guardrails, rollback, and closed-default flags. |
| Are owner approval roles sufficient for this stage? | yes | Product, policy, copy, evidence, and engineering owner placeholders are enough for approval-metadata review. |
| Is `limited_admin_internal_preview` the right proposed surface for this metadata? | yes | It is the narrowest plausible future surface and remains blocked until explicit approval exists. |
| Are the allowed families appropriate? | yes | The metadata stays limited to `pre_consent_tracking` and `pre_consent_cookie_storage`. |
| Are blocked families and contexts complete enough? | yes | The artifact blocks 17 families and contexts, including sensitive-context items and diagnostic-only purposes. |
| Are access-control and data-handling requirements sufficient for this stage? | yes | The requirements preserve artifact-only, read-only, internal-only posture. |
| Is the copy posture sufficiently closed? | yes | Copy posture remains `internal_diagnostic_only`. |
| Are fail-closed reasons clear? | yes | Current fail-closed reasons are expected: `implementation_proposal_missing` and `owner_approvals_missing`. |
| Should the pattern be reused? | yes | Reuse is approved for structured internal approval-metadata review only. |
| Should implementation begin? | no | Implementation remains blocked. |

## Accepted Pattern

Accepted for internal reuse:

- artifact type: `Wc01V2LimitedAdminPreviewApprovalMetadata`
- target surface class: `limited_admin_internal_preview`
- allowed families:
  - `pre_consent_tracking`
  - `pre_consent_cookie_storage`
- owner approval roles:
  - product
  - policy
  - copy
  - evidence
  - engineering
- approval status: `incomplete`
- implementation status: `not_approved`
- fail-closed reasons:
  - `implementation_proposal_missing`
  - `owner_approvals_missing`

Closed-default flags remain:

- `productionEligible:false`
- `persistEligible:false`
- `concernPolicyCallEligible:false`
- `unifiedFindingEligible:false`
- `checklistProjectionEligible:false`
- `customerFacingEligible:false`
- `explicitApprovalRequired:true`

## What Is Approved

Only the following is approved:

- reuse of the approval metadata artifact pattern for internal review discussions
- use of the generated example as a closed-default reference artifact
- continued design work around approval metadata requirements

## What Is Not Approved

The following remain blocked:

- implementation
- app UI
- persistence
- production integration
- production concern policy calls
- persisted normalized concerns
- unified findings
- report rows
- checklist rows
- executive summaries
- top findings
- scoring output
- regulatory-lens output
- API/MCP/export output
- customer-facing copy
- legal-conclusion language
- forbidden status mapping

## Future Approval Metadata Required

Before any implementation proposal could be considered, the following metadata would be required:

- named product owner approval
- named policy owner approval
- named copy owner approval
- named evidence owner approval
- named engineering owner approval
- approved target surface
- approved evidence families
- approved blocked families and contexts
- approved access-control plan
- approved data-handling plan
- approved copy posture
- approved sensitive-context exclusion or handling plan
- approved rollback/suppression plan
- clean guardrail scan result
- explicit implementation proposal ID or path

## Next Operating Recommendation

Stop short of implementation. Use this accepted metadata pattern as the approval checkpoint for any future limited internal admin preview proposal.

The next allowed step is approval-metadata refinement or owner-review preparation if a concrete implementation proposal is later requested. Do not proceed to app UI, persistence, production integration, report/checklist/executive/scoring/regulatory/API output, or customer-facing copy from this decision alone.

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
