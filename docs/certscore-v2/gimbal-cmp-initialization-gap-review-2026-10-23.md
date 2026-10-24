# CertScore.ai Gimbal remaining CMP initialization gap

October 23, 2026. Retained-evidence investigation only. No browser, public
request, runtime modification, deployment or flag change. Recurring AWS increase: $0.

## Finding

No safe scanner-side initialization fix is established. The latest visit got
past the page scripts and downloaded the OneTrust stub, but did not retain the
intermediate CMP requests needed to locate the remaining initialization stage.
The own OneTrust global was absent; this is not permanent API absence, an opt-out
failure or proof that the stub failed to execute.

| Latest visit | Offset |
| --- | ---: |
| DOMContentLoaded | 1,950 ms |
| Stub request | 1,954 ms |
| Stub public validation | 1,954–2,009 ms |
| Stub HTTP 200 response and completion | 2,426 ms |
| Page load event | 2,432 ms |
| Terminal snapshot starts | 2,604 ms |

Only **178 ms** elapsed between observed stub completion and snapshot start.
The page was complete, its own OneTrust global absent, and the exact banner
request unobserved. The 55 ms guard interval is public validation, not a proven
DNS-only delay; the remaining 417 ms to completion includes unresolved routing,
browser/protocol and network work. No caching or validation bypass is justified.

The earlier detailed trace finished the stub at 1,620 ms and started the banner
at 2,053 ms, a 433 ms interval. That trace omitted XHR/fetch. It demonstrates that
the gap can contain substantial additional work, not that this latest visit
needed another 255 ms or would follow the same sequence. Do not extrapolate a
required wait or transfer timings between sessions.

The verified historical runtime bundle has five uniquely joined HTTP 200
request/response pairs in the same Infillion document/scenario:

| Historical resource | Request → response offset |
| --- | ---: |
| Stub | 2,706 → 2,919 ms |
| Exact site configuration JSON | 2,926 → 2,998 ms |
| OneTrust geolocation endpoint | 3,005 → 3,048 ms |
| Exact `202604.1.0` banner SDK | 3,051 → 3,109 ms |
| Exact regional/language `en.json` | 3,148 → 3,249 ms |

Retained attribution identifies the stub as the responsible script for the
historical geolocation/banner requests and the banner for the regional request.
It does not establish a mandatory serial dependency, response-body correctness,
current region/configuration, or getter readiness. Historical configuration
request attribution does not name a responsible script. None of these historical
responses can fill the latest capture's missing facts.

## Current budget implications

The action observer already uses commit navigation and bounded event-driven
readiness; it does not contain a fixed initialization sleep to remove. With a
2,750 ms effective capture, its nominal readiness cutoff is 1,350 ms after
reserving existing opening, action, observation and cleanup work. A tighter
parent deadline can reduce this further.

The latest stub did not start until 1,954 ms, already after that cutoff. Even
the earlier detailed trace started it at 1,460 ms. Completing initialization near
the passive terminal checkpoint would therefore still not demonstrate readiness
for an action under the current reserves. The diagnostic is useful for locating
a limitation, not a promise to recover this route. Keep the limited outcome and
inactive flags; no evidence supports borrowing the action reserve.

## Narrowest next diagnostic — proposal only

Replace the three first-party script slots and remove their route-handler
checkpoints. Keep seven total slots: original document, final document, stub,
exact site configuration, exact geolocation endpoint, exact banner and exact
regional/language configuration. The five exact CMP URLs, taken from the verified
historical request bytes without query strings, are listed in
`artifacts/gimbal-cmp-initialization-review-2026-10-23/analysis.json`.

This is a replacement of diagnostic scope, not additional scanning:

- Passively observe existing CDP Network events for Document, Script, XHR and
  Fetch requests, sharing one 32-candidate inspection cap across all four types.
  No independent XHR/fetch allowance. Keep first response/status and first
  completion/failure per selected request. Do not fetch the URLs ourselves.
- Match the exact reviewed HTTPS URL and GET method for each CMP slot, with no
  wildcard tenant, locale, version, host or query expansion. Record fixed role
  names, timing/state and existing guard phases only. Changed endpoints stay
  unknown. Existing guard diagnostics may classify XHR/fetch for these exact
  slots without modifying enforcement or issuing another DNS check.
- Preserve unique request identity, redirect ordinal, main-frame/loader checks,
  exact original-route ancestry, native TLS, isolation and all network guards.
  Guard checkpoints remain correlations, never proof of network transmission.
- Keep the same 2,750 ms absolute capture, 150 ms terminal reserve, cleanup
  reserve, shared 10 ms cooperative processing, 2,048-byte diagnostic and
  32,000-byte packet. Retain at most two existing lifecycle checkpoints and
  one terminal readyState/own-OneTrust descriptor snapshot. No new wait, retry,
  polling, SDK call, category/GPP read, click or external-form visit.
- Stop diagnostic collection at cap/freeze/deadline; preserve security handlers.
  No headers/bodies, configuration values, geographic result, cookies, source
  code, stacks, console capture, CPU profiling or broader API discovery.

If configuration or geolocation is pending/failed, the diagnostic identifies
that stage without claiming a cause. If all selected resources finish but the
global remains absent, execution/initialization or another unobserved dependency
remains unresolved. If a slot is unobserved or the candidate cap is hit, report
unknown/limited rather than absence. Expanded request types may reach the same
32-candidate cap sooner; no automatic retry or larger buffer follows.

Offline acceptance checks should cover delayed configuration/geo/region,
completed downloads with absent global, changed URL/locale/version, duplicate
requests, document/loader mismatch, shared four-type candidate cap, processing
and combined byte caps, cancellation and zero SDK/action execution. Tests and
implementation precede any public visit.

## Approval and recommendation

The last single-visit grant is consumed. Nothing proposed above was implemented
or run in this investigation. The narrowest approval, if further explanation is
worth another diagnostic, is:

> Implement and offline-test the seven-slot Gimbal CMP initialization diagnostic
> locally, replacing the first-party script/route-handler telemetry with the
> three exact configuration/geolocation/regional slots and sharing all existing
> caps. Then run one bounded passive original-route visit, zero SDK calls/actions,
> no external forms, retry, deployment, flag change or Lambda invocation.

Implementation/tests may be approved without a visit. Expected additional
recurring AWS spend is **$0**, with one small local artifact if validation is
authorized. Keep the existing 3,008 MB Lambda, six-lane topology and shared
$10/month within $50 allowance. No extra monetary allowance is requested.

The lower-cost alternative is to stop live investigation and retain this route's
coverage limitation: there is currently no demonstrated recovery within the
action budget. Flags will not accelerate initialization and should stay unchanged.
Longer deadlines, altered action reserves, larger/warmed workers, SDK reads or
non-GPP verification, page-resource injection/blocking/reordering, CMP response
replay, region overrides, external forms, further visits and rollout each need
separate authorization. None is recommended as a repair on this evidence.

## Verification

`artifacts/gimbal-cmp-initialization-review-2026-10-23/audit.cjs` verified the latest
manifest/evidence/source hashes, historical bundle hash and size, five unique
request/response joins and earlier trace hash. It calculated the 178/433 ms
intervals and 1,350 ms nominal cutoff into `analysis.json`. The reviewed observer,
readiness and decision-reader source hashes are retained. No prior evidence or
production source was changed.
