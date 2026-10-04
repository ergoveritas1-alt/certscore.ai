# Public launch measurement

Scope: consented acquisition and conversion measurement on public CertScore pages.
No extra scanner invocation, lane, model call, database schema or paid service is added.
Expected incremental recurring cost: under $0.01/month at 10,000 launch visits from
small text/parameter additions; no new analytics destination. Existing event
volume may recover previously missed consented landing events.

## Attribution contract

- Campaign storage requires analytics consent. Before consent, current URL fields
  may remain in the URL but are not persisted by the attribution helper.
- Upon consent, capture the current landing only; do not replay browsing history.
- First touch expires after 30 days; current-tab session attribution expires after
  30 minutes without a capture/navigation. Incoming campaigns replace the whole
  session field set. They never fill missing fields from another campaign.
- Opt-out clears campaigns and their landing/domain milestone bookkeeping.
- Optional GA and Umami events remain consent-gated. Existing operational
  aggregate measurement remains separate.
- Release/study scan events retain page_type, content_id and cta_location through
  canonical completion. No target URL or report ID is included in this context.
- Scan started means a fresh accepted scan, not a button click. Shared/reused/sample
  reports do not count as conversions. Completion consumes the matching journey once.

## GA4 setup and verification (requires property access)

The code does not configure GA4 property settings. In the production property:
1. Check the web stream is G-B6TQVX35ZB. Review the screenshot's data-quality warning
   in GA4 itself; the screenshot cannot explain its cause.
2. Register event-scoped custom dimensions for scan_source, page_type, content_id,
   cta_location, utm_source, utm_medium, utm_campaign and utm_content as needed.
   UTM event parameters are flat; GA's standard session attribution is separate.
3. Use scan_completed and registration_completed as candidate key events. Keep
   scan_started as a funnel step. Do not mark lead_form_submit_attempted,
   generic form_submitted, clicks, or page views as successful leads.
4. Successful-lead GA measurement is not currently wired: the contact/monitor
   actions redirect after success. Add a server-confirmed, single-use success
   receipt before configuring a successful-lead key event; a thank-you page
   view alone is insufficient proof. Do not send email/message/form values.
5. In a separate test property or local mocked collector, verify direct landing,
   client-side navigation, initial denial, later grant, revocation, two successive
   campaigns, fresh scan acceptance, failure, reused report and repeat completion.
6. Confirm one intended page_view per direct load and SPA navigation in DebugView;
   verify enhanced-measurement history settings before adding manual page views.
7. Confirm internal/test traffic filters, unwanted OAuth referrals, retention,
   and which events are actually marked key events. Do not infer these from code.

No production scans, lead submissions or registration records are needed for
local verification. Do not send synthetic conversions to production GA4.

## Campaign URLs

Use the study URL for research posts, with:
- LinkedIn: utm_source=linkedin&utm_medium=organic_social&utm_campaign=session_replay_2026&utm_content=study_launch
- X: utm_source=x&utm_medium=organic_social&utm_campaign=session_replay_2026&utm_content=study_launch

Do not add UTMs to internal links; those should not start a new campaign.

## Discovery release checks

Run `pnpm exec tsx scripts/sync-public-discovery.ts`, then run it with `--check`.
Both llms files use the release registry, shared positioning, and research link.
Keep editorial dateModified tied to actual substantive changes. Verify canonical
URLs, sitemap, RSS, internal links and visible copy after deployment. Inspect new
URLs in Search Console and verify crawler access from actual logs; a robots allow
rule and HTTP 200 do not establish indexing or rankings.
