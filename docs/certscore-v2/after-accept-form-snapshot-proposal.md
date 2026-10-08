# Proposal: forms withheld until Accept

Status: production baseline released; October 7 detection-handoff fix verified locally and owner-authorized for production rollout.

## October 7 follow-up: detection handoff and truthful empty counts

Retained production scan `904c54d3-a7d3-4968-ba18-5fb1d9fa947f` confirmed Accept
with the same ConsentCheckBot HTTP/native-navigator posture as the successful
two-form scan. Its browser inventory returned one form after the original
deadline; the extension never activated and no form image packet was retained.
The image code had not changed between those runs.

The local fix delivers bounded visible-field inventory through a main-frame
browser binding before the full evaluation response. Only validated, in-window
detection may request the existing one-time extension. Cancellation, exact-target
and document checks, worker/coordinator caps, image masking and review remain
unchanged. A stalled notification still fails closed; this is not a guarantee
that arbitrarily late or blocked forms will be captured.

Structured capture v2 resamples within the existing Accept window and retains
its confirmed-window bounds and terminal-sample coverage independently of pixels.
Legacy v1 samples are not reinterpreted as completed window inspection. Fields
and local disclosures survive screenshot failure, and structured embedded forms
are not suppressed by main-document image inventory.

The shared report/API/Pulse/MCP form summary adds optional `countStatus`:
`captured`, `limited` or `not_captured`. `totalObserved` remains the backward-
compatible count of retained observations, not proof of absence. An incomplete
empty inventory displays **Not captured**; completed empty inspection displays
**0**. No finding, scoring effect or new disclaimer is added.

Local delayed-response verification retained two reviewed fixture screengrabs,
eight Contact fields, one Newsletter field and both local disclosures. Reproduce
without public contact or paid services:

```sh
TSX_TSCONFIG_PATH=tsconfig.base.json node --import tsx scripts/verify-post-accept-form-handoff.ts
```

Review at `/dev-fixtures/post-accept-form-handoff`. This is a loopback fixture,
not a fresh SITS scan. No deployment or customer-record rewrite was performed.
The owner then approved one local Accept-only SITS exception. The central
history check found no active scans, the canonical selector recorded the narrow
cooldown override, and the existing SITS hold stayed unchanged. Fresh run
`0273807b-785b-4683-a41b-ae7aa948be66` used ConsentCheckBot on HTTP with Chromium's
native navigator identity, one browser context, one confirmed Borlabs Accept
click, no retry and no form submission. It completed in 11.220 seconds and
retained two reviewed masked images, eight contact fields and one newsletter
field. The contact form's privacy-policy link, request-handling notice and
optional marketing notice were retained; the newsletter disclosure was not.
Structured capture reached its terminal sample but remained limited by the
existing three-frame inspection cap and an unavailable frame. This does not
invalidate the independently verified main-document inventory or images.
The late-form extension activated at 9,336 ms, before the 10,500 ms base image
deadline; completion used only part of the already approved allowance.

Actual capture review: `/dev-fixtures/post-accept-form-handoff/sits`. This is an
Accept-only diagnostic inventory preview, not a complete scored customer report;
it does not fabricate a passive control assessment. Packet and image integrity,
both browser image-serving links and the contact disclosure/field expansion were
verified. Evidence and the reviewed manual ledger candidate are retained in
`artifacts/sits-local-accept-handoff-20261007`. The attempted contact was persisted
centrally with idempotent run key `sits-local-accept-handoff-20261007-one-run`.
One-off history/contact bookkeeping is estimated below $0.06 total. There was no
AWS scanner invocation, retry, deployment or customer-record rewrite.

Focused runtime/contract, report/API/Pulse and follow-up/image tests passed
(104 total). Contracts, scan-core, API contracts, web and MCP HTTP typechecks passed.
The owner authorized committing and deploying this follow-up on October 7 after the fresh local verification. The release record is `docs/certscore-v2/releases/2026-10-07-form-capture-handoff.md`.

Cost: no new recurring infrastructure, browser lane, model call, retained-byte
limit, worker timeout or coordinator timeout. Work remains inside the existing
owner-approved bounded capture allowance (upper estimate $126.55/month at
100,000 affected scans, documented below); actual utilization can vary.

