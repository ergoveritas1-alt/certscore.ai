# WC01 v2 Product Surface Proposal Draft Design

Internal design only. Not customer-facing report output.

## Executive Summary

This design defines the artifact-only `Wc01V2ProductSurfaceProposalDraft` format for future internal product-surface proposals.

The artifact is needed because production-readiness gate drafts can describe whether an internal item is mature enough for a future proposal, but they do not describe the actual proposed surface, audience, copy posture, approval requirements, rollback/suppression plan, or blocked surface boundaries. The proposal draft creates a structured, non-persistent way to discuss a possible surface before any implementation.

This design does not approve:

- implementation
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

No reviewer action alone can create production eligibility. No readiness gate alone can create product output. Customer-facing final statuses are not defined.

## Inputs

Allowed inputs for a future proposal draft:

| Input | Status | Purpose |
|---|---|---|
| `Wc01V2ProductionReadinessGateDraft` | Future, if/when it exists | Source gate result and audit trail for a candidate item. |
| Policy/copy review artifact | Future, if/when it exists | Source policy/copy decision and wording posture. |
| Product-owner notes artifact | Future, if/when it exists | Product intent, target audience, and proposed surface rationale. |
| `docs/certscore-v2/wc01-v2-production-surface-taxonomy-design.md` | Existing design source | Defines allowed taxonomy classes and blocked surfaces. |
| `docs/certscore-v2/wc01-v2-internal-reviewer-workflow-stability-checkpoint.md` | Existing design source | Defines the adopted internal reviewer workflow and current operating boundary. |

The proposal draft should not read production report builders, checklist builders, executive summary code, scoring code, regulatory-lens code, persisted normalized concerns, unified findings, or production concern policy.

## Proposed Artifact Shape

Artifact name:

```text
Wc01V2ProductSurfaceProposalDraft
```

Proposed fields:

| Field | Required | Purpose |
|---|---|---|
| `packetVersion` | yes | Supported proposal draft contract version. |
| `proposedSurfaceClass` | yes | Target surface class from the production surface taxonomy. |
| `proposedSurfaceAudience` | yes | Intended audience, such as internal reviewer, product owner, internal operator, or customer. |
| `proposedSurfacePurpose` | yes | Why the surface is being proposed. |
| `sourceProductionReadinessGateDraft` | yes for next-stage proposals | Path or artifact ref for the source readiness gate draft. |
| `sourcePolicyCopyReviewArtifact` | required when wording or sensitive context is involved | Path or artifact ref for policy/copy decision context. |
| `sourceReviewerWorkflowDocs` | yes | Source docs used to justify the workflow boundary. |
| `allowedFamilies` | yes | Candidate families allowed in the proposal. |
| `blockedFamilies` | yes | Candidate families blocked from the proposal. |
| `sensitiveContextHandling` | yes | Category handling, routing, approvals, and blocked surface rules. |
| `copyPosture` | yes | Copy posture state and approval notes. |
| `evidenceRequirements` | yes | Required refs, excerpts, confidence/directness, family context, and guardrail checks. |
| `userVisibleWordingStatus` | yes | Whether wording is absent, internal-only, pending review, separately approved for a named surface, or blocked. |
| `guardrailRequirements` | yes | Required wording scans, raw-field checks, sanitizer checks, and regression checks. |
| `approvalRequirements` | yes | Required owners and approval records. |
| `rollbackSuppressionPlan` | yes | Suppression reason, hold state, owner, regression/guardrail check, and disable plan. |
| `implementationStatus` | yes | Always `not_approved` by default. |
| `productionEligible` | yes | Always `false` by default. |
| `customerFacingEligible` | yes | Always `false` by default. |
| `explicitApprovalRequired` | yes | Always `true`. |

Closed-default field values:

```json
{
  "implementationStatus": "not_approved",
  "productionEligible": false,
  "customerFacingEligible": false,
  "explicitApprovalRequired": true
}
```

## Proposed Surface Classes

