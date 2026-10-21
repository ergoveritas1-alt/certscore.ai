# CertScore.ai PDF issue/action and policy-summary revision

## Requested presentation changes

- Remove the review-area/count paragraph, status glossary, affected-page line
  and iframe caveat from the Top issues introduction.
- Combine Top issues and Remediation plan into one chapter. Each issue retains
  its observations, followed immediately by its owner, estimated effort, fixes
  and re-test instructions before the next issue begins.
- Limit the current canary's Appendix C to two pages of concise policy evidence.

## Implementation boundaries

The combined chapter consumes the same canonical review groups, observations
and action inputs. Cover and appendix links now target that chapter; the
separate Remediation plan bookmark is removed. Re-test instructions for
accessibility, policy and integrity issues are appropriate to those topics
rather than repeating pre-consent network checks.

Appendix C retains every transparency check and its existing status. A compact
matrix shows a shortened excerpt or coverage limitation, linked to a shared
policy source record. Repeated document ownership/retrieval metadata appears
once per source. Visible excerpts are explicitly shortened to at most 180
characters plus an ellipsis; full text, detailed checks and provenance remain
unchanged in the JSON workpaper. No status, finding, confidence or score is
recomputed by this presentation change.

The generic long-table regression remains on non-summary transport evidence.
Separate policy tests verify deliberate excerpt shortening, all row statuses,
source association and input immutability.

## Verification

Re-export the existing local scan
`4374b04f-1164-42cd-954b-105fc5872b86`, not a new scan. Compare its JSON with
`tmp/pdfs/combined-issues-baseline/report.json`, excluding only `generatedAt`.
The score remains 28/100 and policy coverage remains seven Observed rows of
eleven. Verify Appendix C ends before Appendix D after no more than two pages,
all seven appendices start on new pages, every finding precedes its associated
action block, and all internal links resolve. Render all pages for visual QA.

Focused renderer, policy summary, frontmatter, evidence/export, safety,
timezone, choice-path and visual-binding tests pass (49 tests). Web typecheck
and `git diff --check` pass. Final artifact validation is recorded beside the
PDF in `combined-issues-verification.json` and `pdf-validation.json`.

No canary publication, new scan, model call, infrastructure change or recurring
cost increase is introduced. Estimated incremental recurring cost: $0/month.
