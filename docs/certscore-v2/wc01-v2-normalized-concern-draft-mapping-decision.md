# WC01 v2 Normalized Concern Draft Mapping Decision

Internal decision summary only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Decision: **A. Accept mapping shape as-is; keep fixture-only.**

The fixture-only WC01 v2 normalized-concern draft mapping shape is accepted for the two non-sensitive families currently under review:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

This decision validates the mapping shape as a useful first bridge from reviewed v2 evidence toward a future WC01 normalized concern input design. It does not approve production integration, production concern policy calls, persisted normalized concerns, unified findings, UI, report output, checklist output, executive output, scoring output, regulatory output, API/MCP/export output, or customer-facing copy.

## Reviewed Artifacts

| Artifact | Path |
|---|---|
| Follow-up report | `docs/certscore-v2/wc01-v2-normalized-concern-draft-mapping-followup.md` |
| Example input | `docs/certscore-v2/examples/Wc01V2NormalizedConcernDraftMappingInput.example.json` |
| Example output JSON | `artifacts/example/Wc01V2NormalizedConcernDraftMapping.json` |
| Example output summary | `artifacts/example/Wc01V2NormalizedConcernDraftMapping.summary.md` |

## Decision Table

| Question | Decision | Notes |
|---|---|---|
| Is the draft mapping shape sufficient for `pre_consent_tracking`? | Yes | The shape carries consent-state context, source refs, display-safe excerpt refs, confidence/directness, attribution, purpose basis, exclusions, and rollback hints. |
| Is the draft mapping shape sufficient for `pre_consent_cookie_storage`? | Yes | The shape adds party/storage context and unsafe-storage exclusion while keeping cookie/storage separate from tracking. |
| Should the mapping remain fixture-only? | Yes | The current stage tests shape only. It must not call production policy or persist concerns. |
| Are closed-default flags clear enough? | Yes | Production, persistence, policy-call, unified-finding, checklist-projection, and customer-facing eligibility remain false. |
| Should this move to production integration now? | No | A separate implementation proposal would be required before any production path. |

## Accepted Shape

Accepted fixture-only output:

```text
Wc01V2NormalizedConcernDraftMapping
```

Accepted draft policy keys:

- `v2.pre_consent_tracking.reviewed_non_sensitive`
- `v2.pre_consent_cookie_storage.reviewed_non_sensitive`

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

- use the fixture-only draft mapping shape for internal design review
- use the two generated examples as the current mapping baseline

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

Keep this lane fixture-only.

Do not add more families unless reviewers request a specific additional non-sensitive family.

The next allowed step is design review of whether this fixture-only mapping is enough to specify a future `Wc01V2ProductionIntegrationCandidate` artifact. Do not implement production concern policy, persisted normalized concerns, unified findings, UI, report/checklist/executive/scoring/regulatory projection, API/MCP/export output, or customer-facing copy.

## Explicit Non-Goals

This decision does not approve or create:

- code changes beyond the fixture-only mapper already completed
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
