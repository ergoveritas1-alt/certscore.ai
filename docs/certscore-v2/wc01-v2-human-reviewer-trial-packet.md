# WC01 v2 Human Reviewer Trial Packet

Internal reviewer trial only. This packet is not customer-facing report output.

## Trial Objective

This trial asks human reviewers to evaluate whether grouped WC01 v2 evidence preview artifacts are usable for internal evidence review.

Reviewers should validate:

- queue lane clarity
- sensitive-context routing
- evidence grouping
- top-N evidence summaries
- unresolved-ref warnings
- redaction warning categories
- whether the packet supports triage and evidence-shape adjudication

Reviewers should not evaluate legal compliance, approve customer-facing output, or treat any item as production-ready.

## What Reviewers Should Understand

Markdown summaries are representative views. They show the top evidence groups for each queue item so reviewers can make a practical first-pass assessment.

JSON preserves the full safe grouped detail. If Markdown indicates omitted groups, reviewers may open the matching `Wc01V2EvidencePreviewPacket.json` file for additional safe detail.

Unresolved refs are fail-closed. They indicate evidence pointers that were not displayed because the preview could not safely resolve them, could not establish clean lineage, or could not find the referenced excerpt. They must not be treated as evidence promotion.

Redaction warnings mean values were redacted or evidence was omitted for safety. `displayed_with_redaction` means the preview retained a bounded safe representation. `omitted_fail_closed` means the evidence was not displayed.

Sensitive context increases review requirements only. It does not create production eligibility, top-finding eligibility, customer-facing output, or stronger findings.

All items remain internal-only, artifact-only, and non-persistent.

## Sample Set

Review the Markdown summary first. Open the matching JSON only when the Markdown top-N view is not enough to answer the scoring questions.

