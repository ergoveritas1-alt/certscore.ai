# CertScore.ai Red Hat opt-out action verification

Owner-authorized local verification, November 5, 2026. Result: **live action and
confirmation remain unverified within the existing timing limits**. No opt-out
failure by Red Hat was established.

## Live result

One original-route visit followed `https://redhat.com/` →
`https://www.redhat.com/en`, retaining the 301/200 response chain and request
ancestry. The final document committed at 878 ms. Five readiness inspections
used 1 ms rounded DOM processing, but the reviewed native control was not ready
by the existing 1,600 ms cutoff. Capture ended at 1,604 ms and cleanup at 1,609 ms.
There were zero clicks, submissions and SDK calls, and no confirmed choice.

The 3,000 ms capture cap and 250 ms cleanup reserve were unchanged. The cutoff
preserved the existing 1,400 ms readiness reserve, including the action/state
checks and full 750 ms anchored follow-up with its 500 ms effective observation
window. This run did not consume the reserve for late discovery. The prior
2,753 ms passive state read is not evidence that the control/API was ready before
this earlier action cutoff. Neither visit establishes the first appearance time
or a population success rate. Local geographic egress was not independently
verified.

## Diagnostic implementation and checks

The local diagnostic recognizes only the retained Red Hat native button inside
one `.truste_box_overlay_inner[role="dialog"]` and its exact
`div[name="trustarc_cm"].trustarc_newcm_container.truste_popframe` content host.
It supports the observed open-shadow portal structure as well as light DOM.
TrustArc's own `eu.popdiv3` and `eu.popframe` data properties must bind those same
elements. The button must be unique within `div.pdynamicbutton`, have the exact
visible and accessible “Do Not Sell or Share My Personal Information” name, pass
form/hidden/inert exclusions and verified geometry, and retain the same handle
through dispatch. Generic Settings, Accept and Reject are not substitutes.

Readiness uses at most 32 inspections and 10 ms cooperative DOM processing.
Native TLS, public-network checks, exact ordered redirect targets, per-hop CDP
request ancestry and same-loader checks remain required. Only an observed
baseline with no prior asserted choice can allow one native click. Before,
after and terminal granular reads each use the existing maximum 50 ms read
slot. A stable asserted change is recorded as an explicit category-choice change;
category indices alone never create a sale/sharing effectiveness finding.
There is no SDK mutation, form submission, second click, retry, generic preference
opening, extra worker or model call.

Two tests passed, including ten owned-browser scenarios: light DOM, shadow DOM,
wrong label, form, duplicate controls, mismatched SDK binding, late control,
unavailable state, unregistered click and changed document. Successful fixtures
complete a single click, three reads and the full follow-up within 3,000 ms;
negative cases cannot confirm success. The local diagnostic TypeScript check
passed. These fixture successes are not live Red Hat successes.

Four original Red Hat artifacts were checksum-verified against the acquisition
receipt. The live packet's hash, size, source reference, redirect ancestry,
readiness bounds and capture/cleanup times were independently rechecked.
The registry check and central contact-history export passed before canonical
selection. The owner cooldown waiver was recorded; all holds remained enforced.
The single attempt was recorded centrally under `redhat-opt-out-20261105-v1`
and in the repository contact ledger. Disconnected AWS waiters were recovered
from their existing tasks without duplicate tasks or diagnostic visits.

## Scope and disposition

No production scanner, Accept/Reject implementation, action recipe registry,
scoring, report history, deployment, flag, capture budget or memory configuration
changed. The work consists of local diagnostic/test artifacts and required contact
bookkeeping. Keep the TrustArc action route inactive: the evidence does not yet
support enabling it. Estimated recurring cost increase is $0; one-time ledger
bookkeeping is below $0.05.

Evidence and executable diagnostic:
`outputs/redhat-opt-out-verification-2026-11-05/`.
