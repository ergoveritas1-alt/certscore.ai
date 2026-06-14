# WC01 v2 Evidence Preview Reviewer Trial

## Executive Summary

This third internal reviewer trial evaluated whether `Wc01V2EvidencePreviewPacket` artifacts are usable for evidence review, not just queue-shape triage.

Result: evidence preview packets are a clear improvement over reviewer packets alone. They are sufficient for internal queue triage and most evidence-shape adjudication. They are not yet consistently sufficient for full evidence adjudication on high-volume sites because unresolved evidence refs and redaction warnings are noisy, and the current preview does not group representative examples.

Recommended next decision: **B + D**. Add representative grouping / top-N evidence display and clearer redaction warning labels, still artifact-only and non-persistent.

No app UI, persistence, production integration, production concern policy call, persisted normalized concern, unified finding, report/checklist/executive/top-finding/scoring/regulatory-lens output, customer-facing copy, or `gap_observed` mapping is recommended here.

## Trial Source

Source document:

- `docs/certscore-v2/wc01-v2-evidence-preview-followup.md`

Evidence preview artifacts sampled from:

- `artifacts/v2-wc01-evidence-preview-expanded-fresh-registry`
- `artifacts/v2-wc01-evidence-preview-stress-fresh-registry`
- `artifacts/v2-wc01-evidence-preview-edge-consent`
- `artifacts/v2-wc01-evidence-preview-policy-stress-consent`

## Sample Coverage

Sampled 12 packets and 27 queue items.

Covered:

- `standard_internal_review_candidate`
- `sensitive_context_review_required`
- `pre_consent_tracking`
- `pre_consent_cookie_storage`
- `session_replay_behavioral_analytics`
- health
- reproductive health
- finance
- public benefits
- employment / HR
- behavioral analytics reference sites
- high-volume publisher / adtech
- ecommerce
- partial / fail-closed zero-candidate output

Aggregate sampled counts:

| Metric | Count |
|---|---:|
| Packets sampled | 12 |
| Queue items sampled | 27 |
| Resolved bounded excerpts | 266 |
| Resolved source refs | 4,547 |
| Unresolved evidence refs | 15,675 |
| Redaction warnings | 322 |
| Sensitive-context queue items | 17 |

## Sampled Packet Assessments

| Site | Cohort | Coverage role | Queue items | Resolved excerpts | Source refs | Unresolved refs | Warnings | Assessment | Recommended reviewer action |
|---|---|---|---:|---:|---:|---:|---:|---|---|
| `target.com` | expanded | ecommerce, standard lane, all three families | 3 | 30 | 163 | 575 | 8 | Strong packet. Bounded excerpts show redacted cookies and a FullStory collection endpoint. Vendor/purpose/confidence/directness/context are clear. Unresolved refs are noisy but not blocking for representative review. | Proceed with internal evidence review; use as a good baseline fixture. |
| `weather.com` | expanded | high-volume publisher/adtech | 2 | 24 | 2,499 | 8,207 | 16 | Evidence shape is clear, but volume is overwhelming. Source refs are useful for traceability, yet the reviewer cannot practically inspect all refs without grouping. | Needs top-N / representative grouping before routine review. |
| `fidelity.com` | policy-stress | partial / fail-closed zero-candidate example | 0 | 0 | 0 | 0 | 0 | Packet clearly communicates zero queue items and preserves internal-only guardrails. It does not carry module-limitation explanation in the summary itself, so reviewers may need the upstream cohort summary for why it is empty. | Keep as fail-closed; add optional upstream limitation note later. |
| `bankofamerica.com` | stress | finance sensitive context | 2 | 16 | 14 | 46 | 0 | Good sensitive-context packet. Excerpts and source refs are modest enough to review. Finance category is clear and remains review metadata only. | Suitable for evidence-shape adjudication; keep internal-only pending policy review. |
| `fullstory.com` | edge | behavioral analytics reference | 2 | 22 | 416 | 1,292 | 0 | The session replay item has collection endpoint context and strong runtime shape. The pre-consent item includes tag management as diagnostic only, which is understandable. Unresolved count is high. | Use for session replay reviewer calibration; add grouping for high-volume refs. |
| `hotjar.com` | edge | behavioral analytics reference, all three families | 3 | 31 | 457 | 1,558 | 4 | Useful packet. Session replay and pre-consent tracking context are clear, and sensitive-category labeling is explicit. Repeated unresolved IDs create friction but do not hide the core evidence. | Suitable for internal review with representative grouping. |
| `segment.com` | edge | adtech / analytics reference, standard lane | 3 | 26 | 259 | 1,051 | 125 | Evidence shape is clear, but redaction warnings are too noisy. The warning count distracts from the bounded excerpts and source refs. | Add clearer redaction warning categories and grouping before broad reviewer use. |
| `cloudflare.com` | edge | privacy-mature SaaS / standard lane | 2 | 19 | 61 | 266 | 0 | Good standard-lane packet. Tag management stays diagnostic, and confidence/directness/context are readable. | Suitable for reviewer trial as-is. |
| `healthline.com` | policy-stress | health sensitive context, all three families | 3 | 29 | 108 | 433 | 4 | Strong sensitive-context example. Bounded excerpts show redacted cookie/storage evidence and session replay runtime context. Sensitive category is clear. | Suitable for evidence-shape adjudication; keep internal-only. |
| `plannedparenthood.org` | policy-stress | reproductive health sensitive context, all three families | 3 | 29 | 249 | 906 | 95 | Evidence context is clear, but warning volume is high for a sensitive-context review. Session replay endpoint excerpt is particularly useful. | Needs warning grouping and stricter reviewer workflow before policy review. |
| `benefits.gov` | policy-stress | public benefits sensitive context | 2 | 18 | 28 | 112 | 8 | Good compact sensitive-context packet. Analytics-only vendor/purpose context is clear and remains review-only. | Suitable for internal evidence-shape review. |
| `greenhouse.com` | policy-stress | employment / HR sensitive context | 2 | 22 | 293 | 1,229 | 62 | Evidence shape is understandable, but high unresolved and warning counts make manual review heavy. Employment category is clear. | Needs representative grouping and clearer warnings before routine review. |

