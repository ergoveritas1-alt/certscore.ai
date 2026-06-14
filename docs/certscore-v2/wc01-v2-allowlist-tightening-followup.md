# WC01 v2 allowlist tightening follow-up

Audit date: 2026-06-08

Input shadow directories:

- `artifacts/v2-wc01-shadow-expanded-fresh-registry`
- `artifacts/v2-wc01-shadow-stress-fresh-registry`

Tightened dry-run output directories:

- `artifacts/v2-wc01-allowlist-dry-run-expanded-fresh-registry-tightened`
- `artifacts/v2-wc01-allowlist-dry-run-stress-fresh-registry-tightened`

This remains an internal dry-run bridge only. It does not implement production normalized concern mapping, unified findings, checklist rows, executive rows, top findings, scoring, regulatory lenses, or customer-facing report output.

## Summary

| Cohort | Files | Rows | Candidates before | Candidates after | Blocked before | Blocked after | Guardrail failures |
|---|---:|---:|---:|---:|---:|---:|---:|
| Expanded | 10 | 260 | 19 | 11 | 241 | 249 | 0 |
| Stress | 12 | 312 | 17 | 11 | 295 | 301 | 0 |
| Total | 22 | 572 | 36 | 22 | 536 | 550 | 0 |

The tightening removed all `third_party_vendors_observed` candidates from the dry-run bridge. Those rows now remain blocked as inventory-only signals unless a future bridge stage supplies stronger pre-consent, collection, or cookie/storage context.

All remaining candidates are still `candidate_review_only` with `productionEligible: false`, `topFindingEligible: false`, and `gapEligible: false`.

## Candidate counts

| Source/family | Before total | After total |
|---|---:|---:|
| `third_party_vendors_observed` / `tracker_inventory` | 14 | 0 |
| `pre_consent_tracking_detected` / `pre_consent_tracking` | 12 | 12 |
| `third_party_cookie_pre_consent` / `pre_consent_cookie_storage` | 9 | 9 |
| `session_replay_or_behavioral_analytics_observed` / `session_replay_behavioral_analytics` | 1 | 1 |
| `consent_banner_observed_or_not_observed` / `consent_surface` | 0 | 0 |

Expanded after tightening:

- `pre_consent_tracking`: 6
- `pre_consent_cookie_storage`: 4
- `session_replay_behavioral_analytics`: 1
- `tracker_inventory`: 0

Stress after tightening:

- `pre_consent_tracking`: 6
- `pre_consent_cookie_storage`: 5
- `session_replay_behavioral_analytics`: 0
- `tracker_inventory`: 0

## Purpose classification

| Purpose classification | Expanded | Stress | Total |
|---|---:|---:|---:|
| Supporting `advertising` | 9 | 11 | 20 |
| Supporting `analytics` | 8 | 11 | 19 |
| Supporting `session_replay` | 2 | 0 | 2 |
| Supporting `tag_management` | 0 | 0 | 0 |
| Diagnostic `tag_management` present | 5 | 9 | 14 |
| Diagnostic `consent_management` present | 0 | 0 | 0 |

`tag_management` is no longer counted as supporting purpose evidence. It may still appear as a diagnostic label alongside advertising or analytics in candidate rows.

## Audit checks

| Check | Expanded | Stress |
|---|---:|---:|
| Surprise candidates | 0 | 0 |
| Candidates from `third_party_vendors_observed` | 0 | 0 |
| Candidates with original shadow status not allowed | 0 | 0 |
| Candidates missing source refs | 0 | 0 |
| Candidates missing excerpts/display-safe evidence | 0 | 0 |
| Candidates with weak or missing confidence/directness | 0 | 0 |
| Tier B/C leakage count | 0 | 0 |
| Guardrail failures | 0 | 0 |
| Malformed artifacts | 0 | 0 |

Guardrail text scan over both tightened output directories found no `gap_observed`, raw blocked evidence field names, or legal-conclusion language.

## Blocked rows

| Tier | Expanded | Stress | Total |
|---|---:|---:|---:|
| `tier_a_failed_gates` | 37 | 46 | 83 |
| `tier_b_review_only` | 150 | 180 | 330 |
| `tier_c_never_tracker_default` | 2 | 3 | 5 |
| `unsupported` | 60 | 72 | 132 |

The increase in `tier_a_failed_gates` is expected. It is the former inventory candidate set moving into blocked rows with `inventory_only_signal`, `requires_pre_consent_or_collection_context`, and `inventory_signal_requires_stronger_tracking_context`.

## Recommendation

Proceed with the next bridge stage only against the tightened candidate families:

- Keep `third_party_vendors_observed` blocked as inventory/support context.
- Keep consent banner rows blocked until a split consent-surface gate defines bounded absence/search-scope evidence and observed surface evidence separately.
- Keep `tag_management`, `consent_management`, security, performance, support, infrastructure, fraud-prevention, bot-defense, RUM, and live-chat purposes diagnostic-only by default.
- Preserve the current review-only posture for unresolved endpoint review, policy/runtime alignment, consent-flow persistence, and delta rows.

No production WC01 UI/report/checklist/executive integration should be added from this dry run.
