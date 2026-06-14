# WC01 v2 Unified-Finding/Checklist Projection Shape Comparison Decision

Internal decision summary only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Decision: **A. Accept projection shape comparison as-is; stop implementation chain and consolidate readiness.**

The `Wc01V2ProjectionShapeComparison` artifact is accepted as fixture-only readiness evidence for the two non-sensitive families currently under review:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

The comparison found zero missing projection inputs and zero blocked reasons. It recommends `projection_shape_reviewable_fixture_only`, with unified finding shape, checklist projection shape, and evidence packet readiness all marked `fixture_reviewable`.

This decision does not approve production implementation, production concern policy calls, persistence, unified findings, checklist rows, report rows, executive summaries, top findings, scoring output, regulatory-lens output, API/MCP/export output, app UI, or customer-facing output.

## Reviewed Sources

| Source | Path |
|---|---|
| Projection shape comparison follow-up | `docs/certscore-v2/wc01-v2-projection-shape-comparison-followup.md` |
| Generated projection shape summary | `artifacts/example/Wc01V2ProjectionShapeComparison.summary.md` |
| Concern-policy shape comparison follow-up | `docs/certscore-v2/wc01-v2-concern-policy-shape-comparison-followup.md` |
| Normalized-concern schema comparison decision | `docs/certscore-v2/wc01-v2-normalized-concern-schema-comparison-decision.md` |

## Decision Table

| Question | Decision | Notes |
|---|---|---|
| Does the fixture shape cover unified finding projection inputs? | Yes | Both families include draft unified finding keys, concern policy keys, evidence refs, display-safe excerpt refs, consent-state context, confidence/directness, purpose context, and evidence packet coverage. |
| Does the fixture shape cover checklist projection inputs? | Yes | Both families include draft checklist row keys, concern policy keys, evidence packet context, copy-review readiness, suppression readiness, and blocked surfaces. |
| Are missing projection inputs zero? | Yes | Missing projection input count is 0 for `pre_consent_tracking` and 0 for `pre_consent_cookie_storage`. |
| Are blocked reasons zero? | Yes | Blocked reason count is 0 in the generated projection shape comparison summary. |
| Are draft unified/checklist keys acceptable as comparison metadata only? | Yes | The keys are explicitly draft strings for fixture-only comparison and do not create unified findings or checklist rows. |
| Are closed-default flags intact? | Yes | Production, persistence, policy-call, unified-finding, checklist-projection, and customer-facing eligibility remain false; explicit approval remains required. |

## Accepted Scope

Only the following is accepted:

- use the projection shape comparison as fixture-only evidence that `pre_consent_tracking` and `pre_consent_cookie_storage` can be represented in future unified-finding/checklist projection design
- use the generated example as an internal readiness checkpoint
- stop the current implementation chain before any production path

Compared families:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Readiness result:

| Readiness area | Status |
|---|---|
| unified finding shape readiness | `fixture_reviewable` |
| checklist projection shape readiness | `fixture_reviewable` |
| evidence packet readiness | `fixture_reviewable` |

Closed-default flags:

| Flag | Value |
|---|---:|
| `productionEligible` | `false` |
| `persistEligible` | `false` |
| `concernPolicyCallEligible` | `false` |
| `unifiedFindingEligible` | `false` |
| `checklistProjectionEligible` | `false` |
| `customerFacingEligible` | `false` |
| `explicitApprovalRequired` | `true` |

## What Is Not Approved

This decision does not approve:

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
- customer-facing output
- app UI
- persistence
- production integration
- customer-facing copy
- legal-conclusion language
- forbidden status mapping

## Current Fixture-Only Readiness Chain

The internal readiness chain now has accepted fixture-only evidence through:

```text
Wc01V2ProductionIntegrationCandidate
-> Wc01V2NormalizedConcernSchemaComparison
-> Wc01V2ConcernPolicyShapeComparison
-> Wc01V2ProjectionShapeComparison
```

This chain is useful as an internal design baseline. It does not call production concern policy, persist normalized concerns, create unified findings, create checklist rows, or produce customer-facing output.

## Next Decision Options

| Option | Decision path |
|---|---|
| A | Create a consolidated WC01 v2 production-readiness fixture chain checkpoint. |
| B | Stop and collect external/product/policy validation on the fixture chain. |
| C | Design explicit approval metadata for a future implementation proposal. |
| D | Start production implementation. |
| E | Stop this lane. |

Recommended default: **A. Create a consolidated WC01 v2 production-readiness fixture chain checkpoint.**

Do not choose D yet.

## Explicit Non-goals

- no code changes
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
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
