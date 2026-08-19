# Product analytics

CertScore uses first-party analytics to understand product usage and improve reliability. Users can opt out at any time.

We record limited structured events such as pages, actions, forms, scans, reports, performance, and errors. Events may include normalized routes, coarse technical context, opaque session/actor IDs, and a canonical scan ID.

Scan evidence stays in the canonical scan system. We do not record passwords, tokens, keystrokes, form contents, arbitrary page text, payment information, precise persistent location, raw IP addresses, or session replay recordings.

Opting out stops linkable journey events and clears browser analytics identifiers. Essential security, service, scan, API, MCP, and reliability telemetry may continue. Optional Google analytics requires approval.

Raw events target 90-day retention. The admin dashboard is `/app/admin/analytics`; it shows activity, sessions, actors, routes, features, outcomes, and recent events. It does not measure off-site impressions or searches that never reach CertScore.
