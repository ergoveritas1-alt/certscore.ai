# CertScore.ai Gimbal route-handler diagnostic

October 23, 2026. The owner approved local implementation/tests and one bounded
passive original-route visit. That visit is consumed; no retry occurred.

## Result

All three reviewed first-party scripts finished in this visit. Their observed
navigation-handler and public-validation intervals rounded to zero milliseconds.
No identity handler was installed in this session, so identity/signing work did
not hold these requests here. This does not establish the configuration or cause
of the earlier visit's delay, nor represent Lambda performance.

| Resource/event | Host elapsed time |
| --- | --- |
| Final commit / HTML completion | 1,255 / 1,317 ms |
| Bricks Network request / Playwright request event | 1,316 / 1,521 ms |
| Splide Network request / Playwright request event | 1,316 / 1,521 ms |
| Search UI Network request / Playwright request event | 1,316 / 1,522 ms |
| Each navigation-handler entry/return and guard pending/validated | Same millisecond as its Playwright request event |
| Bricks HTTP 200 response/completion | 1,865 ms |
| Splide / Search UI HTTP 200 response/completion | 1,932 / 1,932 ms |
| DOMContentLoaded | 1,950 ms |
| OneTrust stub request / HTTP 200 completion | 1,954 / 2,426 ms |
| Load lifecycle event | 2,432 ms |
| Collector freeze / terminal snapshot start | 2,602 / 2,604 ms |
| Snapshot verified / capture plus cleanup | 2,612 / 2,638 ms |

The 205–206 ms gap precedes the observed Playwright request event and first user
route handler. It is not time spent inside those measured handlers. The next
344/411/410 ms to script response remains an unresolved combination of default
continuation, protocol/browser scheduling and network work. Handler return is
not proof of actual Chromium continuation or socket transmission. No routing
defect is demonstrated; do not remove guards, skip identity handling, change
interception or infer a performance improvement caused by this instrumentation.

The final document was `complete`, but its own OneTrust global was still absent.
The exact reviewed banner request was not observed. The stub completed only
178 ms before snapshot start. Completion of its download or the page's load event
does not prove CMP initialization, API availability, a completed privacy choice
or action readiness. The approved action-readiness deadline was not extended.

## Implementation and checks

All changes are local diagnostic artifacts in
`artifacts/gimbal-route-handler-2026-10-23/`, plus this report and the approval
record. Production runtime helpers are unchanged, verified against hashes.

`route-adapter.ts` wraps only existing navigation/identity callback registrations:
the original Route, Request, receiver, return value, overrides and thrown error
are preserved. It adds no route, continuation command, SDK operation or action.
Diagnostic callback errors cannot change routing. Identity mode records only
`absent`, `headers` or `signed`; no configuration secrets or header values are
retained.

The collector adds checkpoints only to the three already-accepted exact CDP
script slots, with unique URL/main-frame correlation and the same Playwright
Request object. There is no independent candidate inventory. If a Playwright
event precedes its selected CDP slot, its checkpoint remains unknown rather than
being reconstructed. Duplicate/mismatched requests are not stitched together.

Compact per-row checkpoint keys are `p` (Playwright request event), `n0/n1/nx`
(navigation handler entry/return/throw), and `i0/i1/ix` (identity handler equivalents).
These are host callback times, never protocol-identity joins. Recording stops at
freeze/cap/deadline; request listeners are removed while security handlers remain
active for normal cleanup.

All **34 offline tests pass**, including the previous request/lifecycle checks,
adapter argument/override/error preservation, delayed callbacks, absent handler
registration, exact request matching, late events, shared CPU and combined byte
caps. The focused TypeScript check passes. Evidence, source and test hashes are
in `verification.json`; raw output is `visit-gimbal-route-handler.json`.

The visit used 17 of 32 candidate inspections, seven resource slots and
approximately 1.38 ms of shared cooperative processing. The diagnostic is below
2,048 bytes and the complete packet below 32,000 bytes; exact sizes are in the
manifest. The unchanged capture is 2,750 ms including launch/setup, with the same
150 ms terminal reserve and 250 ms cleanup reserve. There was one snapshot,
zero SDK calls/actions, zero external-form visits and zero AWS invocations.

## Cost and authorization boundaries

Incremental recurring AWS cost is **$0**. Keep the current 3,008 MB Lambda,
six-lane topology and shared $10/month within $50 allowance. No deployment,
flag change, canary activation or production instrumentation occurred.

No flag change or routing repair is recommended from this result. The remaining
question is CMP initialization after stub loading; prior retained configuration,
geolocation and language-request evidence can be reviewed without another visit.
Another public visit, additional initialization/request-stage capture, SDK/state
reads, actions, external forms, expanded budgets, deployment or flag changes
requires separate authorization. This one-visit grant is consumed.