| Surface class | Can proposal draft reference it? | Extra approvals required |
|---|---|---|
| internal evidence preview | Yes, as existing allowed surface context. | Evidence owner if changing evidence-preview behavior. |
| internal reviewer log | Yes, as existing allowed surface context. | Evidence owner if changing reviewer log shape. |
| internal policy/copy review artifact | Yes, design-only. | Policy owner and copy owner. |
| internal production-readiness draft | Yes, design-only. | Evidence owner, policy owner, product owner, engineering owner. |
| internal product proposal artifact | Yes, this artifact. | Product owner and engineering owner for any next step. |
| limited admin/internal preview | Yes, but blocked by default. | Product owner, engineering owner, access-control owner, policy/copy owner when wording is present. |
| customer-facing report row | Yes, but blocked by default. | Evidence owner, policy owner, copy owner, product owner, engineering owner, and explicit production proposal approval. |
| customer-facing checklist row | Yes, but blocked by default. | Checklist policy owner, evidence owner, copy owner, product owner, engineering owner, and explicit production proposal approval. |
| executive summary item | Yes, but blocked by default. | Executive-selection owner, product owner, policy/copy owner, engineering owner, and approved production projection. |
| top finding | Yes, but blocked by default. | Top-finding policy owner, product owner, policy/copy owner, engineering owner, and approved production projection. |
| score impact | Yes, but blocked by default. | Scoring owner, product owner, policy owner, engineering owner, regression approval, and rollback approval. |
| regulatory-lens output | Yes, but blocked by default. | Regulatory mapping owner, policy owner, copy owner, product owner, engineering owner, and approved production projection. |
| export/API/MCP output | Yes, but blocked by default. | Security/privacy reviewer, API/export contract owner, product owner, engineering owner, access-control owner, and policy/copy owner when wording is present. |

The proposal draft can reference blocked surface classes only to document that they are proposed or blocked. Referencing a class does not approve it.

## Fail-Closed Rules

The proposal draft must fail closed when:

- proposed surface is customer-facing without explicit approval metadata
- proposed surface is scoring/regulatory/API/export/UI/persistence without explicit approval metadata
- policy/copy approval is missing when wording or sensitive context is involved
- sensitive-context handling is missing
- evidence requirements are missing
- rollback/suppression plan is missing
- guardrail requirements are missing
- `productionEligible` is `true` by default
- `customerFacingEligible` is `true` by default
- `implementationStatus` is anything other than `not_approved` by default
- `explicitApprovalRequired` is not `true`
- source readiness gate draft is missing for any next-stage surface proposal
- allowed families or blocked families are missing
- proposed surface attempts to consume reviewer action directly as product eligibility

Fail-closed output should record a blocked or hold reason. It should not create product output.

## Copy Posture

Allowed copy posture states:

| State | Meaning | Default-eligible? |
|---|---|---|
| `no_user_visible_wording` | No user-visible wording is proposed. | yes |
| `draft_internal_only` | Draft wording exists only for internal review. | yes |
| `policy_copy_review_required` | Wording cannot move forward until policy/copy review is complete. | yes |
| `separately_approved_for_named_surface` | Wording is approved for a specific named surface only. | no; requires approval metadata |
| `blocked` | Wording is blocked. | yes, as a hold state |

Default should be `no_user_visible_wording` or `policy_copy_review_required`.

Copy posture must not create customer-facing eligibility. Even `separately_approved_for_named_surface` only records a required approval input for a future proposal.

## Sensitive-Context Handling

Sensitive-context items default to blocked from customer-facing surfaces.

Context labels must not become customer-facing claims.

Sensitive context must not create:

- promotion
- score impact
- checklist posture
- regulatory output
- executive summary selection
- top-finding selection
- customer-facing wording

Separate policy/product/copy approval is required by category:

