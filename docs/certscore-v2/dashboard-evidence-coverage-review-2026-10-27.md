# CertScore.ai detailed-evidence dashboard coverage review

Reviewed every main detailed-evidence section against the 47-measure v2 dashboard. The user-opened v1 artifact remains intact; v2 is the corrected comparison baseline. This expansion retains the same frozen past-month cohort and original source files.

## Coverage added

- 27 previously untabulated canonical checklist checks: 18 present in the public historical exports and nine additional checks retained in recent canonical projections.
- 28 detail-state breakdowns, including A/R verdicts/reasons, GPC states, form capture, storage classification, inventory caps, navigation and recent detailed-projection availability.
- 21 explicit numeric measures, shown as daily medians with measured/eligible denominators and changes in medians; totals remain in CSV.
- 14 evidence-box mappings with remaining data gaps.
- State-specific charts and measure-group filters. No metric is presented as adjudicated accuracy or proof that a product fix worked.

## Evidence-box coverage map

| Detail box | Before | Now tabulated | Remaining limitation |
| --- | --- | --- | --- |
| CMP details | Partial | Provider, dispatch, individual CMP checks, framework signal, optional defaults | SDK/category/state detail remains limited to returned canonical CMP fields; provider recognition does not establish action support. |
| Consent choices | Partial | Four controls, click/execution/registration, returned A/R verdicts, projectability, stop and indeterminate reasons | Opt-out action execution and confirmation are not consistently exported; do not infer them from the control. |
| Tracking & embeds | Missing individual checks | All additional returned canonical checks: tracking, storage, iframes, social embeds, replay/fingerprinting | Finding prevalence and unknown evidence remain separate; no new activity qualification. |
| Policies & disclosures | Partial | Ten topics plus cookie notice and stale-framework checks, fetch, retained text and declared ownership | Entity attribution (including NOZ DPO), completeness and semantic correctness require independent source review. |
| Accessibility (WCAG) | Coverage and findings | Existing coverage/findings plus failed-rule, affected-node and manual-review counts | Node counts depend on scope and engine; fewer reported findings alone do not verify a fix. |
| Cookies & tracking inventories | Missing quality/volume measures | Storage classification, unknown record counts, proven writes versus snapshot records, vendor/cookie counts and inventory truncation | No proof of use or sale/sharing is inferred from a cookie or vendor name. |
| California privacy review | Canonical findings only | Canonical finding IDs remain separately tabulated; GPC recorded sale/sharing states are added | Typed recipient qualification, deduplication and protocol/processing reasons are not consistently in historical public exports. C2 protocol coverage remains open. |
| Connection security | Only surfaced findings | Five individual canonical checks, including positive, concern and unavailable states | No HSTS, cipher or broader TLS posture inferred beyond returned checks. |
| Global Privacy Control | Path, delivery and finding | Response, semantic probe, acknowledgment, recorded sale/sharing states and activity-comparison availability | Recorded state or measured traffic does not establish that GPC caused a change. |
| Tech stack observed | Not tabulated | Recent source-bound projection availability, detection and advisory counts | Recent verified projections add detection/advisory counts. Older public exports lack the technology inventory; no versions or absent technology are inferred. |
| Site integrity / concealed links | Surfaced canonical finding IDs | Canonical findings plus recent verified capture coverage, inspected-link and retained link-evidence counts | Detailed inspection counts require recent sealed projections. Retained link evidence count is not a new concealed-link qualification or unique-destination count. |
| Forms and destinations | Not tabulated | Observed form counts, pre-consent/after-Accept capture states, recent verified destination-trace availability and event counts | Exact destination/recipient bindings are not consistently exported; no submissions or new trace work. |
| Coverage, navigation and publication | Partial | Existing outcomes/publication plus final-host change and missing/truncated evidence inventories | Historical attempts missing from the archive remain unknown; navigation status alone does not override no-go. |
| Relationship graphs / request ancestry | Not tabulated | Recent verified projection/reference availability and node/edge reference counts | Deferred counts describe retained reference metadata. Full graph bytes and causal ancestry are not verified here; older exports lack the projection. No protected graph endpoint is requested. |

## Every additional canonical checklist check

