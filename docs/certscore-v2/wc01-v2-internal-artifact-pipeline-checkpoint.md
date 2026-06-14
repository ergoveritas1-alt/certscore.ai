# WC01 v2 Internal Artifact Pipeline Checkpoint

Internal checkpoint only. Not customer-facing report output.

## Executive Summary

The WC01 v2 internal artifact lane is stable enough for internal review, policy/copy artifact review, readiness-gate drafting, and proposal-draft work.

Grouped evidence preview is adopted as the internal reviewer workflow. The policy/copy review artifact generator, production-readiness gate draft generator, and product surface proposal draft generator are implemented. Their outputs remain internal-only artifacts with closed defaults:

```json
{
  "implementationStatus": "not_approved",
  "productionEligible": false,
  "customerFacingEligible": false,
  "explicitApprovalRequired": true
}
```

No production/customer-facing/report/checklist/executive/scoring/regulatory/API/UI/persistence path is approved. No reviewer action, policy/copy artifact, readiness-gate draft, taxonomy class, or proposal draft creates production eligibility.

`apps/web/components/scans/shared-scan-detail-view.tsx` remains unrelated to this lane and was not touched by this work.

## Current Artifact Stages

```text
grouped evidence preview
-> manual reviewer workflow
-> policy/copy review artifact generator
-> production-readiness gate draft generator
-> production surface taxonomy design
-> product surface proposal draft generator
```

| Stage | Status | Notes |
|---|---|---|
| Grouped evidence preview | implemented / adopted internally | Primary internal reviewer input. Markdown first, JSON for confirmation, upstream inspection only when exceptional. |
| Manual reviewer workflow | implemented / adopted internally | Manual logs record queue action, sensitive-context routing, unresolved-ref blockers, and reviewer notes. |
| Sensitive-context policy/copy design | implemented as design guidance | Defines stricter handling for health, reproductive health, finance, public benefits, employment / HR, and behavioral analytics reference sites. |
| Policy/copy review artifact generator | implemented | Emits `Wc01V2PolicyCopyReviewArtifact.json` and `.summary.md`; output remains internal-only and keeps sensitive context as routing metadata only. |
| Production-readiness gate design | implemented as design guidance | Defines gates required before any future product-surface proposal can be considered. |
| Production-readiness gate draft generator | implemented | Emits `Wc01V2ProductionReadinessGateDraft.json` and `.summary.md`; output remains internal-only and cannot create product output. |
| Production surface taxonomy design | design-only | Defines possible future surface classes and marks product/customer surfaces blocked. |
| Product surface proposal draft generator | implemented | Emits `Wc01V2ProductSurfaceProposalDraft.json` and `.summary.md`; output remains `not_approved` by default. |

## What Is Implemented

Implemented internal artifact stages:

- grouped evidence preview packets
- manual reviewer workflow and logs
- policy/copy review artifact generator
- production-readiness gate draft generator
- product surface proposal draft generator

Implemented generator commands:

```bash
pnpm v2:wc01-policy-copy-review \
  --input ./docs/certscore-v2/examples/Wc01V2PolicyCopyReviewInput.example.json \
  --out ./artifacts/v2-internal-artifact-chain-example/Wc01V2PolicyCopyReviewArtifact.json

pnpm v2:wc01-production-readiness-gate \
  --input ./docs/certscore-v2/examples/Wc01V2ProductionReadinessGateInput.example.json \
  --out ./artifacts/v2-internal-artifact-chain-example/Wc01V2ProductionReadinessGateDraft.json

pnpm v2:wc01-product-surface-proposal \
  --input ./docs/certscore-v2/examples/Wc01V2ProductSurfaceProposalInput.example.json \
  --out ./artifacts/v2-internal-artifact-chain-example/Wc01V2ProductSurfaceProposalDraft.json
```

Implemented outputs:

- `Wc01V2PolicyCopyReviewArtifact.json`
- `Wc01V2PolicyCopyReviewArtifact.summary.md`
- `Wc01V2ProductionReadinessGateDraft.json`
- `Wc01V2ProductionReadinessGateDraft.summary.md`
- `Wc01V2ProductSurfaceProposalDraft.json`
- `Wc01V2ProductSurfaceProposalDraft.summary.md`

The policy/copy generator records sensitive-context routing, safe refs/excerpts, confidence/directness, family context, internal phrasing posture, owner decisions, unresolved-ref disposition, redaction/sanitization status, fail-closed reasons, and guardrail flags.

The readiness-gate generator records source artifacts, reviewer action, gate decisions, approval record, rollback/suppression plan, blocked reasons, allowed internal next step, and guardrail flags.

The product surface proposal generator records proposed surface class, audience, purpose, allowed/blocked families, sensitive-context handling, copy posture, evidence requirements, guardrail requirements, approval requirements, rollback/suppression plan, fail-closed reasons, and guardrail flags.

## What Is Design-Only

Design-only stages:

- production surface proposal decision process beyond the proposal draft generator
- any limited admin/internal preview
- any product-surface mapping
- any production proposal

These designs provide structure for future decisions. They do not create product behavior.

## What Remains Explicitly Blocked

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

No reviewer action or proposal draft can move an item into these surfaces.

## Guardrail Posture

Current guardrail posture:

- artifact-only
- internal-only
- non-persistent
- display-safe evidence only where projected
- raw blocked fields rejected
- forbidden status mapping rejected
- legal-conclusion wording rejected
- sensitive-context labels remain routing metadata only
- policy/copy review artifacts do not approve customer-facing wording
- production-readiness gate drafts do not create production eligibility
- product surface proposal drafts default to `not_approved`
- production eligibility defaults to `false`
- customer-facing eligibility defaults to `false`
- explicit approval remains required
- high-risk surface proposals fail closed without explicit approval metadata
- import-boundary tests prevent production report/checklist/executive/scoring/regulatory/shared scan detail imports in the policy/copy, readiness, and proposal generator lanes

Recent verification for the internal artifact generators:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-policy-copy-review --help
pnpm v2:wc01-production-readiness-gate --help
pnpm v2:wc01-product-surface-proposal --help
```

The follow-up documentation for the generator was scanned with the standard wording/raw-field guardrail pattern.

## Recommended Operating Model

Use grouped evidence preview packets as the internal reviewer workflow input.

Continue manual reviewer logging for internal evidence-shape decisions.

Use sensitive-context policy/copy rules as review guidance only.

Use policy/copy review artifacts to record internal owner decisions and phrasing posture. These artifacts can feed readiness-gate drafts only as internal evidence of review posture.

Use production-readiness gate drafts to record whether an item is ready for an internal product-surface proposal draft. These drafts cannot create production or customer-facing eligibility.

Use product surface proposal drafts only when a product/policy owner wants to describe a future surface proposal in a structured artifact before implementation.

Keep all proposal drafts closed by default:

- `implementationStatus: not_approved`
- `productionEligible: false`
- `customerFacingEligible: false`
- `explicitApprovalRequired: true`

Do not create UI, persistence, production mappings, customer-facing output, or production concern policy calls from this lane.

## Deferred Decisions

Deferred decisions:

- reviewer decision persistence
- app/admin UI
- product-surface proposal approval workflow
- production proposal
- report/checklist/executive/top-finding/scoring/regulatory integration
- API/MCP/export exposure
- customer-facing wording
- same-row duplicate excerpt lineage refinement if future reviewer logs show repeated blockers

Revisit these only after explicit product/policy/engineering approval.

## Explicit Non-Goals

This checkpoint does not approve:

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