| Site | Cohort | Artifact path | Reason selected | Expected review focus |
|---|---|---|---|---|
| `weather.com` | expanded | `artifacts/v2-wc01-evidence-preview-expanded-fresh-registry/weather.com/Wc01V2EvidencePreviewPacket.summary.md` | High-volume publisher/adtech packet with many representative groups and unresolved refs. | Determine whether grouping and omitted-group totals make a high-volume packet reviewable for first-pass adjudication. |
| `segment.com` | edge | `artifacts/v2-wc01-evidence-preview-edge-consent/segment.com/Wc01V2EvidencePreviewPacket.summary.md` | Prior high-warning example with all three draft families. | Evaluate whether warning categories are understandable and less noisy. |
| `plannedparenthood.org` | policy-stress | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/plannedparenthood.org/Wc01V2EvidencePreviewPacket.summary.md` | Reproductive health sensitive context. | Evaluate sensitive-context routing, session-replay evidence shape, and whether unresolved refs require escalation. |
| `greenhouse.com` | policy-stress | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/greenhouse.com/Wc01V2EvidencePreviewPacket.summary.md` | Employment / HR sensitive context and prior warning example. | Evaluate whether source-ref grouping and warning labels are enough for reviewer confidence. |
| `hotjar.com` | edge | `artifacts/v2-wc01-evidence-preview-edge-consent/hotjar.com/Wc01V2EvidencePreviewPacket.summary.md` | Behavioral analytics reference site. | Evaluate whether session replay / behavioral analytics context is clear. |
| `healthline.com` | policy-stress | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/healthline.com/Wc01V2EvidencePreviewPacket.summary.md` | Health sensitive context. | Evaluate sensitive-context labels and evidence grouping across tracking, cookie/storage, and behavioral analytics items. |
| `bankofamerica.com` | stress | `artifacts/v2-wc01-evidence-preview-stress-fresh-registry/bankofamerica.com/Wc01V2EvidencePreviewPacket.summary.md` | Finance sensitive context with compact evidence. | Test whether compact sensitive packets can be adjudicated from preview alone. |
| `benefits.gov` | policy-stress | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/benefits.gov/Wc01V2EvidencePreviewPacket.summary.md` | Public benefits sensitive context. | Evaluate whether public-benefits routing and warning summaries are understandable. |
| `target.com` | expanded | `artifacts/v2-wc01-evidence-preview-expanded-fresh-registry/target.com/Wc01V2EvidencePreviewPacket.summary.md` | Ecommerce standard packet with all three families. | Evaluate a non-sensitive standard packet with broad family coverage. |
| `cloudflare.com` | policy-stress | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/cloudflare.com/Wc01V2EvidencePreviewPacket.summary.md` | Compact / privacy-mature SaaS packet. | Use as a lower-volume baseline and assess whether diagnostic purposes remain easy to separate. |

Optional alternate behavioral analytics reference:

- `artifacts/v2-wc01-evidence-preview-edge-consent/fullstory.com/Wc01V2EvidencePreviewPacket.summary.md`

Optional alternate compact standard packet:

- `artifacts/v2-wc01-evidence-preview-stress-fresh-registry/airbnb.com/Wc01V2EvidencePreviewPacket.summary.md`

## Reviewer Scoring Form

Complete one row per artifact.

Ratings use `1` to `5`, where `1` means unclear or unusable and `5` means clear and usable. Use `N/A` only where the artifact has no sensitive-context items.

| Artifact | Queue lane clarity | Sensitive-context clarity | Evidence grouping clarity | Top-N excerpt usefulness | Unresolved-ref summary clarity | Redaction-warning clarity | Confidence/directness usefulness | Family context usefulness | Can make queue triage decision? | Can make evidence-shape decision? | Can make first-pass full evidence decision? | Needed upstream artifact inspection? | Reviewer action selected |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| `weather.com` |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `segment.com` |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `plannedparenthood.org` |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `greenhouse.com` |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `hotjar.com` |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `healthline.com` |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `bankofamerica.com` |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `benefits.gov` |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `target.com` |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `cloudflare.com` |  |  |  |  |  |  |  |  |  |  |  |  |  |

Allowed reviewer actions:

- `evidence_shape_confirmed`
- `needs_more_evidence`
- `internal_only`
- `policy_copy_review_required`
- `sensitive_context_escalated`
- `rejected_overbroad`

## Reviewer Notes Prompts

For each artifact, answer briefly:

- What was confusing?
- Were any warnings too noisy?
- Did unresolved refs block review?
- Were top-N groups representative enough?
- Were sensitive-context labels sufficient?
- Should any artifact remain internal-only indefinitely?
- What would you need before approving any future production proposal?

## Decision Criteria

Use these thresholds after the review:

- If most artifacts score `4+` on evidence grouping clarity and redaction-warning clarity, the grouped preview shape is acceptable.
- If high-volume artifacts score below `3` on adjudication, consider upstream excerpt-retention tuning.
- If reviewers need exact evidence beyond top-N, consider drilldown or rehydration improvements before any UI.
- If sensitive-context reviewers request stricter handling, update policy gates before any production proposal.
- If reviewers consistently select `needs_more_evidence`, inspect whether unresolved refs or excerpt retention are the cause.
- If reviewers consistently select `rejected_overbroad`, revisit the family gates before expanding the trial.

## Boundaries

This is an internal trial only.

No reviewer should:

- draw legal conclusions
- approve customer-facing output
- approve production integration
- persist reviewer decisions into product state
- create unified findings
- create report, checklist, executive, scoring, or regulatory output
- map items to the forbidden gap status
- treat unresolved refs as displayed evidence

The trial does not change app UI, production concern policy, normalized concerns, unified findings, report generation, scoring, regulatory views, or customer-facing behavior.

## Trial Output Template

### Artifacts Reviewed

| Artifact | Reviewed by | Date | Completed? | Notes |
|---|---|---|---|---|
| `weather.com` |  |  |  |  |
| `segment.com` |  |  |  |  |
| `plannedparenthood.org` |  |  |  |  |
| `greenhouse.com` |  |  |  |  |
| `hotjar.com` |  |  |  |  |
| `healthline.com` |  |  |  |  |
| `bankofamerica.com` |  |  |  |  |
| `benefits.gov` |  |  |  |  |
| `target.com` |  |  |  |  |
| `cloudflare.com` |  |  |  |  |

### Average Scores

| Metric | Average score |
|---|---:|
| Queue lane clarity |  |
| Sensitive-context clarity |  |
| Evidence grouping clarity |  |
| Top-N excerpt usefulness |  |
| Unresolved-ref summary clarity |  |
| Redaction-warning clarity |  |
| Confidence/directness usefulness |  |
| Family context usefulness |  |

### Blocker List

| Artifact | Blocker | Severity | Recommended fix |
|---|---|---|---|
|  |  |  |  |

### Recommended Next Action

Select one:

| Option | Selected? | Notes |
|---|---|---|
| A. Proceed with grouped preview as internal reviewer workflow. |  |  |
| B. Tune upstream excerpt retention. |  |  |
| C. Add more grouping/filtering. |  |  |
| D. Add admin UI later. |  |  |
| E. Stop before production proposal. |  |  |

Recommended default before reviewer input: **A. Proceed with grouped preview as internal reviewer workflow.**

If high-volume packets block full adjudication, select **B. Tune upstream excerpt retention** before any UI work.

## Completed Reviewer Trial Results

Reviewer: Codex internal artifact review

Review date: 2026-06-09

Scope reviewed:

- 10 evidence preview packets
- 25 queue items
- 406 representative evidence groups
- 239 resolved bounded excerpts
- 4,104 resolved source refs
- 14,261 unresolved refs
- 57 warning entries
- 15 sensitive-context queue items

This review assessed grouped evidence preview usability only. It did not evaluate legal compliance and did not approve any customer-facing output.

### Reviewed Artifact Metrics

| Site | Cohort | Queue items | Families | Queue lane | Sensitive categories | Groups | Excerpts | Source refs | Unresolved refs | Warning entries |
|---|---|---:|---|---|---|---:|---:|---:|---:|---:|
| `weather.com` | expanded | 2 | pre-consent tracking; pre-consent cookie/storage | standard internal review | N/A | 108 | 24 | 2,499 | 8,207 | 5 |
| `segment.com` | edge | 3 | pre-consent tracking; pre-consent cookie/storage; session replay / behavioral analytics | standard internal review | N/A | 43 | 26 | 259 | 1,051 | 7 |
| `plannedparenthood.org` | policy-stress | 3 | pre-consent tracking; pre-consent cookie/storage; session replay / behavioral analytics | sensitive-context review | reproductive health | 37 | 29 | 249 | 906 | 7 |
| `greenhouse.com` | policy-stress | 2 | pre-consent tracking; pre-consent cookie/storage | sensitive-context review | employment / HR | 44 | 22 | 293 | 1,229 | 5 |
| `hotjar.com` | edge | 3 | pre-consent tracking; pre-consent cookie/storage; session replay / behavioral analytics | sensitive-context review | behavioral analytics reference | 40 | 31 | 457 | 1,558 | 7 |
| `healthline.com` | policy-stress | 3 | pre-consent tracking; pre-consent cookie/storage; session replay / behavioral analytics | sensitive-context review | health | 49 | 29 | 108 | 433 | 7 |
| `bankofamerica.com` | stress | 2 | pre-consent tracking; pre-consent cookie/storage | sensitive-context review | finance | 13 | 16 | 14 | 46 | 3 |
| `benefits.gov` | policy-stress | 2 | pre-consent tracking; pre-consent cookie/storage | sensitive-context review | public benefits | 13 | 18 | 28 | 112 | 5 |
| `target.com` | expanded | 3 | pre-consent tracking; pre-consent cookie/storage; session replay / behavioral analytics | standard internal review | N/A | 36 | 30 | 163 | 575 | 7 |
| `cloudflare.com` | policy-stress | 2 | pre-consent tracking; pre-consent cookie/storage | standard internal review | N/A | 23 | 14 | 34 | 144 | 4 |

### Completed Scoring Form

Ratings use `1` to `5`, where `1` means unclear or unusable and `5` means clear and usable.

| Artifact | Queue lane clarity | Sensitive-context clarity | Evidence grouping clarity | Top-N excerpt usefulness | Unresolved-ref summary clarity | Redaction-warning clarity | Confidence/directness usefulness | Family context usefulness | Can make queue triage decision? | Can make evidence-shape decision? | Can make first-pass full evidence decision? | Needed upstream artifact inspection? | Reviewer action selected |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| `weather.com` | 5 | N/A | 4 | 3 | 5 | 4 | 3 | 4 | yes | yes | no | yes | `needs_more_evidence` |
| `segment.com` | 5 | N/A | 5 | 4 | 5 | 5 | 4 | 5 | yes | yes | yes | no | `evidence_shape_confirmed` |
| `plannedparenthood.org` | 5 | 5 | 4 | 4 | 5 | 5 | 4 | 5 | yes | yes | yes | no | `sensitive_context_escalated` |
| `greenhouse.com` | 5 | 5 | 4 | 4 | 5 | 5 | 4 | 4 | yes | yes | yes | yes | `sensitive_context_escalated` |
| `hotjar.com` | 5 | 5 | 5 | 4 | 5 | 5 | 4 | 5 | yes | yes | yes | no | `sensitive_context_escalated` |
| `healthline.com` | 5 | 5 | 5 | 4 | 5 | 5 | 4 | 5 | yes | yes | yes | no | `sensitive_context_escalated` |
| `bankofamerica.com` | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | yes | yes | yes | no | `sensitive_context_escalated` |
| `benefits.gov` | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | yes | yes | yes | no | `sensitive_context_escalated` |
| `target.com` | 5 | N/A | 5 | 5 | 5 | 5 | 4 | 5 | yes | yes | yes | no | `evidence_shape_confirmed` |
| `cloudflare.com` | 5 | N/A | 5 | 5 | 5 | 5 | 4 | 5 | yes | yes | yes | no | `evidence_shape_confirmed` |

### Average Scores

| Metric | Average score |
|---|---:|
| Queue lane clarity | 5.0 |
| Sensitive-context clarity | 5.0 |
| Evidence grouping clarity | 4.7 |
| Top-N excerpt usefulness | 4.3 |
| Unresolved-ref summary clarity | 5.0 |
| Redaction-warning clarity | 4.9 |
| Confidence/directness usefulness | 3.9 |
| Family context usefulness | 4.8 |

### Artifact Notes

| Artifact | Notes | Reviewer action |
|---|---|---|
| `weather.com` | Queue lane and evidence grouping are understandable. The top-N view makes the packet triageable, but 8,207 unresolved refs and 108 groups make first-pass full evidence adjudication incomplete from Markdown alone. JSON or upstream inspection is needed for exhaustive review. | `needs_more_evidence` |
| `segment.com` | All three families are visible. Warning categories clearly separate displayed-with-redaction source refs from fail-closed unresolved evidence. Top-N groups are enough for first-pass review. | `evidence_shape_confirmed` |
| `plannedparenthood.org` | Sensitive-context category is clear. The packet shows grouped pre-consent tracking, cookie/storage, and Hotjar behavioral analytics evidence shape. Escalation is appropriate because of context, not because the item is promoted. | `sensitive_context_escalated` |
| `greenhouse.com` | Employment / HR context is clear. Source-ref groups and cookie/storage groups are understandable. Upstream inspection is still useful because unresolved refs remain high relative to resolved excerpts. | `sensitive_context_escalated` |
| `hotjar.com` | Behavioral analytics reference category is clear. Session replay / behavioral analytics grouping is strong enough for first-pass review, with visible Hotjar source-ref and runtime groups. | `sensitive_context_escalated` |
| `healthline.com` | Health context is clear. Grouping across tracking, cookie/storage, and behavioral analytics is usable. Top-N groups are representative enough for first-pass review. | `sensitive_context_escalated` |
| `bankofamerica.com` | Compact finance packet. Resolved evidence and unresolved-ref summaries are small enough for first-pass full evidence review from the preview packet. | `sensitive_context_escalated` |
| `benefits.gov` | Compact public-benefits packet. Queue lane, sensitive label, warning categories, and evidence groups are understandable. | `sensitive_context_escalated` |
| `target.com` | Strong standard-lane example with all three families. Top-N groups show tracking, cookie/storage, and FullStory behavioral analytics shape clearly. | `evidence_shape_confirmed` |
| `cloudflare.com` | Compact standard-lane example. Evidence groups and warning summaries are clear, and diagnostic context remains separated enough for reviewer triage. | `evidence_shape_confirmed` |

### Reviewer Notes Summary

What was confusing:

- Confidence/directness is useful, but less visible in the Markdown summaries than queue lane, family, grouping, and warning data. Reviewers may need JSON for confidence/directness detail.
- High-volume packets can look more severe than they are because unresolved counts are large. The fail-closed labels help, but reviewers need the instruction text nearby.

Were any warnings too noisy?

- No. Categorized warning rows are much less noisy than flat warning lists.
- `source_ref_url_redacted`, `ambiguous_lineage_fail_closed`, and `evidence_not_found_fail_closed` are understandable labels.

Did unresolved refs block review?

- Not for queue triage.
- Not for evidence-shape adjudication.
- They blocked first-pass full evidence adjudication for `weather.com` and created mild review friction for `greenhouse.com`.

Were top-N groups representative enough?

- Yes for compact and moderate packets.
- Yes for first-pass high-volume triage.
- No for exhaustive high-volume adjudication without JSON or upstream inspection.

Were sensitive-context labels sufficient?

- Yes. The labels were clear and routed the review correctly.
- Sensitive context should remain review metadata only.

Should any artifact remain internal-only indefinitely?

- Sensitive-context artifacts should remain internal-only until policy owners define stricter copy, evidence, and review workflow requirements.
- High-volume artifacts should remain internal-only until reviewers agree that unresolved-ref handling is acceptable or excerpt retention is improved.

What would be needed before any future production proposal?

- Policy-owner approval of sensitive-context handling.
- Clear copy-policy rules.
- A reviewer workflow for sensitive-context escalation.
- A decision on whether high-volume unresolved refs require upstream excerpt-retention tuning.
- Better Markdown visibility for confidence/directness or a standard instruction to open JSON for those fields.

### Blocker List

| Artifact | Blocker | Severity | Recommended fix |
|---|---|---|---|
| `weather.com` | High unresolved-ref volume prevents first-pass full evidence adjudication from Markdown alone. | Medium | Keep grouped preview for triage; tune upstream excerpt retention only if human reviewers confirm this blocks adjudication. |
| `greenhouse.com` | Unresolved-ref volume is high enough that final confidence may require upstream inspection. | Low | Keep in trial; note that sensitive-context review may need JSON/upstream inspection before final reviewer action. |
| All packets | Confidence/directness is not prominent in Markdown. | Low | Either document that reviewers should open JSON for confidence/directness, or add a compact Markdown summary in a later artifact-only refinement. |

### Completed Decision

| Option | Selected? | Notes |
|---|---|---|
| A. Proceed with grouped preview as internal reviewer workflow. | yes | Recommended for a small human reviewer trial. |
| B. Tune upstream excerpt retention. | conditional | Do this only if human reviewers report that high-volume unresolved refs block adjudication. |
| C. Add more grouping/filtering. | no | Defer until reviewers identify concrete filter needs. |
| D. Add admin UI later. | no | Artifact workflow should be validated first. |
| E. Stop before production proposal. | no | No production proposal is approved here, but the internal reviewer workflow is usable enough to continue. |

### Completed Trial Assessment

| Question | Answer |
|---|---|
| Can reviewers understand the queue lane? | Yes. Queue lanes are clear across standard and sensitive-context samples. |
| Can reviewers understand the evidence grouping? | Yes. Group labels are readable and make the evidence shape much easier to review. |
| Are top-N excerpts enough for first-pass review? | Yes for compact and moderate packets; enough for high-volume triage but not exhaustive high-volume review. |
| Are unresolved refs and redaction warnings clear? | Yes. Reason and disposition labels are understandable. |
| Can reviewers make a queue triage decision? | Yes for all sampled artifacts. |
| Can reviewers make an evidence-shape decision? | Yes for all sampled artifacts. |
| Can reviewers make a first-pass full evidence decision? | Yes for 9 of 10 sampled artifacts; `weather.com` needs additional inspection. |

Recommended next action: proceed with grouped preview as the internal reviewer workflow for a small human reviewer trial. Do not tune upstream excerpt retention unless human reviewers report that unresolved refs block adjudication.

## Explicit Non-Goals

- no code changes
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
