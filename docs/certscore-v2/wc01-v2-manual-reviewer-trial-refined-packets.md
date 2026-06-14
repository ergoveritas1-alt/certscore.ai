# WC01 v2 Manual Reviewer Trial: Refined Packets

## Trial Summary

This second internal manual reviewer trial sampled 11 refined WC01 v2 reviewer packets after safe evidence pointers were added to the comparison and reviewer-packet contracts.

Source packet cohorts:

- `artifacts/v2-wc01-reviewer-packets-expanded-fresh-registry`
- `artifacts/v2-wc01-reviewer-packets-stress-fresh-registry`
- `artifacts/v2-wc01-reviewer-packets-edge-consent`
- `artifacts/v2-wc01-reviewer-packets-policy-stress-consent`

The sampled packets covered:

- `standard_internal_review_candidate`
- `sensitive_context_review_required`
- `pre_consent_tracking`
- `pre_consent_cookie_storage`
- `session_replay_behavioral_analytics`
- health / reproductive health
- finance / public benefits
- employment / HR
- behavioral analytics reference sites
- non-sensitive standard sites

High-level result: refined packets are sufficient for queue triage and evidence-shape adjudication. They are still not sufficient for full evidence adjudication because reviewers can see safe IDs and counts, but not the exact bounded excerpt text inside the packet.

## Aggregate Availability

Across all regenerated reviewer packets:

| Cohort | Queue items | Source refs | Excerpt refs/counts | Vendor metadata | Confidence/directness | Family context | Sensitive categories |
|---|---:|---:|---:|---:|---:|---:|---:|
| Expanded fresh-registry | 11 | 11 | 11 | 11 | 11 | 11 | 0/0 |
| Stress fresh-registry | 11 | 11 | 11 | 11 | 11 | 11 | 2/2 |
| Edge consent | 34 | 34 | 34 | 34 | 34 | 34 | 11/11 |
| Policy-stress consent | 25 | 25 | 25 | 25 | 25 | 25 | 23/23 |
| Total | 81 | 81 | 81 | 81 | 81 | 81 | 36/36 |

## Sampled Packets

| Site | Cohort | Context | Queue items sampled |
|---|---|---|---:|
| `target.com` | expanded fresh-registry | non-sensitive standard retail | 3 |
| `consumerfinance.gov` | expanded fresh-registry | public finance / government | 1 |
| `bankofamerica.com` | stress fresh-registry | finance | 2 |
| `plannedparenthood.org` | edge consent | reproductive health | 3 |
| `bedsider.org` | policy-stress consent | reproductive health | 2 |
| `benefits.gov` | policy-stress consent | public benefits | 2 |
| `greenhouse.com` | policy-stress consent | employment / HR | 2 |
| `workday.com` | policy-stress consent | employment / HR | 3 |
| `hotjar.com` | edge consent | behavioral analytics reference | 3 |
| `segment.com` | edge consent | analytics reference / non-sensitive standard | 3 |
| `cloudflare.com` | policy-mature SaaS / non-sensitive standard | non-sensitive standard | 2 |

## Packet-Level Assessment

### target.com

- Queue lane: `standard_internal_review_candidate`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics`
- Source refs: present and useful; each family has distinct ref sets.
- Display-safe excerpt refs/counts: present; counts are capped to representative display-safe evidence.
- Vendor labels/purposes: understandable; examples include advertising, analytics, and session replay labels.
- Confidence/directness: useful; all sampled items show `high/direct`.
- Sensitive-context categories: not applicable.
- Family context: sufficient to understand entry into review: pre-consent, third-party cookie, and collection endpoint context are visible.
- Evidence-shape decision from packet alone: yes.
- Exact bounded excerpt text still needed: yes, for full evidence review and reviewer signoff.
- Recommended reviewer action: `evidence_shape_confirmed`, with `policy_copy_review_required` before any future product-surface work.

### consumerfinance.gov

- Queue lane: `standard_internal_review_candidate`
- Candidate family: `pre_consent_tracking`
- Source refs: present and useful.
- Display-safe excerpt refs/counts: present and useful for traceability.
- Vendor labels/purposes: understandable; analytics purpose and tag-management diagnostic metadata are clearly distinguishable.
- Confidence/directness: useful; `high/direct` supports internal review priority.
- Sensitive-context categories: not present in this packet, despite the public-finance/government context.
- Family context: pre-consent context is visible and sufficient for shape review.
- Evidence-shape decision from packet alone: yes, with caveat that context classification may need policy-owner review.
- Exact bounded excerpt text still needed: yes.
- Recommended reviewer action: `evidence_shape_confirmed`; consider policy question on whether public finance/government sites should receive explicit sensitive or heightened-review labels.

### bankofamerica.com

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`
- Source refs: present.
- Display-safe excerpt refs/counts: present.
- Vendor labels/purposes: understandable; finance-sensitive vendor/purpose labels are visible as internal diagnostics.
- Confidence/directness: useful; `high/direct` makes the review priority clear.
- Sensitive-context categories: clear; `finance`.
- Family context: pre-consent and third-party cookie context are visible.
- Evidence-shape decision from packet alone: yes.
- Exact bounded excerpt text still needed: yes, especially before any copy review for financial context.
- Recommended reviewer action: `sensitive_context_escalated` and `internal_only`.

