# WC01 v2 Production Surface Taxonomy Design

Internal design only. Not customer-facing report output.

## Executive Summary

This design defines possible future product surfaces where WC01 v2 evidence could appear and makes explicit which surfaces remain blocked until separately approved.

A product-surface taxonomy is needed because the production-readiness gate design can describe whether an internal artifact is mature enough for a future proposal, but it does not define where that artifact may appear. Surface boundaries matter: a row in an internal reviewer artifact has very different risk from a report row, checklist row, executive summary item, score impact, regulatory-lens output, or API/export output.

This document sits after the production-readiness gate design. It does not approve implementation, production integration, customer-facing copy, report output, checklist output, scoring output, regulatory-lens output, API/MCP/export output, persistence, or UI changes.

Customer-facing final statuses are not defined here.

## Surface Classes

| Surface class | Audience | Purpose | Allowed source inputs | Required gates | Current status | Risk level |
|---|---|---|---|---|---|---|
| Internal evidence preview | Internal evidence reviewers | Review grouped evidence, refs, excerpts, warnings, and queue lanes. | `Wc01V2EvidencePreviewPacket.summary.md`, `Wc01V2EvidencePreviewPacket.json`. | Artifact guardrails and display-safe evidence checks. | allowed now | low |
| Internal reviewer log | Internal evidence reviewers and policy/product owners | Record manual reviewer action and operational notes. | Evidence preview artifacts and reviewer observations. | Manual reviewer SOP. | allowed now | low |
| Internal policy/copy review artifact | Policy/copy owners | Evaluate wording risk and sensitive-context routing before any proposal. | Reviewer log, evidence preview artifacts, sensitive-context design. | Policy/copy review design; sensitive-context rules. | design-only | medium |
| Internal production-readiness draft | Evidence, policy, product, and engineering owners | Assess whether an item is ready for a future product-surface proposal. | Evidence preview artifacts, reviewer log, policy/copy decision. | Production-readiness gate design. | design-only | medium |
| Internal product proposal artifact | Product, policy, engineering owners | Describe the proposed surface before implementation. | Production-readiness gate draft and taxonomy. | Product-surface mapping gate and approval-record gate. | design-only | medium |
| Limited admin/internal preview | Internal operators | Inspect future product-shape projection without customer exposure. | Product proposal artifact plus gated preview data. | Product-surface proposal, guardrails, no persistence unless separately approved. | blocked | medium-high |
| Customer-facing report row | Customers | Display an evidence-scoped report item. | Not approved. Future source would require approved product proposal and production mapping. | All readiness gates plus approved copy and surface mapping. | blocked | high |
| Customer-facing checklist row | Customers | Display checklist projection. | Not approved. Future source would require production concern/checklist integration. | All readiness gates plus checklist policy approval. | blocked | high |
| Executive summary item | Customers and internal account teams | Summarize already-approved projected findings. | Not approved for v2. | Approved production projection and executive-selection rules. | blocked | high |
| Top finding | Customers and internal account teams | Highlight already-approved projected findings. | Not approved for v2. | Approved production projection and top-finding selection rules. | blocked | high |
| Score impact | Customers and internal account teams | Change score or risk calculation. | Not approved for v2. | Approved scoring policy, regression tests, rollback path. | blocked | very high |
| Regulatory-lens output | Customers and internal account teams | Project already-approved findings into regulatory views. | Not approved for v2. | Approved regulatory mapping, policy/copy approval, regression tests. | blocked | very high |
| Export/API/MCP output | External systems, customers, or internal integrations | Expose data outside the artifact workflow. | Not approved for v2. | Approved export contract, access control, copy policy, guardrails. | blocked | very high |

## Current Allowed Surfaces

Currently allowed surfaces are:

- evidence preview artifacts
- manual reviewer logs
- internal SOP/checkpoint/design docs

These surfaces are artifact-only, internal-only, and non-persistent unless a later task explicitly changes that boundary.

## Blocked Surfaces

Currently blocked surfaces are:

- customer-facing report rows
- checklist rows
- executive summaries
- top findings
- scoring changes
- regulatory-lens output
- API/MCP/export output
- app UI
- persistence
- production concern policy calls
- unified findings

No reviewer action alone can move an item into any blocked surface. No production-readiness gate result alone creates product output.

## Internal-Only Product Proposal Surface

Proposed artifact-only proposal class:

```text
Wc01V2ProductSurfaceProposalDraft
```

Purpose: describe a future surface proposal before implementation.

Proposed fields:

