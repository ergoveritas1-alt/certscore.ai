# WC01 v2 Product Surface Decision Packet

Internal decision packet only. Not customer-facing report output.

## Executive Summary

WC01 v2 now has three design layers for future product-surface consideration:

- `docs/certscore-v2/wc01-v2-production-readiness-gate-design.md`
- `docs/certscore-v2/wc01-v2-production-surface-taxonomy-design.md`
- `docs/certscore-v2/wc01-v2-product-surface-proposal-draft-design.md`

Together, these designs define how an internal reviewer result could eventually be evaluated, how possible future surfaces are classified, and how a product-surface proposal could be documented before implementation.

This packet asks product/policy to decide whether the next artifact-only stage is approved:

```text
Wc01V2ProductSurfaceProposalDraft generator
```

Recommended decision: approve the artifact-only product surface proposal draft generator. Do not approve app UI, persistence, production report mapping, checklist output, executive output, top findings, scoring, regulatory-lens output, API/export/MCP output, customer-facing copy, production concern policy calls, persisted normalized concerns, or unified findings.

## Current State

Grouped evidence preview is adopted as the internal reviewer workflow.

The current workflow remains:

- artifact-only
- internal-only
- non-persistent
- manually reviewed
- guarded by display-safe evidence, source refs, excerpt refs, unresolved-ref handling, warning categories, and manual reviewer logs

Sensitive-context labels remain review routing metadata only. They must not create stronger findings, customer-facing language, score impact, checklist posture, regulatory output, or production eligibility.

No reviewer action alone creates production eligibility. No production-readiness gate result alone creates product output.

## Design Chain

```text
Grouped evidence preview
-> manual reviewer log
-> sensitive-context policy/copy review design
-> production-readiness gate design
-> production surface taxonomy design
-> product surface proposal draft design
-> future artifact-only generator, if approved
```

The proposed next stage would generate an internal proposal artifact only. It would not implement any product surface.

## Decision Requested

| Decision | Recommended answer | Notes |
|---|---|---|
| Approve implementation of an artifact-only `Wc01V2ProductSurfaceProposalDraft` generator? | Yes | This would create JSON/Markdown proposal drafts only. |
| Approve app UI or admin preview? | No | UI remains blocked until a separate proposal. |
| Approve persistence or reviewer decision storage? | No | The workflow remains artifact-only. |
| Approve production report/checklist/executive/top-finding/scoring/regulatory output? | No | All production/product surfaces remain blocked. |
| Approve API/MCP/export output? | No | Externalized outputs remain blocked. |
| Approve customer-facing copy? | No | Copy remains absent or internal-only unless separately approved. |
| Approve production concern policy calls or unified findings? | No | Production WC01 pipelines remain untouched. |

## Proposed Next Artifact

Artifact:

```text
Wc01V2ProductSurfaceProposalDraft
```

Purpose:

Document a future product-surface proposal before implementation.

Expected outputs:

- `Wc01V2ProductSurfaceProposalDraft.json`
- `Wc01V2ProductSurfaceProposalDraft.summary.md`

Allowed inputs:

- `Wc01V2ProductionReadinessGateDraft`, if/when it exists
- policy/copy review artifact, if/when it exists
- product-owner notes artifact, if/when it exists
- production surface taxonomy design
- reviewer workflow stability checkpoint

Closed defaults:

```json
{
  "implementationStatus": "not_approved",
  "productionEligible": false,
  "customerFacingEligible": false,
  "explicitApprovalRequired": true
}
```

## What This Would Enable

If approved, the next technical stage would allow internal reviewers, product owners, and policy/copy owners to produce a structured proposal draft that records:

- proposed surface class
- proposed audience and purpose
- allowed and blocked families
- sensitive-context handling
- copy posture
- evidence requirements
- guardrail requirements
- approval requirements
- rollback/suppression plan
- implementation status fixed to `not_approved`

This would make future product-surface discussions easier to review without creating product behavior.

## What Remains Blocked

The following remain blocked:

- app UI
- admin/internal preview UI
- persistence
- production integration
- production concern policy calls
- persisted normalized concerns
- unified findings
- customer-facing report rows
- checklist rows
- executive summaries
- top findings
- scoring changes
- regulatory-lens output
- API/MCP/export output
- customer-facing copy
- legal-conclusion language
- forbidden status mapping

## Sensitive-Context Decision Point

Sensitive-context items should remain blocked from customer-facing surfaces unless a later proposal includes separate approval from:

- policy owner
- copy owner
- product owner
- evidence owner
- engineering owner

Covered categories:

- health
- reproductive health
- finance
- public benefits
- employment / HR
- behavioral analytics reference sites

Sensitive-context labels must remain routing metadata. They must not become customer-facing claims or product-surface eligibility.

## Approval Criteria For The Next Technical Stage

Approve the artifact-only generator only if product/policy agrees that:

- the proposal artifact is internal-only
- implementation status defaults to `not_approved`
- production and customer-facing eligibility default to `false`
- explicit approval is always required
- blocked surfaces stay blocked by default
- sensitive-context handling is required before any named surface proposal
- missing policy/copy, evidence, guardrail, or rollback fields fail closed
- no product output is created

## Recommended Decision

Recommended decision:

```text
Approve artifact-only Wc01V2ProductSurfaceProposalDraft generator.
Do not approve production integration or customer-facing output.
```

Rationale:

The generator would improve review discipline by making future product-surface proposals structured and auditable while preserving all current boundaries. It is the smallest safe next technical step after the gate, taxonomy, and proposal-draft designs.

## Non-Goals

This packet does not approve:

- implementation beyond a future artifact-only proposal draft generator
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

## Future Implementation Prompt: Not Approved Until Product/Policy Decision

The following prompt is for use only if product/policy approves the artifact-only generator.

```text
Implement an artifact-only WC01 v2 product surface proposal draft generator in @certscore/report-adapter.

Input:
- Wc01V2ProductionReadinessGateDraft.json, if available
- policy/copy review artifact, if available
- product-owner notes artifact, if available
- docs/certscore-v2/wc01-v2-production-surface-taxonomy-design.md
- docs/certscore-v2/wc01-v2-internal-reviewer-workflow-stability-checkpoint.md

Output:
- Wc01V2ProductSurfaceProposalDraft.json
- Wc01V2ProductSurfaceProposalDraft.summary.md

Requirements:
- artifact-only
- non-persistent
- no app UI
- implementationStatus defaults to not_approved
- productionEligible defaults to false
- customerFacingEligible defaults to false
- explicitApprovalRequired defaults to true
- fail closed on missing policy/copy, sensitive-context, evidence, guardrail, approval, or rollback/suppression fields
- fail closed for any production/customer-facing/scoring/regulatory/API/export/UI/persistence surface without explicit approval metadata
- emit internal diagnostic JSON/Markdown only

Boundaries:
- no production integration
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no report/checklist/executive/top-finding/scoring/regulatory-lens output
- no API/MCP/export output
- no customer-facing copy
- no legal-conclusion language
- no forbidden status mapping
- no changes to apps/web/components/scans/shared-scan-detail-view.tsx
```
