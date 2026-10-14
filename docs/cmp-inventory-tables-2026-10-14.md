# CMP inventory tables — local implementation

Implemented compact service, cookie-match and declaration tables in CMP Details.
Each window has a sticky header and room for up to eight standard rows, then
scrolls. Cells wrap on mobile; the wider four-column comparison also scrolls
horizontally. Scroll regions support keyboard focus and scrolling. Green checks
mean a cookie name matched a retained declaration pattern, not a compliance
verdict. The unmatched-cookie scope note explicitly refers to unmatched names.

The production scanner already reads Borlabs service names in its bounded API
inventory call but previously discarded them. It now retains that existing
array, clears it on document invalidation, and exposes it only through the
same verified document/checkpoint path. No lane, browser call, click, model
call, timeout, retry or wait has been added. Labelled service controls remain
an alternative source of identities; neither source asserts tested functionality.

Supplemental bounded fields are persisted in CMP assessment rows, carried by
normalized concerns, and projected only when the canonical row and source hash
match. The public contract, generated OpenAPI and SDK types include them;
shared MCP evidence pages consume that same export. Historical reads do not
silently rematerialize assessments or fetch artifacts.

## Saved SITS verification

Replayed scan `a68a5b3b-df92-429a-bbef-975aa2fdddf0` for `https://sits.com/en/`.
Verified the retained preference packet's original bytes against the AWS
manifest's SHA-256 and byte count, and checked that the canonical bundle contains
that exact packet. No new SITS scan or site visit was made.

- All nine extended CMP criterion statuses, summaries, evidence references and
  existing cookie-comparison conclusions remained unchanged.
- 36 cookie declarations retained name, purpose and duration.
- 14 observed cookie names: seven matched declaration patterns, seven unmatched.
- The original packet retained source accounting for 11 services but **no service
  names**. This historical limitation is shown explicitly. Names cannot be filled
  from this packet; future captures retain the already-read names.
- Supplemental inventory payload for this SITS replay: approximately 4.8 KB.
- Public-schema parity and source immutability verified, including SDK evidence
  page reconstruction and rejection of unexpected private fields.
- Desktop (1280px) and mobile (390px) previews: no page overflow, bounded tables,
  full rows accessible by keyboard scrolling. All cookie detail columns fit on
  mobile; comparison pattern/observation columns remain horizontally scrollable.

Artifacts are locally ignored under `artifacts/cmp-inventory-tables-20261014/`:
`verification.json`, `visual-verification.json`, `index.html`, screenshots and
check logs. The preview is a labelled local evidence replay, not a changed
production report. No production records were written or deployed.

## Validation and cost

Focused projection/UI/export tests, scanner observer fixtures (including document
invalidation), SDK tests and web/contracts/API/scanner/SDK/MCP typechecks pass.
Generated contract mirrors are current. Assessment policy and scoring are unchanged.

Incremental recurring storage/transfer estimate: roughly $0.25–$0.75/month at
100,000 scans/month, 30-day retention, and SITS-sized payloads including multiple
persisted copies. This below-$1 change is pre-approved under AGENTS.md and was
disclosed before implementation. Longer retention or materially larger average
payloads require revisiting the estimate. Browser compute budgets are unchanged.

Deployment is pending. To enrich saved reports, explicitly replay verified
retained bundles through canonical materialization; do not add per-read artifact
fetches, use current site configuration to backfill old scans, or overwrite old
assessment conclusions. A fresh authorized scan after scanner deployment is
needed to obtain names that the original SITS packet did not retain.

## Post-Reject request table follow-up

The existing `supportingEvidence.requests` list uses the same compact table,
with Service, Category, After Reject (milliseconds), and Request (hostname and
path). The original five SITS requests, timestamps, Review assessment and data
scope note remain unchanged. All five rows fit without vertical scrolling at
1280px and 390px. On mobile the first three columns are visible together, with
a sideways-scroll hint for the request address. This is presentation only;
no scanner, persistence, export contract, cost or latency change. Existing UI
tests and web typecheck pass. Nothing has been deployed.

## Category choices follow-up

Category choices use the same table with Category and Captured setting columns.
Only retained, document/checkpoint-eligible enabled category controls supply rows.
Captured checked states display as On, Off or Not captured; these are observations
of the inspected view, not a functional toggle test. The shared report projection
shortens the recap when the structured table is present; older records without
table data retain their named recap. The canonical assessment summary, statuses
and scoring remain unchanged. `cmp_inventory_tables.v2` binds new materializations
to this additive evidence policy; historical records are not upgraded on read.

The existing SITS evidence retains Statistics, Marketing and External media, each
captured unchecked. All three rows and both columns fit at 1280px and 390px. The
local preview leaves the criterion expanded. No new scan, browser work, wait,
model call or deployment was made. API, generated OpenAPI and SDK types carry
`inventory.categories`; SDK/MCP evidence page reconstruction preserves the array.
44 focused tests and web/SDK/MCP typechecks pass, including source binding, tamper
rejection, disabled-category exclusion, nullable states and legacy summary coverage.

Incremental storage estimate for category metadata is under $0.10/month at
100,000 scans/month and 30-day retention, within the existing below-$1 estimate
for these table additions. This was disclosed before implementation. The scanner
packet already retained these fields; scanner capture and compute are unchanged.
