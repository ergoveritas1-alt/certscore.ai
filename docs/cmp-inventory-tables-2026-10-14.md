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

## Table identity icons

All cookie-name cells in the expiry, declaration, comparison and historical
unmatched-name tables now include a compact neutral cookie icon. Service and
post-Reject request cells reuse bundled service logos when available, with a
neutral service icon otherwise. Cookie names without retained vendor attribution
do not receive a guessed vendor logo. These are decorative, hidden from assistive
technology, and leave the complete names and copied table text unchanged.
No external favicon service, asset download or new evidence field is introduced.

The saved SITS replay retains its original assessments and 36 declaration rows,
14 compared cookies and five post-Reject HubSpot requests. All five HubSpot logos
load locally. At mobile width 390px and desktop width 1280px there is no page
overflow; the mobile expiry table also fits without horizontal overflow. All
cookie rows include their neutral icons. Seventeen focused component/copy tests
and the web typecheck pass. Preview screenshots: `mobile-cookie-icons.png` and
`desktop-table-icons.png`. Nothing has been deployed or rescanned.

No scanner latency, evidence storage, browser work or model calls are added.
Potential extra page transfer if shipped is estimated below $0.20/month at
100,000 SITS-sized report views, including repeated inline icons and the existing
1.5KB HubSpot asset (cached across its five rows). This estimate was disclosed
during implementation and is pre-approved under the below-$1 policy.

## Cookie-banner magnifier (local review)

The Cookie banner finding has a compact magnifier only when its assessment is
Observed and a retained, available image has valid crop metadata. The modal
shows a browser-side crop of that existing image, with a close control, Escape
dismissal, keyboard focus containment and focus restoration. The image is loaded
only when opened. No image is regenerated, stored as a derivative, enhanced,
fetched from the current target site or sent to a model.

`consent_banner_crop.v1` is presentation metadata on the existing visual artifact.
It uses the already validated canonical assessment's visual comparison and
representative screenshot reference, with matching document token and retained
geometry. Both compared controls must share a container, and an enclosing
first-layer semantic dialog must contain their bounds inside the image. Inner
action clusters cannot crop out the banner header or footer. Unknown, malformed,
withheld, document-mismatched or unanchored sources provide no magnifier. Historical
records without metadata stay unchanged; there is no new read-time artifact fetch
or production backfill. Neither the assessment nor its source hash is changed.

The local SITS replay verifies original geometry and screenshot bytes against the
saved manifest. Its available settled screenshot has SHA-256
`5f71573b4892fc5be61f10b07187235c11c2c46354b785d2ffd73315c2475927`.
The crop is x=395, y=151.75, width=576, height=596.5 in a 1366x900 image.
The newer withheld geometry-proof image is neither loaded nor served.
The saved replay preserves all criterion assessments. Focused UI, crop,
visual-provenance, export and existing visual-materialization tests pass, along
with the web typecheck. Mobile width 390px has no modal overflow. Browser checks
verify opening does not toggle the finding, closing/Escape restore focus, and
the crop retains the full visible banner. Screenshot: `mobile-banner-preview.png`.

This remains local and unpushed, with no new scan, runtime browser work, model
call, retention or deployment. Two one-time AWS artifact reads cost less than
$0.01, disclosed during the work. New bounded metadata and deterministic
projection, if shipped, are estimated below $0.10/month at 100,000 scans with
30-day retention. On-demand image delivery reuses the existing image endpoint;
potential additional view traffic is not a scan-time cost. At 100,000 additional
SITS-sized image opens, transfer could be about $4/month. Production rollout
must review that usage estimate and obtain cost approval if the expected
increment is $1/month or more; no such recurring usage has been enabled here.

## Reject-option magnifier (local review)

Reject option now uses the same magnifier and accessible modal, with a separate
`consent_control_crop.v1` / `control: reject` rectangle. Its crop comes from the
canonical assessment's retained first-layer Reject measurement and includes
12px of surrounding pixels, bounded by the original image. A separated Reject
link does not need to share the banner's enclosing dialog. The existing image,
document, assessment and safety binding checks still apply. Missing, withheld,
invalid or unbound evidence omits the magnifier, as does a non-Observed row.
Historical records are not rewritten and the UI does not infer control bounds.

Saved SITS uses the same checksum-verified available settled image. Its crop is
x=407, y=544.75, width=552, height=73, showing the original “Accept essential
cookies” refusal-equivalent button. All saved assessments remain unchanged.
Thirty focused crop, metadata, UI and shared export tests plus web typecheck
pass. Browser checks confirm the exact crop, mobile fit at 390px, keyboard focus
containment, Escape/close restoration and no accidental finding expansion.
Screenshot: `mobile-reject-preview.png`.

