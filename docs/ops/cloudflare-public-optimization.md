# Cloudflare public-site optimization

Reviewed and applied October 4, 2026 (Europe/Paris).

## Applied configuration

Enabled Smart Tiered Cache for the certscore.ai zone using the existing Free
plan. Expected incremental recurring cost: $0/month. This consolidates requests
for already-cacheable assets through upper-tier caches. No cache eligibility,
TTL, authentication, WAF, crawler policy, Worker route or paid subscription was
changed. AWS remains the application origin.

The dashboard confirmed the enabled switch and Smart Tiered Cache topology,
with SJC/LAX shown for the current origins. No manual region hint was needed.
Rollback: Caching → Tiered Cache → turn off Tiered Cache Topology.

## Findings and decisions

- AI Crawl Control crawler block switches were off, including BingBot,
  Googlebot, OAI-SearchBot, Claude-SearchBot and PerplexityBot. Seven-day
  successful request counts included Bing 2.65k, Google 997 and OpenAI Search
  605. These are dashboard classifications, not an independent identity audit.
- The 24-hour crawler status distribution showed 74 HTTP 400, seven 401, one
  403 and 84 HTTP 404 responses. Prominent failed paths included MCP endpoints
  on mcp.certscore.ai and nonexistent probe paths. Unsuccessful requests are
  not equivalent to Cloudflare blocks of public editorial content.
- The earlier Python homepage request was found in Security Events at
  09:30:52 GMT+2: Browser Integrity Check blocked Python-urllib/3.14, Ray ID
  a4527bd30ff4d0aa. No search-crawler exception is justified by this event.
- certscore-proxy has only its workers.dev address, no custom domains or
  routes, and zero invocations in the displayed 24-hour window. It does not
  currently route the public website. It was preserved.
- HTTP/2, HTTP/3, HTTP/2 to origin and TLS 1.3 were enabled; Brotli was verified
  on the live study response. No extra performance product was purchased.
- No Cache Rules or legacy Page Rules were configured. Public HTML retains
  origin/Next.js caching. Broad HTML edge caching was not introduced: it needs
  explicit Next.js variant handling and deployment invalidation before rollout.

## Verification and limits

After activation, the homepage and study returned HTTP 200 with Cloudflare
DYNAMIC status. The version endpoint remained DYNAMIC with no-store; the
unauthenticated app request resolved to a response with private/no-cache/no-store
headers. The release image returned HTTP 200 and retained its public four-hour
cache policy. No production scans, accounts or lead submissions were created.

Configuration activation is verified; an improvement in real-user latency or
cache hit ratio requires a later traffic comparison. Compare cacheable-asset
origin requests and cache hit ratios over comparable periods, not the whole-zone
ratio dominated by dynamic application/API traffic. No scheduled monitor was added.

References:
- https://developers.cloudflare.com/cache/how-to/tiered-cache/
- https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/
- https://nextjs.org/docs/app/guides/cdn-caching