## Family-Level Observations

### Pre-Consent Tracking

Bounded excerpts are generally enough to understand that runtime evidence exists before a consent choice. The combination of `pre_consent / choice_not_made`, vendor labels, supporting purposes, confidence, and directness makes the review reason clear.

High-volume sites are the weak spot. The reviewer sees enough evidence to understand the row, but too many unresolved IDs and source refs to judge representativeness manually.

### Pre-Consent Cookie Storage

Cookie/storage packets are easy to understand when the bounded excerpt is a redacted cookie-style value and context says `third_party cookie`.

A recurring limitation is that resolved source refs are often `0` for cookie-storage items while unresolved excerpt refs remain present. That is acceptable as fail-closed traceability, but a reviewer may need upstream artifacts when deciding whether the retained sample is representative enough.

### Session Replay / Behavioral Analytics

This is the clearest family when collection endpoint or equivalent strong runtime context is present. Examples like FullStory and Hotjar are reviewable from the packet shape alone.

Exact bounded excerpt text is helpful here because it can show a collection/settings endpoint or session-replay cookie signal. The packet still correctly avoids asserting recording, sensitive-field capture, or person identification.

## Usability Findings

### Bounded Excerpt Text

Resolved bounded excerpts are useful. They let reviewers see the evidence shape directly instead of opening upstream artifacts for every item.

For many cookie/storage and tracking rows, examples such as redacted cookie names are enough for initial evidence-shape adjudication. For session replay, endpoint-like bounded excerpts are especially useful.

### Source Refs

Resolved source refs are useful for traceability, but source-ref volume needs summarization. Large sites such as `weather.com`, `hotjar.com`, `segment.com`, `greenhouse.com`, and `plannedparenthood.org` are not ergonomic as flat lists.

### Unresolved Evidence Refs

The sampled packets had 15,675 unresolved evidence refs. This is not a guardrail failure and not a reason to suppress the preview, but it is a review-friction problem.

Unresolved refs are acceptable fail-closed behavior for internal diagnostics. They become a practical blocker when reviewers need to determine whether the displayed examples are representative of the full row.

### Redaction Warnings

Redaction warnings are understandable in principle, but the current count can be noisy. The sampled packets had 322 warnings, with concentrated examples on `segment.com`, `plannedparenthood.org`, and `greenhouse.com`.

The label should make clear whether the warning means:

- an opaque value was safely redacted in bounded preview text
- a source-ref label/path was normalized
- a value could not be displayed and remains unavailable

### Vendor, Purpose, Confidence, Directness, And Context

These fields remained clear in the sampled packets.

Supporting purposes and diagnostic purposes were easy to distinguish. `tag_management` appeared as diagnostic metadata only, not as supporting evidence. Confidence and directness were consistently useful because all sampled candidate rows were high/direct.

### Sensitive-Context Categories

Sensitive-context categories were clear and did not promote eligibility. The packet shape made it easy to see when a row remained internal because of health, reproductive health, finance, public benefits, employment / HR, or behavioral analytics reference context.

## Full Evidence Adjudication Assessment

| Question | Assessment |
|---|---|
| Sufficient for queue triage? | Yes. |
| Sufficient for evidence-shape adjudication? | Mostly yes. |
| Sufficient for full evidence adjudication? | Not yet for high-volume sites. |
| Do reviewers still need upstream artifacts? | Sometimes, especially when unresolved refs are high or when representativeness matters. |
| Are unresolved refs a blocker? | Not for fail-closed internal preview; yes for exhaustive manual adjudication on high-volume rows. |
| Are redaction warnings understandable? | Yes in concept, but too noisy without categories/grouping. |
| Should bounded excerpt text move directly into reviewer packets? | Not yet. Keep excerpt text in evidence preview packets to avoid making reviewer packets another evidence store. |

## Recommended Next Decision

Recommended default: **B + D**.

1. Add representative grouping / top-N evidence display for high-volume sites.
2. Add clearer redaction warning labels.

Both should remain artifact-only and non-persistent.

Secondary recommendation: consider upstream excerpt-retention tuning after grouping exists. The current unresolved counts may be less painful if reviewers get a clean representative view first.

## Decision Options

| Option | Recommendation |
|---|---|
| A. Keep evidence preview as-is and proceed to internal reviewer trial. | Not recommended as the only next step. It works, but high-volume rows are too noisy. |
| B. Add representative grouping / top-N evidence display for high-volume sites. | Recommended. |
| C. Tune upstream excerpt retention so more display-safe excerpt IDs resolve. | Useful later, especially if unresolved refs remain high after grouping. |
| D. Add clearer redaction warning labels. | Recommended. |
| E. Add bounded excerpt text directly into reviewer packets instead of separate preview packets. | Not recommended yet. Keep reviewer packets as queue artifacts and preview packets as evidence artifacts. |

## Explicit Non-Goals

- no code changes in this trial report
- no app UI
- no persistence
- no production integration
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no report/checklist/executive/top-finding/scoring/regulatory-lens output
- no customer-facing output
- no `gap_observed` mapping
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
