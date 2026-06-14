# WC01 v2 edge cohort allowlist dry-run summary

Generated: 2026-06-09

Artifacts:

- Calibration: `artifacts/v2-calibration-edge-consent`
- Shadow projection: `artifacts/v2-shadow-projection-edge-consent`
- WC01 shadow projection: `artifacts/v2-wc01-shadow-edge-consent`
- WC01 allowlist dry-run: `artifacts/v2-wc01-allowlist-dry-run-edge-consent`

This is internal diagnostic output only. It is not production WC01 report integration, not customer-facing report output, not persisted normalized concerns, not unified findings, and not legal-conclusion language.

## Run status

| Stage | Input count | Succeeded | Failed |
|---|---:|---:|---:|
| Edge calibration URLs | 30 | 30 | 0 |
| Shadow projection files | 30 | 30 | 0 |
| WC01 shadow files | 30 | 30 | 0 |
| Allowlist dry-run files | 30 | 30 | 0 |

Site-level calibration status:

| Status | Count |
|---|---:|
| Complete, all runtime modules completed | 28 |
| Partial, one or more runtime modules failed | 2 |
| Failed site | 0 |

Module status counts:

| Module status | Count |
|---|---:|
| `preConsentRuntimeScanner:completed` | 28 |
| `preConsentRuntimeScanner:failed` | 2 |
| `consentFlowRuntimeScanner:completed` | 28 |
| `consentFlowRuntimeScanner:failed` | 2 |

Explainable module failures:

| Site | Module | Status | Explanation |
|---|---|---|---|
| `washingtonpost.com` | `preConsentRuntimeScanner` | failed | `page.goto: net::ERR_HTTP2_PROTOCOL_ERROR` |
| `washingtonpost.com` | `consentFlowRuntimeScanner` | failed | `page.goto: net::ERR_HTTP2_PROTOCOL_ERROR` |
| `fidelity.com` | `preConsentRuntimeScanner` | failed | `page.goto: net::ERR_HTTP2_PROTOCOL_ERROR` |
| `fidelity.com` | `consentFlowRuntimeScanner` | failed | `page.goto: net::ERR_HTTP2_PROTOCOL_ERROR` |

## Projection summaries

Shadow projection row counts:

| Metric | Count |
|---|---:|
| Sites | 30 |
| Observed rows | 93 |
| Checked rows | 237 |
| Review-signal rows | 50 |
| Coverage-limitation rows | 304 |
| Not-observed rows | 42 |
| Not-testable rows | 54 |
| Limitation or not-testable rows | 358 |
| Rows with capped excerpts | 126 |
| Rows missing evidence excerpts | 0 |
| Disallowed statuses | 0 |

Endpoint grouping:

| Group | Count |
|---|---:|
| `known_adtech_support_endpoint` | 2397 |
| `known_performance_security_endpoint` | 158 |
| `site_owned_infrastructure` | 704 |
| `unresolved_collection_like_endpoint` | 1205 |
| `ignored_noise` | 16608 |

WC01 shadow guardrails:

| Guardrail | Count |
|---|---:|
| `productionEligible: true` | 0 |
| `topFindingEligible: true` | 0 |
| `gapEligible: true` | 0 |
| Forbidden gap status token presence | 0 |
| Raw blocked field presence | 0 |
| Unsupported status count | 0 |
| Disallowed status warning count | 0 |
| Legal-conclusion language warning count | 0 |
| Guardrail failures | 0 |

WC01 shadow rows:

| Status | Count |
|---|---:|
| `observed` | 93 |
| `checked` | 62 |
| `review_signal` | 225 |
| `coverage_limitation` | 304 |
| `not_observed` | 42 |
| `not_testable` | 54 |

WC01 assessment statuses:

| Status | Count |
|---|---:|
| `checked` | 155 |
| `review_signal` | 225 |
| `coverage_limitation` | 358 |
| `not_applicable` | 42 |

## Allowlist dry-run results

| Metric | Count |
|---|---:|
| Candidates | 40 |
| Blocked rows | 740 |
| Malformed artifacts | 0 |
| Guardrail failures | 0 |
| `third_party_vendors_observed` candidates | 0 |
| Surprise candidates | 6 |
| Tier B/C leakage count | 6 |
| Candidates missing source refs | 0 |
| Candidates missing excerpts/display-safe evidence | 0 |
| Candidates with weak/missing confidence or directness | 0 |
| Candidates whose original shadow status was not allowed | 0 |

