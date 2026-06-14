# WC01 v2 Concern Policy Comparison Follow-Up

Internal dry-run diagnostic only. Mock policy-shape comparison. Not production concern policy. Not persisted normalized concerns. Not unified findings. Not checklist, report, executive, top-finding, scoring, regulatory-lens, or customer-facing output.

## Executive Summary

We implemented the dry-run-only WC01 v2 concern-policy comparison stage using Strategy A: a pure mock evaluator inside `@certscore/report-adapter`. The stage reads `V2NormalizedConcernCandidateDraft` artifacts, compares each candidate against expected WC01 concern-policy requirements, and emits internal `Wc01V2ConcernPolicyComparisonDryRun` artifacts plus JSON/Markdown summaries.

This remains policy-shape calibration only. It does not import or call production WC01 concern policy, persist normalized concerns, create unified findings, mutate reports, create checklist/executive/top-finding/scoring/regulatory-lens output, or create customer-facing copy.

No production WC01 paths were touched. `apps/web/components/scans/shared-scan-detail-view.tsx` was not modified in this pass and remains dirty from unrelated prior work.

## Pipeline Position

```text
Wc01V2ShadowProjection
-> Wc01V2AllowlistDryRun
-> Wc01V2ConcernPolicyInputDraft
-> Wc01V2ConcernPolicySimulationDryRun
-> V2NormalizedConcernCandidateDraft
-> Wc01V2ConcernPolicyComparisonDryRun
```

The new comparison stage is the final stage shown above. It is non-persisted and internal-only.

## Cohort Results

| Cohort | Input files | Succeeded | Failed | Comparison results | Blocked | Malformed | Guardrail failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Expanded | 10 | 10 | 0 | 11 | 0 | 0 | 0 |
| Stress | 12 | 12 | 0 | 11 | 0 | 0 | 0 |
| Edge | 30 | 30 | 0 | 34 | 0 | 0 | 0 |
| Policy-stress | 20 | 20 | 0 | 25 | 0 | 0 | 0 |
| Total | 72 | 72 | 0 | 81 | 0 | 0 | 0 |

## Outcome Summary

| Outcome | Count |
| --- | ---: |
| Total candidates | 81 |
| Total comparison results | 81 |
| `would_accept_for_internal_review` | 45 |
| `would_remain_internal_only` | 36 |
| `would_require_more_evidence` | 0 |
| `would_be_suppressed` | 0 |

All 81 candidates matched the mock policy-shape requirements. The 36 internal-only outcomes were not weak-evidence rows; they were complete candidates with sensitive-context review handling.

## Outcomes By Family

| Family | Expanded | Stress | Edge | Policy-stress | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| `pre_consent_tracking` | 6 | 6 | 16 | 11 | 39 |
| `pre_consent_cookie_storage` | 4 | 5 | 12 | 10 | 31 |
| `session_replay_behavioral_analytics` | 1 | 0 | 6 | 4 | 11 |

## Sensitive-Context Interpretation

36 outcomes remained internal-only because of sensitive-context review handling. Sensitive context increased review restrictions only; it did not promote eligibility, harden findings, or create customer-facing output.

The mock evaluator currently treats complete sensitive-context candidates as `would_remain_internal_only` because policy owners have not approved whether any sensitive-context family can move beyond internal review. This posture avoids accidental surfacing of higher-stakes observations involving health, reproductive health, public benefits, children/education, employment/HR, finance, or behavioral analytics reference contexts.

Policy owners need to decide whether any sensitive-context family can ever move beyond internal review, and if so, what additional evidence, policy-surface coverage, reviewer workflow, and copy requirements apply.

## Guardrail Summary

| Guardrail | Result |
| --- | ---: |
| `productionEligible` true count | 0 |
| `topFindingEligible` true count | 0 |
| `gapEligible` true count | 0 |
| Forbidden gap status token matches | 0 |
| Raw blocked field matches | 0 |
| Legal-conclusion term matches | 0 |
| Production policy imports/calls | 0 |
| Persistence / unified finding / report wiring | none |
| Malformed artifacts | 0 |
| Blocked candidates | 0 |
| Guardrail failures | 0 |

The final guardrail scan over comparison outputs returned no matches for forbidden gap status tokens, raw blocked field names, or legal-conclusion terms.

## Test Coverage Summary

The comparison test coverage includes:

- valid `pre_consent_tracking`
- valid `pre_consent_tracking` with sensitive context
- missing source refs and display-safe excerpts
- weak confidence
- tag-management-only suppression
- Tier C mixed suppression
- valid `pre_consent_cookie_storage`
- first-party-only storage suppression
- CMP/security/necessary storage suppression
- valid session replay collection
- library-only session replay requiring more evidence
- sensitive-context session replay
- unsupported adapter version handling
- malformed artifact handling
- forbidden gap/legal/raw injection
- single-file and batch output generation
- import-boundary tests preventing production WC01 concern policy, report, checklist, executive, top-finding, scoring, regulatory-lens, and shared scan detail imports

Verification passed:

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-concern-policy-compare --help
```

## Interpretation

The pipeline is now narrow enough for internal policy-shape calibration. Weak or missing-evidence rows did not reach comparison in the generated cohorts, and diagnostic-only or Tier C-only rows remained blocked upstream.

The main remaining policy decision point is sensitive-context handling. The comparison stage shows that 36 candidates have complete enough shape for internal review, but the mock policy keeps them internal-only until policy owners decide whether any sensitive-context scenario can move forward.

Production integration is still not approved.

## Recommended Next Decision

Recommended default: **B. Design a manual reviewer workflow for internal-only review queues, not production reports.**

Options:

| Option | Recommendation | Notes |
| --- | --- | --- |
| A. Keep all outputs internal and stop here for v2 dry-run phase | Viable pause point | Conservative if policy owners are not ready to review sensitive-context handling. |
| B. Design a manual reviewer workflow for internal-only review queues | Recommended | Lets reviewers inspect complete candidates without producing reports, persisted concerns, or customer-facing output. |
| C. Design a read-only comparison against selected production concern policy functions, still non-persisted and no UI | Later option | Useful after reviewer workflow and policy questions are clearer. Requires stricter import/no-side-effect controls. |
| D. Begin a separate production integration proposal only after explicit approval | Not recommended yet | Premature while sensitive-context posture and copy/evidence requirements remain open. |

## Explicit Non-Goals

- No production integration.
- No production WC01 concern policy imports or calls.
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
