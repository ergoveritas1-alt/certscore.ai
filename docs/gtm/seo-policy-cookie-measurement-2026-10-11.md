# Privacy-policy scanner and third-party cookie checker

## Change and evidence

The two existing pages now lead with a free page scan, a dated actual-report screenshot, and a concrete review procedure. The policy page walks through discovery, disclosure passages, runtime comparison and assignment/retesting. The cookie guide distinguishes site relationship from vendor identity, includes Chrome inspection steps with primary documentation, and explains how to investigate and retest captured activity. Related guides link back to these destinations. Canonicals and URLs are preserved; editorial modification dates describe this substantive edit.

Screenshots reuse the September 28 ErgoVeritas test report and unchanged public assets documented in `docs/homepage-feature-showcase.md`. These examples remain marketing snapshots, never scan inputs. No new scans, model calls, vendors, capacity, retention or finding/scoring behavior were added.

## Search baseline

Authenticated Search Console, Web search, September 12–October 9, 2026:

| Page | Clicks | Impressions | Average position |
| --- | ---: | ---: | ---: |
| `/solutions/privacy-policy-risk-scanner` | 1 | 22 | 21.6 |
| `/guides/third-party-cookie-checker` | 0 | 64 | 27.5 |

Compare the exact page/query groups with equal-length periods. Record the actual ECS release and current indexed crawl before treating a period as post-change. Aggregate ranking changes can reflect query mix. These small counts do not establish a causal lift.

## Product baseline and measurement

Read-only production query through the approved ECS psql one-off, captured October 11 Pacific / October 12 UTC. Machine-readable counts are in `seo-policy-cookie-baseline-2026-10-11.json`.

| Page | Browser views, Sep 13–Oct 10 | Linked fresh starts | Completed scans |
| --- | ---: | ---: | ---: |
| Privacy policy scanner | 9 | 0 | 0 |
| Third-party cookie checker | 9 | 0 | 0 |

Earlier period August 16–September 12: 11 policy-page views and three cookie-guide views; neither had a retained linked fresh start. These are all-channel, browser-confirmed visits, not unique people or Google clicks. Historical zero means no qualifying linked outcome was retained, not proof that every visitor was measurable.

GA/Umami `scan_started` and `scan_completed` now retain bounded `content_id` and `page_type` for guide and solution origins through the existing journey marker. Context storage and optional analytics still require consent. Opt-out, stale/mismatched journeys and inaccessible storage retain the existing fail-closed behavior. No new analytics events, identifiers or payload fields are introduced.

For organic outcomes, use GA4 **Session default channel group = Organic Search** and **Landing page** equal to either exact target route; compare sessions and `scan_completed`. Do not use the operational ingestion request's referrer as the visitor's search source. Use the existing Admin Events view to cross-check scan activity. Search Console and first-party telemetry have different coverage; do not divide their totals into a claimed conversion rate.

Review seven complete post-release days for early direction and 28 complete days for the primary comparison. Track clicks, impressions, fixed-query rankings, browser visits, fresh starts and canonical completions. If impressions rise but starts do not, inspect the scan journey; if exposure remains flat, revisit page/query fit and relevant independent references. Avoid broad rewrites based on a handful of visits.

## Verification and cost

Focused tests cover guide/solution attribution after report navigation, consent restrictions and deduplicated completion. Desktop and 390 px browser review confirmed functioning scan forms, loaded existing images and no page-level horizontal overflow. The existing analytics events provide ongoing measurement; no new dashboard is included.

Added static delivery are estimated below $0.01/month at current traffic, with no fixed-capacity change. The one-off baseline query is estimated below $0.01. Additional visitor-requested scans retain ordinary existing usage cost. Record release checks and actual live revision in the release receipt; a source commit alone is not a deployment.
