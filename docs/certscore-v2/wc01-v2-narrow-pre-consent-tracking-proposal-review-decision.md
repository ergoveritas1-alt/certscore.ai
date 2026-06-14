# WC01 v2 Narrow Pre-Consent Tracking Proposal Review Decision

Internal decision note only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Decision: **A. Accept proposal shape as an internal artifact pattern, keep blocked.**

The narrow WC01 v2 pre-consent tracking proposal shape is accepted as a reusable internal artifact pattern.

The proposal remains blocked. This decision does not approve implementation, a product surface, production integration, customer-facing output, report rows, checklist rows, executive rows, scoring output, regulatory-lens output, API/MCP/export output, production concern policy calls, persisted concerns, or unified findings.

The proposal remains useful as an internal design artifact because it records scope, blocked contexts, evidence expectations, guardrails, approval requirements, and rollback/suppression posture while staying closed by default.

## Reviewed Artifact

Review packet:

```text
docs/certscore-v2/wc01-v2-narrow-pre-consent-tracking-proposal-review-packet.md
```

Generated proposal draft:

```text
artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.json
```

Reviewed shape:

| Field | Value |
|---|---|
| Surface | `limited_admin_internal_preview` |
| Family | `pre_consent_tracking` only |
| Status | `not_approved` |
| Production eligible | `false` |
| Customer-facing eligible | `false` |
| Explicit approval required | `true` |
| Fail-closed reason | `explicit_approval_metadata_missing_for_blocked_surface` |

The fail-closed reason is expected. It confirms that a blocked surface class cannot move forward without explicit approval metadata.

## Decision Record

| Owner / perspective | Decision |
|---|---|
| Evidence | Accept artifact shape as reusable for internal proposal review; keep blocked until evidence approval is explicit. |
| Policy | Accept artifact shape as reusable for internal proposal review; keep blocked until policy approval is explicit. |
| Copy | Accept artifact shape as reusable for internal proposal review; keep blocked until copy posture is explicitly approved. |
| Product | Accept artifact shape as reusable for internal proposal review; keep blocked until the target surface is explicitly approved. |
| Engineering | Accept artifact shape as reusable for internal proposal review; keep blocked until a separate implementation proposal is approved. |

Decision details:

- Accept the artifact shape as a reusable internal pattern.
- Keep the proposal blocked until explicit approval metadata exists.
- Do not implement app UI.
- Do not add persistence.
- Do not integrate into production.
- Do not create customer-facing output.
- Do not create report rows, checklist rows, executive rows, scoring output, regulatory-lens output, API/MCP/export output, production concern policy calls, persisted concerns, or unified findings.

## Required Future Approval Metadata

Before any future implementation proposal, a separate artifact must include:

- named product owner approval
- named policy owner approval
- named copy owner approval
- named engineering owner approval
- approved target surface
- approved evidence families
- approved copy posture
- rollback/suppression plan
- guardrail scan result
- explicit implementation proposal

Approval metadata should include:

- owner name or role
- decision
- scope
- timestamp
- artifact reference
- conditions or limitations
- rollback/suppression owner

No approval metadata should be interpreted as production/customer-facing approval unless a separate implementation proposal explicitly says so.

## Open Questions

- Is `limited_admin_internal_preview` still the right first proposed surface?
- Is `pre_consent_tracking` still the right first family?
- Are the 17 blocked families complete?
- Should confidence/directness be more visible in proposal summaries?
- Should this pattern be tested with one more low-risk non-sensitive family later?

## Next Allowed Steps

Allowed:

- reuse this artifact pattern for future internal proposals
- optionally create one second non-sensitive example later
- continue external validation using internal artifacts
- refine proposal-summary visibility for confidence/directness if reviewers ask for it

Not allowed:

- implementation
- app UI
- persistence
- production integration
- customer-facing output
- report/checklist/executive/top-finding/scoring/regulatory-lens output
- API/MCP/export output
- production concern policy calls
- persisted normalized concerns
- unified findings

## Explicit Non-Goals

This decision does not approve or create:

- legal conclusions
- customer-facing output
- production integration
- app UI
- persistence
- production concern policy calls
- persisted normalized concerns
- unified findings
- report/checklist/executive/top-finding/scoring/regulatory-lens output
- API/MCP/export output
- forbidden status mapping
- changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
