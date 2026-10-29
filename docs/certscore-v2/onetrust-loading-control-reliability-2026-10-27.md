# CertScore.ai OneTrust loading and control reliability

The owner authorized further local repairs, retained-evidence review and helpful
live checks on October 27, 2026. Deployment remains prohibited. Cooldown is waived
for this work; contact holds, no-go handling, identity/region boundaries and
existing capture/action budgets remain mandatory.

## Demonstrated shared failures

Both action lanes waited for DOMContentLoaded before resolving a named control.
A controlled streaming page reproduced a missed action even though a complete,
visible OneTrust first layer, its handler, configuration and baseline receipt
were already available. An unrelated parser-blocking script kept the document
loading beyond the search deadline. Both original action paths failed the
fixture before the repair.

The discovery init script separately failed under the tsx CLI serializer because
local named arrow helpers acquired a browser reference to an unavailable
`__name` helper. An existing network-backed discovery test masked the broken DOM
wake-up. A network-free mutation test reproduced the error and lack of a wake.
This establishes a CLI serialization failure, not its incidence in deployed
workers.

## Implemented behavior

The document-ready wait can now inspect one unchanged canonical OneTrust
first-layer recipe when existing runtime observations identify that recipe.
Registry selectors, banner ancestry, confirmation contract and disabled-recipe
policy must match exactly. Frame-bound, custom, accessible, preference-center
and unregistered lookalikes cannot use this path. Only a positive main-document
resolution may leave the wait early; partial or empty loading reads never become
a negative inventory.

The same full control-proof, label/context classification, uniqueness, visibility,
enabled, viewport hit-target, exact-target, baseline, freshness and independent
semantic-readback requirements still follow. Initialization does not authorize
an action. A visible but unusable control cannot become a click or confirmed
choice. Other CMPs and unrecognized OneTrust recipes keep the ordinary
DOM-ready/canonical discovery path.

One native DOM-ready wait and the original absolute search deadline remain.
Probe cancellation uses its own abort signal, never a fresh deadline. Already
ready pages avoid an additional early failed selector sweep. A search expiring
while the document is known ready retains that observation and reports binding
budget exhaustion rather than incorrectly reporting document loading. Zero-time
legacy passes keep their existing behavior.

The discovery script uses self-contained object methods, observes the first
available document root without waiting for a blocked parser, and uses existing
debounced wake-ups for DOM changes, registered CMP initialization completion and
failure, `OneTrustGroupsUpdated`, and `OTConsentApplied`. Payloads are ignored.
These are routing/timing hints only: no event is a consent witness. There is no
new SDK getter, preference opening, setter, remote fetch or action recipe.

## Evidence and limits

The selected live candidate checks all confirmed with completed observations:

| Case | Decision | Total duration |
| --- | --- | ---: |
| Eni Accept | Granted | 11,693 ms |
| Wickes Reject | Denied | 16,649 ms |
| IKEA Reject | Denied, pinned applicability v3 retained | 15,764 ms |

Each action retained two existing configuration reads. IKEA still retained five
declared categories and the complete C0001/C0002 effective receipt. Wickes had
loading-state reads during the early search, but retained positive selector
counts followed interactive-state reads. No exact DOMContentLoaded timestamp at
dispatch was retained. The public checks therefore establish successful selected
actions and applicability compatibility, not a claim that a live click preceded
DOMContentLoaded. The controlled streaming fixtures demonstrate that behavior.
There is no representative success-rate or paired latency claim.

The initial fresh GEICO and Hotjar visits completed four registered OneTrust
initialization downloads each but did not resolve a matching first-layer control.
Downloads do not establish initialization or display configuration. Cloudflare
retained no registered OneTrust initialization request in its selected visit.
These cases do not establish CMP absence or a selector defect. No location,
identity, hidden preference panel or alternative action was used to force a
banner.

One additional passive GEICO visit retained screenshots of its normal page, but
its optional geometry/configuration checkpoint did not run before the existing
module budget expired. It made zero SDK calls and zero privacy actions. The
NoBanner flag remains unknown; the viewport screenshot does not prove whole-page
absence. The bounded diagnostic was not retried.

A late-runtime/busy-geometry stress control already passed before any proposed
ordering change. No unsupported resolver reordering was introduced to claim an
unreproduced fix. Final deadline/readiness truthfulness and already-ready fast
path guards were hardened after the selected public checks and tested locally.
All phases retain source hashes and test logs separately.

## Verification and release boundary

The canonical fast/full consent gate includes the new loading, independent DOM
wake-up, lifecycle-event and deadline tests. Tests cover Accept and Reject,
late controls, covered/duplicate/disabled/mislabeled controls, runtime-only and
initialization-only hints, unsupported recipes, cancellation and late results.
The retained replay preserves 1,466 packet registrations, 751 legacy diagnostic
packets and 450 decoder parity comparisons. Historical records are not upgraded.

The complete local summary and check results are retained under:
`/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T050558Z-manual-onetrust-loading-resolution`.
The selected live verification is under
`20261028T051902Z-manual-onetrust-loading-live-verification`; the limited passive
check is under `20261028T053140Z-manual-geico-passive-display-configuration`.

Expected recurring overhead is below $0.50/month at 100,000 scans. This estimate
was disclosed before implementation. Existing worker size, capture windows,
retention, lanes, SDK/model calls and production flags remain unchanged. The
conservative one-time allowance is $0.70 for seven public contacts, all recorded
centrally and in the repository ledger. Required ledger operations use the
repository ECS workflow. There were no scanner Lambda invocations or paid model
calls.

No product commit, push or deployment is authorized. Main audit checkpoints,
backlog, dashboard pointers, release watch and automation state remain unchanged.
The repairs establish local candidate behavior and selected public-site
verification. Production closure requires a separately authorized AWS release
and ordinary eligible production evidence. Site-specific display/configuration
unknowns remain explicit and separate from the repaired shared failures.
