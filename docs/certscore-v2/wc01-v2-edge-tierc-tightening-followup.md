# WC01 v2 edge Tier C tightening follow-up

Generated: 2026-06-09

Input WC01 shadow artifacts:

- `artifacts/v2-wc01-shadow-edge-consent`

Compared allowlist dry-run outputs:

- Before tightening: `artifacts/v2-wc01-allowlist-dry-run-edge-consent`
- After tightening: `artifacts/v2-wc01-allowlist-dry-run-edge-consent-tightened-tierc`

This is internal diagnostic output only. It does not implement production normalized concern mapping, persisted concerns, unified findings, checklist rows, executive rows, top findings, scoring, regulatory lenses, or customer-facing report output.

## Summary

| Metric | Before | After |
|---|---:|---:|
| Shadow files found | 30 | 30 |
| Succeeded | 30 | 30 |
| Failed | 0 | 0 |
| Candidates | 40 | 34 |
| Blocked rows | 740 | 746 |
| Surprise candidates | 6 | 0 |
| Tier B/C leakage count | 6 | 0 |
| Candidates with Tier C diagnostic purpose | 6 | 0 |
| Candidates blocked for Tier C diagnostic purpose | n/a | 6 |
| Mixed tracker + Tier C blocked count | n/a | 6 |
| Guardrail failures | 0 | 0 |
| Malformed artifacts | 0 | 0 |

The tightening moved 6 mixed tracker/Tier C diagnostic rows from candidates into `tier_a_failed_gates` blocked rows. The remaining candidate set contains no Tier C diagnostic purposes.

## Candidate Counts After Tightening

By source finding key:

| Source finding key | Count |
|---|---:|
| `pre_consent_tracking_detected` | 16 |
| `third_party_cookie_pre_consent` | 12 |
| `session_replay_or_behavioral_analytics_observed` | 6 |
| `third_party_vendors_observed` | 0 |

By proposed concern family:

| Proposed concern family | Count |
|---|---:|
| `pre_consent_tracking` | 16 |
| `pre_consent_cookie_storage` | 12 |
| `session_replay_behavioral_analytics` | 6 |

Blocked rows by tier after tightening:

| Tier | Count |
|---|---:|
| `tier_a_failed_gates` | 107 |
| `tier_b_review_only` | 450 |
| `tier_c_never_tracker_default` | 9 |
| `unsupported` | 180 |

## Purpose Counters After Tightening

| Counter | Count |
|---|---:|
| Supporting `advertising` | 26 |
| Supporting `analytics` | 22 |
| Supporting `session_replay` | 13 |
| Supporting `tag_management` | 0 |
| Supporting `consent_management` | 0 |
| Diagnostic `tag_management` presence | 23 |
| Diagnostic `security` presence on candidates | 0 |
| Diagnostic `performance_monitoring` / `rum` presence on candidates | 0 |
| Diagnostic `customer_support` / `live_chat` presence on candidates | 0 |
| Diagnostic infrastructure presence on candidates | 0 |

`tag_management` remains diagnostic-only and non-supporting, but it does not block otherwise valid tracker-purpose rows. `consent_management` remains non-supporting.

## New Block Reasons

The tightened dry-run introduced the expected block reasons:

| Block reason | Count |
|---|---:|
| `tier_c_diagnostic_purpose_present` | 6 |
| `mixed_tracker_and_tier_c_purpose_requires_evidence_subset_gate` | 6 |

These rows are blocked until a future evidence-subset gate can prove that candidate evidence is supported only by tracker-purpose observations.

## Newly Blocked Rows

| Site | Row ID | Source finding key | Tier | Blocked purposes | Block reasons |
|---|---|---|---|---|---|
| `bbc.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `tier_a_failed_gates` | security | `mixed_tracker_and_tier_c_purpose_requires_evidence_subset_gate`, `tier_c_diagnostic_purpose_present` |
| `bbc.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `tier_a_failed_gates` | security | `mixed_tracker_and_tier_c_purpose_requires_evidence_subset_gate`, `tier_c_diagnostic_purpose_present` |
| `nytimes.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `tier_a_failed_gates` | security, tag_management | `mixed_tracker_and_tier_c_purpose_requires_evidence_subset_gate`, `tier_c_diagnostic_purpose_present` |
| `nytimes.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `tier_a_failed_gates` | security | `mixed_tracker_and_tier_c_purpose_requires_evidence_subset_gate`, `tier_c_diagnostic_purpose_present` |
| `theguardian.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `tier_a_failed_gates` | security | `mixed_tracker_and_tier_c_purpose_requires_evidence_subset_gate`, `tier_c_diagnostic_purpose_present` |
| `theguardian.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `tier_a_failed_gates` | security | `mixed_tracker_and_tier_c_purpose_requires_evidence_subset_gate`, `tier_c_diagnostic_purpose_present` |

## Guardrails

| Check | Count |
|---|---:|
| `gap_observed` token | 0 |
| Raw blocked field names | 0 |
| Legal-conclusion language | 0 |
| `productionEligible: true` candidates | 0 |
| `topFindingEligible: true` candidates | 0 |
| `gapEligible: true` candidates | 0 |
| Candidates missing source refs | 0 |
| Candidates missing excerpts/display-safe evidence | 0 |
| Candidates with weak/missing confidence or directness | 0 |

## Sanitizer Warning Status

The prior WC01 shadow sanitizer warning remains unchanged:

| Site | Warning | Context |
|---|---|---|
| `supabase.com` | `contains_long_opaque_value_without_redaction_context` | Long PostHog-style cookie name appears in display-safe excerpts and group keys with redacted values. |

The Tier C tightening did not modify sanitizer behavior.

## Recommendation

Keep the newly tightened gates unchanged and proceed to concern-policy input draft design only as an internal, dry-run draft stage.

Before any production mapping or persisted normalized concerns, add follow-up coverage for:

- evidence-subset gating, if mixed tracker/Tier C rows are ever reconsidered
- Supabase/PostHog-style long opaque cookie names in display-safe excerpts
- consent action confidence cases where clicks are held back or banner state remains present

Do not wire this output into WC01 report, checklist, executive-summary, top-finding, scoring, regulatory-lens, or customer-facing paths.
