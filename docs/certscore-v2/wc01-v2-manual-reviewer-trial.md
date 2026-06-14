# WC01 v2 Manual Reviewer Trial

## Trial Summary

This internal trial sampled 10 artifact-only manual reviewer packets from the generated WC01 v2 reviewer-packet cohorts.

Source packet cohorts:

- `artifacts/v2-wc01-reviewer-packets-expanded-fresh-registry`
- `artifacts/v2-wc01-reviewer-packets-stress-fresh-registry`
- `artifacts/v2-wc01-reviewer-packets-edge-consent`
- `artifacts/v2-wc01-reviewer-packets-policy-stress-consent`

The sample covered 24 queue items:

- `standard_internal_review_candidate`: 8 sampled queue items
- `sensitive_context_review_required`: 16 sampled queue items
- `pre_consent_tracking`: represented
- `pre_consent_cookie_storage`: represented
- `session_replay_behavioral_analytics`: represented

Sensitive and high-attention contexts represented:

- health / medical information
- reproductive health
- finance / public benefits
- employment / HR
- behavioral analytics reference sites
- one non-sensitive standard site

Conclusion: the current packet shape is sufficient for queue-shape and workflow triage review. It is not sufficient for full evidence adjudication because it does not carry source refs, excerpt IDs, vendor names, confidence, directness, or sensitive-context category labels forward from upstream artifacts.

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

## Packet-Level Review Notes

### target.com

- Queue lane: `standard_internal_review_candidate`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics`
- Simulated outcome: `would_accept_for_internal_review`
- Review flags: `copy_policy_review_required`
- Lane/action label clarity: understandable for triage. The lane says this is eligible for internal review, not production output.
- Triage sufficiency: yes. The packet clearly separates the three families and keeps the item internal-only.
- Missing for evidence adjudication: source ref IDs, display-safe excerpt IDs, vendor names, confidence/directness, and evidence snippets.
- Internal-only posture: should remain internal-only until evidence pointers and copy posture are reviewed.
- Recommended reviewer action: `evidence_shape_confirmed` for workflow shape, plus `policy_copy_review_required`.

### consumerfinance.gov

- Queue lane: `standard_internal_review_candidate`
- Candidate family: `pre_consent_tracking`
- Simulated outcome: `would_accept_for_internal_review`
- Review flags: `copy_policy_review_required`
- Lane/action label clarity: understandable, though the public-finance context is not carried as packet metadata.
- Triage sufficiency: yes for routing to internal review.
- Missing for evidence adjudication: explicit public-benefits/finance context label, source refs, excerpts, vendors, confidence, and directness.
- Internal-only posture: should remain internal-only until sensitive/public-sector handling rules are explicit.
- Recommended reviewer action: `policy_copy_review_required`; consider `internal_only` if public-sector context should receive stricter review.

### bankofamerica.com

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`
- Simulated outcome: `would_remain_internal_only`
- Review flags: `copy_policy_review_required`, `sensitive_context_extra_review_required`
- Lane/action label clarity: strong. The sensitive lane and internal-only outcome are easy to understand.
- Triage sufficiency: yes. The packet clearly prevents promotion beyond internal review.
- Missing for evidence adjudication: finance category label, source refs, excerpts, vendor names, confidence/directness, and cookie/storage evidence details.
- Internal-only posture: yes. Finance-sensitive context should remain internal-only at this stage.
- Recommended reviewer action: `sensitive_context_escalated` and `policy_copy_review_required`.

### plannedparenthood.org

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics`
- Simulated outcome: `would_remain_internal_only`
- Review flags: `copy_policy_review_required`, `sensitive_context_extra_review_required`
- Lane/action label clarity: strong for triage. The lane accurately signals heightened review.
- Triage sufficiency: yes for routing and sensitivity handling.
- Missing for evidence adjudication: reproductive-health category label, source refs, excerpts, vendor names, confidence/directness, and session replay collection detail.
- Internal-only posture: yes. This should not move toward external output without separate policy approval and stronger evidence display.
- Recommended reviewer action: `sensitive_context_escalated`; keep all sampled items `internal_only`.

### bedsider.org

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`
- Simulated outcome: `would_remain_internal_only`
- Review flags: `copy_policy_review_required`, `sensitive_context_extra_review_required`
- Lane/action label clarity: clear.
- Triage sufficiency: yes.
- Missing for evidence adjudication: reproductive-health category label, source refs, excerpts, vendor names, confidence/directness, and storage context detail.
- Internal-only posture: yes.
- Recommended reviewer action: `sensitive_context_escalated` and `policy_copy_review_required`.

### benefits.gov

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`
- Simulated outcome: `would_remain_internal_only`
- Review flags: `copy_policy_review_required`, `sensitive_context_extra_review_required`
- Lane/action label clarity: clear, but the public-benefits context is not visible inside the packet.
- Triage sufficiency: yes for sensitivity routing.
- Missing for evidence adjudication: public-benefits category label, source refs, excerpts, vendor names, confidence/directness, and cookie evidence detail.
- Internal-only posture: yes.
- Recommended reviewer action: `sensitive_context_escalated`; keep `internal_only`.

### greenhouse.com

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`
- Simulated outcome: `would_remain_internal_only`
- Review flags: `copy_policy_review_required`, `sensitive_context_extra_review_required`
- Lane/action label clarity: clear.
- Triage sufficiency: yes for employment/HR queue routing.
- Missing for evidence adjudication: employment/HR category label, source refs, excerpts, vendor names, confidence/directness, and storage context detail.
- Internal-only posture: yes.
- Recommended reviewer action: `sensitive_context_escalated` and `policy_copy_review_required`.

