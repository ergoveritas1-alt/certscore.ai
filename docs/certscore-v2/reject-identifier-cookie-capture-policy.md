# Bounded Reject identifier and exact cookie evidence

CertScore.ai fresh request producers use `measurement_request_evidence.v3` for
the exact Heap `/h`, HubSpot `__ptc.gif`/`__ptq.gif` collectors and Shopify
Monorail endpoints. Existing Google Analytics and Cloudflare profiles retain
their previous contracts. Heap `u` and HubSpot `vi` are persistent only when the
transmitted value hashes to one exact, scoped, unexpired, retained pre-action
cookie in the same session. Heap additionally requires the exact app-specific
cookie suffix to match request parameter `a`. Duplicate, missing, session-only,
partitioned, expired, mismatched or opaque identifiers stay unknown. Shopify's
mixed telemetry remains purpose-unresolved and cannot qualify by endpoint alone.

`certscore.cookie-purpose.v4` adds the exact numeric app-scoped Heap identity
cookie rule. Frozen v1/v2/v3 tables and retained classification objects preserve
their prior conclusions. Only fresh captures use v4; no historical evidence is
reclassified on read. No raw identifier, query, cookie value or body is retained.

`exact_cookie_write_evidence.v1` hashes exact name/domain/path/unpartitioned
identity and value from the existing main-document setter read or response
header callback. Partitioned, oversized, malformed, duplicate-scope, foreign-domain
and deletion assignments are omitted. Assignments and Set-Cookie headers are
observed attempts, with acceptance explicitly not independently verified.
Snapshot identity/value matches can corroborate retained state; they do not
invent missing writes or prove browser acceptance. Main-document setter proof
stays attached to its timed write; server evidence stays attached to its request.

The existing 48 measurement inspections, 16 pre-action allowance and 32 reserved
post-action inspections remain. Exact response-cookie records have the same
bounded 48/16/32 allowance, with at most 24 per response. The setter keeps its
192-record ring, 96-record readback and 48-row retained output. Existing
request, byte, observation, lane and publication deadlines remain unchanged.
There is no new browser read, API/model call, lane or wait beyond the existing
bounded inspector/header callbacks. Expected incremental bounded CPU/metadata
is below $0.75/month at 100,000 scans under existing retention.

Verified evidence still follows packet checksum verification -> typed assessment
-> normalized concern -> concern policy -> unified finding/checklist -> score.
The approved registration-independent request tiers remain 15/5/0. Cookie
presence and unconfirmed-click cookie writes alone remain neutral under the
existing policy. Customer reports show factual findings and resulting scores;
deduction details remain internal. Fresh local verification does not update
production reports or deploy scanner/report code.

Primary protocol references:

- [Heap user identity](https://developers.heap.io/docs/using-identify)
- [Heap public v4 SDK](https://cdn.heapanalytics.com/js/heap-351700210.js)
- [HubSpot visitor cookies](https://knowledge.hubspot.com/privacy-and-consent/what-cookies-does-hubspot-set-in-a-visitor-s-browser)
- [HubSpot public analytics SDK](https://js.hs-analytics.net/analytics/1792607400000/51490235.js)
- [Shopify Monorail metrics](https://github.com/Shopify/shopify-cli/wiki/Monorail-Metrics)

Supplier documentation establishes protocol meaning, never missing site evidence.
