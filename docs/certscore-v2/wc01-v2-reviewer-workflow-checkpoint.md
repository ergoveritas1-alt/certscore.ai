# WC01 v2 Reviewer Workflow Checkpoint

Internal checkpoint only. Not customer-facing report output.

## Source

- `docs/certscore-v2/wc01-v2-human-reviewer-trial-packet.md`

## What Was Validated

The completed reviewer trial validated whether grouped `Wc01V2EvidencePreviewPacket` artifacts are usable for internal reviewer workflow.

Validated areas:

- queue lane clarity
- sensitive-context routing
- representative evidence grouping
- top-N excerpt/source-ref summaries
- unresolved-ref reason summaries
- redaction warning categories
- queue triage usability
- evidence-shape adjudication usability
- first-pass full evidence review usability

The trial did not evaluate legal compliance and did not approve any customer-facing output.

## Trial Scope

| Metric | Count |
|---|---:|
| Evidence preview packets | 10 |
| Queue items | 25 |
| Representative evidence groups | 406 |
| Resolved bounded excerpts | 239 |
| Resolved source refs | 4,104 |
| Unresolved refs | 14,261 |
| Warning entries | 57 |
| Sensitive-context queue items | 15 |

Sample coverage included standard, sensitive-context, high-volume publisher/adtech, health, reproductive health, finance, public benefits, employment / HR, behavioral analytics reference, ecommerce, and compact SaaS examples.

## Key Scores

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

## Key Findings

Grouped preview artifacts are ready for internal queue triage.

Evidence grouping is understandable. Reviewers can see the candidate family, evidence kind, source host, unresolved-ref reason, and representative excerpt/source-ref shape without scanning a flat list.

Top-N summaries are enough for compact and moderate packets. They are also enough for high-volume triage, but not always enough for exhaustive high-volume adjudication.

Unresolved refs and redaction warnings are clear. Reason and disposition labels such as `excerpt_id_not_found`, `ambiguous_lineage`, `evidence_not_found_fail_closed`, and `source_ref_url_redacted` are understandable.

Queue triage and evidence-shape decisions were possible for all sampled artifacts.

First-pass full evidence decisions were possible for 9 of 10 sampled artifacts. `weather.com` still requires JSON or upstream artifact inspection because of high unresolved-ref volume.

## What Is Ready

- grouped preview artifacts as the internal reviewer workflow input
- queue triage from Markdown summaries
- evidence-shape adjudication from Markdown summaries
- sensitive-context routing for internal review
- redaction and unresolved-ref explanations for reviewer use
- JSON fallback for full safe grouped detail

## What Remains Limited

- high-volume packets may require JSON or upstream artifact inspection for exhaustive adjudication
- confidence/directness is less prominent in Markdown than queue lane, family, grouping, and warning data
- upstream excerpt-retention tuning may be useful later, but only if human reviewers say unresolved refs block adjudication
- sensitive-context artifacts remain internal-only until policy owners define stricter copy, evidence, and workflow requirements

## Recommended Next Action

Proceed with grouped preview as the internal reviewer workflow for a small human reviewer trial.

Do not tune upstream excerpt retention unless human reviewers report that unresolved refs block adjudication.

Do not build admin UI, persistence, production integration, or customer-facing output yet.

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
- no legal conclusions
- no changes to `apps/web/components/scans/shared-scan-detail-view.tsx`
