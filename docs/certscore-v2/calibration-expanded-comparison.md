# CertScore v2 Expanded Calibration Comparison

Generated from:

- `artifacts/v2-calibration-standard/calibration-summary.json`
- `artifacts/v2-calibration-full/calibration-summary.json`
- `artifacts/v2-calibration-expanded-standard/calibration-summary.json`
- `artifacts/v2-calibration-expanded-full/calibration-summary.json`

This is internal diagnostic output only. It is not customer-facing report prose and does not state legal conclusions.

## Cohort Health

| Cohort | Profile | URLs | Completed | Failed |
| --- | --- | ---: | ---: | ---: |
| Smoke | standard | 7 | 7 | 0 |
| Smoke | full | 7 | 7 | 0 |
| Expanded | standard | 10 | 10 | 0 |
| Expanded | full | 10 | 10 | 0 |

Both expanded runs completed without batch failures. Module execution stayed clean enough for calibration, but the full cohort exposed consent-action confidence limits on every site.

## Policy-Surface Comparison

| Signal | Smoke standard | Smoke full | Expanded standard | Expanded full |
| --- | ---: | ---: | ---: | ---: |
| Privacy policy observed | 7/7 | 7/7 | 9/10 | 9/10 |
| Cookie policy observed | 2/7 | 3/7 | 2/10 | 2/10 |
| Privacy choices/control surface observed | 4/7 | 4/7 | 1/10 | 1/10 |
| Do Not Sell / Share observed | 0/7 | 0/7 | 3/10 | 3/10 |
| GPC disclosure candidate eligible | 3/7 | 3/7 | 3/10 | 3/10 |
| Sites with policy fetch failures | 2/7 | 2/7 | 2/10 | 2/10 |
| Total failed policy surface attempts | 13 | 13 | 14 | 14 |
| Sites using common-path fallback | 2/7 | 2/7 | 3/10 | 3/10 |
| Sites using Nano-ranked homepage candidates | 5/7 | 5/7 | 7/10 | 7/10 |

Findings:

- Privacy policy recall remained good but not complete. `ikea.com` produced only failed guessed-common-path policy attempts.
- Cookie policy recall stayed low in the expanded cohort. Several large sites expose cookie controls through privacy centers or CMP flows rather than direct cookie-policy links.
- Privacy choices recall dropped materially in the expanded cohort. Weather surfaced `your_privacy_choices`; BestBuy and Mayo surfaced `do_not_sell_or_share`; other sites likely require deeper footer hydration, regional routing, or privacy-center traversal.
- Common-path fallback was useful for Mayo but noisy for HubSpot and IKEA. HubSpot fetched two privacy pages but six fallback attempts failed; IKEA failed all eight fallback attempts.
- Nano homepage candidate quality looked good where observed candidates existed. The weakest area is not ranking quality, but candidate inventory/recall before Nano gets useful options.

## Consent-Flow Comparison

| Signal | Smoke full | Expanded full |
| --- | ---: | ---: |
| Banner/relevant consent surface candidate | 7/7 | 10/10 |
| Accept control candidate eligible | 3/7 | 3/10 |
| Reject control candidate eligible | 3/7 | 5/10 |
| Manage/preferences controls observed | 4/7 | 3/10 |
| Accept action succeeded | 3/7 | 0/10 |
| Reject action succeeded | 1/7 | 0/10 |
| Sites with action confidence/execution issues | 6/7 | 10/10 |

Findings:

- The expanded cohort is a much harder consent-flow set. Controls were often detected, but accept/reject actions were not confidently executable.
- Common failure modes were `candidate_not_observed`, `candidate_confidence_too_low`, and `banner_still_present_after_click`.
- Weather appears preference-center-oriented: manage/preferences controls were observed, but direct accept/reject controls were not.
- IKEA and HubSpot exposed accept/reject/manage candidates, but actions were not trusted enough to classify as successful. This supports adding a preference-center traversal phase before customer-facing consent-flow conclusions.
- Full runs preserved action-confidence limitations in comparisons; no consent-flow persistence/delta signal should be customer-facing yet.

## Runtime Comparison

| Signal | Smoke standard | Smoke full | Expanded standard | Expanded full |
| --- | ---: | ---: | ---: | ---: |
| Sites with resolved runtime vendors | 5/7 | 6/7 | 7/10 | 8/10 |
| Sites with unresolved meaningful endpoints | 3/7 | 4/7 | 7/10 | 7/10 |
| Unresolved endpoint observations | 41 | 59 | 68 | 102 |
| Session replay / behavioral analytics candidate | 1/7 | 3/7 | 1/10 | 1/10 |
| Third-party cookie pre-consent candidate | 2/7 | 2/7 | 4/10 | 4/10 |
| Vendor-associated first-party cookie candidate | 2/7 | 4/7 | 0/10 | 6/10 |

