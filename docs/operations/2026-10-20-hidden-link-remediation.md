# CertScore.ai hidden-link remediation follow-up

## Change

The hidden-link finding fell through to generic review guidance. Add shared,
finding-specific instructions for canonical finding presentation and eligible
site-integrity panels. Existing PDF exports also use these instructions instead
of a stale persisted generic fix. No finding, eligibility, confidence, severity,
score or disclosure is changed.

The combined issue/remediation chapter includes each retained source URL,
destination hostname, occurrence reference, measured concealment and sanitized
DOM excerpt. The highlighted hiding element is identified without inventing a
unique selector, original URL path, link text, source file or line number.
Historical captures without code remain explicit about that limitation.

Webmaster guidance covers locating the anchor and hiding ancestor in Elements,
searching the page/CMS/template/theme/plugin/tag-manager source, tracing dynamic
insertion with a DOM breakpoint, removing unwanted links at their producer or
making intended navigation visible, investigating unexplained insertions
without asserting compromise, cache invalidation, and fresh-session desktop,
mobile, keyboard and re-scan checks. Destination pages need not be opened.

Only an already-reportable hidden-link issue receives this PDF action block.
Validated, scan-bound appendix evidence supplies its details. Raw appendix
observations cannot create or reopen a suppressed finding. Additional-page
evidence retains its own page provenance; repeated page/occurrence entries are
deduplicated. Appendix E points to the combined guidance instead of repeating
the long action text.

## Verification

- Re-export existing scan `4374b04f-1164-42cd-954b-105fc5872b86` from localhost;
  no new scan or model call. Authenticated PDF export is HTTP 200; anonymous is
  HTTP 401.
- Canonical JSON is identical to the previous 21-page export except the
  generation time and `/appendix/siteIntegrity/action` presentation copy.
  Score remains 28/100; policy coverage remains seven Observed rows of eleven;
  retained evidence and provenance are unchanged. Methodology/disclosure text
  matches the prior PDF after removing running footers and page numbering.
- The updated export has 22 pages. Hidden-link evidence, five fixes and
  verification steps stay together on page 5. Appendix C remains two pages,
  every appendix starts on a fresh page, and Accept/Reject results remain one
  consolidated section.
- 62 focused PDF/export/site-integrity tests pass. Web typecheck and
  `git diff --check` pass. The additional existing UI suite has five passes and
  one unrelated failure: its executive-overview assertion expects lowercase
  `score 100 out of 100`, while the existing component renders `Score`.
  No unrelated UI source or assertion is changed.
- Render all pages and check text bounds, overlaps and internal destinations.
  Receipts are saved with the updated PDF, including
  `hidden-link-remediation-verification.json` and `pdf-validation.json`.

No source publication or production deployment. The intentional canary link is
unchanged. Estimated incremental recurring cost: $0/month; no additional
browser lane, retained data, model usage, capacity or background work.
