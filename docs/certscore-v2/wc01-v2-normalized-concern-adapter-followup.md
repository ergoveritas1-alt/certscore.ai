# WC01 v2 Normalized Concern Adapter Follow-Up

Internal dry-run diagnostic only. Not production concern policy. Not persisted normalized concerns. Not unified findings. Not checklist, report, executive, top-finding, scoring, regulatory-lens, or customer-facing output.

## Executive Summary

We implemented a dry-run-only typed WC01 v2 normalized-concern candidate adapter. The adapter reads `Wc01V2ConcernPolicySimulationDryRun` artifacts, validates supported contract version and guardrails, applies the approved family-specific gates, and emits internal `V2NormalizedConcernCandidateDraft` artifacts plus blocked-candidate summaries.

The adapter remains draft/internal only. It does not call production concern policy, persist normalized concerns, create unified findings, create customer-facing copy, or wire into checklist, report, executive, top-finding, scoring, or regulatory-lens output.

No production WC01 report paths were touched. `apps/web/components/scans/shared-scan-detail-view.tsx` was not modified in this pass and remains dirty from unrelated prior work.

## Pipeline Position

```text
Wc01V2ShadowProjection
-> Wc01V2AllowlistDryRun
-> Wc01V2ConcernPolicyInputDraft
-> Wc01V2ConcernPolicySimulationDryRun
-> V2NormalizedConcernCandidateDraft
```

The new adapter is the final stage shown above. It produces internal candidate drafts only; it does not enter the WC01 production concern pipeline.

## Cohort Results

| Cohort | Input files | Succeeded | Failed | Candidates | Blocked | Malformed | Guardrail failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Expanded | 10 | 10 | 0 | 11 | 0 | 0 | 0 |
| Stress | 12 | 12 | 0 | 11 | 0 | 0 | 0 |
| Edge | 30 | 30 | 0 | 34 | 0 | 0 | 0 |
| Policy-stress | 20 | 20 | 0 | 25 | 0 | 0 | 0 |
| Total | 72 | 72 | 0 | 81 | 0 | 0 | 0 |

## Candidate Counts By Family

| Family | Expanded | Stress | Edge | Policy-stress | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| `pre_consent_tracking` | 6 | 6 | 16 | 11 | 39 |
| `pre_consent_cookie_storage` | 4 | 5 | 12 | 10 | 31 |
| `session_replay_behavioral_analytics` | 1 | 0 | 6 | 4 | 11 |

Evidence-family counts matched candidate-family counts:

| Evidence family | Total |
| --- | ---: |
| `runtime_pre_consent_collection` | 39 |
| `runtime_pre_consent_cookie_or_storage` | 31 |
| `runtime_session_replay_collection` | 11 |

## Sensitive-Context Summary

Sensitive-context candidates: 36

All 36 sensitive-context candidates require extra review. Sensitive context remains review metadata only; it does not promote production eligibility, top-finding eligibility, or gap eligibility.

| Category | Candidate count | Sites observed |
| --- | ---: | --- |
| `behavioral_analytics_reference` | 8 | `fullstory.com`, `hotjar.com` |
| `reproductive_health` | 8 | `bedsider.org`, `plannedparenthood.org` |
| `health` | 6 | `healthline.com` |
| `employment_hr` | 5 | `greenhouse.com`, `workday.com` |
| `finance` | 4 | `bankofamerica.com` |
| `public_benefits` | 4 | `benefits.gov`, `ssa.gov` |
| `children_education` | 1 | `pbskids.org` |

## Guardrail Summary

| Guardrail | Count |
| --- | ---: |
| `productionEligible` true count | 0 |
| `topFindingEligible` true count | 0 |
| `gapEligible` true count | 0 |
| Forbidden gap status token matches | 0 |
| Raw blocked field matches | 0 |
| Legal-conclusion term matches | 0 |
| Malformed artifacts | 0 |
| Blocked candidates | 0 |
| Guardrail failures | 0 |

Supporting vendor-purpose counts across emitted candidates:

| Purpose | Count |
| --- | ---: |
| `advertising` | 62 |
| `analytics` | 60 |
| `session_replay` | 23 |

Diagnostic purpose counts:

| Purpose | Count |
| --- | ---: |
| `tag_management` | 53 |

`tag_management` remains diagnostic only and does not support production eligibility.

## Implementation Summary

Files added:

- `packages/certscore-report-adapter/src/wc01-v2-normalized-concern-adapter.ts`
- `packages/certscore-report-adapter/src/wc01-v2-normalized-concern-adapter-output.ts`
- `packages/certscore-report-adapter/src/cli/wc01-v2-normalized-concern-adapter-dry-run.ts`
- `packages/certscore-report-adapter/src/wc01-v2-normalized-concern-adapter.test.ts`

Files updated:

- `packages/certscore-report-adapter/src/wc01-v2-concern-policy-simulation.ts`
- `packages/certscore-report-adapter/src/index.ts`
- `packages/certscore-report-adapter/package.json`
- `package.json`

Command added:

```bash
pnpm v2:wc01-normalized-concern-adapter
```

Generated adapter artifact directories:

- `artifacts/v2-wc01-normalized-concern-adapter-expanded-fresh-registry`
- `artifacts/v2-wc01-normalized-concern-adapter-stress-fresh-registry`
- `artifacts/v2-wc01-normalized-concern-adapter-edge-consent`
- `artifacts/v2-wc01-normalized-concern-adapter-policy-stress-consent`

## Test Coverage Summary

The adapter test matrix covers:

- valid `pre_consent_tracking` candidates
- analytics-only, advertising-only, and mixed analytics/advertising candidates
- missing consent-state context
- missing source refs and display-safe excerpts
- tag-management-only support
- consent-management-only support
- Tier C mixed support
- sensitive health candidates
- sensitive children/education candidates
- valid third-party cookie/storage candidates
- first-party-only cookie/storage
- CMP/security/necessary cookie exclusion behavior
- session replay collection endpoint evidence
- session replay library-only blocking
- RUM/live-chat-only blocking
- coverage limitation / partial module blocking
- unsupported contract version
- malformed artifact handling
- forbidden phrase and raw-field injection
- single-file and batch output generation
- import-boundary checks preventing production policy, report, checklist, executive, top-finding, scoring, regulatory-lens, and shared scan detail imports

Verification passed:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-normalized-concern-adapter --help
```

The final guardrail scan over adapter outputs returned no matches for the forbidden gap status token, raw blocked field names, or legal-conclusion terms.

## Recommendation

Recommended next step: design a non-persisted WC01 concern-policy comparison dry run.

Suggested future path:

```text
V2NormalizedConcernCandidateDraft
-> non-persisted WC01 concern-policy comparison dry run
```

This should be a design step first, not implementation. If later approved, the comparison dry run should remain internal-only and non-persisted. It should not call production concern policy in a way that changes state, should not persist concerns, should not create unified findings, and should not produce customer-facing output.

## Explicit Non-Goals

- No production integration.
- No production concern policy calls that affect state.
- No persisted normalized concerns.
- No unified findings.
- No checklist output.
- No report output.
- No executive output.
- No top-finding output.
- No scoring output.
- No regulatory-lens output.
- No customer-facing copy.
- No customer-facing behavior changes.
- No direct mapping to `gap_observed`.
- No legal-conclusion language.
- No changes to `apps/web/components/scans/shared-scan-detail-view.tsx`.
