# WC01 v2 Narrow Production Proposal Design

Internal design only. Not customer-facing report output.

## Executive Summary

This document proposes the narrowest next design step after the stabilized WC01 v2 internal artifact chain and fresh calibration expansion.

The proposed next surface is not a production report, checklist, executive summary, top finding, score impact, regulatory-lens output, app UI, API/MCP/export output, persistence path, or customer-facing copy. The proposed surface is an internal, artifact-only product proposal describing a possible future low-risk surface before any implementation is approved.

The goal is to let product, policy, copy, and engineering owners decide whether a limited future surface is worth designing further, while keeping all current WC01 v2 outputs closed by default.

Recommended proposal:

```text
Surface class: internal product proposal artifact
Target future surface under discussion: limited internal/admin diagnostic preview
Initial family scope: non-sensitive pre_consent_tracking only
Output status: design-only, not approved for implementation
```

## Current Readiness Basis

The fresh edge-cohort expansion completed the internal chain with clean guardrails:

| Check | Result |
|---|---:|
| Sites completed | 30/30 |
| WC01 shadow succeeded | 30/30 |
| WC01 shadow sanitizer warnings | 0 |
| Allowlist candidates | 34 |
| Reviewer queue items | 34 |
| Evidence-preview unresolved refs | 0 |
| Evidence-preview guardrail failures | 0 |
| Production eligibility true count | 0 |
| Top-finding eligibility true count | 0 |
| Gap eligibility true count | 0 |
| Artifact-chain smoke | 13 checks passed |

The internal artifact path remains:

```text
Wc01V2ShadowProjection
-> Wc01V2AllowlistDryRun
-> Wc01V2ConcernPolicyInputDraft
-> Wc01V2ConcernPolicySimulationDryRun
-> V2NormalizedConcernCandidateDraft
-> Wc01V2ConcernPolicyComparisonDryRun
-> Wc01V2ManualReviewerPacket
-> Wc01V2EvidencePreviewPacket
-> manual reviewer workflow
-> policy/copy review artifact
-> production-readiness gate draft
-> product surface proposal draft
```

No step in that chain creates product output.

## Proposed Surface Class

Proposed surface class:

```text
internal product proposal artifact
```

Concrete artifact:

```text
Wc01V2ProductSurfaceProposalDraft
```

Current status:

```json
{
  "implementationStatus": "not_approved",
  "productionEligible": false,
  "customerFacingEligible": false,
  "explicitApprovalRequired": true
}
```

This proposal design recommends using the product proposal artifact to describe a future limited internal/admin diagnostic preview. It does not approve building that preview.

## Proposed Future Surface Under Discussion

Future surface under discussion:

```text
limited internal/admin diagnostic preview
```

Purpose:

- let authorized internal users inspect reviewed WC01 v2 evidence shape
- preserve the grouped evidence preview workflow
- keep all labels diagnostic and review-only
- avoid any customer-facing report, checklist, executive, score, regulatory, API/export, or production concern policy behavior

Current status:

```text
blocked until separately approved
```

This document only defines what a proposal for that future surface would need to include.

## Allowed Inputs

Allowed source inputs for the proposal design:

- `Wc01V2EvidencePreviewPacket.summary.md`
- `Wc01V2EvidencePreviewPacket.json`
- manual reviewer log entries
- `Wc01V2PolicyCopyReviewArtifact`
- `Wc01V2ProductionReadinessGateDraft`
- `Wc01V2ProductSurfaceProposalDraft`
- calibration and dry-run summaries

All inputs must be artifact-only, display-safe, and internally generated.

## Excluded Inputs

Excluded inputs:

- raw scanner runtime objects
- raw cookies or cookie values
- raw request or response bodies
- unbounded DOM text
- unbounded policy text
- raw Nano reasoning
- production concern policy outputs
- persisted normalized concerns
- unified findings
- production report/checklist/executive/scoring/regulatory rows
- customer-facing copy
- app UI state
- API/MCP/export payloads

The future surface must not rehydrate raw artifacts directly. Any rehydration must use safe source refs, display-safe excerpt IDs, and already-generated evidence preview packets.

## Initial Family Scope

Recommended initial scope:

| Family | Proposed handling | Rationale |
|---|---|---|
| `pre_consent_tracking` | allow for proposal design only when non-sensitive and reviewer-confirmed | Most mature candidate family; direct runtime evidence shape is already represented in packets. |
| `pre_consent_cookie_storage` | hold for later design | Storage/cookie wording needs separate copy and policy treatment. |
| `session_replay_behavioral_analytics` | hold for later design | Higher interpretive risk; should remain internal until separate policy/copy review. |

The first proposal should not include sensitive-context items.

## Blocked Families And Contexts

Blocked from the first narrow proposal:

- sensitive-context items
- `pre_consent_cookie_storage`
- `session_replay_behavioral_analytics`
- `third_party_vendors_observed`
- consent banner presence/absence
- unresolved endpoint review
- policy/runtime alignment
- consent-flow delta or persistence rows
- tag-management-only evidence
- consent-management-only evidence
- security, performance, support, infrastructure, fraud/bot, RUM, live-chat, or other Tier C diagnostic purposes
- any row with coverage-limited required modules
- any row with missing source refs, missing display-safe excerpts, weak confidence, weak directness, unresolved blocker, sanitizer warning, or guardrail warning

