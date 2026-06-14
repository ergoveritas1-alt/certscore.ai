# Fresh-registry consent calibration follow-up

Date: 2026-06-09

Scope: internal CertScore v2 diagnostics only. No production WC01 UI/report integration.

## Commands run

```bash
pnpm v2:calibrate --profile consent --urls ./docs/certscore-v2/calibration-urls-expanded.txt --out ./artifacts/v2-calibration-expanded-fresh-registry
pnpm v2:calibrate --profile consent --urls ./docs/certscore-v2/calibration-urls-stress.txt --out ./artifacts/v2-calibration-stress-fresh-registry
pnpm v2:shadow-project --calibration ./artifacts/v2-calibration-expanded-fresh-registry --out ./artifacts/v2-shadow-projection-expanded-fresh-registry
pnpm v2:shadow-project --calibration ./artifacts/v2-calibration-stress-fresh-registry --out ./artifacts/v2-shadow-projection-stress-fresh-registry
```

## Sanitizer hardening

The previous Costco warning was a false positive on the internal demotion reason `first_party_cookie_not_third_party_cookie_finding`.

The sanitizer now walks projection fields by location. It exempts bounded snake_case internal diagnostic keys only in internal reason/basis locations such as `demotionReasons`, `missingCorroborators`, `eligibility.reasons`, coverage limitation keys, matched criteria, and `relatedVendors[].basis[]`. It still flags long opaque values in evidence excerpts, source evidence refs, raw/evidence-like fields, and URL/query/cookie-looking values.

Focused tests cover:

- internal `first_party_cookie_not_third_party_cookie_finding` does not warn in internal reason fields
- long opaque excerpt values still warn
- long opaque source evidence refs still warn
- cookie-looking underscore values still warn

## Calibration comparison

| Cohort | Run | Sites succeeded | Sites failed | Module status counts |
| --- | --- | ---: | ---: | --- |
| Expanded | Previous fresh | 10 | 0 | pre-consent completed 10; consent-flow completed 10 |
| Expanded | Fresh-registry | 10 | 0 | pre-consent completed 10; consent-flow completed 10 |
| Stress | Previous fresh | 12 | 0 | pre-consent completed 11 / failed 1; consent-flow completed 11 / failed 1 |
| Stress | Fresh-registry | 12 | 0 | pre-consent completed 11 / failed 1; consent-flow completed 11 / failed 1 |

Costco behavior was unchanged in stress: the site record completed, but both runtime modules failed with `page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://costco.com/`.

| Cohort | Run | Unresolved runtime endpoints | Unique unresolved endpoints | Resolved vendor/product observations | Unique resolved products |
| --- | --- | ---: | ---: | ---: | ---: |
| Expanded | Previous fresh | 93 | 50 | 48 | 27 |
| Expanded | Fresh-registry | 79 | 43 | 54 | 32 |
| Stress | Previous fresh | 61 | 19 | 72 | 33 |
| Stress | Fresh-registry | 55 | 23 | 78 | 37 |

Fresh-registry resolved products added expected registry-backed coverage such as BrightLine, Integral Ad Science, Medallia Digital, Neustar / AGKN, RevJet, Spotify Pixel, and Taboola.

Consent-flow action outcome changed only modestly:

- Expanded previous: accept succeeded 1; reject succeeded 0.
- Expanded fresh-registry: accept succeeded 1; reject succeeded 1.
- Stress previous: accept succeeded 1; reject succeeded 0.
- Stress fresh-registry: accept succeeded 1; reject succeeded 0.

## Shadow comparison

| Cohort | Run | Known adtech/support | Performance/security | Site-owned infra | Unresolved collection-like | Ignored noise |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Expanded | Previous fresh | 1,201 | 59 | 202 | 1,166 | 7,166 |
| Expanded | Fresh-registry plus targeted unresolved pass | 2,126 | 63 | 195 | 1,082 | 6,322 |
| Stress | Previous fresh | 965 | 191 | 197 | 796 | 6,857 |
| Stress | Fresh-registry plus targeted unresolved pass | 1,466 | 200 | 197 | 732 | 6,675 |

The first fresh-registry shadow pass had stress unresolved rows effectively flat (`796 -> 797`) despite calibration-level unresolved endpoints dropping (`61 -> 55`), which appeared attributable to live-site variability and event volume. After the targeted unresolved pass for DoubleVerify, LinkedIn, Demdex sync paths, Amazon Ads reporting, Google Ad Traffic Quality, Quantcast, and Attentive, shadow unresolved rows improved further on the existing fresh-registry bundles. A new live calibration would be needed for calibration-level unresolved/resolved counts to reflect the scan-core attribution additions from this targeted pass.

| Cohort | Run | `review_signal` | `observed` | `coverage_limitation` | `not_testable` | Capped rows | Missing excerpts | Disallowed statuses | `gap_observed` |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Expanded | Previous fresh | 19 | 34 | 90 | 19 | 42 | 0 | 0 | 0 |
| Expanded | Fresh-registry | 19 | 35 | 90 | 18 | 43 | 0 | 0 | 0 |
| Stress | Previous fresh | 16 | 26 | 125 | 21 | 34 | 0 | 0 | 0 |
| Stress | Fresh-registry | 16 | 25 | 125 | 21 | 33 | 0 | 0 | 0 |

## Sanitization warnings

| Cohort | Run | Warning count | Details |
| --- | --- | ---: | --- |
| Expanded | Previous fresh | 0 | None |
| Expanded | Fresh-registry | 1 | `ikea.com`, row `rows.23`, long source evidence ref `url` values such as `CF_Milan_FY_26_some_roomsets_4_5_living_wide_44caf52d5e` |
| Stress | Previous fresh | 1 | `airbnb.com`, row `rows.23`, long hash-like source evidence ref `url` values |
| Stress | Fresh-registry | 1 | `airbnb.com`, row `rows.23`, long hash-like source evidence ref `url` values |

The Costco internal-reason warning is cleared. The remaining warnings are evidence-ref locations, so they remain intentionally flagged.

Recommended follow-up: source evidence refs should avoid retaining bare hash/asset-name values in the `url` field when those values are not display-safe URLs. Prefer a redacted URL, a label, or an internal-only artifact reference.

## Guardrail audit

- No disallowed statuses.
- No `gap_observed` statuses.
- No missing projected excerpt rows.
- No security, performance monitoring, customer support, fraud-prevention, bot-defense, RUM, live-chat, CDN/static, or site-owned infrastructure evidence was found supporting tracker findings by default.
- Broad host path-gating remained intact in resolver tests for generic `www.google.com`, static/site-owned hosts, `hubspotusercontent`, and `assets.thdstatic.com`.
- `pagead2.googlesyndication.com` is path-gated to Google Ads / ActiveView style endpoints.
- `redditstatic.com`, `facebook.com`, Amazon, and similar broad families remain dependent on product/path evidence rather than generic host presence.
- Unresolved endpoint review, policy/runtime alignment, and consent-flow persistence/delta rows remained `review_signal` or `coverage_limitation`.
- No customer-facing named-vendor risk was created; these outputs remain internal shadow diagnostics only.
