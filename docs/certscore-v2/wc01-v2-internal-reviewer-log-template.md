# WC01 v2 Internal Reviewer Log Template

Internal manual log only. Not customer-facing report output.

## Purpose

Use this template to manually record reviewer outcomes from the adopted WC01 v2 grouped evidence preview SOP.

This log is artifact-only and non-persistent. It does not create product state, report output, checklist output, executive output, scoring output, regulatory output, customer-facing copy, or production approval.

## Reviewer Log

| Date | Reviewer | Cohort | Site/domain | Artifact path | Queue item count | Reviewer action | Sensitive-context category | Markdown sufficient? yes/no | JSON opened? yes/no | Upstream inspection needed? yes/no | Unresolved refs blocked review? yes/no | Confidence/directness clear? yes/no | Escalation needed? yes/no | Escalation reason | Notes | Recommended follow-up |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

## Summary

| Metric | Count / notes |
|---|---|
| Total artifacts reviewed |  |
| Total needing JSON |  |
| Total needing upstream inspection |  |
| Total unresolved-ref blockers |  |
| Total sensitive-context escalations |  |
| Repeated blocker patterns |  |
| Should upstream excerpt retention be revisited? |  |

## Reviewer Action Reference

| Action | Use when |
|---|---|
| `evidence_shape_confirmed` | The grouped preview is enough to understand why the item entered internal review. |
| `needs_more_evidence` | The preview is not enough for evidence-shape review or first-pass full evidence adjudication. |
| `internal_only` | The item should remain internal-only even when the evidence shape is understandable. |
| `policy_copy_review_required` | Evidence shape is understandable, but future language would require policy/copy review. |
| `sensitive_context_escalated` | Sensitive context requires stricter internal review or policy/product routing. |
| `rejected_overbroad` | The item appears too broad for the current internal workflow shape. |

## Notes

Unresolved refs are fail-closed and should not be treated as evidence promotion.

Sensitive context is review routing metadata only.

Upstream inspection should be exceptional and recorded when needed.

Repeated high-volume unresolved-ref blockers are the main reason to revisit upstream excerpt retention.

## Boundaries

This log does not approve:

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
