# Local CMP API, SDK and MCP parity

Verified October 16, 2026 using retained EU-Ireland scans. No new public scans,
external network requests, database writes, report regeneration, deployment,
package publication or Options/Customise actions were performed.

## Supported fixes

The canonical internal CMP inventory accepts `cmp_loaded_inventory`, but the
public Detailed Evidence schema omitted it from both service and declaration
sources. Cookiebot's retained passive inventory therefore failed public export
validation. Added that existing source to the public schema, preserving its
provenance rather than relabeling loaded configuration as visible evidence or
an API read. Regenerated standalone SDK types and OpenAPI schemas from the
public schema. No assessment, concern, policy, finding or scoring rule changed.

A retained Cookiebot controller-contact checklist reference includes 4,150
characters of existing policy excerpt text. The public Detailed Evidence
reference limit was 4,000 characters. Because the API assembles Detailed Evidence
before selecting CMP, this unrelated reference also prevented the focused CMP
response. The reference limit is now a bounded 8,192 characters, with no text
shortening; existing JSON Pointer/string-part pagination preserves it exactly.
Other display-text limits remain 4,000. Unknown sources, cookie values, malformed
expiry arithmetic, unsupported fields and over-limit strings still fail closed.

## Retained evidence and real local transport

Replayed the latest saved materializations for CookieYes, Cookiebot, Didomi,
Consentmanager, OneTrust, Termly, Iubenda and TrustArc. Actual canonical report
derivation and the shared timeline model reproduced their saved public CMP
projections, including source hashes, criterion states and supporting tables.
This was an in-memory diagnostic projection, with no persisted report changes.
The unrelated Tranco lookup used a null fixture; database queries were guarded.

`scripts/verify-cmp-channel-parity.mts` exercises the actual API v2 report-evidence
GET handler over loopback HTTP. Storage/model loading, credential validation and
read throttling are fixture boundaries; they do not represent live production
database, identity-provider or rate-limit verification. Prepared report models
were loaded from the canonical replay above. Public wrapper IDs and existing
available form-image URLs are aliased only inside transport fixtures because
artifact-only local scan IDs have prefixes rejected by the public UUID contract.
Original source IDs/hashes remain recorded in the receipt; no fixture is a newly
published or persisted scan. Images are not fetched or made available.

For each provider, verified CMP-focused, consent-focused and full evidence:

- Direct HTTP API pages through completion.
- SDK `getReportEvidence` over real loopback HTTP.
- Authenticated full MCP and anonymous MCP Light using real in-memory MCP
  client/server protocol connections and the SDK's HTTP reads.
- The actual API JSON download and reconstruction of its shared references.

All 24 retained-report/section cases are equal across channels. Every CMP response
has all 13 criteria. Source hashes, statuses, limitation groups, explanations,
safe supporting evidence, presentation counts, scores and finding facts are
preserved. Longer full reports span three to five pages. Supporting evidence
includes Cookiebot's 17 services and 61 declaration entries, Didomi's 25 named
services, OneTrust's 27 services and 65 declaration entries, Termly's 47 entries,
CookieYes's 38 entries and its recovered prominence measurements. These are
retained sample counts, not completeness or compliance claims.

Three additional cases use an explicitly synthetic boundary fixture with 100
services, categories, declarations and cookies; all canonical source kinds;
named disclosures; inferred purposes; exact expiry; possible template matches;
partial declaration coverage; grouped incomplete inspection; and Accept/Reject
storage/activity facts. CMP and consent exports span three pages, the full export
six. All channels reconstruct them without loss. Synthetic rows are transport
fixtures, not observed website evidence, calibration labels or production findings.

Private fixtures remain unavailable to anonymous API and MCP Light callers.
Invalid credentials are rejected; authenticated reads and short-lived signed
downloads succeed. Mixed section/workpaper selectors are rejected. Existing
access rules and pagination guidance are unchanged. The harness performed 282
loopback GETs and zero external requests.

## Checks, preservation and cost

118 focused public-contract, shared presentation, export, pagination, access,
SDK and MCP tests passed. Tests compare accepted source kinds with the canonical
internal schema, preserve loaded provenance and long references, reject unknown
sources/raw values, and retain fail-closed bounds. API contracts, SDK, MCP and
web TypeScript checks passed. Generated contract drift checks passed; the SDK
was built locally without publishing or rebuilding the web application.

All 16 original materialization/projection file hashes are unchanged. No original
assessment, stored score or customer report was written. The three unrelated
pre-existing worktree changes remain separate.

No scanner, model, retention or infrastructure allowance increased. Conservative
additional transfer/formatting estimate is below $0.25/month at 100,000 on-demand
reads, assuming 10% return an extra 8 KB of retained reference text. Verification
used local compute only, with $0 additional AWS/model spend.

Artifacts: `/Users/benmasek/WC01/outputs/cmp-channel-parity-local-2026-10-16/`.
See `channel-parity.json`, `preservation.json`, `regression-tests.log`, the saved
model/export comparisons and `report-manifest.json`. The checked-in harness takes
that manifest and a receipt destination. Use `apps/web/tsconfig.test.json` for
React-bearing fixtures.
