# WC01 v2 allowlist dry-run audit

Audit date: 2026-06-08

Input directories:

- `artifacts/v2-wc01-allowlist-dry-run-expanded-fresh-registry`
- `artifacts/v2-wc01-allowlist-dry-run-stress-fresh-registry`

This is an internal calibration audit only. It does not implement production normalized concern mapping, unified findings, checklist rows, executive rows, top findings, scoring, regulatory lenses, or customer-facing output.

## Executive summary

| Cohort | Files reviewed | Candidates | Blocked rows | Guardrail failures | Failed files |
|---|---:|---:|---:|---:|---:|
| Expanded | 10 | 19 | 241 | 0 | 0 |
| Stress | 12 | 17 | 295 | 0 | 0 |
| Total | 22 | 36 | 536 | 0 | 0 |

All candidate drafts remained `candidate_review_only` with `productionEligible: false`, `topFindingEligible: false`, and `gapEligible: false`. No dry-run output contained `gap_observed`, raw blocked evidence field names, or legal-conclusion language.

Recommendation: split and tighten before any next bridge stage. The current gates are good for conservative dry-run discovery, but `third_party_vendors_observed` is too broad to become a normalized concern by itself. It should remain inventory/support-only unless paired with stronger tracking, consent-state, or collection context. `pre_consent_tracking_detected`, `third_party_cookie_pre_consent`, and `session_replay_or_behavioral_analytics_observed` are closer to useful bridge candidates, but should keep direct evidence and source-ref requirements. The consent banner gate correctly produced no candidates in these batches and should stay blocked until bounded UI or absence/search-scope evidence is stronger.

## Candidate inventory