Findings:

- Expanded publisher/ecommerce sites increased unresolved endpoint volume sharply.
- Repeated unresolved endpoints include Google pagead support paths, Brightline TV events, New Relic `gov-bam.nr-data.net`, Amazon Ads scripts, Rubicon/Lotame/OpenX sync paths, Medallia events, and PX Cloud collection.
- The resolver did not show an obvious broad vendor over-promotion in the summary, but unresolved endpoint review remains a blocker for clean report projection.
- Runtime evidence excerpts are abundant on adtech-heavy sites. Weather produced thousands of excerpts, which is useful for traceability but too noisy for future report projection without row-level excerpt limits/deduplication.

## Adapter Readiness

Projection checks were run on representative expanded full bundles:

- `artifacts/v2-calibration-expanded-full/weather.com/V2ReportProjectionDraft.json`
- `artifacts/v2-calibration-expanded-full/ikea.com/V2ReportProjectionDraft.json`

Observed adapter behavior:

- Weather projected 26 rows with `observed=11`, `review_signal=3`, `checked=7`, `not_observed=3`, `not_testable=2`.
- IKEA projected 26 rows with `checked=13`, `review_signal=1`, `not_observed=8`, `observed=2`, `not_testable=2`.
- Neither projection contained `gap_observed`.
- Review signals were preserved.
- Coverage/action limitations were preserved as not-testable or review-only projection states.
- Display-safe excerpts were present, but excerpt volume on Weather is too high for future report UI without capping and representative excerpt selection.

## Prioritized Calibration Issues

### High

- Consent-flow action execution is not ready for customer-facing report integration. Expanded full had 0/10 accept successes and 0/10 reject successes despite controls/surfaces being observed.
- Preference-center traversal is needed. Several sites expose manage/preference controls or CMP centers rather than direct first-layer accept/reject buttons.
- Unresolved endpoint attribution remains too noisy for customer-facing naming. Expanded full recorded 102 unresolved endpoint observations across 7/10 sites.
- Policy-surface recall is incomplete for global/privacy-center sites. IKEA failed all fallback policy attempts and produced no observed/fetched policy surface.

### Medium

- Common-path fallback needs better regional/global URL handling and better failure reporting. HubSpot and IKEA show fallback-heavy behavior with many failed attempts.
- Privacy choices and cookie-policy recall should improve before beta. Expanded full found privacy choices/control surfaces on only 1/10 and cookie policies on 2/10.
- Evidence excerpt volume needs adapter/report-side capping and deduplication. Weather projected many repeated display-safe excerpts.
- Consent control summaries are noisy because unknown candidate counts dominate known controls on several sites.

### Low

- Calibration Markdown could separate library/script unresolved endpoints from active collection endpoints more visibly.
- Policy/runtime alignment criteria are accurate as review signals, but the summaries should make `policy_vendor_mentions_present` versus `runtime_vendor_not_matched_to_policy_mention_review_signal` easier to scan.
- Preference/control observations in policy summaries are currently sparse even when consent-flow sees manage/preferences controls.

## Fixture Coverage Decision

The expanded cohort repeated failure modes that are already partially covered by local fixtures:

- ambiguous consent controls
- manage/preferences-only banners
- failed clicks where the banner remains
- common-path fallback
- failed policy link attempts
- CMP preference controls
- unresolved collection endpoint ambiguity

No new local fixture was added in this pass because the top repeated modes are represented in `packages/certscore-scan-core/src/test-fixtures/static-server.ts` and related scanner tests. The next fixture work should be more targeted: add a hydration-delayed global footer privacy center and a multi-step preference-center reject flow once the desired traversal behavior is defined.

## Recommendation

Do not proceed to production report UI integration yet.

Proceed with adapter validation/shadow integration only if it remains internal and non-customer-facing. The next implementation pass should focus on:

1. Preference-center traversal for consent flow.
2. Endpoint attribution resolver cleanup for repeated adtech/support endpoints.
3. Policy-surface candidate inventory improvements for global/regional privacy centers.
4. Adapter evidence excerpt capping/deduplication for report projection.
5. A shadow projection harness over calibration artifacts to verify row stability before any WC01 production presentation work.