No new scan, screenshot capture, model call, AWS artifact read or deployment was
performed. Current local incremental infrastructure cost is $0. If shipped,
the extra bounded rectangle metadata and deterministic projection are estimated
below $0.05/month at 100,000 scans and 30-day retention. On-demand transfer uses
the same existing image endpoint; the production traffic approval consideration
documented above still applies. This remains local and unpushed for review.

## Accept / Reject comparison magnifier (local review)

Accept / Reject prominence now has the same magnifier when a reportable retained
comparison and matching available screenshot crop exist. The optional
`consent_prominence_crop.v1` rectangle contains both assessed controls with 12px
of surrounding context. One contiguous crop preserves their original sizes,
spacing and any intervening UI; controls are never stitched together, recolored
or resized independently. Separated controls retain their original separation.
Observed, Review and historical informational comparisons keep their assessments.
Missing comparison evidence, unavailable images or invalid binding omit the icon.

SITS uses the existing checksum-verified settled screenshot, cropped at x=407,
y=426.75, width=552, height=191. Its Save consent control remains between Accept
all and Accept essential cookies. The saved replay confirms unchanged assessments.
Thirty-three focused metadata, crop, UI and shared-export tests, three existing
visual-materialization tests, and web typecheck pass. Browser verification covers
the exact crop, 390px mobile fit, keyboard focus, Escape restoration and no
accidental finding expansion. Screenshot: `mobile-prominence-preview.png`.

Materialization now verifies each existing screenshot's crop source once for all
three views, replacing repeated verification. No new scan, capture, model call,
image derivative, AWS artifact read, production write or deployment was made.
Current local incremental infrastructure cost is $0. If shipped, the extra
bounded rectangle metadata is estimated below $0.05/month at 100,000 scans with
30-day retention; image-view traffic remains subject to the rollout cost review
documented above. The changes remain local and unpushed.

## Finding badge alignment

### Prominence retention diagnosis

Comparison of saved SITS scan `a68a5b3b-df92-429a-bbef-975aa2fdddf0` with
local scan `58ac0b55-641b-4cd1-bdd1-6d5c7bb24613` confirms that button capture
still worked: the new geometry retains Accept 528 x 45 px, Reject 528 x 49 px,
and a 129 ms geometry/image skew. The new screenshots all have the typed
`finalization_deadline_exceeded` safety failure. The consent-proof manifest records
a 79 ms screenshot-safety finalization phase. Both old and new first-layer
inventories were marked `partial`, so the existing safety gate selected its
75 ms finalization allowance, rather than the 2,000 ms allowance reserved for
`complete_with_controls`. Two earlier images completed review successfully;
none of the new images completed in time. The retained evidence does not explain
why the external moderation request took longer on this occasion.

The shared CMP report projection now describes the retained typed timeout as
"Screenshot safety review timed out; the button comparison was not assessed."
This applies only to usable, scan-bound assessments whose withheld visual evidence
records a finalization deadline or moderation timeout. It preserves Not assessed,
source hashes, scoring, withheld-image handling, and the underlying assessment.
The website and shared export use the same reason. Existing positive/review
projections retain precedence. No safety bypass, timer change, late review,
historical image repair, scan, model call or deployment was performed. Deleted
withheld images cannot restore this report's visual comparison. Upstream review
scheduling/finalization reliability remains a separate follow-up.

Twenty-one focused CMP/export tests pass, including wrong-scan rejection and
preservation of structured Reject visibility, and the local report was visually
verified with the specific timeout reason. The wording change has no incremental
scan latency or paid-service usage.

### Cookie brand decoration

Cookie table rows now use bundled brand logos for unambiguous names recognized
by the existing canonical vendor resolver or cookie knowledge base. This is
decorative pattern recognition, labelled in the icon tooltip; it does not identify
the observed setter, infer a purpose, change CMP pattern matches or alter any
assessment. The resolver receives only the retained name, without invented
hostname, domain or initiator context. Ambiguous or context-dependent names
(including `CONSENT` and `test_cookie` without direct domain context) retain the
neutral cookie symbol. Recognized brands without bundled artwork use initials.
No assessment cookie signatures, vendor attribution rules or remote favicon
calls were introduced. The exact `_GRECAPTCHA` name also has a decorative Google
reCAPTCHA mapping, confirmed against Google's official FAQ:
https://developers.google.com/recaptcha/docs/faq#does-recaptcha-use-cookies.
This fills a missing icon match without changing purpose, essentiality or scan
classification. Similar names and different casing remain neutral. Focused icon
tests pass, and the local SITS row was verified with a loaded Google logo while
retaining its original name, purpose and duration. No new scan or deployment ran;
the additional exact-name mapping remains within the existing transfer estimate.

