# WC01 v2 Concern Policy Simulation Follow-Up

Internal dry-run diagnostic only. Not production concern policy. Not persisted normalized concerns. Not unified findings. Not checklist, executive, scoring, regulatory-lens, top-finding, or customer-facing report output.

## Purpose

This pass adds a review-only simulation stage after the refined WC01 v2 concern-policy input draft stage:

```text
Wc01V2ConcernPolicyInputDraft
-> Wc01V2ConcernPolicySimulationDryRun
-> future concern policy, not implemented
```

The simulation checks whether the current draft inputs are shaped well enough for the next internal policy refinement stage. It does not call the production concern-policy code and does not create production report artifacts.

## Commands

```bash
pnpm v2:wc01-concern-policy-simulate \
  --input-dir ./artifacts/v2-wc01-concern-input-dry-run-expanded-fresh-registry-refined \
  --out-dir ./artifacts/v2-wc01-concern-policy-simulation-expanded-fresh-registry

pnpm v2:wc01-concern-policy-simulate \
  --input-dir ./artifacts/v2-wc01-concern-input-dry-run-stress-fresh-registry-refined \
  --out-dir ./artifacts/v2-wc01-concern-policy-simulation-stress-fresh-registry

pnpm v2:wc01-concern-policy-simulate \
  --input-dir ./artifacts/v2-wc01-concern-input-dry-run-edge-consent-refined \
  --out-dir ./artifacts/v2-wc01-concern-policy-simulation-edge-consent

pnpm v2:wc01-concern-policy-simulate \
  --input-dir ./artifacts/v2-wc01-concern-input-dry-run-policy-stress-consent-refined \
  --out-dir ./artifacts/v2-wc01-concern-policy-simulation-policy-stress-consent
```

## Aggregate Results

| Cohort | Input files | Succeeded | Failed | Draft inputs | Simulated outcomes | Blocked inputs | Guardrail failures | Malformed artifacts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Expanded fresh registry | 10 | 10 | 0 | 11 | 11 | 0 | 0 | 0 |
| Stress fresh registry | 12 | 12 | 0 | 11 | 11 | 0 | 0 | 0 |
| Edge consent | 30 | 30 | 0 | 34 | 34 | 0 | 0 | 0 |
| Policy-stress consent | 20 | 20 | 0 | 25 | 25 | 0 | 0 | 0 |
| Total | 72 | 72 | 0 | 81 | 81 | 0 | 0 | 0 |

## Outcome Families

| Family | Expanded | Stress | Edge | Policy-stress | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| pre_consent_tracking | 6 | 6 | 16 | 11 | 39 |
| pre_consent_cookie_storage | 4 | 5 | 12 | 10 | 31 |
| session_replay_behavioral_analytics | 1 | 0 | 6 | 4 | 11 |

## Simulated Review Statuses

| Status | Expanded | Stress | Edge | Policy-stress | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| policy_review_candidate | 11 | 9 | 23 | 2 | 45 |
| policy_review_candidate_sensitive_context | 0 | 2 | 11 | 23 | 36 |
| policy_needs_more_evidence | 0 | 0 | 0 | 0 | 0 |

The absence of `policy_needs_more_evidence` rows is expected for the refined input cohorts: weaker rows were blocked before the concern-policy input draft stage. The simulation still carries the missing-evidence status for malformed or manually weakened future inputs.

## Vendor Purpose Diagnostics

| Purpose | Expanded | Stress | Edge | Policy-stress | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| advertising | 9 | 11 | 26 | 16 | 62 |
| analytics | 8 | 11 | 22 | 19 | 60 |
| tag_management | 5 | 9 | 23 | 16 | 53 |
| session_replay | 2 | 0 | 13 | 8 | 23 |

`tag_management` remains diagnostic metadata only. It does not support simulated production eligibility, top-finding eligibility, or gap eligibility.

## Guardrail Results

- Production eligibility true count: 0
- Top-finding eligibility true count: 0
- Gap eligibility true count: 0
- Forbidden gap status token matches: 0
- Raw blocked field matches: 0
- Forbidden legal-style term matches: 0
- Blocked inputs at simulation stage: 0
- Malformed artifacts: 0
- Guardrail failures: 0

## Interpretation

The refined input cohorts are now narrow enough that every draft input becomes a review-only simulated outcome. That is a good result for this stage: the simulation is no longer discovering broad inventory rows, Tier C diagnostic rows, tag-management-only rows, or weak evidence rows.

The sensitive-context split is meaningful. Expanded remains non-sensitive in this pass, while policy-stress is dominated by sensitive-context outcomes. That gives policy reviewers a focused way to discuss whether future copy, evidence gates, and reviewer workflows need stricter handling for health, finance, public benefits, children or education, employment, and privacy-mature contexts.

## Recommendation

Proceed to policy-approved concern-policy-input contract refinement. Keep the gates unchanged for now.

Before any production proposal, policy owners should explicitly decide:

- whether the three simulated families remain the right first scope
- whether pre-consent tracking and pre-consent cookie storage stay separate
- whether session replay always requires collection endpoint or equivalent runtime evidence
- whether sensitive-context outcomes require stricter evidence, copy, or reviewer workflow rules
- whether any family should remain internal-only indefinitely

No production integration should begin until policy review is complete.