Owner approval: “Approve bounded After Accept form screengrabs.” The approved scope
is at most two masked, safety-reviewed images in the existing Accept lane, up to
$20/month at 100,000 affected scans, with no new lane or timeout extension.

SITS withholds both HubSpot forms on a verified fresh, unaccepted visit. Fixing
its navigator-based bot auto-grant restores that visit and the consent controls,
but also removes the accidentally unblocked forms from pre-consent evidence.
Earlier bot-accepted images cannot be reused as fresh pre-consent evidence.

## Approved bounded implementation

Use only the existing authorized Accept observation lane and its canonical
one-click recipe. After confirmed registration, retain typed form inventory and
at most two masked, safety-reviewed form crops from that same session. Keep
the exact-target, document, control, inventory-hash and action-anchor bindings.
Never submit a form or write form values. No new lane, rescan, retry, model
interpretation, timeout extension, coordinator tail or report refresh is proposed.

Inventory and capture must fit the existing action-worker deadline without
shortening mandatory runtime observation. Use at most the existing 2.5-second
shared form-image allowance when sufficient budget remains. A failed or
unconfirmed action cannot supply registered after-Accept form evidence.

Extend the retained typed action evidence and canonical persistence/collection
projection. Report these forms explicitly as after Accept, separate from the
fresh pre-consent collection. They must not create pre-consent deductions or
reinterpret accepted tracker activity as unaccepted activity. Do not add a
customer disclaimer.

Focused verification must cover real SITS masked screenshots after one canonical
Accept, absent forms and trackers before Accept, no form submission, honest
phase provenance, safe retention, replay/persistence/report projection, unchanged
pre-consent scoring and unchanged action deadlines.

## Estimated incremental cost and lower-cost alternative

At 100,000 affected scans/month, assume every scan retains two images and spends
the full additional 2.5 seconds at 3,008 MB in the existing Lambda invocation.
Lambda compute is roughly $12–$13/month at the standard x86 duration rate.
An illustrative allowance for 200,000 added image writes, up to 128 KiB/image,
30-day storage, and one viewing per image brings the estimated total below
$20/month. This is an upper operating estimate for that stated workload, not a
measured affected-scan rate. Existing moderation safety reviews add up to two
calls per affected scan; use the existing free moderation endpoint, without
Nano/Mini interpretation. Existing account pricing and retention must be checked
before final implementation. Different traffic, retention or image-view rates
require a revised estimate.