| Field | Purpose |
|---|---|
| `proposedSurfaceClass` | Target surface class from this taxonomy. |
| `sourceProductionReadinessGateDraft` | Path to the source readiness gate draft. |
| `allowedFamilies` | Candidate families allowed for the proposed surface. |
| `blockedFamilies` | Candidate families blocked from the proposed surface. |
| `sensitiveContextHandling` | Sensitive-context handling and escalation requirements. |
| `copyPosture` | Approved, pending, or blocked copy posture for the proposed surface. |
| `evidenceRequirements` | Required evidence fields, refs, excerpts, confidence/directness, and family context. |
| `userVisibleWordingStatus` | Whether wording is absent, draft-only, approved for internal review, or separately approved for a surface. |
| `guardrailRequirements` | Required wording, raw-field, sanitizer, and regression checks. |
| `approvalRequirements` | Product, policy, copy, evidence, and engineering approvals needed. |
| `rollbackSuppressionPlan` | How the item can be held back or reversed. |
| `implementationStatus` | Always `not_approved` by default. |

The proposal artifact would not create UI, persistence, report rows, checklist rows, executive rows, scoring output, regulatory output, API output, MCP output, exports, customer-facing copy, or production concern policy calls.

## Surface-Specific Risk Notes

### Report Rows

Report rows are high risk because customers may treat them as product assertions. Any future report-row proposal would need approved copy, evidence sufficiency, clear status semantics, regression coverage, and rollback/suppression handling.

### Checklist Rows

Checklist rows are high risk because they imply structured checklist posture. Any future checklist-row proposal would need explicit checklist policy mapping and must not consume v2 reviewer actions directly.

### Executive Summaries

Executive summaries are high risk because they compress evidence into prioritized narrative. V2 evidence must not enter executive summaries unless it has already passed through an approved production projection path.

### Top Findings

Top findings are high risk because they highlight selected issues. V2 evidence must not become a top finding directly from reviewer or readiness artifacts.

### Scoring

Scoring is very high risk because it changes product-level risk calculation. Any future scoring proposal would need separate scoring policy, regression testing, and rollback rules.

### Regulatory Lenses

Regulatory-lens output is very high risk because it projects evidence into regulation-oriented views. Any future regulatory-lens proposal would need explicit policy mapping, copy approval, and evidence gates.

### API/MCP/Export

API, MCP, and export surfaces are very high risk because they expose data outside the internal artifact workflow. Any future proposal would need access control, contract review, copy posture, and guardrail scans.

### Internal Admin Preview

An internal admin preview is lower risk than customer-facing output but still blocked for now because it introduces app UI, possible access-control needs, and operational expectations. A future internal preview should remain read-only, non-customer-facing, and separate from production report builders.

## Sensitive-Context Surface Rules

Sensitive-context items remain blocked from customer-facing surfaces until separate policy/copy and product approval.

Sensitive-context labels must not become customer-facing claims.

Sensitive context must not promote an item, harden language, change score impact, create checklist posture, or create regulatory-lens output.

Sensitive-context categories include:

- health
- reproductive health
- finance
- public benefits
- employment / HR
- behavioral analytics reference sites

For these categories, the safest default is internal-only routing until a policy owner explicitly approves the category, family, evidence threshold, copy posture, and target surface.

## Minimal Safe Next Surface

The only plausible next design surface is:

```text
internal product proposal artifact
```

This means an artifact-only `Wc01V2ProductSurfaceProposalDraft` design, not implementation.

Do not proceed next to:

- app UI
- production report rows
- customer-facing copy
- checklist output
- executive summary output
- top finding output
- scoring output
- regulatory-lens output
- API/MCP/export output
- persistence

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
- Wc01V2ProductionReadinessGateDraft.json
- optional policy/copy review artifact
- optional product-owner notes artifact

Output:
- Wc01V2ProductSurfaceProposalDraft.json
- Wc01V2ProductSurfaceProposalDraft.summary.md

Requirements:
- validate supported draft versions
- read only artifact inputs
- require proposedSurfaceClass from docs/certscore-v2/wc01-v2-production-surface-taxonomy-design.md
- record allowedFamilies and blockedFamilies
- record sensitiveContextHandling, copyPosture, evidenceRequirements, guardrailRequirements, approvalRequirements, and rollbackSuppressionPlan
- set implementationStatus to not_approved by default
- fail closed when the proposed surface is customer-facing, scoring, regulatory, API/MCP/export, app UI, persistence, production concern policy, unified findings, report, checklist, executive, or top-finding output without explicit approval metadata
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