### plannedparenthood.org

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics`
- Source refs: present and extensive.
- Display-safe excerpt refs/counts: present; representative counts are capped.
- Vendor labels/purposes: understandable; advertising, analytics, session replay, and diagnostic tag management are distinguishable.
- Confidence/directness: useful; `high/direct` across sampled items.
- Sensitive-context categories: clear; `reproductive_health`.
- Family context: sufficient; pre-consent, third-party cookie, and session replay collection endpoint context are visible.
- Evidence-shape decision from packet alone: yes.
- Exact bounded excerpt text still needed: yes, strongly, due to reproductive-health sensitivity.
- Recommended reviewer action: `sensitive_context_escalated`; keep `internal_only`.

### bedsider.org

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`
- Source refs: present.
- Display-safe excerpt refs/counts: present.
- Vendor labels/purposes: understandable; advertising and analytics labels are visible.
- Confidence/directness: useful; `high/direct`.
- Sensitive-context categories: clear; `reproductive_health`.
- Family context: sufficient for shape review.
- Evidence-shape decision from packet alone: yes.
- Exact bounded excerpt text still needed: yes.
- Recommended reviewer action: `sensitive_context_escalated` and `policy_copy_review_required`.

### benefits.gov

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`
- Source refs: present.
- Display-safe excerpt refs/counts: present.
- Vendor labels/purposes: understandable; analytics and diagnostic tag-management labels are visible.
- Confidence/directness: useful; `high/direct`.
- Sensitive-context categories: clear; `public_benefits`.
- Family context: sufficient; pre-consent and third-party cookie context are visible.
- Evidence-shape decision from packet alone: yes.
- Exact bounded excerpt text still needed: yes, especially because public-benefits context may require stricter wording.
- Recommended reviewer action: `sensitive_context_escalated`; keep `internal_only`.

### greenhouse.com

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`
- Source refs: present and extensive.
- Display-safe excerpt refs/counts: present.
- Vendor labels/purposes: understandable; advertising, analytics, and diagnostic tag-management labels are visible.
- Confidence/directness: useful; `high/direct`.
- Sensitive-context categories: clear; `employment_hr`.
- Family context: sufficient for shape review.
- Evidence-shape decision from packet alone: yes.
- Exact bounded excerpt text still needed: yes, especially before any HR/applicant-flow copy is drafted.
- Recommended reviewer action: `sensitive_context_escalated` and `internal_only`.

### workday.com

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics`
- Source refs: present.
- Display-safe excerpt refs/counts: present.
- Vendor labels/purposes: understandable; session replay is separately visible for the session replay family.
- Confidence/directness: useful; `high/direct`.
- Sensitive-context categories: clear; `employment_hr`.
- Family context: sufficient; session replay shows equivalent strong runtime signal context.
- Evidence-shape decision from packet alone: yes.
- Exact bounded excerpt text still needed: yes, particularly for the equivalent-runtime-signal session replay case.
- Recommended reviewer action: `sensitive_context_escalated`; keep `internal_only`.

### hotjar.com

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics`
- Source refs: present and extensive.
- Display-safe excerpt refs/counts: present.
- Vendor labels/purposes: understandable; Hotjar/session replay purpose appears as expected.
- Confidence/directness: useful; `high/direct`.
- Sensitive-context categories: clear; `behavioral_analytics_reference`.
- Family context: sufficient; collection endpoint context is visible for session replay.
- Evidence-shape decision from packet alone: yes.
- Exact bounded excerpt text still needed: yes for confirming representative evidence and avoiding overbroad interpretation.
- Recommended reviewer action: `evidence_shape_confirmed` plus `policy_copy_review_required`; keep sensitive-reference items internal until policy review.