Estimate references: [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/),
[S3 pricing](https://aws.amazon.com/s3/pricing/), and the
[OpenAI moderation guide](https://developers.openai.com/api/docs/guides/moderation).

The benefit is actual form screenshots and field evidence for forms withheld
until a visitor grants consent, with correct phase attribution. The $0 recurring
alternative is to ship the identity fix and retain only forms visible during
the unaccepted visit; do not add automatic after-Accept form capture. One-off
local form verification remains possible without a new recurring feature.

Root AGENTS.md requires explicit product-owner cost approval before implementing
or deploying an incremental change estimated at $1/month or more. General scan
reliability or earlier runtime-settle approval does not approve this new action
evidence capture scope.


The implementation retains image bytes in the existing verified Accept packet,
not separate image writes. Persisted report projection contains metadata only;
the existing throttled form-image endpoint verifies the original packet
bytes and inventory/image hashes before serving. One bounded presence gate
requires a stable eligible field set for 250 ms within the existing registered After Accept observation
window, followed by one inventory sample and the existing shared image budget.
There is no late result, report refresh, accepted-session score effect, or new
customer disclaimer. Failed optional image verification preserves valid action
facts. Borlabs registration uses the documented service-state API and a fresh
saved-decision event. Content-specific unblock controls and CMP preference forms
are excluded through the shared registry. Adding the Borlabs recipe raises the
Reject candidate bound from 24 to 25 without adding a browser action or window.
Its one additional bounded selector/API inspection is estimated below $0.10/month
at 100,000 scans; this is covered by the approved overall ceiling. One-off local
verification model usage is estimated below $1 total.

The image deadline uses the existing confirmed-observation window anchored to
acceptance registration, and remains capped by the original worker result budget.
Confirmation time must not be subtracted from that unchanged observation window.


## Local verification result — October 6, 2026

The six-lane local SITS run completed in 13,025 ms and retained two safe actual
After Accept images, for the eight-field contact form and one-field newsletter.
Original packet SHA/size, inventory/image integrity, metadata-only materialization,
canonical report eligibility, image serving and negative provenance checks passed.
HTTP ConsentCheckBot identity was retained with native navigator identity and
fresh unaccepted passive state. Accept, Reject and Options projected Observed.
Both independent actions registered through the Borlabs service API and a fresh
saved-decision event. No form was submitted.

Canonical scoring replay produced 85: only the existing 15-point confirmed
After Reject measurement/advertising deduction applied. Accepted activity remained
score-neutral. The exact WPML current-language cookie was corrected in the canonical
cookie registry using WPML documentation; scoring weights did not change. GPC
remained indeterminate and neutral. The local harness used filesystem service
doubles and a local-only HTTP/2 launch override; it did not deploy, invoke AWS
workers, write production data or replace a historical score. Detailed evidence
is in artifacts/sits-local-registered-window-20261006/README.md.

Optional form presence/capture can defer an existing early Accept exit while it
uses the already configured three-second registered observation window. It does
not add ten seconds or change all-scan deadlines. Runs without a registered Accept
do not start this image work; no image-specific tail is permitted.

## October 7, 2026: approved late-form window

The owner approved one targeted extension of at most 1.5 seconds, estimated at
up to $7.35/month additional Lambda compute at 100,000 affected scans/month,
on top of the previously approved $20/month form-image allowance. The $0
alternative is the original three-second limit with possible missed late forms.
This approval adds no browser lane, scan, retry, form action, model call, or
general scan timeout increase.

The extension activates only after a real form is detected at least 1.8 seconds
after confirmed Accept and with at most 1.2 seconds left in the original image
window. The Accept worker's result timer and this optional image capture move
together once, by no more than 1.5 seconds. No-form and early-form visits keep
their original deadlines. The consent observation duration, scoring, action
authorization, and coordinator tail policy do not change. Safety review remains
bounded by the original image deadline plus 1.5 seconds; late or unverifiable
images remain unavailable.

Extended captures use `certscore.post_accept_form_snapshots.v2` with the original
image deadline, actual detection offset and fixed extension. The packet and
persisted projection independently reject a missing or invalid late-form anchor
or pixels outside that bound. Historical v1 captures retain their original
three-second rule.

Local tests verify a late form with deliberately slow browser binding, the
Accept result timer, masked JPEG bytes, packet integrity and report projection.
The actual SITS form DOM also yielded two locally masked images. A signed local
SITS scan still did not reach its CMP on workstation egress, so the registered
SITS Accept path and production image serving remain unverified. Deployment is
on hold pending that end-to-end evidence.

An October 7 follow-up rebuilt the branch and reran the local six-lane SITS
parity harness with its prior HTTP/1 browser setting and existing local policy
key. The scan completed, but neither action lane found a consent dialog or
attempted a click. A separate fresh single-browser visit timed out waiting for
DOMContentLoaded after 15 seconds; the document remained `loading`, with
deferred Borlabs configuration present but its consent API and dialog absent.
This isolates the current end-to-end verification blocker to page/CMP loading
on workstation egress, before the changed form timing code can execute. No
production deployment or scan followed these attempts.

## October 7, 2026: final bounded late-form trial

Subsequent owner approvals increased the late-form-only image window by four
worker seconds with up to eight coordinator-tail seconds, then by four more
worker seconds and four more coordinator-tail seconds. The current capture
contract is `certscore.post_accept_form_snapshots.v4`: one verified late-form
trigger may extend the original three-second image window by at most 9.5
seconds. The Accept worker result budget can extend from 20 to 29.5 seconds
only on that trigger. The coordinator's normal six-second tail can extend to
18 seconds only after it verifies a scan-bound late-form progress marker.
Historical v1–v3 captures retain their original limits. No extra lane, browser
session, form action, rescan, model interpretation or later report publication
was added.

The incremental owner-approved upper estimates at 100,000 affected scans per
month are $20 for two masked images, $7.35 for the first 1.5 seconds, $60 for
the next four worker/eight coordinator seconds, and $39.20 for the final four
worker/four coordinator seconds: $126.55/month if every affected scan reaches
those separate upper bounds. The actual affected-scan rate is not yet measured.
Ordinary scans retain the original timing. Lane timing and the extended-tail
cap are retained so production cohorts can measure frequency after rollout.

Workstation requests to SITS intermittently failed at HTTP/2 navigation before
its CMP loaded. The isolated eu-west-1 canary used the same regional VPC and
Lambda memory as production. A direct Accept worker and two full sharded
coordinator runs retained a reviewed, masked 640×230 SITS form crop. Original
packet, bundle, geometry and image hashes verified. The final coordinator
joined the image into its single canonical bundle, and WC01's retained
assessment marked Accept observed and projected an available After Accept
form-snapshot URL. The canary's separate structured form capture remained
limited; the verified image inventory contained one form and one field. This
is a bounded visible crop, not evidence that SITS has only one form or field.

A later same-session DOM inventory now runs after the first masked pixels,
overlapping the existing image safety review and staying inside the already
approved late-form worker deadline. Version 5 retains both observation times,
the matching CDP loader and the original imaged controls. It may enrich the
report table only when every original control still identifies the same form;
the image remains bound to its original inventory and hash. Failed or
document-mismatched later sampling falls back to the valid earlier image.
There is no new browser lane, screenshot, model call or maximum timeout beyond
the previously approved $126.55/month upper estimate at 100,000 affected scans.

The isolated October 7 canary 25 confirmed a fresh Borlabs Accept and joined
one reviewed, masked 640×230 contact-form image into the canonical bundle.
The image inventory first observed one field. The later verified inventory
retained two SITS forms with eight and one fields; WC01 projects both form
rows, with an available image only for the first. The separate legacy
structured capture still reported `frame_unavailable`. Original packet and
image hashes, document binding, consent-control eligibility and report
projection verified. The newsletter form has no screengrab in this run.
Production rollout remains on hold until the owner settles whether that
single-image result meets the requested release scope.


## October 7 follow-up: late second image, disclosure and form UX

The first retained canary25 report was an Accept/form test with Reject disabled.
Its score of 100 cannot establish that an earlier Reject finding is resolved.
Read-only production inspection of the latest six completed SITS scans found
score 85 on each. The latest (078379ab-8ed9-48b8-b490-267675876cef) retained
confirmed Borlabs refusal and seven HubSpot request observations beginning
201–1,294 ms afterward. The approved post-Reject scoring rule remains 15;
no scoring eligibility or weight changes are part of this form work.

The fast After Accept DOM probe omitted privacy disclosures. It now retains
form-associated public notice excerpts using the existing canonical locale hints,
two-excerpt/600-character/two-link limits, five milliseconds of shared work,
and 1 KiB per-sample cap. Field values, unrelated form notices, CMP text and
footer/navigation text remain excluded. This stays within the existing overall
capture deadline. Estimated additional compute/storage/transfer is below
$0.50/month at 100,000 scans; the read-only AWS inspection was below $0.01.

Capture v6 may photograph one newly discovered second form from the already
required later inventory. The original image/inventory hash stays unchanged;
the second image binds independently to the later inventory hash, same loader,
and its own post-pixel capture offset. Both images together remain capped at
two, inside the previously approved 9.5-second late extension. No new lane,
invocation, action, timeout or model call beyond the approved two image reviews
is added. Metadata projection removes both sets of image bytes, and serving
checks the matching image timestamp, inventory binding, packet and pixel hashes.

An actual workstation scan confirmed Accept and retained two reviewed masked
SITS images, two field inventories (8 and 1 fields), and the contact form's
request-handling notice, policy link and optional marketing wording. No
newsletter disclosure was retained. The second crop initially exposed a wrapped
browser crop-change error that bypassed the existing single layout retry; the
retry now recognizes that error while preserving all mask/layout safety checks
and the existing deadline. The successful capture completed in 15.676 seconds.
The local direct-observer evidence remains artifact-only and non-production.
It does not replace or combine with older reports from another scan/session.

The shared form table uses at most two summary lines per cell, a dedicated
privacy-disclosure status/action, explicit After Accept click context, and six
field-detail columns. Submission method, control summary and full technical
provenance remain in details/JSON. These are evidence descriptions, not new
findings or score effects. Historical capture evidence is unchanged.

The owner authorized committing, merging and deploying the complete release on
October 7 after the successful two-image local verification. Production rollout
must pass the full release gate, preserve the approved timing/cost bounds, and
verify a fresh canonical production report and both image-serving paths.
Local review routes are development-only and return 404 in production. Live evidence remains in ignored local artifacts and is excluded from the production image.
