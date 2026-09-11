# Authenticated user activity

Authenticated `/app` activity is operational telemetry, independent of optional
analytics consent. The ingestion endpoint resolves the actor from the server
session; browser-provided actor IDs never establish authenticated identity.
Page/scan/report views, navigation, controls, forms, engagement, and errors use
the existing bounded event contract. Scan submissions and API/MCP actions retain
their existing server-side request records.

Opted-out public/marketing events remain anonymous. Operational events omit
optional actor/session IDs, campaign attribution, and entry-route attribution.
No form contents, credentials, or report contents are retained. The existing
90-day retention and platform-admin access checks apply. Historical anonymous
rows are not backfilled by inference.

Admin Users → User activity shows a paginated event timeline with timestamps,
actions, routes/controls, scan IDs and links, outcomes, and Browser/Server source.
The existing submissions and API summaries remain available. Admin Events search
also matches exact scan IDs.

Browser events are client-reported observations, attributed to the authenticated
sender; they are not proof that a server operation succeeded. Server layout
records describe requests, not confirmed views, and may include prefetches.
Browser navigation events cover soft navigation and cached back/forward visits;
initial authenticated loads retain the existing server request record. Delivery
retries reuse one event UUID for idempotent persistence. Browser delivery remains
best-effort (for example, a closed tab or blocked JavaScript can prevent it).

This change reuses existing invocations/event rows and 90-day retention. Added
identity/reference bytes, authentication lookups for opted-out app events, and
indexed admin timeline reads are estimated below $1/month at current traffic.
No new infrastructure, model calls, or retention extension is introduced.