Candidate counts by source finding key:

| Source finding key | Count |
|---|---:|
| `pre_consent_tracking_detected` | 19 |
| `third_party_cookie_pre_consent` | 15 |
| `session_replay_or_behavioral_analytics_observed` | 6 |
| `third_party_vendors_observed` | 0 |

Candidate counts by proposed concern family:

| Proposed concern family | Count |
|---|---:|
| `pre_consent_tracking` | 19 |
| `pre_consent_cookie_storage` | 15 |
| `session_replay_behavioral_analytics` | 6 |

Blocked counts by tier:

| Tier | Count |
|---|---:|
| `tier_a_failed_gates` | 101 |
| `tier_b_review_only` | 450 |
| `tier_c_never_tracker_default` | 9 |
| `unsupported` | 180 |

Top block reasons:

| Reason | Count |
|---|---:|
| `tier_b_review_only_by_design` | 450 |
| `source_finding_key_not_allowlisted` | 180 |
| `status_not_allowed_for_tier_a` | 49 |
| `missing_excerpt_or_display_safe_evidence` | 48 |
| `missing_source_refs` | 48 |
| `missing_allowed_vendor_purpose` | 33 |
| `inventory_only_signal` | 30 |
| `inventory_signal_requires_stronger_tracking_context` | 30 |
| `requires_pre_consent_or_collection_context` | 30 |
| `missing_pre_consent_or_consent_state_evidence` | 25 |
| `missing_session_replay_collection_evidence` | 24 |
| `consent_surface_gate_split_required` | 21 |
| `consent_surface_mapping_blocked_for_now` | 21 |
| `missing_direct_cookie_or_storage_evidence` | 15 |
| `missing_direct_runtime_evidence` | 10 |
| `missing_high_confidence_runtime_evidence` | 10 |
| `tier_c_non_tracker_purpose_only` | 9 |
| `coverage_or_source_module_incomplete` | 6 |
| `review_only_or_disallowed_demotion_present` | 6 |

Purpose classification:

| Purpose metric | Count |
|---|---:|
| Supporting `advertising` | 32 |
| Supporting `analytics` | 22 |
| Supporting `session_replay` | 13 |
| Supporting `tag_management` | 0 |
| Supporting `consent_management` | 0 |
| Diagnostic `tag_management` presence | 25 |
| Diagnostic `security` presence | 6 |
| Diagnostic `consent_management` presence | 0 |

Guardrail text scan:

| Check | Count |
|---|---:|
| `gap_observed` token | 0 |
| Raw blocked field names | 0 |
| Legal-conclusion language | 0 |

## Sanitizer warnings

| Artifact stage | Site | Warning | Context |
|---|---|---|---|
| Shadow projection / WC01 shadow | `supabase.com` | `contains_long_opaque_value_without_redaction_context` | Long PostHog-style cookie name appears in display-safe excerpts and group keys: `ph_phc_..._posthog=[redacted]`. Value is redacted, but the cookie name itself is a long opaque token. |

## Notable edge cases

- `washingtonpost.com` and `fidelity.com`: site entries completed at the harness level, but both runtime modules failed with `net::ERR_HTTP2_PROTOCOL_ERROR`; these should remain partial calibration results, not hidden failures.
- `geico.com`: both accept-all and reject-all actions succeeded in the consent-flow run; most other sites did not produce confident consent actions.
- `forbes.com`, `plannedparenthood.org`, and `segment.com`: accept attempts were made but did not succeed because the banner remained present after click.
- `walmart.com`, `notion.so`, `progressive.com`, `unilever.com`, `segment.com`, and `fullstory.com`: one or more action candidates were held back because confidence was too low.
- `bbc.com`, `nytimes.com`, and `theguardian.com`: generated the 6 surprise/Tier B-C leakage counters because diagnostic `security` purpose appeared alongside advertising-supported candidates.
- `supabase.com`: produced the only sanitizer warning, tied to long opaque cookie-name handling.
- Sites with zero allowlist candidates: `etsy.com`, `fidelity.com`, `forbes.com`, `ftc.gov`, `linear.app`, `nih.gov`, `openai.com`, `supabase.com`, `vercel.com`, `washingtonpost.com`, `wayfair.com`.

## Candidate review

All candidates below remain `candidate_review_only` with `productionEligible:false`, `topFindingEligible:false`, and `gapEligible:false`.

