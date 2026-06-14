# WC01 v2 Product Surface Proposal Pattern Checkpoint

Internal checkpoint only. Not implementation approval. Not customer-facing report output.

## Executive Summary

The narrow WC01 v2 product-surface proposal pattern is now at a stable checkpoint.

Two example proposal drafts exist and are accepted as reusable internal artifact patterns:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Both examples use the proposed future surface class:

```text
limited_admin_internal_preview
```

Both remain closed by default:

| Check | Result |
|---|---|
| Implementation status | `not_approved` |
| Production eligible | `false` |
| Customer-facing eligible | `false` |
| Explicit approval required | `true` |
| Fail-closed reason | `explicit_approval_metadata_missing_for_blocked_surface` |

This checkpoint does not approve implementation, app UI, persistence, production integration, report/checklist/executive/scoring/regulatory output, API/MCP/export output, production concern policy calls, persisted normalized concerns, unified findings, or customer-facing copy. It records that the proposal artifact shape is ready for policy/product/evidence/engineering review as an internal pattern.

## Current State

The surrounding internal artifact lane is stable enough to support proposal-pattern review:

- grouped evidence preview is adopted as the internal reviewer workflow
- reviewer workflow remains artifact-only, internal-only, and non-persistent
- sensitive-context policy/copy handling is documented as internal review routing only
- production-readiness gate design and generator are implemented as internal artifacts
- product surface taxonomy design is documented
- product surface proposal draft generator is implemented
- product surface proposal drafts default to `not_approved`

Recent calibration and artifact-chain cleanup also closed known evidence-preview and sanitizer noise:

| Check | Current result |
|---|---:|
| Edge cohort completed sites | 30/30 |
| WC01 shadow sanitizer warnings | 0 |
| Evidence-preview unresolved refs after retention cleanup | 0 |
| Internal artifact-chain smoke checks | passed |

These results support review of the proposal pattern. They do not create product output.

## Accepted Proposal Pattern

The accepted internal pattern is `Wc01V2ProductSurfaceProposalDraft`.

The draft records:

- proposed surface class
- proposed audience and purpose
- allowed evidence family or families
- blocked families and contexts
- sensitive-context handling
- copy posture
- evidence requirements
- guardrail requirements
- approval requirements
- rollback/suppression plan
- implementation status
- closed-default eligibility flags
- fail-closed reasons

The pattern is useful because it gives reviewers a structured way to discuss a future product surface before any implementation work begins.

The pattern is not useful as an approval mechanism. A proposal draft cannot create production eligibility, customer-facing eligibility, persistence, UI, or product output.

## Example Inventory

| Example | Input | Draft | Summary |
|---|---|---|---|
| `pre_consent_tracking` | `docs/certscore-v2/examples/Wc01V2ProductSurfaceProposalInput.narrow-pre-consent-tracking.example.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.summary.md` |
| `pre_consent_cookie_storage` | `docs/certscore-v2/examples/Wc01V2ProductSurfaceProposalInput.narrow-pre-consent-cookie-storage.example.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-cookie-storage.json` | `artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-cookie-storage.summary.md` |

| Check | `pre_consent_tracking` | `pre_consent_cookie_storage` |
|---|---:|---:|
| Proposed surface class | `limited_admin_internal_preview` | `limited_admin_internal_preview` |
| Allowed families | 1 | 1 |
| Allowed family | `pre_consent_tracking` | `pre_consent_cookie_storage` |
| Blocked families / contexts | 17 | 17 |
| Evidence requirements | 11 | 13 |
| Guardrail requirements | 17 | 17 |
| Implementation status | `not_approved` | `not_approved` |
| Production eligible | `false` | `false` |
| Customer-facing eligible | `false` | `false` |
| Explicit approval required | `true` | `true` |
| Fail-closed reason | `explicit_approval_metadata_missing_for_blocked_surface` | `explicit_approval_metadata_missing_for_blocked_surface` |

## Closed-Default Posture

The closed-default posture is the main outcome of this lane.

| Guardrail | Posture |
|---|---|
| Proposal approval | Drafts remain `not_approved` |
| Production eligibility | Always `false` by default |
| Customer-facing eligibility | Always `false` by default |
| Explicit approval | Required before any future implementation proposal |
| Sensitive context | Routing metadata only |
| Reviewer action | Cannot create product output |
| Readiness gate | Cannot create product output |
| Proposal draft | Cannot create product output |

No reviewer action, policy/copy review artifact, readiness-gate draft, taxonomy class, or proposal draft creates production eligibility.

## What Remains Blocked

The following remain blocked:

- implementation
- app UI
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
- changes to `apps/web/components/scans/shared-scan-detail-view.tsx`

## Operating Recommendation

Use the two examples as the current review set for the proposal-pattern lane.

Do not create more examples unless reviewers request additional coverage.

Do not implement any surface from these examples.

If reviewers want to continue, the next artifact should be an approval-metadata requirements note that defines exactly what named product, policy, copy, and engineering approvals would need to contain before a separate implementation proposal could be considered.

## Next Allowed Future Actions

Allowed future actions:

- collect policy/product/evidence/engineering reviewer feedback
- refine the proposal artifact shape if reviewers find missing fields
- draft approval-metadata requirements
- improve proposal summaries for confidence/directness visibility if reviewers request it
- run another calibration only if evidence drift is suspected

Not allowed from this checkpoint:

- implementation
- app UI
- persistence
- production integration
- product output
- customer-facing output

## Explicit Non-Goals

This checkpoint does not approve or create:

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
