# WC01 v2 Policy-Stress Cohort Summary

Internal diagnostics only. Not customer-facing report output.

## Scope

This summary covers the policy-stress cohort added in `docs/certscore-v2/calibration-urls-policy-stress.txt` and run through the internal-only v2 dry-run chain:

```text
v2:calibrate
-> v2:shadow-project
-> v2:wc01-shadow
-> v2:wc01-allowlist-dry-run
-> v2:wc01-concern-input-dry-run
```

No production integration, persisted normalized concerns, unified findings, checklist rows, executive rows, top findings, scoring, regulatory lenses, customer-facing copy, or production report output was created.

## Run Health

| Metric | Count |
|---|---:|
| Total URLs | 20 |
| Site-level completed scans | 20 |
| Site-level failed scans | 0 |
| Module-limited / partial sites | 1 |

`fidelity.com` completed at the site level but had `preConsentRuntimeScanner` and `consentFlowRuntimeScanner` failures. It carried through as coverage-limited, zero-candidate output rather than being hidden.

## Module Status Counts

| Module status | Count |
|---|---:|
| `preConsentRuntimeScanner:completed` | 19 |
| `preConsentRuntimeScanner:failed` | 1 |
| `consentFlowRuntimeScanner:completed` | 19 |
| `consentFlowRuntimeScanner:failed` | 1 |

Coverage limitations included `policy_surface_not_run=20`, `consent_flow_not_run=1`, and `pre_consent_runtime_not_run=1`.

## Projection And Guardrail Health

| Stage | Files/sites | Succeeded | Failed |
|---|---:|---:|---:|
| Calibration | 20 URLs | 20 | 0 |
| WC01 shadow | 20 projection files | 20 | 0 |
| Allowlist dry-run | 20 shadow files | 20 | 0 |
| Concern-input dry-run | 20 allowlist files | 20 | 0 |

WC01 shadow rows:

| Status | Count |
|---|---:|
| `observed` | 61 |
| `checked` | 39 |
| `review_signal` | 154 |
| `coverage_limitation` | 197 |
| `not_observed` | 32 |
| `not_testable` | 37 |

## Candidate Counts

| Metric | Count |
|---|---:|
| Allowlist candidates | 25 |
| Allowlist blocked rows | 495 |
| Concern input drafts | 25 |
| Concern-input blocked candidates | 0 |

Candidate counts by proposed concern family:

| Draft family | Count |
|---|---:|
| `pre_consent_tracking` | 11 |
| `pre_consent_cookie_storage` | 10 |
| `session_replay_behavioral_analytics` | 4 |

## Sensitive-Context Sites With Candidates

| Site | Context | Concern input drafts | Families |
|---|---|---:|---|
| `healthline.com` | Health / medical information | 3 | `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics` |
| `plannedparenthood.org` | Reproductive health | 3 | `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics` |
| `bedsider.org` | Reproductive health | 2 | `pre_consent_tracking`, `pre_consent_cookie_storage` |
| `bankofamerica.com` | Finance | 2 | `pre_consent_tracking`, `pre_consent_cookie_storage` |
| `benefits.gov` | Government / public benefits | 2 | `pre_consent_tracking`, `pre_consent_cookie_storage` |
| `ssa.gov` | Government / public benefits | 2 | `pre_consent_tracking`, `pre_consent_cookie_storage` |
| `pbskids.org` | Children / education | 1 | `pre_consent_tracking` |
| `greenhouse.com` | Employment / HR | 2 | `pre_consent_tracking`, `pre_consent_cookie_storage` |
| `workday.com` | Employment / HR | 3 | `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics` |
| `cloudflare.com` | Privacy-mature SaaS | 2 | `pre_consent_tracking`, `pre_consent_cookie_storage` |
| `hotjar.com` | Behavioral analytics reference site | 3 | `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics` |

Sites with zero concern input drafts: `bbc.com`, `fidelity.com`, `healthcare.gov`, `indeed.com`, `khanacademy.org`, `mayoclinic.org`, `proton.me`, `statefarm.com`, `webmd.com`.

## Purpose And Leakage Checks

