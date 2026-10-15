# AI Lab Privacy Leaderboard publication — October 14, 2026

Owner request: publish the existing Muse paper on certscore.ai and provide an accessible URL.

Public URL: https://certscore.ai/insights/ai-lab-privacy-leaderboard-2026

Original: https://muse.ai/s/ai-lab-privacy-leaderboard-xhxr5xtxvxexh9xah7

The self-contained static document preserves the original October 12 rankings, observed findings, methodology,
validation limits and ten distinct retained scan-report links. Its canonical and sharing metadata point to certscore.ai. It uses the
existing local social image and favicon, removes the Google Fonts import, and
fixes wrapping of the report link in desktop leaderboard rows. No Muse frame,
remote font, script, authentication or new scanner run is required to read it.
The Insights index and sitemap link to the article.

The captured original document SHA-256 (including its doctype) is
`8ff92c3f05c540e69fd0a862d4d5fa4e32f29f786f48d5d7293fd011e2380364`.
Article-body equality and ten original report links were checked for the initial
copy. The owner then requested removal of em dashes and formulaic wording.
The final copy uses a shorter factual headline, removes stock phrases and an
unsupported comparison of company openness, labels the original HTTP check
without implying an independent reviewer, and uses the existing public support
address. Counts, scores, report links, scan location, date, coverage and validation
limits remain unchanged. No em or en dashes remain in the document or sharing
metadata.
This republication does not independently validate the historical scan findings
or run the original cross-checks again.

Deployment uses the repository-controlled public-web AWS ECS workflow, from an
isolated checkout descended from the live revision
`94399fef7c45f348ef27da535198f783670f61f2`. Scanner, validation and infrastructure
changes are outside this release.

## Cost estimate

No new service, capacity, model call, scan or retention policy. Approximately
29 KB of static HTML per page view: 10,000 monthly views transfer about 0.29 GB
before compression. Expected incremental storage/serving cost is under
$0.10/month at that volume using existing capacity (and under the $1/month
pre-approved threshold). This estimate was disclosed before implementation;
actual transfer depends on traffic and caching. Existing deployment CI applies.

## Verification

- Frozen-lockfile install and workspace dependency builds passed.
- Local route returned the complete article without login or third-party runtime dependencies.
- Browser inspection confirmed readable article and leaderboard, no desktop overflow,
  correct canonical URL, and twenty report anchors covering the ten original reports.
- A retained headline-case report returned HTTP 200 without authentication.
- Required change-aware readiness checks and exact-revision production checks are
  recorded in the release execution logs; a planned URL alone does not prove deployment.