| Category | Required handling |
|---|---|
| health | Policy/copy review required before any wording references health context. |
| reproductive health | Strictest policy/copy review required; default internal-only. |
| finance | Purpose separation and policy/copy review required. |
| public benefits | Policy/copy review required before any wording references public-benefits context. |
| employment / HR | Policy/copy review required before any wording references applicant or employment context. |
| behavioral analytics reference sites | Collection endpoint or equivalent strong runtime context required for session replay/behavioral analytics handling; reference-site labels remain internal. |

## Approval Requirements

Required owners:

| Owner | Required for |
|---|---|
| Evidence owner | Evidence sufficiency, refs/excerpts, confidence/directness, family context. |
| Policy owner | Sensitive-context handling, family scope, and policy posture. |
| Copy owner | Any proposed wording, even internal draft wording intended to inform a future surface. |
| Product owner | Proposed surface class, audience, purpose, and product boundary. |
| Engineering owner | Feasibility, integration boundary, guardrails, rollback/suppression plan, and test strategy. |
| Security/privacy reviewer | Required if API/export/MCP, access-control changes, or data exposure beyond internal artifacts is proposed. |

Approval records should include owner, decision, timestamp, scope, and notes. No approval record should imply implementation approval unless it explicitly says so in a separate approved production proposal.

## Rollback/Suppression Plan

Every proposal draft must include:

- suppression reason
- hold state
- rollback owner
- regression/guardrail check
- emergency disable plan for any future implementation proposal
- conditions that would return the item to internal-only handling
- notes on how customer-facing exposure would be prevented unless separately approved

Rollback/suppression design is required even when the proposed surface is internal-only.

## Non-Goals

This design does not approve:

- implementation
- app UI
- persistence
- production integration
- production concern policy calls
- persisted normalized concerns
- unified findings
- report/checklist/executive/top-finding/scoring/regulatory-lens output
- customer-facing copy
- legal-conclusion language
- forbidden status mapping
- changes to `apps/web/components/scans/shared-scan-detail-view.tsx`

## Future Implementation Prompt: Not Approved

The following prompt is for a future implementation discussion only. It is not approved for implementation.

```text
Implement an artifact-only WC01 v2 product surface proposal draft generator.

Inputs:
- Wc01V2ProductionReadinessGateDraft.json, if available
- policy/copy review artifact, if available
- product-owner notes artifact, if available
- docs/certscore-v2/wc01-v2-production-surface-taxonomy-design.md as the surface taxonomy source
- docs/certscore-v2/wc01-v2-internal-reviewer-workflow-stability-checkpoint.md as reviewer workflow context

Output:
- Wc01V2ProductSurfaceProposalDraft.json
- Wc01V2ProductSurfaceProposalDraft.summary.md

Requirements:
- read artifact inputs only
- validate proposedSurfaceClass against the taxonomy
- write proposedSurfaceAudience and proposedSurfacePurpose
- preserve sourceProductionReadinessGateDraft, sourcePolicyCopyReviewArtifact, and sourceReviewerWorkflowDocs
- write allowedFamilies and blockedFamilies
- write sensitiveContextHandling, copyPosture, evidenceRequirements, userVisibleWordingStatus, guardrailRequirements, approvalRequirements, and rollbackSuppressionPlan
- set implementationStatus to not_approved by default
- set productionEligible false by default
- set customerFacingEligible false by default
- set explicitApprovalRequired true
- fail closed when customer-facing, scoring, regulatory, API/export/MCP, app UI, persistence, production concern policy, unified finding, report, checklist, executive, or top-finding surfaces are proposed without explicit approval metadata
- fail closed when policy/copy approval, sensitive-context handling, evidence requirements, guardrail requirements, or rollback/suppression plan are missing
- emit internal diagnostic JSON/Markdown only

Boundaries:
- no app UI
- no persistence
- no production integration
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no report/checklist/executive/top-finding/scoring/regulatory-lens output
- no customer-facing copy
- no legal-conclusion language
- no forbidden status mapping
- no changes to apps/web/components/scans/shared-scan-detail-view.tsx
```
