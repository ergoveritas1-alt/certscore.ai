# CertScore.ai six-check live CMP validation

## Outcome

Six owner-authorized local-candidate checks ran on October 27, 2026, with no
deployment or retry. They provide limited live coverage and do not establish
a live benefit from the OneTrust receipt-read optimization.

| Target | Check | Supported result |
| --- | --- | --- |
| WorkMarket | OneTrust Accept | OneTrust appeared in canonical geometry diagnostics. No visible actionable Accept control resolved within the search window; no click or confirmation occurred. |
| Spotify | OneTrust Reject | The result budget expired during control resolution following redirects. No click or confirmation occurred. |
| HubSpot | Passive attribution | Canonical runtime evidence identified the HubSpot banner. Structured capture retained Accept all, Decline all and Manage Cookies. |
| Enzo Custom | Passive attribution | The screenshot showed a privacy widget with an Okay control; provider identity and specific consent intent remain unresolved. The expected Shopify identity was not promoted. |
| curl | Neutral control | No named CMP or first-layer Accept/Reject control was observed in the retained capture. This is not proof of CMP absence. |
| SQLite | Neutral control | No named CMP or first-layer Accept/Reject control was observed in the retained capture. This is not proof of CMP absence. |

All visits returned local artifacts, but that is not six successful product
scans or six verification passes. The OneTrust timing path was not exercised.
HubSpot's identity came from its observed banner script, so it does not establish
an incremental benefit from the new global/shadow-root capture. The new shadow
capture repair remains verified by deterministic local tests only.

## Scope and limits

The approved six-check plan used the current source candidate on the local Mac:
two OneTrust paths, two passive attribution visits and two neutral controls.
The browser used native Chromium navigator identity with the existing crawler
HTTP identity, en-US locale and America/Los_Angeles timezone. No alternate-region
or identity retry, proxy change, Options opening, form submission or model call
was performed. Locale/timezone settings do not establish geographic egress or
equivalence to an EU production worker.

Action visits kept a 20-second result budget, 14-second control search,
2-second initial confirmation and existing 3/8-second Accept/Reject observation
windows. Passive diagnostic modules used a 14-second internal budget. These were
bounded diagnostic visits rather than full multi-lane production scans.

Both passive attribution visits exhausted that diagnostic budget before the
final geometry artifact could be written. They retained screenshots and other
structured evidence; the missing final geometry is a coverage limitation.
HubSpot's screenshot preceded the later structured consent-control capture and
does not supply same-image visual comparison proof. No timeout was increased
or follow-up visit made to obtain a preferable result.

## What this means for further work

The focused local work remains supported by 506 tests, typechecks and the
unchanged projection of 1,466 retained packets. OneTrust removes one cookie
round trip for a changed receipt while retaining independent readback and all
configuration/group/freshness checks. This live sample does not measure its
confirmation improvement or latency effect.

Further broad name expansion has diminishing returns. The three next retained
provider-like clusters cover at most 20 candidate actions across 15 sites, with
stronger source or captured markers still needed. The immediate live-validation
limit is obtaining representative, actionable controls in the applicable
region and capture window. Prefer ordinary evidence from the intended worker
environment to another broad rescan campaign. Do not relax visibility,
uniqueness, authorization or semantic requirements to turn these results into
successes, and do not increase budgets based on this small sample alone.

## Authorization, contact ledger and cost

The owner explicitly approved the six checks after receiving the conservative
estimate of up to $0.60. The calibration registry check passed. Central contact
history was successfully exported through the approved AWS ECS psql boundary.
The normal selector found only three cooldown-eligible inventory targets, one
of which is excluded by this repository's platform restriction. The supported
owner-authorized cooldown override was recorded for this single six-check run,
with the owner's approval quote and scope. Blocked/do-not-calibrate targets and
contact holds remained excluded. No canonical inventory or baseline was changed.

Six contacts were persisted under idempotent run key
`cmp-attribution-onetrust-six-20261027T222702Z`. The reviewed manual-ledger
candidate changed only those six entries and updatedAt; no blocked entry was
changed. The repository ledger was committed separately as
`6d5a147e51decd6451f6278d4328ae5275a9dd8b` with no product commit or push.

The scans used local compute, with no scan-creation API, scanner Lambda, proxy
purchase or paid model call. Two existing ECS database one-offs handled contact
export/persistence; their combined compute/log cost is estimated below $0.01,
within the approved allowance. This is an estimate, not a billing reconciliation.
There is no new recurring service or automation. Audit checkpoint, issue backlog,
model-transition ledger, dashboard and automation configuration remain unchanged.

The immutable run artifacts, packets, screenshots, selection/override records,
source references and contact ledger receipts are under
`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261027T222702Z-manual-cmp-live-six`.