| Cohort | Site | Row ID | Source finding key | Proposed family | Proposed key | Status | Vendor names | Vendor purposes | Excerpts | Source refs | Capped / omitted | Gate ID | Caveats |
|---|---|---|---|---|---|---|---|---|---:|---:|---|---|---|
| expanded | bestbuy.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Google; Adobe; TransUnion; LiveRamp; Magnite; Lotame | advertising, tag_management, analytics | 5 | 544 | true / 539 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| expanded | bestbuy.com | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | Google; Adobe; TransUnion; LiveRamp; Magnite; Lotame | advertising, tag_management, analytics | 5 | 544 | true / 539 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| expanded | bestbuy.com | third_party_cookie_pre_consent | third_party_cookie_pre_consent | pre_consent_cookie_storage | v2_pre_consent_cookie_storage_candidate | candidate_review_only | Google; Adobe; LiveRamp; Magnite | advertising, tag_management, analytics | 5 | 64 | true / 59 | tier_a.third_party_cookie_pre_consent.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| expanded | chase.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Adobe | analytics | 3 | 3 | false / 0 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| expanded | cnn.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | BrightLine; Google | advertising | 5 | 60 | true / 55 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| expanded | cnn.com | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | BrightLine; Google | advertising | 5 | 60 | true / 55 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| expanded | consumerfinance.gov | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Google | tag_management, analytics | 5 | 117 | true / 112 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| expanded | consumerfinance.gov | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | Google | tag_management, analytics | 5 | 117 | true / 112 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| expanded | hubspot.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Google; LinkedIn; Amazon; Spotify; Tapad; Meta | tag_management, advertising, analytics | 5 | 371 | true / 366 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| expanded | hubspot.com | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | Google; LinkedIn; Amazon; Spotify; Tapad | tag_management, advertising, analytics | 5 | 366 | true / 361 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| expanded | hubspot.com | third_party_cookie_pre_consent | third_party_cookie_pre_consent | pre_consent_cookie_storage | v2_pre_consent_cookie_storage_candidate | candidate_review_only | Google; LinkedIn; Amazon; Tapad | tag_management, advertising, analytics | 5 | 31 | true / 26 | tier_a.third_party_cookie_pre_consent.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| expanded | ikea.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Google | tag_management, analytics | 5 | 8 | true / 3 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| expanded | target.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Google; FullStory; Adobe; Medallia | advertising, session_replay, analytics | 5 | 345 | true / 340 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| expanded | target.com | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | Google; FullStory; Adobe; Medallia | advertising, session_replay, analytics | 5 | 345 | true / 340 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| expanded | target.com | third_party_cookie_pre_consent | third_party_cookie_pre_consent | pre_consent_cookie_storage | v2_pre_consent_cookie_storage_candidate | candidate_review_only | Google; Adobe | advertising, analytics | 5 | 23 | true / 18 | tier_a.third_party_cookie_pre_consent.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| expanded | target.com | session_replay_or_behavioral_analytics_observed | session_replay_or_behavioral_analytics_observed | session_replay_behavioral_analytics | v2_session_replay_behavioral_analytics_candidate | candidate_review_only | FullStory | session_replay | 5 | 16 | true / 11 | tier_a.session_replay_or_behavioral_analytics_observed.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| expanded | weather.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Magnite; Amazon; Google; Integral Ad Science; TransUnion; Criteo; LiveRamp; Lotame; Taboola; Amplitude; OpenX; Index Exchange; The Trade Desk; PubMatic; Outbrain; Quantcast; Tapad; LinkedIn; Adobe | advertising, analytics | 5 | 5028 | true / 5023 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| expanded | weather.com | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | Magnite; Amazon; Google; Integral Ad Science; TransUnion; Criteo; LiveRamp; Lotame; Taboola; Amplitude; OpenX; Index Exchange; The Trade Desk; PubMatic; Outbrain; Quantcast; Tapad; LinkedIn; Adobe | advertising, analytics | 5 | 5028 | true / 5023 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| expanded | weather.com | third_party_cookie_pre_consent | third_party_cookie_pre_consent | pre_consent_cookie_storage | v2_pre_consent_cookie_storage_candidate | candidate_review_only | Magnite; Amazon; Google; Criteo; LiveRamp; Taboola; OpenX; Index Exchange; The Trade Desk; PubMatic; Outbrain; Quantcast; Tapad; LinkedIn; Adobe | advertising | 5 | 337 | true / 332 | tier_a.third_party_cookie_pre_consent.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| stress | airbnb.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Google; Snap; Pinterest; Meta | tag_management, advertising, analytics | 5 | 57 | true / 52 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | airbnb.com | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | Google; Snap; Pinterest; Meta | tag_management, advertising, analytics | 5 | 57 | true / 52 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | bankofamerica.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Adobe; Google; TransUnion | advertising, analytics | 5 | 34 | true / 29 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| stress | bankofamerica.com | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | Adobe; Google; TransUnion | advertising, analytics | 5 | 34 | true / 29 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| stress | bankofamerica.com | third_party_cookie_pre_consent | third_party_cookie_pre_consent | pre_consent_cookie_storage | v2_pre_consent_cookie_storage_candidate | candidate_review_only | Adobe | advertising, analytics | 4 | 4 | false / 0 | tier_a.third_party_cookie_pre_consent.v1 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| stress | booking.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Google; Criteo; Reddit; The Trade Desk; Magnite | tag_management, advertising, analytics | 5 | 279 | true / 274 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | booking.com | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | Google; Criteo; Reddit; The Trade Desk; Magnite | tag_management, advertising, analytics | 5 | 279 | true / 274 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | booking.com | third_party_cookie_pre_consent | third_party_cookie_pre_consent | pre_consent_cookie_storage | v2_pre_consent_cookie_storage_candidate | candidate_review_only | Google; Criteo; The Trade Desk; Magnite | tag_management, advertising, analytics | 5 | 27 | true / 22 | tier_a.third_party_cookie_pre_consent.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | homedepot.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Adobe; Google; Meta; Tapad; Pinterest; RevJet; TransUnion; Criteo; Segment | advertising, tag_management, analytics | 5 | 284 | true / 279 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | homedepot.com | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | Adobe; Google; Meta; Tapad; RevJet; TransUnion; Criteo | advertising, tag_management, analytics | 5 | 273 | true / 268 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | homedepot.com | third_party_cookie_pre_consent | third_party_cookie_pre_consent | pre_consent_cookie_storage | v2_pre_consent_cookie_storage_candidate | candidate_review_only | Adobe; Google; Tapad; Criteo | advertising, tag_management, analytics | 5 | 29 | true / 24 | tier_a.third_party_cookie_pre_consent.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | nike.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Google; Pinterest; Snap; TikTok; Reddit; Meta; Amazon; Singular; The Trade Desk; Magnite | tag_management, advertising, analytics | 5 | 538 | true / 533 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | nike.com | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | Google; Pinterest; Snap; TikTok; Reddit; Amazon; Singular; The Trade Desk; Magnite | tag_management, advertising, analytics | 5 | 517 | true / 512 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | nike.com | third_party_cookie_pre_consent | third_party_cookie_pre_consent | pre_consent_cookie_storage | v2_pre_consent_cookie_storage_candidate | candidate_review_only | Google; Pinterest; Snap; TikTok; Amazon; The Trade Desk; Magnite | tag_management, advertising, analytics | 5 | 49 | true / 44 | tier_a.third_party_cookie_pre_consent.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | webmd.com | third_party_vendors_observed | third_party_vendors_observed | tracker_inventory | v2_runtime_tracker_inventory_candidate | candidate_review_only | Tapad; Google; TransUnion; Pinterest; Amazon; Lotame; Criteo; OpenX; The Trade Desk; Integral Ad Science; Magnite; Outbrain; Index Exchange; PubMatic; LiveRamp; Quantcast; LinkedIn; Adobe; Taboola | advertising, tag_management, analytics | 5 | 3444 | true / 3439 | tier_a.third_party_vendors_observed.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | webmd.com | pre_consent_tracking_detected | pre_consent_tracking_detected | pre_consent_tracking | v2_pre_consent_tracking_candidate | candidate_review_only | Tapad; Google; TransUnion; Pinterest; Amazon; Lotame; Criteo; OpenX; The Trade Desk; Magnite; Outbrain; Index Exchange; PubMatic; LiveRamp; Quantcast; LinkedIn; Adobe; Taboola | advertising, tag_management, analytics | 5 | 3352 | true / 3347 | tier_a.pre_consent_tracking_detected.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| stress | webmd.com | third_party_cookie_pre_consent | third_party_cookie_pre_consent | pre_consent_cookie_storage | v2_pre_consent_cookie_storage_candidate | candidate_review_only | Tapad; Google; Pinterest; Amazon; Criteo; OpenX; The Trade Desk; Magnite; Outbrain; Index Exchange; PubMatic; LiveRamp; Quantcast; LinkedIn; Adobe | advertising, tag_management, analytics | 5 | 241 | true / 236 | tier_a.third_party_cookie_pre_consent.v1 | candidate_review_only, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |

