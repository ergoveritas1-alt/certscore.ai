# WC01 v2 Production Integration Candidate Decision

Internal decision summary only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Decision: **A. Accept candidate artifact as-is; keep internal-only.**

The `Wc01V2ProductionIntegrationCandidate` artifact is accepted as a pre-implementation review object for the two non-sensitive families currently under review:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

The artifact remains internal-only, artifact-only, and non-persistent. It does not approve production integration, production concern policy calls, persisted normalized concerns, unified findings, UI, report output, checklist output, executive output, scoring output, regulatory output, API/MCP/export output, or customer-facing copy.

## Reviewed Artifacts

| Artifact | Path |
|---|---|
| Follow-up report | `docs/certscore-v2/wc01-v2-production-integration-candidate-followup.md` |
| Example candidate JSON | `artifacts/example/Wc01V2ProductionIntegrationCandidate.json` |
| Example candidate summary | `artifacts/example/Wc01V2ProductionIntegrationCandidate.summary.md` |
| Source mapping JSON | `artifacts/example/Wc01V2NormalizedConcernDraftMapping.json` |

## Decision Table

| Question | Decision | Notes |
|---|---|---|
| Is the candidate artifact sufficient as a pre-implementation review object? | Yes | It packages family, source evidence artifact, normalized concern draft, draft policy/projection keys, evidence refs, display-safe excerpt refs, context, attribution, blocked surfaces, approvals, and rollback plan. |
| Does the artifact preserve the two accepted families? | Yes | It emits one `pre_consent_tracking` candidate and one `pre_consent_cookie_storage` candidate. |
| Does the artifact remain internal-only? | Yes | Production, persistence, policy-call, unified-finding, checklist-projection, and customer-facing eligibility remain false. |
| Should this move to production implementation now? | No | A separate implementation proposal and approvals would be required. |
| Should this become UI or persisted workflow now? | No | Manual/internal artifact review remains the approved posture. |

## Accepted Artifact Shape

Accepted internal artifact:

```text
Wc01V2ProductionIntegrationCandidate
```

Accepted families:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Closed defaults:

| Field | Required value |
|---|---|
| `implementationStatus` | `not_approved` |
| `productionEligible` | `false` |
| `persistEligible` | `false` |
| `concernPolicyCallEligible` | `false` |
| `unifiedFindingEligible` | `false` |
| `checklistProjectionEligible` | `false` |
| `customerFacingEligible` | `false` |
| `explicitApprovalRequired` | `true` |

## What Is Approved

Only the following is approved:

- use the `Wc01V2ProductionIntegrationCandidate` artifact as an internal pre-implementation review object
- use the generated two-family example as the current review baseline

## What Is Not Approved

This decision does not approve:

- production integration
- app UI
- persistence
- production concern policy calls
- persisted normalized concerns
- unified findings
- checklist rows
- report rows
- executive summaries
- top findings
- scoring output
- regulatory-lens output
- API/MCP/export output
- customer-facing copy
- legal-conclusion language
- forbidden status mapping

## Operating Recommendation

Keep the candidate artifact internal-only and non-persistent.

Do not add more families unless reviewers request a specific additional non-sensitive family.

The next useful safety step is fixture-only WC01 normalized-concern schema comparison. That step should compare the candidate artifact shape against the existing WC01 normalized concern conventions without calling production concern policy, persisting concerns, creating unified findings, or projecting report/checklist output.

## Explicit Non-Goals

This decision does not approve or create:

- code changes beyond the internal candidate generator already completed
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
