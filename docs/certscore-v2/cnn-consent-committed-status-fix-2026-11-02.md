# CertScore.ai consent status retention after a readiness timeout

Local work only, based on `6a9d197a207765ea958059d6ee2f2b2fdd94aa07` and preserving
the existing uncommitted CMP/GPC changes and concurrent dashboard-test edit.
No push, publication, deployment, flag change or historical rewrite.

## Confirmed defect and correction

The consent scanner already receives a main-document response from its existing
`goto(..., waitUntil: "commit")`. If the subsequent DOMContentLoaded wait times
out, its catch returns null. Later access diagnostics can therefore record a
loaded page without its original HTTP status. A representative but degraded
consent lane needs that status for the existing strict independent-document
handoff. The missing fact can leave otherwise valid partial evidence unbound.

A hermetic browser regression reproduced an actual committed HTTP 200, one
navigation, an injected post-commit readiness timeout and a loaded geometry
artifact with an absent HTTP status. The same regression passes after the fix.
This establishes the code defect; it does **not** establish that this was the
cause of either retained CNN failure.

The scanner now keeps one invocation-local response candidate from that existing
navigation. It retains only URL, status and the expected main-document revision.
The existing CDP frame handler counts changed loader commits. The candidate can
complete the already-existing access read only when:

- the native response is a navigation response from this page's main frame;
- its URL matches the current committed destination;
- exactly one main-document commit occurred since dispatch;
- the cached CDP loader and URL are identical before/after the existing access read;
- the geometry being serialized has that same URL and loader;
- access is already `loaded`, without any access reason code or HTTP status;
- the original response status is a valid integer 2xx value.

CDP commit metadata may arrive after `goto` resolves. The existing access read
retains a private weak reference to its bound response, without changing its
returned access result. Each existing geometry artifact write joins that receipt
against the actual geometry's URL and loader. A document change between access
and geometry cannot lend the earlier status to a replacement geometry. The same
check applies to the existing final geometry refresh write. There is no new wait,
read, listener or artifact write. Server redirects can
still end in one committed document. A second document commit, including a
same-URL replacement, omits the supplemental status. Missing loader proof, a
changed document, non-success response, blocked/unknown/timeout access or an
existing recorded status leaves the original access result unchanged.

The helper adds only the existing `httpStatus` field at serialization. It does not expose the
private response URL, document token or commit revision. The original navigation
return value, navigation-attempt diagnostics, all recovery decisions and all
capture scheduling stay unchanged. In particular, retaining status does not
enable the existing HTTP-202 retry branch. The helper preserves `access.status`.
Runtime and GPC sessions do not use this consent-only supplement.

No browser command, API call, capture, retry, default wait, navigation, model call,
object read or publication is added. Original future worker artifacts retain
their actual bytes and are verified by the existing coordinator. Historical
artifacts and report interpretations remain unchanged. Finding policies, source
proof gates and score weights are unchanged; no missing criterion is converted
into a pass. No public contract, package version or database migration is needed
for this existing private geometry field. Global projection v27 is unchanged.

## GPC probe investigation

The complete [IAB GPP API specification](https://raw.githubusercontent.com/InteractiveAdvertisingBureau/Global-Privacy-Platform/main/Core/CMP%20API%20Specification.md)
requires generic commands, including `ping`, to call back immediately without
asynchronous logic. The earlier suggestion that accepting delayed callbacks
might repair a valid GPP implementation was incorrect. The production probe's
synchronous gate stays unchanged. Regression tests explicitly reject both
timer-delayed and microtask-delayed callbacks with no accepted state/hash.
CNN's specific not-ready cause remains unproved by its retained public fields.

## Verification and cost

The dedicated local regression covers direct navigation, server redirect and
same-URL replacement. It asserts one isolated context, one scanner navigation,
one existing recovery-attempt entry and no newly enabled late accessibility
retry. Only the redirect/replacement fixtures have their two expected document
requests. The exact fixture CMP script is fulfilled with synthetic bytes;
unexpected external requests are rejected and service workers are blocked.
Unit tests cover missing/mismatched bindings, non-success responses, existing
status, access failures, reason codes, immutability and data minimization.
An assessment/report regression verifies that the retained status can complete
an otherwise valid partial handoff while failed visits and replacement loaders
remain unavailable. Both new browser and callback regressions enter predeploy.

Receipts and the final source state are in
`outputs/cnn-cmp-capture-fix-2026-11-02/verification.md`. The prior web/PDF review
remains applicable to unchanged presentation sources; this step changes no UI.

The new geometry property adds 17 serialized bytes when previously absent.
Added cached state and pure processing are bounded; there is no configured
infrastructure or paid-service increase. Keep the **single combined conservative
$0.50/month allowance at 100,000 scans and 30-day retention** for all current local
CMP/GPC changes. This supplement fits inside the existing 2 KiB-per-scan reserve;
it is not an additional allowance. Local checks add $0 recurring AWS cost.
Local timing receipts are synthetic and do not establish Lambda performance,
production population coverage or that CNN's missing details are repaired live.

The underlying CNN consent failure and its paired CMP-state availability still
require direct supporting evidence. No additional public scan was run against
the unchanged deployment. A future separately authorized AWS release must keep
compatible consumers ahead of producer changes, followed by a fresh report
check. This document authorizes no deployment or publication.
