# CertScore.ai Red Hat direct-control and terminal verification

November 5, 2026 local continuation. The exact Red Hat opt-out button was clicked
within the existing budget in two visits. **Completed opt-out remains unverified.**
The final visit encountered an additional document request outside the authorized
route chain before terminal confirmation. The guard rejected it. This is a capture
limitation, not evidence that Red Hat failed to honor an opt-out.

## Local corrections

The direct-button diagnostic no longer reserves 250 ms for a panel-opening click
it does not perform. Its discovery cutoff moves from 1,600 to 1,850 ms inside the
same 3,000 ms capture. The 750 ms anchored follow-up, 50 ms read slots, remaining
dispatch checks and 250 ms cleanup allowance remain unchanged. Insufficient time
still prevents action; the additional discovery time does not guarantee a click.

The retained `div.pdynamicbutton button` selector can match multiple buttons.
The local resolver now narrows candidates by the exact normalized visible opt-out
label before requiring uniqueness. Final proof independently checks the accessible
name, native button, same TrustArc portal and SDK-owned identifiers, form exclusion,
same element, viewport hit target and document binding. Accept/Reject siblings are
not candidates. Two exact opt-out matches, conflicting accessible names or more
than 32 candidates fail closed. Readiness retains its 32-check/10 ms processing cap.

A pending immediate state read no longer discards the already-reserved follow-up
and terminal read. Stable immediate and terminal asserted category changes remain
separate from a change observed only at the terminal checkpoint. The latter does
not establish an earlier decision or a verified post-confirmation observation
window. Neither result alone establishes sale/sharing effectiveness. A changed or
unverified document prevents accepting terminal state altogether.

These are local diagnostic corrections. No production recipe or caller was
enabled, and no customer finding or score was created from these observations.

## Live evidence

Three sequential visits used fresh isolated contexts, native TLS, public-network
guards and the exact original route `https://redhat.com/` →
`https://www.redhat.com/en`. Each retained a joined 301/200 request chain. No visit
retried a denial or switched identity/region. Local geographic egress was not
independently verified.

| Diagnostic | Observed result | Click time | Capture / cleanup complete |
| --- | --- | --- | --- |
| Direct timing | Broad selector reported ambiguous controls; zero clicks | — | 1,599 / 1,605 ms |
| Exact label | One verified native click; immediate state remained implied `[0]` | 1,813 ms | 1,826 / 1,830 ms |
| Terminal read | One verified native click; immediate state remained implied `[0]`; subsequent document request rejected before terminal read | 1,591 ms | 2,352 / 2,365 ms |

The exact-label visit observed the control at 1,779 ms, after the old readiness
cutoff. This demonstrates one successful dispatch using the recovered allowance;
it is not a population success rate or proof of first appearance at that time.
Both successful dispatches bound the exact visible and accessible “Do Not Sell or
Share My Personal Information” button in an open shadow root to its TrustArc host.

The final run retained `route_or_ancestry_mismatch`, followed by `document_changed`
from the binding gate. This means a subsequent document request was outside the
allowed chain; it does not prove navigation completed. Its destination was not
retained, so do not infer an external form, a specific destination or an authorized
reload. Final binding is false, no terminal read was accepted, and choice
confirmation remains false. The local `submitted` flag records completed click
dispatch only; it is not proof of a submitted form or registered opt-out.

There were two clicks, four read-only SDK calls and zero confirmed choices across
these three visits. No SDK mutation, second click in a session, Accept/Reject action
or form submission was performed. The final run is a failed/limited diagnostic,
not a completed choice path. Its full post-action capture was not verified.

## Verification and disposition

Four original Red Hat artifacts were checksum-verified. All three new live packets
were independently checked for original source hash, receipt hash/size, redirect
ancestry, control proof where present, readiness bounds and capture/cleanup caps.
Original records were preserved. The executed timing-only source is archived under
`outputs/redhat-direct-timing-2026-11-05/live-source/`; later source revisions are
kept in their separate run directories.

The final owned-browser suite covers 18 scenarios: light/shadow DOM, Accept/Reject
siblings in both structures, wrong visible/accessibility labels, forms, duplicate
opt-out controls, excessive candidates, mismatched SDK binding, newly reachable
late controls, controls beyond the cutoff, slow binding, unavailable state,
unregistered clicks, delayed category changes, and immediate/delayed document
changes. TypeScript and the calibration registry checks passed. Fixtures intercept
all requests locally and do not contact Red Hat. Fixture confirmation is not live
confirmation.

Before every public visit, central contact history was successfully exported and
the canonical selector applied the owner's cooldown waiver while preserving all
holds. Each attempt was recorded centrally with a distinct idempotent run key and
in the repository manual ledger. Disconnected AWS waiters were recovered from
their existing tasks without duplicate tasks or visits.

Keep the Red Hat TrustArc route inactive. The next unresolved question is the
post-click document transition and its exact provenance, followed by terminal
choice confirmation. Do not broaden the route or infer success from this click.
Further investigation should target that transition, rather than increasing
capture time or repeating readiness-only probes.

Accept/Reject, production flags, budgets, worker memory, scoring and historical
reports remain unchanged. No deployment occurred. Estimated recurring cost
increase: $0. Total one-time contact-ledger bookkeeping for this continuation:
below $0.15.

Final executable diagnostic and verification receipts:
`outputs/redhat-terminal-read-2026-11-05/`.
