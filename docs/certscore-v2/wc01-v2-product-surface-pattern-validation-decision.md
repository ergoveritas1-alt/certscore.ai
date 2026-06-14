# WC01 v2 Product Surface Pattern Validation Decision

Internal decision summary only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Decision: **A. Pattern is useful as-is.**

The WC01 v2 product-surface proposal pattern is validated as useful for internal review discussions. This validation applies only to the internal review pattern. It does not approve implementation, product surface behavior, production integration, or customer-facing output.

The validated pattern is:

```text
Wc01V2ProductSurfaceProposalDraft
```

The current review baseline remains the two accepted narrow examples:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

No additional examples are needed now. No product surface is approved.

## Decision Table

| Reviewer question | Answer | Notes |
|---|---|---|
| Does this pattern help evaluate whether a v2 evidence family should ever move toward a product surface? | Yes | It separates proposal shape from implementation and keeps review focused on scope, gates, and approvals. |
| Is the approval metadata checklist sufficient? | Yes | Sufficient for this stage. Future implementation would still require named owners and a separate proposal. |
| Are the blocked surfaces clear enough? | Yes | UI, persistence, production integration, customer-facing output, production policy calls, and report/checklist/executive/scoring/regulatory/API/export output are clearly blocked. |
| Are the two starter families appropriate? | Yes | `pre_consent_tracking` and `pre_consent_cookie_storage` are narrow, related, and distinct enough to validate the pattern without expanding scope too soon. |
| What is needed before any implementation proposal? | Explicit approval metadata, implementation proposal path, target surface definition, approved evidence/copy posture, rollback/suppression plan, and a clean guardrail scan. | These are prerequisites only. They do not approve implementation by themselves. |

## Validated Pattern

Validated internal artifact pattern:

```text
Wc01V2ProductSurfaceProposalDraft
```

Proposed internal surface:

```text
limited_admin_internal_preview
```

Validated examples:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Closed defaults:

| Field | Required value |
|---|---|
| `implementationStatus` | `not_approved` |
| `productionEligible` | `false` |
| `customerFacingEligible` | `false` |
| `explicitApprovalRequired` | `true` |

These defaults must remain in place until a separate approval and implementation process exists.

## What Is Approved

Only the following is approved:

- use the product-surface proposal pattern for internal review discussions

The pattern may help reviewers discuss possible future surfaces. It cannot create product output.

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

## Future Implementation Prerequisites

Before any implementation proposal, the following must exist:

- explicit approval metadata
- named product, policy, copy, and engineering owners
- implementation proposal path
- target surface definition
- approved evidence families
- approved blocked families
- approved copy posture
- rollback/suppression plan
- guardrail scan result

These prerequisites should be documented before any implementation work is considered.

## Operating Recommendation

Stop creating examples.

Use the two accepted examples as the review baseline:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Do not proceed to implementation.

The next allowed step is approval-metadata design only if product, policy, privacy, or engineering reviewers need it.

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
