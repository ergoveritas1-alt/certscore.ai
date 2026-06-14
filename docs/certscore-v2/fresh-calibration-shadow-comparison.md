# Fresh consent calibration and shadow projection comparison

Date: 2026-06-08

Scope: internal CertScore v2 diagnostics only. No production UI/report integration.

## Commands run

```bash
pnpm v2:calibrate --profile consent --urls ./docs/certscore-v2/calibration-urls-expanded.txt --out ./artifacts/v2-calibration-expanded-fresh
pnpm v2:calibrate --profile consent --urls ./docs/certscore-v2/calibration-urls-stress.txt --out ./artifacts/v2-calibration-stress-fresh
pnpm v2:shadow-project --calibration ./artifacts/v2-calibration-expanded-fresh --out ./artifacts/v2-shadow-projection-expanded-fresh
pnpm v2:shadow-project --calibration ./artifacts/v2-calibration-stress-fresh --out ./artifacts/v2-shadow-projection-stress-fresh
```

## Important comparison caveat

The existing comparison artifacts were produced with the `full` profile, while the fresh runs used the requested `consent` profile. The fresh consent runs do not execute policy-surface discovery, so policy rows shift toward `coverage_limitation` and away from policy-derived `observed`/`checked` outcomes. Endpoint and consent-flow posture are still useful to compare.

## Scan and module health

| Cohort | Artifact | Profile | Sites succeeded | Sites failed | Module statuses |
| --- | --- | --- | ---: | ---: | --- |
| Expanded existing | `artifacts/v2-calibration-expanded` | `full` | 10 | 0 | pre-consent completed 10; consent-flow completed 10; policy-surface completed 10 |
| Expanded fresh | `artifacts/v2-calibration-expanded-fresh` | `consent` | 10 | 0 | pre-consent completed 10; consent-flow completed 10 |
| Stress existing | `artifacts/v2-calibration-stress` | `full` | 12 | 0 | pre-consent completed 11 / failed 1; consent-flow completed 11 / failed 1; policy-surface completed 10 / failed 2 |
| Stress fresh | `artifacts/v2-calibration-stress-fresh` | `consent` | 12 | 0 | pre-consent completed 11 / failed 1; consent-flow completed 11 / failed 1 |

Stress fresh failures were clean and explainable:

- `https://costco.com` pre-consent runtime failed with `page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://costco.com/`.
- `https://costco.com` consent-flow runtime failed with the same HTTP/2 navigation error.

## Resolver effect at calibration level

| Cohort | Unresolved runtime endpoints | Resolved vendor product count |
| --- | ---: | ---: |
| Expanded existing | 102 | 40 |
| Expanded fresh | 93 | 48 |
| Stress existing | 86 | 60 |
| Stress fresh | 61 | 72 |

The fresh live runs show reduced unresolved endpoint count and increased named vendor/product attribution at the calibration summary level.

## Shadow endpoint groups

| Cohort | Known adtech/support | Performance/security | Site-owned infra | Unresolved collection-like | Ignored noise |
| --- | ---: | ---: | ---: | ---: | ---: |
| Expanded existing | 517 | 13 | 184 | 841 | 8,314 |
| Expanded fresh | 1,201 | 59 | 202 | 1,166 | 7,166 |
| Stress existing | 544 | 48 | 198 | 523 | 8,392 |
| Stress fresh | 965 | 191 | 197 | 796 | 6,857 |

Shadow grouping is event-row based, not unique-host based. Fresh live runs observed different endpoint volume, so unresolved group rows increased even while calibration-level unresolved endpoint counts decreased.

After the registry-consolidation pass, the existing fresh shadow bundles shifted additional known vendor endpoint rows out of `unresolved_collection_like_endpoint` without changing review status posture. A fresh live calibration rerun is still needed for scan-core endpoint attribution statuses and calibration-level unresolved endpoint counts to reflect the new resolver/attribution mappings.

## Review statuses and evidence projection

| Cohort | `review_signal` | `observed` | `coverage_limitation` | `not_testable` | Capped excerpts | Missing excerpts | Disallowed statuses |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Expanded existing | 25 | 56 | 0 | 20 | 40 | 0 | 0 |
| Expanded fresh | 19 | 34 | 90 | 19 | 42 | 0 | 0 |
| Stress existing | 25 | 42 | 36 | 21 | 35 | 0 | 0 |
| Stress fresh | 16 | 26 | 125 | 21 | 34 | 0 | 0 |

No `gap_observed` status was introduced in the fresh expanded or stress shadow outputs.

## Sanitization warnings

| Cohort | Warning count | Details |
| --- | ---: | --- |
| Expanded fresh | 0 | None |
| Stress fresh | 1 | `https://costco.com`, row `vendor_associated_cookie_pre_consent`, status `coverage_limitation`, warning `contains_long_opaque_value_without_redaction_context` |

Stress warning context:

- Row key: `vendor_associated_cookie_pre_consent`
- Excerpts: none
- Source refs: none
- Detected token: `first_party_cookie_not_third_party_cookie_finding`

Recommended fix: tune the sanitizer's long-token heuristic to ignore known internal snake_case reason/status keys while retaining the check for opaque identifiers in evidence refs and excerpts. This appears to be a safe internal demotion/limitation reason, not raw evidence leakage.

## Guardrail checks

- No disallowed statuses were produced.
- No `gap_observed` status was introduced.
- No missing excerpt rows were produced.
- No evidence with security, performance monitoring, customer support, fraud-prevention, bot-defense, RUM, or live-chat purpose was found supporting a tracker finding in the fresh expanded or stress shadows.
- Security, performance monitoring, and customer support purposes remained non-tracker by default.
- No new named-vendor customer-facing risk was created by the resolver cleanup. The outputs remain internal shadow diagnostics.

## Recommendation

The resolver cleanup is directionally healthy: unique unresolved runtime endpoint counts dropped and resolved vendor/product attribution increased in both cohorts, without unsafe status promotion. Keep unresolved endpoint review, policy/runtime alignment, and consent-flow persistence/delta rows at review-signal or coverage-limitation posture until the WC01/report adapter work introduces explicit projection gates.