| Site | Row ID | Source finding key | Proposed family | Proposed key | Vendor names | Supporting purposes | Diagnostic purposes | Excerpts | Source refs | Caveats |
|---|---|---|---|---|---|---|---|---:|---:|---|
| `bbc.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Permutive; DoubleVerify; Criteo; Google; PubMatic; Amazon; The Trade Desk; LiveRamp | advertising | security | 5 | 615 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| `bbc.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Google; Criteo; Google; Amazon; The Trade Desk | advertising | security | 5 | 21 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| `booking.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Criteo; Reddit; The Trade Desk; Google; Magnite; Google | advertising, analytics | tag_management | 5 | 291 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `booking.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Google; Criteo; The Trade Desk; Google; Magnite; Google | advertising, analytics | tag_management | 5 | 29 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `cloudflare.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Google; The Trade Desk; Reddit; Google; LiveRamp; Index Exchange; Magnite | advertising, analytics | tag_management | 5 | 148 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `cloudflare.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Google; Google; The Trade Desk; Google; LiveRamp; Index Exchange; Magnite | advertising, analytics | tag_management | 5 | 25 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `fullstory.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | FullStory; Google; Google | advertising, session_replay | tag_management | 5 | 450 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `fullstory.com` | `session_replay_or_behavioral_analytics_observed` | `session_replay_or_behavioral_analytics_observed` | `session_replay_behavioral_analytics` | `v2_session_replay_behavioral_analytics_candidate` | FullStory | session_replay | none | 5 | 415 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| `geico.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Snap; Google; Tapad; Google; Amazon; Pinterest; The Trade Desk | advertising, analytics | tag_management | 5 | 261 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `geico.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Snap; Tapad | advertising | none | 5 | 26 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| `healthline.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Amazon; Google; LiveRamp; The Trade Desk; Reddit; TikTok; Microsoft; Google; Criteo | advertising, analytics, session_replay | tag_management | 5 | 241 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `healthline.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | LiveRamp; The Trade Desk; TikTok; Microsoft; Criteo | advertising, session_replay | none | 5 | 21 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| `healthline.com` | `session_replay_or_behavioral_analytics_observed` | `session_replay_or_behavioral_analytics_observed` | `session_replay_behavioral_analytics` | `v2_session_replay_behavioral_analytics_candidate` | Microsoft | session_replay | none | 5 | 25 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| `hotjar.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Hotjar; Google; Google; LinkedIn; Reddit; Google | advertising, analytics, session_replay | tag_management | 5 | 583 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `hotjar.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Google; Google; LinkedIn; Google | advertising, analytics | tag_management | 5 | 23 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `hotjar.com` | `session_replay_or_behavioral_analytics_observed` | `session_replay_or_behavioral_analytics_observed` | `session_replay_behavioral_analytics` | `v2_session_replay_behavioral_analytics_candidate` | Hotjar | session_replay | none | 5 | 417 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| `macys.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | FullStory; Pinterest; Snap; Google; Google; LiveRamp; TransUnion; Adobe; Taboola; Tapad; The Trade Desk; Google; Adobe | advertising, analytics, session_replay | tag_management | 5 | 643 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `macys.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Snap; Google; Google; LiveRamp; Adobe; Taboola; Tapad; The Trade Desk; Google; Adobe | advertising, analytics | tag_management | 5 | 66 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `macys.com` | `session_replay_or_behavioral_analytics_observed` | `session_replay_or_behavioral_analytics_observed` | `session_replay_behavioral_analytics` | `v2_session_replay_behavioral_analytics_candidate` | FullStory | session_replay | none | 5 | 25 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| `mozilla.org` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Google | analytics | tag_management | 5 | 34 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `notion.so` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; LinkedIn; Meta; Google; Google | advertising, analytics | tag_management | 5 | 226 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `notion.so` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Google; LinkedIn; Meta; Google; Google | advertising, analytics | tag_management | 5 | 33 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `nytimes.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Google; Amazon; Criteo; Magnite; Index Exchange; OpenX; DoubleVerify; PubMatic; The Trade Desk; Google; Adobe; LiveRamp; LinkedIn; TransUnion; Lotame; Tapad | advertising | security, tag_management | 5 | 1516 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `nytimes.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Google; Google; Amazon; Criteo; Magnite; Index Exchange; OpenX; The Trade Desk; Google; Adobe; LiveRamp; LinkedIn; Tapad | advertising | security, tag_management | 5 | 151 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `plannedparenthood.org` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Hotjar; Quantcast; Pinterest; TikTok; Google; Google | advertising, analytics, session_replay | tag_management | 5 | 566 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `plannedparenthood.org` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Google; Quantcast; Pinterest; TikTok; Google; Google | advertising, analytics | tag_management | 5 | 28 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `plannedparenthood.org` | `session_replay_or_behavioral_analytics_observed` | `session_replay_or_behavioral_analytics_observed` | `session_replay_behavioral_analytics` | `v2_session_replay_behavioral_analytics_candidate` | Hotjar | session_replay | none | 5 | 13 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| `progressive.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | TransUnion; Google; Google; Google; Amazon | advertising, analytics | tag_management | 5 | 234 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `progressive.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Google; Google; Google; Amazon | advertising, analytics | tag_management | 5 | 20 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `segment.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Adobe; Adobe; LinkedIn; Meta; Reddit; Segment; Google; Google; Microsoft | advertising, analytics, session_replay | tag_management | 5 | 595 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `segment.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Google; Adobe; Adobe; LinkedIn; Meta; Segment; Google; Google | advertising, analytics | tag_management | 5 | 64 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `segment.com` | `session_replay_or_behavioral_analytics_observed` | `session_replay_or_behavioral_analytics_observed` | `session_replay_behavioral_analytics` | `v2_session_replay_behavioral_analytics_candidate` | Microsoft | session_replay | none | 5 | 9 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| `spotify.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Google; Criteo; Google | advertising, analytics | tag_management | 5 | 85 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `spotify.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Criteo | advertising | none | 4 | 4 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| `theguardian.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Amazon; Permutive; Integral Ad Science; Criteo; PubMatic; Lotame; OpenX; The Trade Desk; Index Exchange; Magnite; LiveRamp; Quantcast; Outbrain; LinkedIn; Tapad; Adobe; Google; TransUnion | advertising | security | 5 | 2307 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| `theguardian.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Google; Amazon; Criteo; OpenX; The Trade Desk; Index Exchange; Magnite; LiveRamp; Quantcast; Outbrain; LinkedIn; Tapad; Adobe; Google | advertising | security | 5 | 192 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern |
| `unilever.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Google; Google | advertising, analytics | tag_management | 5 | 32 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `usa.gov` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Google; Google | analytics | tag_management | 5 | 70 | candidate_review_only, diagnostic_purpose_not_supporting, dry_run_only, non_tracker_purpose_diagnostic_only, not_production_normalized_concern, tag_management_diagnostic_only |
| `walmart.com` | `pre_consent_tracking_detected` | `pre_consent_tracking_detected` | `pre_consent_tracking` | `v2_pre_consent_tracking_candidate` | Criteo; LiveRamp; Google | advertising | none | 5 | 53 | candidate_review_only, dry_run_only, not_production_normalized_concern |
| `walmart.com` | `third_party_cookie_pre_consent` | `third_party_cookie_pre_consent` | `pre_consent_cookie_storage` | `v2_pre_consent_cookie_storage_candidate` | Criteo; LiveRamp; Google | advertising | none | 5 | 13 | candidate_review_only, dry_run_only, not_production_normalized_concern |

