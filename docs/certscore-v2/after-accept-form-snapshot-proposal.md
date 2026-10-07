# Proposal: forms withheld until Accept

Status: implementation approved October 6, 2026; local SITS capture verified; production deployment remains on hold.

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
