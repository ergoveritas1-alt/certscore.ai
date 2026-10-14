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

## Copy icons follow-up

Each CMP table header has a compact copy icon within the expanded evidence body.
Collapsing the evidence hides it. This includes categories, services, cookie
comparisons, historical unmatched-name lists, cookie declarations, requests after
Reject, and the Accept/Reject visual comparison. The existing shared clipboard
button supplies keyboard activation, copied confirmation, failure feedback and
retry; no new client dependency or scanner work was added.

Copy uses tab-separated headers and every retained row, including rows outside
the eight-row viewport. Match icons become Matched/No match text, request hostname
and path form one cell, and embedded tabs/newlines are normalized within cells.
Formula-like site-supplied text is escaped as literal spreadsheet content. Full
JSON evidence and assessment fields are unchanged; clipboard text is presentation
only and is not a new API, SDK or MCP evidence field.

The local preview now mounts the actual React components so the icons work,
rather than showing static SSR output alone. Desktop and mobile interaction
checks exercised the real button handlers with a stub clipboard to preserve the
user's clipboard, including all 36 declaration rows, 14 compared cookies, five
requests, comparison rows, keyboard copy, failed writes and successful retry.
Collapsed controls are hidden and both viewports have no page overflow. Focused
copy/UI tests and web typecheck pass. Artifacts include `copy-verification.json`
and the desktop/mobile `category-copy.png` screenshots.

No deployment or new scan was made. Incremental page-transfer estimate is under
$0.10/month per 100,000 report views for SITS-sized table text, disclosed before
completion and pre-approved under the below-$1 cost policy. There are no added
model calls, browser runs, timeouts, infrastructure resources or evidence-storage
fields. The standalone development bundle is local-only and is not shipped.

## Precise consent-cookie expiry follow-up

The expiry criterion uses the shared, copyable table with Visit, Cookie and
Remaining days columns. The values derive from the retained browser expiry
minus its capture timestamp; no configured lifetime or initial creation time
is inferred. Days are formatted to at most eight decimal places (approximately
millisecond resolution); unrounded remaining seconds and both original epoch
timestamps remain in supporting JSON and the API/SDK/MCP evidence export.
The recap retains the long-term behavior limitation without repeating the table.

New `inventory.expiries` metadata is produced only from the existing
scan/target-bound, production-projectable action-cookie eligibility path with
identity/value hash proof. Invalid, missing, session-only or already-expired
timestamp tuples do not create exact table rows. Metadata cannot alter the
historical assessment, rounded canonical summary, policy eligibility or score.
It also survives a preference-worker timeout when independent action proof
is valid. `cmp_inventory_tables.v3` versions new materializations; historical
records remain unchanged on read. Arrays are bounded at four rows and do not
include cookie values or identity/value hashes. Internal and public schemas
validate timestamp arithmetic; row/source-hash matching remains mandatory.

For saved SITS scan `a68a5b3b-df92-429a-bbef-975aa2fdddf0`, the original Accept
and Reject packet bytes were verified against the retained AWS manifest's SHA-256
and size, and their storage observations matched the canonical bundle exactly.
The `borlabs-cookie` rows show 59.99992611 days for Accept and 59.99995527 for
Reject. These are a few seconds below 60 days because capture followed cookie
creation. Both criterion outcomes remain Observed; the original canonical
assessments remain unchanged. No production record was written.

50 focused tests pass, including timestamp precision, arithmetic consistency,
foreign/unprojectable action rejection, missing hashes/timestamps, independent
coverage, concern tamper rejection, and API-to-SDK reconstruction. Web, SDK and
MCP typechecks and generated contract checks pass. Desktop/mobile verification
confirms both rows, all columns, clipboard headers/values and no overflow.
Artifacts: `expiry-verification.json`, updated `verification.json`, and
`desktop-cookie-expiry.png` / `mobile-cookie-expiry.png`. The local preview
leaves the expiry criterion expanded. Nothing has been deployed.

No new scan, observation, browser work, model call, action or wait was added.
Incremental metadata storage/transfer is estimated below $0.05/month at
100,000 scans/month with 30-day retention; disclosed before implementation
and pre-approved under the below-$1 cost policy. The one-time retained packet
reads cost less than $0.01.
