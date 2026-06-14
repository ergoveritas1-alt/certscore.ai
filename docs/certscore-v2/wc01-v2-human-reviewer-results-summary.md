# WC01 v2 Human Reviewer Results Summary

Internal reviewer trial summary only. Not customer-facing report output.

## Executive Summary

The WC01 v2 grouped evidence preview workflow is usable for internal reviewer triage and evidence-shape review.

One reviewer completed the 10-artifact sample covering 25 queue items. All artifacts supported queue triage, and all artifacts supported evidence-shape review. Nine of ten artifacts supported first-pass full evidence review from the preview workflow.

`weather.com` remains the only blocker for first-pass full evidence review because high unresolved-ref volume requires JSON and upstream artifact inspection for exhaustive adjudication.

JSON was used mainly to confirm confidence/directness and high-volume evidence shape. The review did not assess legal compliance, approve customer-facing output, or approve production use.

Final decision: **A. Adopt grouped preview as the internal reviewer workflow.**

Conditional follow-up: **B. Tune upstream excerpt retention only if additional human reviewers report unresolved refs block adjudication on high-volume packets.**

## Reviewer Scope

| Metric | Count |
|---|---:|
| Reviewers | 1 |
| Artifacts reviewed | 10 |
| Queue items reviewed | 25 |
| Artifacts supporting queue triage | 10 |
| Artifacts supporting evidence-shape review | 10 |
| Artifacts supporting first-pass full evidence review | 9 |
| Artifacts requiring upstream inspection for full evidence adjudication | 1 |

Artifacts reviewed:

- `weather.com`
- `segment.com`
- `plannedparenthood.org`
- `greenhouse.com`
- `hotjar.com`
- `healthline.com`
- `bankofamerica.com`
- `benefits.gov`
- `target.com`
- `cloudflare.com`

## Average Scores

| Metric | Average score | Lowest score | Notes |
|---|---:|---:|---|
| Queue lane clarity | 5.0 | 5 | Queue lanes were clear for all artifacts. |
| Sensitive-context clarity | 5.0 | 5 | Sensitive-context labels were clear where applicable. |
| Evidence grouping clarity | 4.7 | 4 | Grouping was usable for all artifacts; high-volume packets had more reviewer friction. |
| Top-N excerpt usefulness | 4.3 | 3 | Top-N was sufficient for compact/moderate packets and high-volume triage, but not exhaustive high-volume review. |
| Unresolved-ref summary clarity | 5.0 | 5 | Reason summaries were clear. |
| Redaction-warning clarity | 4.9 | 4 | Warning categories were understandable and not too noisy. |
| Confidence/directness usefulness | 4.0 | 4 | Useful, but JSON was needed to confirm these fields. |
| Family context usefulness | 4.8 | 4 | Candidate family context was clear. |

## Artifact-Level Decision Table

| Artifact | Queue triage? | Evidence-shape review? | First-pass full evidence review? | Needed JSON? | Needed upstream inspection? | Reviewer action | Notes |
|---|---|---|---|---|---|---|---|
| `weather.com` | yes | yes | no | yes | yes | `needs_more_evidence` | High-volume packet. Grouping is triageable, but unresolved refs dominate the packet. |
| `segment.com` | yes | yes | yes | yes | no | `evidence_shape_confirmed` | All three families are visible; warning categories are clear. |
| `plannedparenthood.org` | yes | yes | yes | yes | no | `sensitive_context_escalated` | Reproductive-health routing is clear; escalation is context-driven only. |
| `greenhouse.com` | yes | yes | yes | yes | yes | `sensitive_context_escalated` | Employment / HR routing is clear; high unresolved volume may warrant upstream inspection for final confidence. |
| `hotjar.com` | yes | yes | yes | yes | no | `sensitive_context_escalated` | Behavioral analytics reference lane and session replay grouping are clear. |
| `healthline.com` | yes | yes | yes | yes | no | `sensitive_context_escalated` | Health context and family grouping are clear. |
| `bankofamerica.com` | yes | yes | yes | yes | no | `sensitive_context_escalated` | Compact finance packet; Markdown is enough for first-pass review. |
| `benefits.gov` | yes | yes | yes | yes | no | `sensitive_context_escalated` | Compact public-benefits packet; grouping and warnings are understandable. |
| `target.com` | yes | yes | yes | yes | no | `evidence_shape_confirmed` | Standard-lane packet with all three families. |
| `cloudflare.com` | yes | yes | yes | yes | no | `evidence_shape_confirmed` | Compact standard-lane packet; diagnostic context remains separated. |

## Blocker List

| Artifact | Blocker | Severity | Recommended handling |
|---|---|---|---|
| `weather.com` | High unresolved-ref volume prevents first-pass full evidence review from the Markdown preview alone. | Medium | Keep grouped preview for triage and evidence-shape review. Tune upstream excerpt retention only if additional reviewers report this blocks adjudication. |
| `greenhouse.com` | Unresolved-ref volume may require upstream inspection for final confidence in a sensitive-context packet. | Low | Keep in reviewer workflow; record whether additional reviewers also need upstream inspection. |

## Sensitive-Context Observations

Sensitive-context routing worked for all applicable artifacts.

| Artifact | Sensitive context | Observation |
|---|---|---|
| `plannedparenthood.org` | reproductive health | Label was clear; reviewer action was context escalation. |
| `greenhouse.com` | employment / HR | Label was clear; unresolved volume may require extra inspection. |
| `hotjar.com` | behavioral analytics reference | Label and session replay / behavioral analytics grouping were clear. |
| `healthline.com` | health | Label and grouped evidence shape were clear. |
| `bankofamerica.com` | finance | Compact packet supported first-pass review. |
| `benefits.gov` | public benefits | Compact packet supported first-pass review. |

Sensitive context should remain review metadata only. It should not create customer-facing output or production approval.

## High-Volume Unresolved-Ref Observations

Unresolved-ref summaries were clear across the sample.

High unresolved-ref volume did not block queue triage or evidence-shape review. It did block first-pass full evidence review for `weather.com`.

`greenhouse.com` did support first-pass full evidence review, but upstream inspection may still be useful because unresolved volume is high and the packet is sensitive-context routed.

JSON was useful for confirming confidence/directness and high-volume packet shape. Upstream artifact inspection should remain exceptional and should be recorded when needed.

## Final Decision

Selected: **A. Adopt grouped preview as the internal reviewer workflow.**

The grouped preview workflow is ready for internal reviewer use across queue triage and evidence-shape review.

Conditional follow-up: **B. Tune upstream excerpt retention only if additional human reviewers report unresolved refs block adjudication on high-volume packets.**

Do not recommend admin UI yet.

Do not recommend production integration yet.

Do not recommend moving bounded excerpt text into reviewer packets.

## Boundaries

This summary does not approve:

- legal compliance conclusions
- customer-facing output
- production integration
- app UI
- persistence
- production concern policy calls
- persisted normalized concerns
- unified findings
- report/checklist/executive/top-finding/scoring/regulatory-lens output
- forbidden gap-status mapping
