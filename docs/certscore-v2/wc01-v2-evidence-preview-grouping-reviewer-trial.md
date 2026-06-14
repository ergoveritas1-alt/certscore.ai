# WC01 v2 Evidence Preview Grouping Reviewer Trial

## Executive Summary

This fourth internal reviewer trial evaluated whether representative grouping, top-N evidence display, unresolved-ref summaries, and categorized warnings make `Wc01V2EvidencePreviewPacket` artifacts usable enough for a small human reviewer trial.

Result: grouped preview packets are now sufficient for queue triage and evidence-shape adjudication. They are also sufficient for first-pass full evidence adjudication on compact and moderate-volume packets. High-volume packets are much more usable than before, but unresolved refs remain the main limitation for exhaustive adjudication.

Recommended decision: **A. Keep grouped preview as-is and proceed to a small human reviewer trial.** If human reviewers find unresolved refs prevent full adjudication, choose **B. Tune upstream excerpt retention** before any UI work.

This remains internal-only, artifact-only, and non-persistent.

## Trial Source

Source document:

- `docs/certscore-v2/wc01-v2-evidence-preview-grouping-followup.md`

Artifacts sampled from:

- `artifacts/v2-wc01-evidence-preview-expanded-fresh-registry`
- `artifacts/v2-wc01-evidence-preview-stress-fresh-registry`
- `artifacts/v2-wc01-evidence-preview-edge-consent`
- `artifacts/v2-wc01-evidence-preview-policy-stress-consent`

## Sample Coverage

Sampled 12 packets and 28 queue items.

Covered:

- high-volume publisher/adtech: `weather.com`
- high-warning prior examples: `segment.com`, `plannedparenthood.org`, `greenhouse.com`
- behavioral analytics reference: `hotjar.com`, `fullstory.com`
- sensitive health and reproductive health
- finance and public benefits
- employment / HR
- ecommerce / non-sensitive standard
- compact / lower-volume examples

Aggregate sampled counts:

| Metric | Count |
|---|---:|
| Packets sampled | 12 |
| Queue items sampled | 28 |
| Representative groups sampled | 457 |
| Resolved bounded excerpts sampled | 273 |
| Resolved source refs sampled | 4,572 |
| Unresolved refs sampled | 15,757 |
| Warning entries sampled | 64 |
| Sensitive-context queue items sampled | 17 |

## Sampled Packet Assessments

| Site | Cohort | Role | Queue items | Groups | Excerpts | Source refs | Unresolved refs | Warning entries | Assessment | Recommended reviewer action |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| `weather.com` | expanded | high-volume publisher/adtech | 2 | 108 | 24 | 2,499 | 8,207 | 5 | Grouping makes the packet reviewable for shape. The top groups expose the largest unresolved buckets and major source-ref hosts. Still too large for exhaustive adjudication without upstream retention or deeper inspection. | Proceed to human trial as high-volume stress case; do not require exhaustive adjudication from packet alone. |
| `segment.com` | edge | prior high-warning example | 3 | 43 | 26 | 259 | 1,051 | 7 | Warning categories are much clearer. Displayed-with-redaction source-ref URL warnings are separated from fail-closed unresolved evidence. Grouping makes first-pass review practical. | Suitable for reviewer trial. |
| `plannedparenthood.org` | policy-stress | reproductive health sensitive context | 3 | 37 | 29 | 249 | 906 | 7 | Sensitive context remains clear. Session replay grouping surfaces Hotjar runtime evidence. Warning categories reduce noise, but unresolved counts still require caution. | Human reviewer should adjudicate shape and note whether upstream artifact inspection is needed. |
| `greenhouse.com` | policy-stress | employment / HR sensitive context | 2 | 44 | 22 | 293 | 1,229 | 5 | Employment / HR category is clear. Top groups expose LinkedIn, DoubleClick, OpenX/Tapad-style source-ref clusters and unresolved buckets. | Suitable for reviewer trial; likely needs upstream inspection for final evidence confidence. |
| `hotjar.com` | edge | behavioral analytics reference | 3 | 40 | 31 | 457 | 1,558 | 7 | Behavioral analytics grouping is useful. Hotjar source-ref groups and session-replay family context are clear. Unresolved counts remain high but understandable. | Good reviewer calibration packet. |
| `fullstory.com` | edge | behavioral analytics reference | 2 | 33 | 22 | 416 | 1,292 | 4 | Grouping isolates FullStory source refs and session-replay context. No source-ref URL redaction warning category appeared; unresolved reason counts are easy to read. | Good session-replay calibration packet. |
| `healthline.com` | policy-stress | health sensitive context | 3 | 49 | 29 | 108 | 433 | 7 | Grouping makes health-sensitive review manageable. Top groups show analytics/adtech and session-replay evidence shape clearly. | Suitable for evidence-shape adjudication in human trial. |
| `bankofamerica.com` | stress | finance sensitive context | 2 | 13 | 16 | 14 | 46 | 3 | Compact and readable. Representative groups and warning categories are enough for first-pass full adjudication. | Use as positive compact-sensitive example. |
| `benefits.gov` | policy-stress | public benefits sensitive context | 2 | 13 | 18 | 28 | 112 | 5 | Compact enough for first-pass adjudication. Public-benefits category remains review metadata only. | Use as public-benefits sensitive example. |
| `target.com` | expanded | ecommerce / standard, all three families | 3 | 36 | 30 | 163 | 575 | 7 | Strong standard-lane example. Session replay grouping surfaces FullStory endpoint evidence. Omitted-group totals are understandable. | Suitable for first-pass full adjudication. |
| `cloudflare.com` | edge | compact privacy-mature SaaS | 2 | 29 | 19 | 61 | 266 | 4 | Compact enough for reviewer packet-only shape review. Grouping makes tag-management diagnostic context easier to separate. | Suitable compact standard example. |
| `airbnb.com` | stress | compact / lower-volume standard | 1 | 12 | 7 | 25 | 82 | 3 | Top groups and unresolved counts are easy to understand. This is close to full evidence adjudication from preview alone. | Use as low-volume baseline. |

