# WC01 v2 Concern Input Contract Refinement Follow-up

Dry run only. Not production concern policy input. Not persisted normalized concerns. Not customer-facing report output.

## Scope

This pass refines the internal `Wc01V2ConcernPolicyInputDraft` contract after policy/product/privacy review. It remains an internal dry-run artifact only.

The refined contract adds explicit retained metadata for:

- source refs and display-safe excerpt IDs/counts
- confidence band and directness classification
- pre-consent or consent-state context
- vendor purpose basis
- source finding key and source shadow context
- blocked/demotion/caveat context
- coverage limitations when available
- source module context placeholders when available
- family-specific required evidence and caveats
- sensitive-context review metadata
- review-only language metadata using safe prohibited phrase keys

No production normalized concern mapping, persisted concern, unified finding, checklist row, report row, executive row, top finding, scoring, regulatory lens, customer-facing copy, or production output was created.

## Commands Run

```bash
pnpm --filter @certscore/report-adapter test
pnpm --filter @certscore/report-adapter typecheck
pnpm v2:wc01-concern-input-dry-run --help

pnpm v2:wc01-concern-input-dry-run \
  --allowlist-dir ./artifacts/v2-wc01-allowlist-dry-run-expanded-fresh-registry-tightened \
  --out-dir ./artifacts/v2-wc01-concern-input-dry-run-expanded-fresh-registry-refined

pnpm v2:wc01-concern-input-dry-run \
  --allowlist-dir ./artifacts/v2-wc01-allowlist-dry-run-stress-fresh-registry-tightened \
  --out-dir ./artifacts/v2-wc01-concern-input-dry-run-stress-fresh-registry-refined

pnpm v2:wc01-concern-input-dry-run \
  --allowlist-dir ./artifacts/v2-wc01-allowlist-dry-run-edge-consent-tightened-tierc \
  --out-dir ./artifacts/v2-wc01-concern-input-dry-run-edge-consent-refined

pnpm v2:wc01-concern-input-dry-run \
  --allowlist-dir ./artifacts/v2-wc01-allowlist-dry-run-policy-stress-consent \
  --out-dir ./artifacts/v2-wc01-concern-input-dry-run-policy-stress-consent-refined
```

## Cohort Counts

| Cohort | Allowlist files | Succeeded | Failed | Allowlist candidates | Refined draft inputs | Blocked candidates |
|---|---:|---:|---:|---:|---:|---:|
| Expanded fresh registry | 10 | 10 | 0 | 11 | 11 | 0 |
| Stress fresh registry | 12 | 12 | 0 | 11 | 11 | 0 |
| Edge consent | 30 | 30 | 0 | 34 | 34 | 0 |
| Policy stress | 20 | 20 | 0 | 25 | 25 | 0 |
| Total | 72 | 72 | 0 | 81 | 81 | 0 |

## Draft Families

| Cohort | `pre_consent_tracking` | `pre_consent_cookie_storage` | `session_replay_behavioral_analytics` |
|---|---:|---:|---:|
| Expanded fresh registry | 6 | 4 | 1 |
| Stress fresh registry | 6 | 5 | 0 |
| Edge consent | 16 | 12 | 6 |
| Policy stress | 11 | 10 | 4 |
| Total | 39 | 31 | 11 |

## Sensitive Context

| Cohort | Sensitive-context flagged drafts | Drafts requiring extra policy review |
|---|---:|---:|
| Expanded fresh registry | 0 | 0 |
| Stress fresh registry | 2 | 2 |
| Edge consent | 11 | 11 |
| Policy stress | 23 | 23 |
| Total | 36 | 36 |

Sensitive-context categories:

| Category | Expanded | Stress | Edge | Policy stress | Total |
|---|---:|---:|---:|---:|---:|
| `behavioral_analytics_reference` | 0 | 0 | 5 | 3 | 8 |
| `children_education` | 0 | 0 | 0 | 1 | 1 |
| `employment_hr` | 0 | 0 | 0 | 5 | 5 |
| `finance` | 0 | 2 | 0 | 2 | 4 |
| `health` | 0 | 0 | 3 | 3 | 6 |
| `public_benefits` | 0 | 0 | 0 | 4 | 4 |
| `reproductive_health` | 0 | 0 | 3 | 5 | 8 |

Sensitive-context flags add review requirements only. They do not change production eligibility, top-finding eligibility, gap eligibility, or concern/finding promotion.

## Family-Specific Caveats

| Caveat | Expanded | Stress | Edge | Policy stress | Total |
|---|---:|---:|---:|---:|---:|
| `analytics_and_advertising_not_automatically_equivalent_policy_review_required` | 6 | 6 | 16 | 11 | 39 |
| `cookie_storage_separate_from_pre_consent_tracking_unless_policy_owners_approve_merge` | 4 | 5 | 12 | 10 | 31 |
| `first_party_cmp_security_necessary_functional_unknown_only_storage_excluded` | 4 | 5 | 12 | 10 | 31 |
| `collection_endpoint_or_equivalent_strong_runtime_evidence_required` | 1 | 0 | 6 | 4 | 11 |
| `library_only_evidence_blocked` | 1 | 0 | 6 | 4 | 11 |
| `no_claim_recording_occurred_sensitive_fields_captured_or_person_identified` | 1 | 0 | 6 | 4 | 11 |

## Review-Only Language Status

| Cohort | Inputs with review-language block | Inputs missing review-language block | Prohibited phrase key count |
|---|---:|---:|---:|
| Expanded fresh registry | 11 | 0 | 88 |
| Stress fresh registry | 11 | 0 | 88 |
| Edge consent | 34 | 0 | 272 |
| Policy stress | 25 | 0 | 200 |
| Total | 81 | 0 | 648 |

The review-language block uses allowed internal phrases and safe prohibited phrase keys. The output does not include the forbidden gap status token or literal legal-conclusion claim language.

## Guardrails

| Guardrail | Result |
|---|---:|
| Batch failures | 0 |
| Malformed artifacts | 0 |
| Guardrail failures | 0 |
| Forbidden gap status token scan matches | 0 |
| Raw blocked field scan matches | 0 |
| Legal-conclusion term scan matches | 0 |
| Outputs with production eligibility | 0 |
| Outputs with top-finding eligibility | 0 |
| Outputs with gap eligibility | 0 |

## Recommendation

The refined dry-run contract is ready for a second policy review.

Recommended review focus:

- Confirm the refined retained fields are sufficient for internal policy review.
- Confirm sensitive-context flags and categories are the right explicit-map scope.
- Confirm `pre_consent_tracking` and `pre_consent_cookie_storage` remain separate.
- Confirm session replay / behavioral analytics should continue requiring collection endpoint evidence or equivalent strong runtime evidence.
- Confirm safe review-language metadata is acceptable without literal banned phrases in generated artifacts.
- Confirm no family should move toward production/customer-facing use before a separate production integration proposal.
