# Proposal: forms withheld until Accept

Status: proposed; not implemented or approved for production.

SITS withholds both HubSpot forms on a verified fresh, unaccepted visit. Fixing
its navigator-based bot auto-grant restores that visit and the consent controls,
but also removes the accidentally unblocked forms from pre-consent evidence.
Earlier bot-accepted images cannot be reused as fresh pre-consent evidence.

## Proposed bounded implementation

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