### workday.com

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics`
- Simulated outcome: `would_remain_internal_only`
- Review flags: `copy_policy_review_required`, `sensitive_context_extra_review_required`
- Lane/action label clarity: clear and useful.
- Triage sufficiency: yes. The packet correctly routes HR/applicant-flow context into sensitive review.
- Missing for evidence adjudication: employment/HR category label, source refs, excerpts, vendors, confidence/directness, and session replay collection detail.
- Internal-only posture: yes.
- Recommended reviewer action: `sensitive_context_escalated`; keep all sampled items `internal_only`.

### hotjar.com

- Queue lane: `sensitive_context_review_required`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics`
- Simulated outcome: `would_remain_internal_only`
- Review flags: `copy_policy_review_required`, `sensitive_context_extra_review_required`
- Lane/action label clarity: understandable, though the reason for sensitivity should be carried explicitly.
- Triage sufficiency: yes for behavioral analytics reference review.
- Missing for evidence adjudication: sensitive-context category, source refs, excerpts, vendor names, confidence/directness, and collection endpoint detail.
- Internal-only posture: yes until behavioral analytics policy copy and evidence requirements are explicit.
- Recommended reviewer action: `policy_copy_review_required`; use `sensitive_context_escalated` if the reference-site sensitivity rule is intended.

### segment.com

- Queue lane: `standard_internal_review_candidate`
- Candidate families: `pre_consent_tracking`, `pre_consent_cookie_storage`, `session_replay_behavioral_analytics`
- Simulated outcome: `would_accept_for_internal_review`
- Review flags: `copy_policy_review_required`
- Lane/action label clarity: understandable.
- Triage sufficiency: yes. Useful non-sensitive standard comparison for analytics/reference behavior.
- Missing for evidence adjudication: source refs, excerpts, vendor names, confidence/directness, and collection endpoint detail.
- Internal-only posture: should remain internal-only until safe evidence pointers are added.
- Recommended reviewer action: `evidence_shape_confirmed` for queue shape and `policy_copy_review_required`.

## Common Missing Information

Across the sampled packets, the same missing fields limited reviewer adjudication:

- source ref IDs
- display-safe excerpt IDs
- display-safe evidence excerpts or bounded snippets
- vendor names
- supporting purposes and diagnostic purposes
- confidence band
- directness
- sensitive-context categories
- family-specific details, especially cookie/storage context and session replay collection endpoint context

This is expected because the packet reads only `Wc01V2ConcernPolicyComparisonDryRun` artifacts. The upstream stages already gated these values, but the comparison artifact does not retain enough safe pointers for a reviewer to inspect evidence without leaving the packet.

## Triage Assessment

The current packet shape is enough for:

- validating queue lane names
- validating action vocabulary
- confirming sensitive-context routing
- confirming standard versus sensitive review separation
- confirming that production/top/gap eligibility stays false
- confirming that no customer-facing copy is present

The current packet shape is not enough for:

- confirming the observed evidence itself
- assessing vendor attribution
- checking whether excerpts support the candidate
- comparing confidence/directness across candidates
- deciding whether session replay evidence is collection-based rather than library-only
- reviewer signoff on any future customer-facing use

## Trial Findings

1. `standard_internal_review_candidate` is a good lane for non-sensitive review-shape candidates.
2. `sensitive_context_review_required` is understandable and appropriately conservative.
3. The universal `copy_policy_review_required` flag is useful, but may become noisy unless future packets distinguish missing copy posture from explicit copy-review escalation.
4. The current packets should be considered triage packets, not evidence-review packets.
5. Sensitive-context packets need explicit category labels carried forward; site identity alone should not be the reviewer’s only signal.
6. Session replay candidates need collection evidence pointers in the reviewer packet before evidence adjudication is possible.

## Recommended Next Step

Recommended default: **B. Refine comparison/packet contract to carry safe evidence pointers forward, still artifact-only and non-persistent.**

This should include bounded, display-safe references only:

- source ref IDs
- display-safe excerpt IDs
- vendor names and purposes as internal diagnostic labels
- confidence and directness
- sensitive-context categories
- family-specific evidence context

Do not add persistence or production mapping as part of this step.

## Decision Options

| Option | Recommendation | Notes |
|---|---|---|
| A. Keep artifact-only packets as triage-only and stop here | Possible | Safe, but does not support evidence adjudication. |
| B. Refine comparison/packet contract to carry safe evidence pointers forward | Recommended | Best next step while preserving artifact-only, non-persistent boundaries. |
| C. Build an internal preview that can rehydrate safe evidence from upstream artifacts | Useful later | More complex and should wait until the forward contract is clarified. |
| D. Add persistence for reviewer decisions | Not recommended | Premature; reviewer workflow and evidence contract are not ready. |

## Boundaries Preserved

- Documentation only.
- No code changes.
- No production integration.
- No persistence.
- No normalized concern persistence.
- No unified findings.
- No report/checklist/executive/top-finding/scoring/regulatory-lens output.
- No customer-facing copy.
- No `gap_observed` mapping.
- No changes to `apps/web/components/scans/shared-scan-detail-view.tsx`.