## Candidate counts

### By source finding key

| Source finding key | Count |
|---|---:|
| `third_party_vendors_observed` | 14 |
| `pre_consent_tracking_detected` | 12 |
| `third_party_cookie_pre_consent` | 9 |
| `session_replay_or_behavioral_analytics_observed` | 1 |
| `consent_banner_observed_or_not_observed` | 0 |

### By proposed concern family

| Proposed concern family | Count |
|---|---:|
| `tracker_inventory` | 14 |
| `pre_consent_tracking` | 12 |
| `pre_consent_cookie_storage` | 9 |
| `session_replay_behavioral_analytics` | 1 |
| `consent_surface` | 0 |

### By vendor purpose

Counts below are vendor-purpose occurrences across candidates, not unique sites or unique vendors.

| Vendor purpose | Count |
|---|---:|
| `advertising` | 216 |
| `analytics` | 43 |
| `tag_management` | 23 |
| `session_replay` | 3 |

### By site

| Cohort / site | Candidate count |
|---|---:|
| expanded/bestbuy.com | 3 |
| expanded/chase.com | 1 |
| expanded/cnn.com | 2 |
| expanded/consumerfinance.gov | 2 |
| expanded/hubspot.com | 3 |
| expanded/ikea.com | 1 |
| expanded/target.com | 4 |
| expanded/weather.com | 3 |
| stress/airbnb.com | 2 |
| stress/bankofamerica.com | 3 |
| stress/booking.com | 3 |
| stress/homedepot.com | 3 |
| stress/nike.com | 3 |
| stress/webmd.com | 3 |