| Check | Count | Expected |
|---|---:|---:|
| `tag_management` supporting count | 0 | 0 |
| `consent_management` supporting count | 0 | 0 |
| Tier B/C leakage | 0 | 0 |
| Surprise candidates | 0 | 0 |
| Candidates missing source refs | 0 | 0 |
| Candidates missing excerpts/display-safe evidence | 0 | 0 |
| Candidates with weak/missing confidence or directness | 0 | 0 |
| Candidates from `third_party_vendors_observed` | 0 | 0 |

Candidate supporting purposes:

| Purpose | Count |
|---|---:|
| `advertising` | 16 |
| `analytics` | 19 |
| `session_replay` | 8 |

Candidate diagnostic purposes:

| Purpose | Count |
|---|---:|
| `tag_management` | 16 |

## Blocked Rows

Blocked counts by tier:

| Tier | Count |
|---|---:|
| `tier_a_failed_gates` | 67 |
| `tier_b_review_only` | 300 |
| `tier_c_never_tracker_default` | 8 |
| `unsupported` | 120 |

Top block reasons included:

| Reason | Count |
|---|---:|
| `tier_b_review_only_by_design` | 300 |
| `source_finding_key_not_allowlisted` | 120 |
| `status_not_allowed_for_tier_a` | 31 |
| `missing_excerpt_or_display_safe_evidence` | 30 |
| `missing_source_refs` | 30 |
| `missing_allowed_vendor_purpose` | 22 |
| `inventory_only_signal` | 20 |
| `inventory_signal_requires_stronger_tracking_context` | 20 |
| `requires_pre_consent_or_collection_context` | 20 |
| `missing_session_replay_collection_evidence` | 16 |
| `missing_pre_consent_or_consent_state_evidence` | 14 |
| `consent_surface_gate_split_required` | 12 |
| `consent_surface_mapping_blocked_for_now` | 12 |
| `tier_c_non_tracker_purpose_only` | 8 |
| `missing_direct_runtime_evidence` | 7 |
| `missing_high_confidence_runtime_evidence` | 7 |
| `mixed_tracker_and_tier_c_purpose_requires_evidence_subset_gate` | 4 |
| `tier_c_diagnostic_purpose_present` | 4 |

## Guardrail Counts

For downstream WC01-facing artifacts (`shadow-project`, `wc01-shadow`, `allowlist-dry-run`, and `concern-input-dry-run`):

| Guardrail scan | Count | Expected |
|---|---:|---:|
| `gap_observed` token matches | 0 | 0 |
| Raw blocked field matches | 0 | 0 |
| Forbidden legal-style term matches | 0 | 0 |

WC01 shadow guardrails:

| Guardrail | Count |
|---|---:|
| `productionEligible` true | 0 |
| `topFindingEligible` true | 0 |
| `gapEligible` true | 0 |
| Unsupported output statuses | 0 |
| Legal-conclusion warnings | 0 |
| Guardrail failures | 0 |

## Sanitizer Warnings

| Metric | Count |
|---|---:|
| WC01 shadow sanitizer warnings | 0 |
| Sites with sanitizer warnings | 0 |

The prior `greenhouse.com` warning was traced to source evidence ref URL/label fields where an ad sync endpoint used a long opaque query parameter name with an already redacted value. The source-ref normalizer now redacts unsafe query parameter names while preserving source ref IDs for traceability. Sanitizer coverage remains strict for unnormalized long opaque values.

## Sensitive-Context Gate Recommendation

Keep the current gates unchanged for policy-owner review. The policy-stress run did not show Tier B/C leakage, tag-management support, consent-management support, missing source refs, missing display-safe evidence, weak confidence/directness candidates, or downstream guardrail text matches.

Before any future production proposal, consider stricter sensitive-context gates:

- Require policy-surface coverage or an explicit coverage-limitation posture for sensitive-context report use.
- Require session replay / behavioral analytics candidates to have collection endpoint evidence or an approved equivalent, not library-only evidence.
- Keep mixed tracker and Tier C diagnostic purposes blocked until evidence-subset gates exist.
- Keep `tag_management` and `consent_management` diagnostic-only.
- Require policy-approved copy and evidence fields before any customer-facing projection.