### segment.com

- Queue lane: `standard_internal_review_candidate`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics`
- Source refs: present.
- Display-safe excerpt refs/counts: present.
- Vendor labels/purposes: understandable; advertising, analytics, session replay, and diagnostic tag management are distinguishable.
- Confidence/directness: useful; `high/direct`.
- Sensitive-context categories: not applicable.
- Family context: sufficient; session replay collection endpoint context is visible.
- Evidence-shape decision from packet alone: yes.
- Exact bounded excerpt text still needed: yes for full evidence review.
- Recommended reviewer action: `evidence_shape_confirmed`, with copy review required before any product-surface proposal.

### cloudflare.com

- Queue lane: `standard_internal_review_candidate`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`
- Source refs: present.
- Display-safe excerpt refs/counts: present.
- Vendor labels/purposes: understandable; advertising, analytics, and diagnostic tag-management labels are visible.
- Confidence/directness: useful; `high/direct`.
- Sensitive-context categories: not applicable.
- Family context: sufficient for shape review.
- Evidence-shape decision from packet alone: yes.
- Exact bounded excerpt text still needed: yes.
- Recommended reviewer action: `evidence_shape_confirmed`; keep as internal review item.

## Cross-Sample Findings

1. Source refs are present and useful for traceability, but high-volume items can include hundreds of refs. Reviewers may need representative grouping or top-N display in future human-facing internal tooling.
2. Display-safe excerpt refs/counts are present and useful, but IDs alone do not let a reviewer verify the exact text or endpoint without opening another artifact.
3. Vendor labels and purposes are understandable. Diagnostic purposes such as `tag_management` are visibly separated from supporting purposes.
4. Confidence/directness is useful for review prioritization. All sampled items were `high/direct`, which makes the current cohort easy to triage but gives little contrast for lower-confidence workflows.
5. Sensitive-context categories are now clear and materially improve review handling.
6. Family-specific context is enough to understand why the item entered review.
7. The packet now supports evidence-shape adjudication from the artifact alone.
8. Full evidence adjudication still requires exact bounded excerpt text or a safe way to open upstream excerpts by ID.

## Final Assessment

| Question | Assessment |
|---|---|
| Sufficient for queue triage? | Yes. |
| Sufficient for evidence-shape adjudication? | Yes. |
| Sufficient for full evidence adjudication? | Not yet. |
| Should bounded excerpt text be carried into packets next? | Possibly, but only if bounded, capped, display-safe, and still artifact-only. |
| Is internal preview/rehydration preferable to copying excerpt text? | Likely yes for high-volume evidence and for preserving a smaller packet contract. |

## Recommendation

Recommended next step: **B. Build an internal preview/rehydration tool that opens upstream artifacts by safe source/excerpt IDs.**

Reasoning:

- The refined packets now carry enough safe IDs and context for the preview to locate evidence deterministically.
- Copying bounded excerpt text into every packet would make packets easier to review offline, but could create duplicated display-safe evidence surfaces and larger artifacts.
- A preview/rehydration tool can keep the packet contract small while allowing reviewers to inspect exact bounded excerpts on demand.

Fallback option: add bounded display-safe excerpt text to the packet contract if reviewers need fully portable packet files for offline review. That should remain artifact-only, capped, display-safe, and non-persistent.

## Boundaries Preserved

- Documentation only.
- No code changes.
- No persistence.
- No app UI.
- No production integration.
- No production concern policy calls.
- No persisted normalized concerns.
- No unified findings.
- No report/checklist/executive/top-finding/scoring/regulatory-lens output.
- No customer-facing copy.
- No `gap_observed` mapping.
- No changes to `apps/web/components/scans/shared-scan-detail-view.tsx`.