Blocked means blocked from the proposed surface, not hidden from internal diagnostics.

## Required Gates Before Any Implementation

Before any implementation is considered, a product proposal artifact would need all of the following:

| Gate | Requirement |
|---|---|
| Evidence sufficiency | Source refs, display-safe excerpts, confidence/directness, consent-state context, and family context present. |
| Manual reviewer | Reviewer action confirms evidence shape and does not request more evidence. |
| Sensitive context | No sensitive-context categories in the initial scope. |
| Policy/copy | Internal-only wording posture reviewed and approved for the proposed internal surface. |
| Guardrail/sanitization | No sanitizer warnings, raw blocked fields, forbidden status mapping, or legal-conclusion wording. |
| Regression consistency | Fresh calibration and fixtures show stable candidate counts and no unsafe promotions. |
| Product-surface mapping | Surface class, audience, purpose, and allowed families explicitly approved. |
| Approval record | Product, policy/copy, evidence, and engineering approvals recorded in artifact form. |
| Rollback/suppression | Clear suppression plan before any implementation. |

Passing these gates would still create only an internal approval to implement a separate proposal. It would not itself create product output.

## Copy Posture

Allowed internal-only phrasing posture:

- "Internal diagnostic preview."
- "Evidence shape reviewed internally."
- "Source refs and display-safe excerpts available."
- "Not customer-facing report output."
- "No production mapping approved."

Blocked phrasing posture:

- legal conclusions
- definitive compliance claims
- customer-facing copy
- score or severity language
- regulatory-lens wording
- sensitive-context claims
- claims based only on tag management, consent management, unresolved endpoints, or inventory rows

The first proposal should avoid product-like status labels. Use internal workflow labels only.

## Proposed Data Shape For A Future Proposal

A narrow `Wc01V2ProductSurfaceProposalDraft` for this lane should include:

| Field | Required content |
|---|---|
| `proposedSurfaceClass` | `limited_admin_internal_preview` or equivalent taxonomy class, still blocked until approved. |
| `sourceProductionReadinessGateDraft` | Path to the readiness gate draft. |
| `allowedFamilies` | `pre_consent_tracking` only for the first proposal. |
| `blockedFamilies` | All families and contexts listed in the blocked section. |
| `sensitiveContextHandling` | Sensitive-context excluded from first proposal; labels remain routing metadata only. |
| `copyPosture` | Internal diagnostic wording only; no customer-facing copy. |
| `evidenceRequirements` | Source refs, display-safe excerpt refs/text, confidence/directness, consent-state context, no unresolved blockers. |
| `guardrailRequirements` | Sanitizer clean, raw-field scan clean, wording scan clean, import-boundary clean. |
| `approvalRequirements` | Product, policy/copy, evidence, and engineering owner approvals. |
| `rollbackSuppressionPlan` | Suppress entire surface, suppress family, suppress site, suppress queue item. |
| `implementationStatus` | `not_approved`. |

## Rollback And Suppression Plan

Any future implementation proposal must include the ability to suppress:

- the entire v2 preview surface
- a candidate family
- a sensitive-context category
- a site/domain
- a queue item
- a vendor purpose
- a specific evidence group

Suppression must not require deleting upstream artifacts.

Suppression must not affect production report/checklist/executive/scoring/regulatory output because those paths remain unimplemented for v2.

## Decision Needed

Product, policy/copy, evidence, and engineering owners should answer:

| Question | Decision needed |
|---|---|
| Is `pre_consent_tracking` the right first family for proposal design? | approve / tighten / reject |
| Should the first proposal exclude all sensitive-context items? | recommended yes |
| Should the target future surface be an internal/admin diagnostic preview only? | recommended yes |
| Is internal-only diagnostic wording sufficient for the proposal? | approve / revise |
| Are the evidence gates strict enough before any implementation proposal? | approve / tighten |
| Is the suppression plan sufficient? | approve / revise |

## Recommended Next Step

Recommended next step:

```text
Create an example Wc01V2ProductSurfaceProposalDraft input for a non-sensitive pre_consent_tracking internal diagnostic preview proposal.
```

This should remain artifact-only and design-only. It should not create app UI, persistence, production mapping, customer-facing copy, or production output.

## Explicit Non-Goals

This design does not approve or create:

- implementation
- app UI
- admin/internal preview UI
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

## Future Implementation Prompt: Not Approved

The following prompt is for a future discussion only. It is not approved for implementation.

```text
Create an artifact-only WC01 v2 narrow product-surface proposal example for a non-sensitive pre_consent_tracking internal diagnostic preview.

Sources:
- docs/certscore-v2/wc01-v2-narrow-production-proposal-design.md
- docs/certscore-v2/wc01-v2-production-surface-taxonomy-design.md
- docs/certscore-v2/wc01-v2-production-readiness-gate-design.md
- docs/certscore-v2/wc01-v2-calibration-expansion-followup.md

Output:
- docs/certscore-v2/examples/Wc01V2ProductSurfaceProposalInput.narrow-pre-consent-tracking.example.json
- artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.json
- artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.summary.md

Requirements:
- artifact-only
- implementationStatus:not_approved
- productionEligible:false
- customerFacingEligible:false
- explicitApprovalRequired:true
- proposed surface remains internal/admin diagnostic preview only
- allowed family is pre_consent_tracking only
- sensitive-context items excluded
- no app UI
- no persistence
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