| Check | Measure group | Returned ID | Reports with a returned state |
| --- | --- | --- | --- |
| Accessibility of privacy/consent controls | Accessibility | `accessibility_consent_controls` | 634/5096 |
| Advertising vendor signal | Tracking & embeds | `advertising_retargeting_vendor_signal_observed` | 634/5096 |
| Analytics vendor signal | Tracking & embeds | `analytics_vendor_observed` | 634/5096 |
| CMP framework | Consent & CMP | `cmp_framework_signal_observed` | 5096/5096 |
| Consent choice quality | Consent & CMP | `consent_choice_quality` | 634/5096 |
| Optional cookie purposes selected by default | Consent & CMP | `consent_optional_defaults_on` | 1/5096 |
| Consent mechanism | Consent & CMP | `consent_surface_observed` | 5096/5096 |
| Cookie notice / cookie policy availability | Policies | `cookie_notice_policy_availability` | 5096/5096 |
| Cross-border analytics / tracking endpoint review | Tracking & embeds | `cross_border_endpoint_review` | 634/5096 |
| Device identification / fingerprinting signal | Tracking & embeds | `device_identification_fingerprinting_signal_observed` | 5096/5096 |
| Embedded third-party services before consent | Tracking & embeds | `embedded_content_pre_consent` | 5096/5096 |
| Outdated transfer framework referenced | Policies | `outdated_transfer_framework_reference` | 114/5096 |
| After Reject observation for review | After Reject | `post_reject_tracking_reduction` | 1317/5096 |
| Pre-consent storage classification review | Tracking & embeds | `pre_consent_cookies_storage` | 5096/5096 |
| Pre-consent non-essential tracking | Tracking & embeds | `pre_consent_third_party_tracking` | 5096/5096 |
| Post-choice consent controls | Consent & CMP | `preference_withdrawal_control` | 634/5096 |
| Public data collection surfaces | Forms | `public_collection_surfaces` | 634/5096 |
| Retargeting / behavioral advertising signal | Tracking & embeds | `retargeting_behavioral_advertising_signal_observed` | 634/5096 |
| Sensitive surfaces with 3rd party tracking | Tracking & embeds | `sensitive_surfaces_third_party_tracking` | 634/5096 |
| Session replay signal | Tracking & embeds | `session_replay_fingerprinting_review` | 5096/5096 |
| Social/media embeds or plugins loaded before consent | Tracking & embeds | `social_media_embed_pre_consent` | 5096/5096 |
| 3rd party iframes before consent | Tracking & embeds | `third_party_iframe_pre_consent` | 5096/5096 |
| Observed form transport | Connection security | `transport_security_form_transport` | 5096/5096 |
| HTTP redirects to HTTPS | Connection security | `transport_security_http_redirect` | 5096/5096 |
| HTTPS delivery for scanned pages | Connection security | `transport_security_https_delivery` | 5096/5096 |
| Mixed content | Connection security | `transport_security_mixed_content` | 5096/5096 |
| Valid SSL/TLS certificate | Connection security | `transport_security_tls_certificate` | 5096/5096 |

## Recent detailed projections

| Projection | Returned state | Report count |
| --- | --- | --- |
| site_integrity | not_checked | 4476/5096 |
| site_integrity | verified_capture | 590/5096 |
| site_integrity | verified_bounded_capture | 30/5096 |
| technology | not_checked | 4465/5096 |
| technology | verified_projection | 631/5096 |
| form_destinations | not_checked | 4464/5096 |
| form_destinations | verified_trace | 570/5096 |
| form_destinations | verified_bounded_trace | 62/5096 |
| relationships | not_checked | 4462/5096 |
| relationships | deferred_reference_metadata | 634/5096 |

These four details require an already-verified persisted report, a matching scan ID, a supported typed schema, and a source hash matching the originally verified canonical bundle. Graph node/edge numbers are reference metadata when detailed bytes are deferred; no graph endpoint was fetched. Older archive-only rows remain not checked.

## Remaining priorities

1. Retain technology, site-integrity, graph availability and form-destination coverage in the ordinary Mac mini public export contract if full-month coverage is needed. That is a separate product/export change; no implementation or deployment is included here.
2. Expose typed California recipient qualification, purpose/protocol support, restricted-processing context and neutral reasons as bounded audit fields. Current canonical finding prevalence remains useful; it cannot establish decoder coverage. Keep C2 protocol coverage unresolved.
3. Keep attribution and semantic validation separate from topic presence, including NOZ’s DPO. Chart movement cannot verify who a disclosure applies to.
4. Retain explicit opt-out action execution/confirmation outcomes across report generations; an observed opt-out control is not a completed path.
5. Continue to distinguish incomplete capture, bounded inventories, unknowns and actual negative determinations. Medians and finding rates also change with site mix and schema versions.

No product code, deployment, live scan, model call, cloud query, historical report or durable audit checkpoint is changed. Local charting and verification add $0 paid usage or recurring infrastructure cost.
