# WC01 v2 Human Reviewer Instructions

Internal reviewer trial only. Not customer-facing report output.

## Purpose

This trial evaluates whether grouped WC01 v2 evidence preview artifacts are usable for a small internal human reviewer workflow.

The trial asks reviewers to assess:

- whether queue lanes are understandable
- whether sensitive-context routing is clear
- whether evidence groups are useful
- whether top-N excerpts and source refs support first-pass review
- whether unresolved-ref summaries are understandable
- whether redaction warning categories are understandable
- whether reviewers can make queue triage and evidence-shape decisions

## What Reviewers Are Reviewing

Reviewers are reviewing grouped evidence preview artifacts generated from the internal WC01 v2 dry-run pipeline.

Each artifact includes:

- a Markdown summary with representative top-N evidence groups
- a JSON packet with the full safe grouped detail
- queue item family and lane
- sensitive-context labels when applicable
- representative evidence groups
- bounded excerpt/source-ref summaries
- unresolved-ref reason summaries
- redaction warning categories
- guardrail metadata confirming the artifact remains internal-only

Use the 10-artifact sample in the scorecard:

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

## What Reviewers Are Not Reviewing

Reviewers are not reviewing legal compliance.

Reviewers are not approving:

- customer-facing output
- production integration
- production concern policy behavior
- persisted normalized concerns
- unified findings
- report/checklist/executive/scoring/regulatory output
- any forbidden gap-status mapping

The review is only about internal evidence-review workflow usability.

## How To Review Each Artifact

1. Open the `Wc01V2EvidencePreviewPacket.summary.md` file first.
2. Read the header counts: queue items, resolved excerpts, resolved source refs, representative groups, unresolved refs, warning entries, and sensitive-context items.
3. Review the "Evidence By Queue Item" table to understand queue lane and candidate family shape.
4. Review "Representative Evidence Groups" to understand the major evidence groupings.
5. Review "Unresolved Evidence Ref Counts" to understand what was not displayed.
6. Review "Warning Category Counts" to understand redaction and fail-closed behavior.
7. Use the scorecard to rate clarity and usefulness.

## When To Open JSON

Open the matching `Wc01V2EvidencePreviewPacket.json` when:

- the Markdown top-N view is not enough to understand the evidence shape
- the artifact has many omitted groups
- confidence/directness is not clear from Markdown
- you need more safe grouped detail before selecting a reviewer action
- a high-volume packet has many unresolved refs

Do not open upstream artifacts unless the scorecard asks whether upstream inspection was needed. If upstream inspection would be required, mark that need rather than performing a broader review.

## How To Treat Unresolved Refs

Unresolved refs are fail-closed.

They mean a referenced evidence pointer was not displayed because it could not be safely resolved, could not establish clean lineage, or could not find the referenced excerpt.

Unresolved refs should:

- reduce confidence in full evidence adjudication when high-volume
- be treated as review friction
- be recorded in notes if they block review

Unresolved refs should not:

- be treated as displayed evidence
- promote an item
- be treated as proof of anything beyond a missing or omitted safe preview reference

## How To Treat Redaction Warnings

Redaction warnings explain safe display behavior.

Use these categories as reviewer signals:

- `source_ref_url_redacted`: a source ref was displayed with sensitive parts redacted
- `evidence_not_found_fail_closed`: an excerpt ID could not be displayed
- `ambiguous_lineage_fail_closed`: lineage was unclear, so the evidence was omitted

Use disposition labels this way:

- `displayed_with_redaction`: safe bounded evidence was displayed after redaction
- `omitted_fail_closed`: evidence was not displayed and should not be used for promotion

## How To Treat Sensitive Context

Sensitive context increases review requirements only.

Sensitive-context labels should help route internal review, especially for:

- health
- reproductive health
- finance
- public benefits
- employment / HR
- behavioral analytics reference sites

Sensitive context does not create production eligibility, customer-facing output, stronger findings, or any final status.

## How To Select Reviewer Actions

Choose one action per artifact:

| Action | Use when |
|---|---|
| `evidence_shape_confirmed` | The grouped preview is enough to understand why the item entered internal review. |
| `needs_more_evidence` | The preview is not enough for evidence-shape or first-pass full evidence review. |
| `internal_only` | The item should remain internal-only even if evidence shape is understandable. |
| `policy_copy_review_required` | Evidence shape is understandable, but future language would require policy/copy review. |
| `sensitive_context_escalated` | Sensitive context requires stricter review or routing. |
| `rejected_overbroad` | The item appears too broad for the current internal workflow shape. |

## Strict Boundaries

Do not draw legal compliance conclusions.

Do not approve customer-facing output.

Do not approve production integration.

Do not create or approve persisted reviewer decisions.

Do not treat this trial as production concern policy review.

Do not map anything to the forbidden gap status.

Do not change app UI, persistence, production behavior, report output, checklist output, executive output, scoring, regulatory output, or customer-facing copy.