Sites with zero candidates:

- expanded/mayoclinic.org
- expanded/salesforce.com
- stress/costco.com
- stress/expedia.com
- stress/lowes.com
- stress/reuters.com
- stress/sephora.com
- stress/statefarm.com

### By original shadow row status

| Original shadow status | Candidate count |
|---|---:|
| `observed` | 36 |

No candidate came from `review_signal`, `coverage_limitation`, `not_testable`, `assisted_candidate`, `checked`, or `not_observed`.

## Surprise review

No candidate matched the hard surprise conditions:

- No candidate came from a non-Tier-A source finding key.
- No Tier B or Tier C row leaked into candidates.
- No candidate came from a review-only, coverage-limited, not-testable, or assisted row.
- No candidate was missing source refs.
- No candidate was missing excerpt IDs and display-safe excerpt counts.
- No candidate carried coverage-limitation or disallowed demotion reasons.
- No candidate had weak or missing directness/confidence. All candidate source rows were high-confidence and direct.
- No candidate had only `consent_management`.
- No candidate had only `tag_management`.
- No candidate had security, performance, customer support, CDN/static, site-owned infrastructure, fraud-prevention, bot-defense, RUM, or live-chat purposes.

Calibration note: 23 candidate vendor-purpose occurrences include `tag_management`, but every one appears alongside advertising or analytics. These were marked with the `non_tracker_purpose_diagnostic_only` caveat where applicable. This is acceptable for dry-run diagnostics, but the next implementation should avoid treating tag-management purpose as supporting evidence in any normalized concern draft.

## Blocked row analysis

### Blocked counts by tier

| Tier | Count |
|---|---:|
| `tier_b_review_only` | 330 |
| `unsupported` | 132 |
| `tier_a_failed_gates` | 69 |
| `tier_c_never_tracker_default` | 5 |

### Top block reasons

| Block reason | Count |
|---|---:|
| `tier_b_review_only_by_design` | 330 |
| `source_finding_key_not_allowlisted` | 132 |
| `status_not_allowed_for_tier_a` | 68 |
| `missing_excerpt_or_display_safe_evidence` | 51 |
| `missing_source_refs` | 51 |
| `missing_allowed_vendor_purpose` | 37 |
| `missing_pre_consent_or_consent_state_evidence` | 22 |
| `missing_session_replay_collection_evidence` | 21 |
| `consent_banner_status_not_mappable` | 17 |
| `missing_direct_runtime_evidence` | 17 |
| `missing_direct_cookie_or_storage_evidence` | 13 |
| `coverage_or_source_module_incomplete` | 5 |
| `review_only_or_disallowed_demotion_present` | 5 |
| `tier_c_non_tracker_purpose_only` | 5 |
| `missing_consent_ui_evidence` | 1 |

### Tier A failed-gate missing requirements

| Missing requirement | Count |
|---|---:|
| `allowed_status` | 68 |
| `excerptIds_or_displaySafeExcerpts` | 51 |
| `sourceRefIds` | 51 |
| `allowed_vendor_purpose` | 37 |
| `pre_consent_consent_state_evidence` | 22 |
| `session_replay_collection_evidence` | 21 |
| `direct_runtime_evidence` | 17 |
| `observed_checked_or_not_observed_status` | 17 |
| `direct_cookie_or_storage_evidence` | 13 |
| `completed_required_source_modules` | 5 |
| `no_disallowed_demotion_reasons` | 5 |
| `consent_ui_or_control_evidence` | 1 |

