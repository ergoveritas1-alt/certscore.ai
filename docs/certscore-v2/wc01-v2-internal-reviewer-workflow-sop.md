# WC01 v2 Internal Reviewer Workflow SOP

Internal SOP only. Not customer-facing report output.

## Workflow Status

Grouped evidence preview is adopted as the WC01 v2 internal reviewer workflow.

This workflow is:

- artifact-only
- internal-only
- non-persistent
- not production-approved
- not customer-facing

Reviewer decisions made through this workflow do not create persisted normalized concerns, unified findings, report rows, checklist rows, executive rows, scoring output, regulatory output, or customer-facing copy.

## Inputs

Standard inputs:

- `Wc01V2EvidencePreviewPacket.summary.md`
- `Wc01V2EvidencePreviewPacket.json`

Exceptional input:

- relevant upstream artifacts, only when the reviewer records that upstream inspection is needed

Use Markdown first. Use JSON when Markdown is not enough. Use upstream artifacts only as an exception.

## Standard Review Flow

1. Open `Wc01V2EvidencePreviewPacket.summary.md`.
2. Review the header counts:
   - queue items
   - resolved bounded excerpts
   - resolved source refs
   - representative groups
   - unresolved refs
   - warning entries
   - sensitive-context items
3. Review the queue lane for each queue item.
4. Review sensitive-context labels, if present.
5. Review representative evidence groups.
6. Review unresolved-ref summaries.
7. Review warning categories and display disposition.
8. Open `Wc01V2EvidencePreviewPacket.json` when needed for:
   - confidence/directness
   - omitted-group detail
   - high-volume packet shape
   - details not sufficiently clear in Markdown
9. Record whether upstream artifact inspection would be needed.
10. Select one reviewer action per artifact.

## Reviewer Actions

| Action | Use when |
|---|---|
| `evidence_shape_confirmed` | The grouped preview is enough to understand why the item entered internal review. |
| `needs_more_evidence` | The preview is not enough for evidence-shape review or first-pass full evidence adjudication. |
| `internal_only` | The item should remain internal-only even when the evidence shape is understandable. |
| `policy_copy_review_required` | Evidence shape is understandable, but future language would require policy/copy review. |
| `sensitive_context_escalated` | Sensitive context requires stricter internal review or policy/product routing. |
| `rejected_overbroad` | The item appears too broad for the current internal workflow shape. |

## High-Volume Handling

Use `weather.com` as the canonical high-volume stress case.

High unresolved-ref volume does not automatically block:

- queue triage
- evidence-shape review

High unresolved-ref volume may block:

- exhaustive first-pass full evidence adjudication
- reviewer confidence in high-volume packets

When high unresolved-ref volume blocks review:

1. Mark whether JSON was needed.
2. Mark whether upstream artifact inspection would be needed.
3. Select `needs_more_evidence` when the preview is not sufficient.
4. Record the blocker in reviewer notes.

Tune upstream excerpt retention only if repeated reviewer use shows unresolved refs block high-volume adjudication.

## Sensitive-Context Handling

Sensitive context is review routing metadata only.

Sensitive-context items remain internal-only until separate policy/copy review.

Sensitive context must not be used to infer:

- stronger findings
- customer-facing language
- production approval
- report/checklist/executive/scoring/regulatory output

Use `sensitive_context_escalated` when the artifact is understandable but context requires stricter internal routing.

## Escalation Rules

Escalate to a policy/product owner when:

- sensitive-context copy would be needed
- reviewer selects `rejected_overbroad`
- reviewer selects `needs_more_evidence` on multiple high-volume artifacts
- unresolved refs repeatedly block adjudication
- reviewer wants production/customer-facing output
- reviewer wants report/checklist/executive/scoring/regulatory output

Escalation does not approve production integration. It only records that policy/product review is needed before any future proposal.

## Explicit Non-Goals

- no legal compliance conclusions
- no customer-facing output
- no production integration
- no app UI
- no persistence
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no report/checklist/executive/top-finding/scoring/regulatory-lens output
- no forbidden gap-status mapping

## Next Deferred Decisions

These decisions remain deferred:

- upstream excerpt-retention tuning
- Markdown confidence/directness visibility improvement
- reviewer decision persistence
- admin UI
- production proposal

Deferred decisions should only be revisited after internal reviewer use produces concrete workflow needs.
