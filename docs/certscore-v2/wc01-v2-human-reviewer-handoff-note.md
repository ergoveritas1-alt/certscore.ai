# WC01 v2 Human Reviewer Handoff Note

Internal reviewer trial only. Not customer-facing report output.

## Purpose

This is an internal evidence-preview usability trial for the WC01 v2 grouped evidence preview workflow.

The goal is to confirm whether a human reviewer can use grouped preview artifacts for:

- queue triage
- evidence-shape review
- first-pass evidence adjudication

## Reviewer Steps

1. Start with `docs/certscore-v2/wc01-v2-human-reviewer-instructions.md`.
2. Complete `docs/certscore-v2/wc01-v2-human-reviewer-scorecard-reviewer-2.md`.
3. Use the same 10-artifact sample listed in the scorecard.
4. Review each Markdown summary first.
5. Open JSON only when Markdown is not enough.
6. Record whether upstream artifact inspection would be needed.

## Review Boundaries

Do not assess legal compliance.

Do not approve customer-facing output.

Do not approve production integration.

Do not approve app UI, persistence, production concern policy calls, persisted normalized concerns, unified findings, or report/checklist/executive/scoring/regulatory output.

Do not map anything to the forbidden gap status.

## Evidence Handling Notes

Unresolved refs are fail-closed. They indicate evidence pointers that were not safely displayed, not evidence promotion.

Redaction warnings explain safe display behavior. They should help reviewers understand whether evidence was displayed with redaction or omitted fail-closed.

Sensitive context is review routing metadata only. It increases internal review requirements but does not create production approval, customer-facing output, or stronger findings.

## Expected Output

Return the completed reviewer-2 scorecard with one row filled for each artifact:

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

After reviewer-2 is complete, compare results using `docs/certscore-v2/wc01-v2-human-reviewer-multi-reviewer-plan.md`.