## Usability Findings

### Representative Groups

Representative groups make review materially easier. The reviewer can now see evidence shape by host, evidence kind, and unresolved bucket instead of scanning flat source-ref and excerpt lists.

The most useful group labels were:

- family plus unresolved reason
- family plus `source_ref` host
- family plus cookie/network/session-replay evidence kind

High-volume examples such as `weather.com` still produce many groups in JSON, but the Markdown top-N view is much more navigable.

### Top-N Excerpts And Source Refs

Top-N display is enough for first-pass adjudication on compact and moderate-volume packets.

For high-volume packets, top-N is enough to understand the dominant evidence shape, but not enough to prove the omitted groups are representative. The omitted-group totals are clear and correctly push reviewers toward JSON or upstream artifacts when exhaustive review is required.

### Omitted-Group Totals

Omitted-group rows are clear. They tell reviewers that Markdown is a representative view while JSON preserves additional safe detail.

The wording “additional groups in JSON” is understandable and should remain.

### Unresolved-Ref Reason Tables

The unresolved-ref reason tables are understandable. The two dominant reasons in sampled packets were:

- `excerpt_id_not_found`
- `ambiguous_lineage`

These are acceptable fail-closed signals for internal diagnostics. They still create review friction on high-volume sites because unresolved totals can exceed resolved evidence by a large margin.

### Warning Categories

Categorized warnings are much clearer than the prior generic warning count.

The most useful categories were:

- `source_ref_url_redacted`
- `ambiguous_lineage_fail_closed`
- `evidence_not_found_fail_closed`

The display disposition field is helpful because it separates evidence displayed with redaction from evidence omitted fail-closed.

### Redaction Warning Noise

Redaction warnings are less noisy after aggregation. Prior high-warning examples now show a small number of warning entries with larger counts.

This is a good tradeoff for reviewer usability.

## Adjudication Assessment

| Question | Assessment |
|---|---|
| Sufficient for queue triage? | Yes. |
| Sufficient for evidence-shape adjudication? | Yes. |
| Sufficient for full evidence adjudication? | Yes for compact/moderate packets; not always for high-volume packets. |
| Are top-N groups enough? | Enough for first-pass review and triage; not enough for exhaustive review. |
| Are warning categories clear enough? | Yes for a small human reviewer trial. |
| Are unresolved refs still a blocker? | Not for trial; potentially for final adjudication on high-volume sites. |
| Should upstream excerpt retention be tuned next? | Only if human reviewers report unresolved refs block adjudication. |
| Proceed to actual reviewers? | Yes, with bounded expectations. |

## Recommended Decision

Recommended default: **A. Keep grouped preview as-is and proceed to a small human reviewer trial.**

Trial instructions should tell reviewers:

- Markdown is a representative view.
- JSON contains full safe grouped detail.
- High unresolved counts are fail-closed, not evidence promotion.
- Full adjudication may require upstream artifact inspection for high-volume packets.

Fallback if blockers remain: **B. Tune upstream excerpt retention to reduce unresolved refs** before any UI work.

## Decision Options

| Option | Recommendation |
|---|---|
| A. Keep grouped preview as-is and proceed to a small human reviewer trial. | Recommended. |
| B. Tune upstream excerpt retention to reduce unresolved refs. | Recommended only if human reviewers cannot adjudicate high-volume packets. |
| C. Add more grouping dimensions or reviewer filters. | Defer until reviewers identify concrete filter needs. |
| D. Add bounded excerpt text directly to reviewer packets. | Not recommended; preview packets should remain the evidence surface. |
| E. Build admin UI. | Not recommended yet; artifact workflow is ready for reviewer validation first. |

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
- no forbidden gap-status mapping
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
