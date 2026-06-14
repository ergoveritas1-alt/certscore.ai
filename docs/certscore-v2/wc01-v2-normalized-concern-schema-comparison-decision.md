# WC01 v2 Normalized Concern Schema Comparison Decision

Internal decision summary only. Not implementation approval. Not customer-facing report output.

## Executive Summary

Decision: **A. Accept schema comparison as-is; continue design/fixture-only work.**

The `Wc01V2NormalizedConcernSchemaComparison` artifact is accepted as fixture-only readiness evidence for the two non-sensitive families currently under review:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

The comparison found zero missing fields and zero blocked reasons. It recommends `schema_shape_reviewable_fixture_only`, with concern policy, unified finding, and checklist projection readiness all marked `fixture_reviewable`.

This decision does not approve production implementation, production concern policy calls, persistence, unified findings, checklist rows, report rows, executive summaries, top findings, scoring output, regulatory-lens output, API/MCP/export output, app UI, or customer-facing output.

## Reviewed Sources

| Source | Path |
|---|---|
| Schema comparison follow-up | `docs/certscore-v2/wc01-v2-normalized-concern-schema-comparison-followup.md` |
| Generated schema comparison summary | `artifacts/example/Wc01V2NormalizedConcernSchemaComparison.summary.md` |
| Production integration candidate decision | `docs/certscore-v2/wc01-v2-production-integration-candidate-decision.md` |
| Production integration readiness design | `docs/certscore-v2/wc01-v2-production-integration-readiness-design.md` |

## Decision Table

| Question | Decision | Notes |
|---|---|---|
| Does the candidate shape cover required normalized concern fields? | Yes | Both reviewed families have required source refs, display-safe excerpt refs, consent-state context, confidence/directness, exclusions, unresolved-ref disposition, rollback/suppression hints, and blocked surfaces. |
| Are missing fields zero? | Yes | Missing field count is 0 for `pre_consent_tracking` and 0 for `pre_consent_cookie_storage`. |
| Are blocked reasons zero? | Yes | Blocked reason count is 0 in the generated comparison summary. |
| Are extra fields acceptable as comparison metadata only? | Yes | `approvalMetadata`, `copyPosture`, `proposedChecklistRowKey`, and `proposedUnifiedFindingKey` are retained as draft review metadata only. |
| Are draft policy/unified/checklist keys clearly non-production? | Yes | The comparison explicitly treats these as draft-only strings and does not call or project production paths. |
| Are closed-default flags intact? | Yes | All production, persistence, policy-call, unified-finding, checklist, and customer-facing eligibility flags remain false; explicit approval remains required. |

## Accepted Scope

Only the following is accepted:

- use the schema comparison as fixture-only evidence that `pre_consent_tracking` and `pre_consent_cookie_storage` can be represented as normalized-concern drafts
- continue internal design or fixture-only artifact work from this comparison

Compared families:

- `pre_consent_tracking`
- `pre_consent_cookie_storage`

Readiness result:

| Readiness area | Status |
|---|---|
| concern policy readiness | `fixture_reviewable` |
| unified finding readiness | `fixture_reviewable` |
| checklist projection readiness | `fixture_reviewable` |

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

## Next Decision Options

| Option | Decision path |
|---|---|
| A | Continue design only. |
| B | Add fixture-only concern-policy shape comparison. |
| C | Add fixture-only unified-finding/checklist projection shape comparison. |
| D | Start production implementation. |
| E | Stop and collect external validation. |

Recommended default: **B. Add fixture-only concern-policy shape comparison**, if continuing internally.

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