### Rows that may deserve review

Only one blocked row looked potentially review-worthy on first pass:

| Cohort | Site | Row | Status | Block reason | Note |
|---|---|---|---|---|---|
| expanded | ikea.com | `pre_consent_tracking_detected` | observed | `missing_pre_consent_or_consent_state_evidence` | The row had tracker-like purposes but lacked the required pre-consent/consent-state evidence in the dry-run gate. Keep blocked unless source evidence confirms pre-consent state. |

The rest of the blocked Tier A rows were blocked for expected reasons: non-observed status, missing refs/excerpts, missing allowed vendor purpose, missing cookie/storage evidence, missing direct runtime evidence, or missing session-replay collection evidence.

## Gate calibration recommendations

| Source finding key | Recommendation | Reason |
|---|---|---|
| `third_party_vendors_observed` | Split/tighten | It produced the largest candidate set and is inherently inventory-like. Keep as review-only inventory or support-only unless paired with pre-consent, collection endpoint, cookie/storage, or policy-approved tracker context. Do not let it become a standalone tracker concern. |
| `pre_consent_tracking_detected` | Keep, then tighten tag-management handling | The candidates were direct/high-confidence observed rows with source refs and excerpts. The gate should continue requiring direct pre-consent runtime evidence. Next pass should ensure tag-management purpose is stripped or kept diagnostic-only and never counted as support. |
| `third_party_cookie_pre_consent` | Keep/tighten | The gate correctly required actual cookie/storage evidence. Next pass should add an explicit third-party-domain/storage-party check if available in display-safe excerpts or source refs, so first-party-only cookies cannot pass. |
| `consent_banner_observed_or_not_observed` | Keep blocked / split later | It produced zero candidates, which is safer for now. Split into separate observed-surface and absence/search-scope gates before any normalized concern draft is allowed. Absence should require bounded search scope, page scope, and strong evidence that prior consent or suppression did not hide the banner. |
| `session_replay_or_behavioral_analytics_observed` | Keep/tighten | Only one FullStory session replay candidate passed, and library-only rows stayed blocked. Keep explicit collection-behavior requirement. Next pass should distinguish session replay collection, behavioral analytics collection, and analytics-only rows more sharply. |

Overall recommendation: split gates. Treat `third_party_vendors_observed` as an inventory/support signal, keep `pre_consent_tracking_detected` and `third_party_cookie_pre_consent` as the main bridge candidates, keep consent banner rows blocked until UI evidence is stronger, and keep session replay gated on collection behavior.

## Recommended next implementation prompt

Tighten the WC01 v2 allowlist dry-run bridge without adding production mapping. Keep the bridge dry-run-only and continue reading only `Wc01V2ShadowProjection.json`. Changes to make:

1. Split `third_party_vendors_observed` into an inventory/support-only candidate type or block it by default unless paired with direct pre-consent, cookie/storage, or collection-endpoint context.
2. Ensure `tag_management` is preserved only as diagnostic vendor metadata and never counted as an allowed tracker-supporting purpose.
3. Add explicit block reasons for mixed tracker plus diagnostic purposes so audits can separate supporting purposes from diagnostic-only purposes.
4. Add an optional third-party cookie/storage party gate for `third_party_cookie_pre_consent` when display-safe excerpts expose enough host/domain context.
5. Split `consent_banner_observed_or_not_observed` into observed-surface and absence/search-scope gates, both still dry-run-only.
6. Add aggregate audit checks to the CLI summary for surprise candidates, diagnostic-only purpose presence, original shadow status, missing refs, missing excerpts, and weak confidence/directness.
7. Add fixture snapshot tests for representative expanded/stress candidate drafts.

Do not integrate with production WC01 UI, report cards, checklist builders, executive summaries, top findings, scoring, regulatory lenses, persisted normalized concerns, or unified findings. Do not map anything to `gap_observed`. Do not modify `apps/web/components/scans/shared-scan-detail-view.tsx`.
