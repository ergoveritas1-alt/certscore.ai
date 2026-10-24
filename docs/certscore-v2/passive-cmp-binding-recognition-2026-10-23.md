# CertScore.ai passive CMP binding and recognition repairs

The owner approved local ReadCube/Gimbal passive binding work, then
Volkswagen/FC-Moto recognition, with tests and live scans where useful. Preserve
current budgets and action scope. No deployment or flag changes. This authorizes
the bounded read-only checks described here; it does not widen the earlier
sale/sharing redirect grants or consent-action recipes.

## Changes

Gimbal's retained policy observation combined a Cookie Settings label with a
navigation-container selector. Two upstream defects made that possible:

- Rendered discovery classified a named container using text aggregated from
  its descendant links. The same bounded read now excludes such noninteractive
  containers and retains the actual child control.
- Observation merging copied a visible link's label without its selector or
  clickability. A verified visible link now contributes its name, source page,
  selector, clickability and classifier fields together. A missing locator stays
  missing; it cannot borrow an older ancestor's locator. Hidden, unnamed,
  non-clickable or unbound observations cannot supply this visible-control proof.

ReadCube's historical `preference_readiness_incomplete` and Gimbal's historical
`preference_parent_binding_unavailable` originated in the old preference worker.
The current `passive_cmp_inventory.v1` / `cmp_preferences.v20` observer already
replaced that panel-binding flow with loader-bound SDK/DOM checkpoints. No new
panel-opening or parent-wait mechanism was introduced. New regressions verify
that ReadCube-shaped delayed SDK data survives the existing readiness checkpoint,
and Gimbal-shaped footer Options outside a CMP wrapper do not prevent a loaded
passive inventory. A changed document discards the evidence. Hidden panel
controls remain unobserved, inventories incomplete, and action counts zero.

Added recognition-only registry entries and canonical vendor rules:

| Site | Reviewed identity | Accepted evidence | Deliberately insufficient evidence |
| --- | --- | --- | --- |
| Volkswagen | Ensighten Privacy | Exact `#ensNotifyBanner`, `#ensModalWrapper`, and their reviewed `tcf2__` variants | Bootstrapper, Ensighten Manage, the tag-manager hostname, generic `ens` names or suffixed lookalikes |
| FC-Moto | CCM19 | Exact `.ccm-root` / `#ccm-widget`; the reviewed HTTPS `www.fc-moto.com/rp/cb/app.js` endpoint | Tracking Garden branding alone, generic `CCM` global, another site's `/app.js`, other FC-Moto scripts or lookalike hosts |

The existing runtime DOM probe recognizes those exact markers within its same
1,000-element / 150-marker bounds. The shared registry uses existing passive
scope reads. No new configuration API, wait, callback, state adapter or control
action is registered. Accept/Reject capabilities remain unavailable for these
new identities; neither has a sale/sharing recipe. Existing observation inputs
flow through the canonical resolver and downstream pipeline. The resolver
provenance advances to `certscore-vendor-resolver-2026-10-23-passive-cmp-v15`;
existing registry identities and retained historical records are preserved.

## Source review and live checks

Four local passive browser checks visited the approved final pages once each,
with the existing browser configuration, native TLS, public-network guard and
web-bot authentication routing. Main-document navigation away from the exact
page was blocked. There were no clicks, submissions, panel opening, retries or
AWS invocations. Each visit had a 6,010 ms absolute context allowance, derived
from the existing 6,510 ms preference allowance minus its 500 ms reserve, and one
bounded DOM inspection. The local checks took 975 ms (ReadCube), 1,588 ms
(Gimbal), 721 ms (Volkswagen) and 727 ms (FC-Moto), including context cleanup.

These are early DOM diagnostics, not completed production scans or proof that
late CMP UI will load within budget. They do not measure Lambda performance or
establish a successful opt-out. Current live page data and fixtures are kept
separate from the October 21 retained cohort; no historical report was rewritten.

The checks corroborated Gimbal's exact `a#ot-sdk-btn.ot-sdk-show-settings`
Cookie Settings link. They also exposed a separate Your Privacy Choices link
to a OneTrust-hosted webform. That URL was retained locally but not visited.
ReadCube exposed its loader before the banner; no inference of absent controls
is made from that early sample. FC-Moto exposed `#CCM.openWidget` as a footer
link destination; the check did not invoke it.

Two additional bounded, read-only source downloads reviewed the already-observed
FC-Moto loader and Volkswagen Bootstrap bundle. The former contains CCM19
runtime markers and modal structure; the latter contains Ensighten Privacy
gateway and consent-button implementations. Their local receipts record SHA-256,
byte length and source path. Query values are not printed in the receipts.
No downloaded script was executed by the source-review tooling.

Primary documentation corroborates these identities: [CCM19's documented
opening link](https://www.ccm19.de/faq/kann-ich-das-einstellungs-icon-unten-links-entfernen.html)
and [Ensighten's description of CHEQ Enforce, previously Ensighten
Privacy](https://academy.ensighten.com/hc/en-us/articles/22832165668241-Enforce-Training-Course-Overview).
These descriptions authorize no API calls or interactions in the scanner.

All live-check results, source receipts, test logs and verification are under
`artifacts/passive-cmp-repairs-2026-10-23/`.

Verification: **321 tests passed** (15 focused/identity checks, 209 existing CMP
and vendor regressions, three policy regressions, and 94 action/projection
checks). Shared, scan-core and vendor-resolver typechecks passed. Fixtures cover
no mutation, same-document checkpoints, hidden controls, delayed SDK data,
source/locator pairing, source-reviewed recognition, false-positive rejection
and preservation of the existing sale/sharing action boundary. These results
do not establish deployed recovery or a successful live opt-out.

## Budgets, cost and remaining approval

No worker configuration, feature gate, scan deadline, join allowance, action cap,
invocation count, retention duration or storage-object count changes. Keep the
checked-in 3,008 MB Lambda. Sale/sharing capture still has its existing 3,000 ms
budget and at most two actions; passive preference work retains its own existing
allowance. There is no new capture or model call.

Local tests, source review and local passive checks add **$0 recurring AWS
spend**. For a future separately approved rollout, expected incremental compute
and retained JSON are **under $0.50/month at 100,000 scans**, sharing the existing
$10 inside $50. This is a planning sensitivity, not a measured production bill:
using the prior planning rate, 50 ms extra work across every scan is about $0.245;
one extra second on the two newly recognized sites at their 2/169 cohort share
is about $0.058; allow under $0.10 for additional JSON within existing objects.
The cohort is not a production prevalence estimate. Recognition can let an
already-dispatched passive worker progress further rather than stop unknown;
six additional seconds at that cohort share would instead be about $0.35
compute, still within the shared allowance. Traffic and production frequency
remain unmeasured. There is no new scheduling trigger or worker invocation.

Still requires separate approval: deployment; flag changes; opening Cookie/
Manage Settings; new sale/sharing submissions, toggles, generic Save or semantic
adapters; following Gimbal's external webform; form completion or identity input;
new action destinations; expanded resource budgets. None was performed.

ReadCube/Gimbal first-layer cookie controls remain distinct from explicit
sale/sharing opt-out. Provider recognition and better binding do not establish
registration, successful enforcement, a legal finding or a score change.
