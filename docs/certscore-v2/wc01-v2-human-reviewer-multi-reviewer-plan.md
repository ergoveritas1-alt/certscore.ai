# WC01 v2 Multi-Reviewer Plan

Internal reviewer trial plan only. Not customer-facing report output.

## Goal

Run the same grouped evidence preview reviewer workflow with 2-3 total reviewers before designing persistence, reviewer decision storage, admin UI, or production integration.

Current state:

- Reviewer 1 completed `docs/certscore-v2/wc01-v2-human-reviewer-scorecard.md`.
- Reviewer 2 should complete `docs/certscore-v2/wc01-v2-human-reviewer-scorecard-reviewer-2.md`.
- A third reviewer is optional if reviewer 1 and reviewer 2 disagree on key workflow usability questions.

## Reviewer Count Target

Target: 2-3 total reviewers.

Minimum for next decision: 2 completed scorecards.

Use a third reviewer when:

- reviewer 1 and reviewer 2 disagree on whether high-volume packets are blocked
- reviewer 1 and reviewer 2 disagree on sensitive-context routing clarity
- reviewer 1 and reviewer 2 disagree on whether queue triage or evidence-shape review is possible
- one reviewer consistently needs upstream artifact inspection and another does not

## How To Compare Results

Compare reviewer 1 and reviewer 2 by artifact and by metric.

For each artifact, compare:

- queue lane clarity score
- sensitive-context clarity score
- evidence grouping clarity score
- top-N excerpt usefulness score
- unresolved-ref summary clarity score
- redaction-warning clarity score
- confidence/directness usefulness score
- family context usefulness score
- queue triage yes/no
- evidence-shape decision yes/no
- first-pass full evidence decision yes/no
- needed JSON inspection yes/no
- needed upstream artifact inspection yes/no
- selected reviewer action
- freeform notes

For aggregate comparison, calculate:

- average score per metric
- lowest score per metric
- number of artifacts where both reviewers answered yes for queue triage
- number of artifacts where both reviewers answered yes for evidence-shape review
- number of artifacts where both reviewers answered yes for first-pass full evidence review
- number of artifacts where either reviewer needed upstream artifact inspection
- artifacts where reviewer actions disagree

## Decision Thresholds

Choose **A. Adopt grouped preview as internal reviewer workflow** when:

- both reviewers agree all or most artifacts support queue triage
- both reviewers agree all or most artifacts support evidence-shape review
- unresolved refs do not block most reviews
- warning categories are understandable
- sensitive-context labels are understandable

Choose **B. Tune upstream excerpt retention** when:

- both reviewers flag `weather.com` as blocked by unresolved refs
- both reviewers flag another high-volume packet as blocked by unresolved refs
- high unresolved-ref volume prevents first-pass full evidence review across multiple artifacts
- reviewers need upstream artifact inspection primarily because top-N summaries omit too many relevant excerpts

Improve Markdown summaries before UI when:

- reviewers disagree mainly on confidence/directness visibility
- reviewers can make decisions only after opening JSON for fields that should be visible in Markdown
- reviewers understand evidence groups but cannot quickly see confidence/directness or family-specific context

Require policy-owner review before any production proposal when:

- reviewers disagree on sensitive-context routing
- reviewers disagree on whether sensitive-context artifacts should remain internal-only
- reviewers request stricter handling for health, reproductive health, finance, public benefits, employment / HR, or behavioral analytics reference packets

Defer admin UI and persistence when:

- grouped preview has not yet been validated by at least two reviewers
- reviewers still disagree on core workflow usability
- high-volume unresolved refs remain a blocker
- confidence/directness visibility needs Markdown refinement
- sensitive-context handling needs policy-owner review

## What Disagreement Means

Disagreement on queue triage means the workflow is not ready to adopt internally.

Disagreement on evidence-shape review means grouping or family context needs refinement.

Disagreement on first-pass full evidence review is acceptable for high-volume packets, but should be tracked.

Disagreement on confidence/directness visibility suggests Markdown should expose those fields more clearly before UI work.

Disagreement on sensitive-context routing requires policy-owner review before any production proposal.

Disagreement on whether upstream artifact inspection is needed should be analyzed by artifact, especially `weather.com`, `greenhouse.com`, `segment.com`, and `hotjar.com`.

## Recommended Default

Default next decision after reviewer 2: **A. Adopt grouped preview as internal reviewer workflow**, if reviewer 2 agrees that all or most artifacts support queue triage and evidence-shape review.

Conditional follow-up: **B. Tune upstream excerpt retention** only if reviewer 2 also reports unresolved refs block adjudication on high-volume packets.

Do not design admin UI yet.

Do not add persistence yet.

Do not pursue production integration yet.

## Boundaries

This plan does not approve:

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
