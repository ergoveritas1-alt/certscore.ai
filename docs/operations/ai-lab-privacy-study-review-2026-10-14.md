# AI Lab Privacy Leaderboard review pass: October 14, 2026

Owner-requested review of:
https://certscore.ai/insights/ai-lab-privacy-leaderboard-2026

## Scope

- Restore the supplied GDPR/ePrivacy sentence at the specified location in finding 02.
- Add the four supplied Key findings bullets immediately below the introduction.
- Add five FAQ answers, each 40 to 60 words, after Run your own. Visible answers
  and FAQPage JSON-LD share one source; Article JSON-LD is also included.
  The owner subsequently requested clarification that readers can run the same
  type of scan manually in their browser at certscore.ai; the MCP Light answer
  now makes that distinction without promising identical results across visits.
- Bound the Hugging Face FAQ ranking explicitly to CertScore.ai MCP Light scans
  on October 12, 2026, following the owner's attribution request.
- Add the supplied scanner CTA and the MCP Light documentation link. Preserve
  the existing scanner, report and contact links.
- Place Perplexity's not-scored status before its unchanged coverage explanation.
- Apply the exact requested title and description; retain the canonical URL and
  complete Open Graph/Twitter metadata. At the owner's subsequent request, add
  a dedicated 1200 by 630 leaderboard card at /images/ai-leaderboard-social-card.png
  and the exact page-only sharing title; site-wide defaults remain unchanged.
- Add a direct Research link from the homepage. The existing Insights index
  already links to the paper and remains unchanged.

## Preservation and verification

Baseline: `4af048677b7e0c12fe1c52a5626f2d17bf65a12a`.

Local checklist verification confirmed that the nine scored leaderboard rows,
Methodology, HTTP cross-check and Reading the results are identical to baseline.
All twenty report anchors, covering the ten original report URLs, remain exact;
all other existing links are preserved. Finding text is unchanged apart from the
owner-supplied sentence. No scoring, finding policy, scan runtime or evidence
projection code changes are included.

The title and description match the request exactly. Both schemas parse as JSON,
and FAQPage questions/answers match the visible content. FAQ answer word counts
are 52, 52, 51, 50 and 52. The four summary bullets match the supplied wording.
The HTML contains zero em dashes. Local desktop (1280 px) and mobile (390 px)
checks showed no horizontal overflow; the CTA and FAQ were visually inspected.

The exact-source readiness gate, AWS workflow result, live revision and final
render/content checklist are retained with the review execution artifacts under
`outputs/ai-privacy-paper-review-2026-10-14/` in the primary checkout. Publication
is verified only after the repository-controlled public-web AWS workflow succeeds
and the live host serves the expected commit.

## Cost estimate

The extra static text, JSON-LD and leaderboard PNG use existing AWS capacity and add no service,
scan, model call or retention setting. Estimated incremental transfer/storage is
below $0.01/month at 10,000 page views, disclosed before implementation and below
the $1/month pre-approved threshold. Existing deployment CI applies.
