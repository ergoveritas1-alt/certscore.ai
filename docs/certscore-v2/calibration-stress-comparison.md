# CertScore v2 Stress Calibration Comparison

Generated from:

- `artifacts/v2-calibration-standard/calibration-summary.json`
- `artifacts/v2-calibration-full/calibration-summary.json`
- `artifacts/v2-calibration-expanded-standard/calibration-summary.json`
- `artifacts/v2-calibration-expanded-full/calibration-summary.json`
- `artifacts/v2-calibration-stress-standard/calibration-summary.json`
- `artifacts/v2-calibration-stress-full/calibration-summary.json`
- `artifacts/v2-shadow-projection-stress-full/shadow-projection-summary.json`

This is internal diagnostic output only. It is not customer-facing report prose and does not state legal conclusions.

## Cohort Status

| Cohort | Profile | URLs | Completed | Failed |
|---|---:|---:|---:|---:|
| Smoke | standard | 7 | 7 | 0 |
| Smoke | full | 7 | 7 | 0 |
| Expanded | standard | 10 | 10 | 0 |
| Expanded | full | 10 | 10 | 0 |
| Stress | standard | 12 | 12 | 0 |
| Stress | full | 12 | 12 | 0 |

All stress URLs completed at the harness level. Module-level failures were retained as coverage limitations instead of stopping the batch.

## Module Health

| Cohort | Profile | Module status summary |
|---|---|---|
| Smoke | standard | pre-consent completed 7/7, policy-surface completed 7/7 |
| Smoke | full | pre-consent completed 7/7, consent-flow completed 7/7, policy-surface completed 7/7 |
| Expanded | standard | pre-consent completed 10/10, policy-surface completed 10/10 |
| Expanded | full | pre-consent completed 10/10, consent-flow completed 10/10, policy-surface completed 10/10 |
| Stress | standard | pre-consent completed 11/12, failed 1/12; policy-surface completed 10/12, failed 2/12 |
| Stress | full | pre-consent completed 11/12, failed 1/12; consent-flow completed 11/12, failed 1/12; policy-surface completed 10/12, failed 2/12 |

Stress module failures were clean and explainable:

- `costco.com`: `page.goto: net::ERR_HTTP2_PROTOCOL_ERROR` in pre-consent runtime; the same navigation failure affected consent-flow in the full run.
- `expedia.com`: policy-surface homepage fetch returned `429`.
- `reuters.com`: policy-surface homepage fetch returned `401`.

## Consent Flow

| Signal | Smoke full | Expanded full | Stress full |
|---|---:|---:|---:|
| Accept succeeded | 3 | 0 | 1 |
| Reject succeeded | 1 | 0 | 0 |
| Accept attempted but not succeeded | 0 | 1 | 0 |
| Reject attempted but not succeeded | 0 | 1 | 0 |
| Accept not attempted | 4 | 9 | 10 |
| Reject not attempted | 6 | 9 | 11 |
| Preference-center traversals | 0 | 0 | 0 |
| Preference-center reject successes | 0 | 0 | 0 |

The bounded preference-center traversal is now implemented and fixture-covered, but the stress cohort did not expose a high-confidence first-layer manage/preferences path that led to clear second-layer reject/save controls. Manage/preferences-only remains not a success condition.

Recommended consent-flow calibration:

- Add real-site diagnostics for why stress manage/preference controls were not selected, especially whether Nano labels them low-confidence, not observed, hidden, or outside the bounded DOM inventory.
- Keep reject success gated on direct reject or completed preference-center reject/save traversal.
- Add a future fixture for preference centers that require category toggles instead of a clear reject-all button.
- Keep CMP/security cookies excluded from tracking-persistence findings unless linked to tracker-eligible journeys.

## Policy Surface

| Signal | Smoke standard | Expanded standard | Stress standard | Stress full |
|---|---:|---:|---:|---:|
| Fetched policy/control surfaces | 19 | 33 | 16 | 15 |
| Observed-only policy/control surfaces | 2 | 0 | 0 | 0 |
| Failed policy/control attempts | 13 | 14 | 40 | 44 |
| Skipped by policy budget | 0 | 0 | 5 | 1 |
| Privacy policy surfaces | 10 | 18 | 13 | 12 |
| Cookie policy surfaces | 2 | 2 | 2 | 2 |
| Do Not Sell / Share surfaces | 0 | 3 | 1 | 1 |

Stress policy recall is lower and noisier than smoke/expanded. The failures are mostly fetch/availability and candidate budget pressure, not Nano unavailability. Nano remained mandatory; no deterministic fallback was used for policy discovery.

Recommended policy-surface calibration:

- Tune ranking to reduce failed candidate attempts before budget exhaustion on ecommerce/travel/publisher sites.
- Preserve observed-candidate-first behavior; keep common paths second-pass only.
- Add route/locale-aware fixtures for delayed global footer links that redirect before fetch.
- Treat policy/runtime alignment as a conservative review signal only.

## Runtime And Journey Quality

Stress full shadow endpoint grouping:

| Endpoint group | Count |
|---|---:|
| Ignored noise | 8392 |
| Unresolved collection-like endpoint | 742 |
| Known adtech support endpoint | 348 |
| Site-owned infrastructure | 198 |
| Known performance/security endpoint | 25 |

Stress still produces substantial unresolved collection-like endpoint volume. That should remain an attribution-review input, not a customer-facing named vendor conclusion.

Recommended runtime calibration:

- Continue endpoint resolver cleanup for high-volume stress domains before WC01 report integration.
- Preserve the collection endpoint vs library-only distinction in journey review.
- Do not promote unresolved endpoint groups beyond review signals without resolver evidence.

## Shadow Projection

Stress full shadow projection:

| Signal | Count |
|---|---:|
| Observed rows | 42 |
| Review-signal rows | 25 |
| Checked rows | 105 |
| Not-observed rows | 83 |
| Not-testable rows | 21 |
| Coverage-limitation rows | 36 |
| Disallowed statuses | 0 |

One shadow sanitization warning was recorded for `costco.com`: `contains_long_opaque_value_without_redaction_context`. This should be investigated before WC01 adapter integration.

## Severity List

High:

- Stress policy-surface fetch failures and failed candidate volume are too high for report adapter integration readiness.
- Stress unresolved collection-like endpoint volume remains too high for named-vendor confidence without resolver cleanup.
- `costco.com` shadow projection has one sanitization warning that needs investigation.

Medium:

- Consent-flow action success remains sparse in stress full: 1 accept success, 0 reject successes.
- Preference-center traversal is implemented but not yet exercised by real-site stress candidates.
- Budget skips appeared in stress policy-surface output and should be tuned before broader calibration.

Low:

- Local fixture coverage now includes delayed global footer discovery and multi-step preference-center reject traversal.
- Stress harness failure handling was clean: failures were retained as module statuses and coverage limitations.

## Fixture And Test Follow-Ups

Added/updated local coverage:

- `policy-global-footer-delayed`
- `consent-preference-center-reject-success`
- `consent-preference-center-ambiguous`
- inspect snapshot refresh for new consent-flow traversal summary fields

Remaining fixture targets:

- preference centers that require category toggles rather than reject-all
- regional/locale policy links with redirects
- GPC disclosure plus runtime preference control behavior
- saved-bundle fixtures for preference-center traversal once the canonical saved-bundle set is refreshed

## Integration Gate

Do not integrate with the production report UI yet. The stress run supports continued v2 calibration, resolver cleanup, policy ranking tuning, and adapter shadow hardening before WC01 report adapter work.