The complete local SITS report now displays Google, Hotjar, HubSpot and LinkedIn
logos where recognized across its cookie tables. The saved CMP replay is also
updated. Twenty-five focused table/CMP/export tests and the web typecheck pass;
390px mobile verification showed no page overflow. All names, copy text, retained
evidence, API fields and assessments are unchanged. No scan or deployment ran.

The browser preview's compressed bundle increased by 49,440 bytes from reusing
the canonical registry. Conservative incremental transfer is about $0.50/month
at 100,000 report views if shipped, within the disclosed below-$1/month estimate;
the change is currently local only. Existing bundled logo transfer remains within
the earlier icon estimate, with browser caching.

Detailed Evidence finding headers now keep the status badge and visual-preview
control at the upper right at every width. Titles wrap alongside that group;
descriptions use the full width below. This removes the previous below-640px
stacking that placed badges under the description. Local saved-evidence preview
verified all 13 headers at 320px and 390px without page overflow. The 20 focused
CMP/report tests pass. Assessments and evidence are unchanged; no scan, deployment,
or incremental infrastructure cost is involved.

## Fresh SITS service-name verification

### Complete localhost report after environment repair

The owner subsequently authorized repair of local policy-review credentials and
exactly one complete local SITS scan, without deployment. The existing development
`OPENAI_API_KEY` in the main checkout was missing from this worktree's
`apps/web/.env.local`. It was copied into that ignored file with mode 0600 and
accepted by a read-only API authentication check; no production secret was read.
The key is not included in logs, artifacts, or Git.

Local PostgreSQL and MinIO readiness checks passed; no migrations were pending.
The web app ran this worktree's current code through the normal simulated Lambda
dispatch, verified terminal ingestion, canonical materialization and persisted
report projection. The one new scan is
`58ac0b55-641b-4cd1-bdd1-6d5c7bb24613`, available at
`http://localhost:3000/scan/58ac0b55-641b-4cd1-bdd1-6d5c7bb24613#cmp-details`.
It completed in 20,866 ms, with 11 service names, 36 declarations, three categories,
confirmed Accept/Reject evidence and two post-Reject HubSpot requests. This fresh
run has 21 compared cookie names, 14 unmatched; the earlier report is unchanged.

The original producer bundle hash verified, and the shared evidence export
preserves all 13 website CMP assessments and every service name. Desktop and
390px mobile review confirmed the tables, copy controls, logos, policy supporting
evidence and upper-right status badges, without page overflow. CMP and policy
sections were left expanded for review. Screenshots were withheld by the existing
safety gate (`safety_check_unavailable`); no withheld image was served or relabeled.
Prominence therefore remains Not assessed and image viewers are omitted. GPC
remains indeterminate. No old evidence was mixed into the new report.

Expected one-time model/API cost was disclosed as below $0.10. There is no
recurring infrastructure change, AWS scanner invocation, production write,
push or deployment. The contact ledger records this owner-authorized exception;
the global SITS diagnostic hold remains unchanged and no repeat scan was run.

The owner explicitly approved one fresh local SITS scan as a one-time exception
to the existing diagnostic-contact hold. Run `sits-services-local-20261014`
targeted `https://sits.com/en/` in one existing sharded local-parity run,
including one authorized Options inspection and no Accept or Reject
actions. The global hold remains unchanged; the contact and 28-day cooldown are
recorded in the manual calibration ledger. No retry was made.

The CMP inspection completed in about 6.5 seconds and retained all 11 names:
Borlabs Cookie, Google Analytics, Google Fonts, Google reCAPTCHA, Google Tag
Manager, Hotjar, HubSpot, LeadFeeder, LinkedIn - Insight Tag, Matomo and WPML.
The original preference bytes match their producer metadata hash and size.
An internal-only projection candidate verifies that the names survive typed
assessment, normalized concern and shared CMP export unchanged. Five scanner
fixtures and 39 projection/UI/export tests pass, including navigation
invalidation and rejection of altered retained names. The capture fix was
already in the local scanner source; this confirms it against fresh SITS data.

The full local scan failed because the policy lane requires an OpenAI API key
that is absent from this dev environment. It must not be presented as a completed
scan or published. Its terminal failure and original lane artifacts remain intact.
The local `/services.html` page is explicitly a CMP inspection preview, showing
the actual shared table component with all 11 names, existing local logos, copy
control and an eight-row scrolling window. It has no score or finding badge.
The earlier saved report stays at `/` with its original missing-name limitation;
fresh names are not backfilled into its historical evidence. Screenshots and
verification receipts are under `artifacts/sits-service-list-review-20261014/`.

There was no deployment, production write, new scanner wait or recurring-cost
change. No model call ran. The one retained-DOM artifact read cost less than
$0.01; the fresh capture ran locally. The disclosed one-time ceiling was $0.10.