## Recommendation

Tighten before moving to concern-policy input draft design.

The major gates held:

- `third_party_vendors_observed` produced 0 candidates.
- `tag_management` supporting count stayed 0.
- `consent_management` supporting count stayed 0.
- No candidate missed source refs or display-safe evidence.
- No candidate used weak or missing confidence/directness.
- WC01 shadow guardrails stayed clean for production, top-finding, gap eligibility, raw blocked fields, and legal-conclusion language.

However, the edge cohort exposed 6 candidates with Tier C diagnostic `security` purpose present alongside advertising-supported candidates. The next tightening should block or demote candidates with security, performance, customer-support, infrastructure, fraud-prevention, bot-defense, RUM, or live-chat diagnostic purposes even when an advertising/analytics purpose is also present, unless a future gate explicitly proves the candidate row is supported only by the tracker-purpose evidence subset.

Also add fixtures for:

- mixed `security + advertising` candidates blocking or demoting out of allowlist candidates
- long opaque cookie names in display-safe excerpts, using the Supabase/PostHog-style cookie-name pattern
- consent action confidence cases where candidates are held back because banner state remains present after click or candidate confidence is too low

Do not proceed to production mapping, persisted normalized concerns, unified findings, checklist rows, executive rows, top findings, scoring changes, regulatory-lens output, or customer-facing report copy from this dry run.
