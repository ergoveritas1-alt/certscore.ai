# CertScore.ai Gimbal navigation slowdown review

October 23, 2026. Retained evidence and local source inspection only. No live
visit, SDK call, privacy action, deployment, flag or runtime change.

## Recommendation

Stop Gimbal live iteration for now and retain explicit unavailable/unknown
category verification. There is no demonstrated safe runtime fix or evidence
supporting a production budget increase. The latest diagnostic local visit
does not measure production Lambda performance or a latency distribution.
Enabling flags would not remedy this navigation delay or supply category proof.

## Where the time went

Compare the previous six-second initialization visit with the latest six-second
category visit. These are host callback offsets, not browser wire timestamps.

| Interval | Previous | Latest | Change |
| --- | ---: | ---: | ---: |
| Navigation to commit | 727 ms | 2,644 ms | +1,917 ms |
| Original request callback to public guard pending | 42 ms | 1,875 ms | +1,833 ms |
| Public guard pending to validated | 2 ms | 4 ms | +2 ms |
| Validated to original redirect / destination request | 290 ms | 275 ms | -15 ms |
| Destination request to commit | 392 ms | 489 ms | +97 ms |
| Completed HTML to collector freeze | 4,582 ms | 2,579 ms | -2,003 ms |

About 95.6% of the additional navigation duration sits before the public guard's
pending notification. Setup completed only 70 ms later in absolute elapsed
time; navigation began 69 ms later. Final commit was 1,986 ms later overall.
Both visits retained the authorized original route, one HTTP 301 hop, native
TLS and final HTTP 200. The latest visit used 14 of 32 candidate slots and
1.09 ms of its 10 ms diagnostic processing cap; those caps were not exhausted.

The category snapshot started at 5,852 ms, after navigation and HTML completion,
and made zero SDK calls. The newly permitted getter cannot explain the earlier
navigation delay. Harness comparison shows unchanged setup/navigation operations;
changes concern authorization/accounting, output names and the terminal reader.
Runtime helper hashes match both retained verification manifests.

## Important attribution limit

The four-millisecond public guard span does **not** rule out network validation
or DNS delay. `sale-sharing-redirect.ts` separately awaits `validatePublicUrl`
before `Fetch.continueRequest`; it also validates the exact redirect destination
before releasing the response and again at destination request time. The latest
collector does not time those document-guard operations.

The older retained `settings-loading-investigation-2026-10-23/trace-gimbal.json`
positively illustrates this ordering: original document validation ran from
80–116 ms, followed by the public guard's pending callback at 116 ms and validated
callback at 117 ms. It establishes a blind spot, not the cause of the latest delay.

Installed Playwright routing code also pairs Network and Fetch events before
dispatching a route; `route.fallback()` passes to subsequent handlers rather than
proving a network send. Missing document pause, validation and continuation
timestamps leave validation, browser/protocol delivery and local scheduling
unresolved. No evidence here establishes a server delay, DNS fault, deadlock or
scanner regression. Removing either interception layer, sharing settled DNS
results across validation boundaries, or bypassing the original route is not a
justified repair.

Losing roughly two seconds of post-HTML time helps explain reduced opportunity
to initialize, but does not prove the entire CMP failure was caused by navigation.
The latest page remained `loading` 2,579 ms after HTML completion. Its five CMP
resource slots are unknown; the compact evidence does not identify all parser
dependencies. Earlier OneTrust object presence cannot supply this visit's state.

## Optional next step and approval boundary

No further work is recommended unless Gimbal specifically warrants more effort.
If reopened, the narrowest useful diagnostic would time only the existing
document guard: original and destination request pauses, redirect response pause,
existing public validation start/end, continuation send/acknowledgment and failure.
Use fixed slots for those stages in the existing 2,048-byte/10 ms diagnostic
allowance, replacing lower-value details if necessary; retain the 32-candidate,
32,000-byte packet, six-second local deadline and cleanup reserves. Preserve
guard order, fresh validation, isolation, native TLS and exact-route checks.
Offline fixtures must establish bounded callbacks and no changed continuation
behavior before any visit. No bodies, headers, new DNS calls, SDK calls, actions,
external forms, retries or extra waits would be part of this proposal.

Another original-route visit requires a **new explicit one-visit authorization**;
the last grant is consumed despite its unused getter allowance. The proposal
would authorize diagnostic instrumentation and one passive visit only, with zero
SDK calls/actions. It would not authorize a runtime optimization, more capture
time, different workers, extra lanes, state-verification adapter, deployment or
flag activation. Any such expansion needs separate approval; guard weakening is
not recommended. No spend increase is recommended. An optional local diagnostic
adds no recurring AWS usage; this review's recurring increment is **$0**. Existing
Lambda configuration, six-lane topology, production budgets and shared $10 within
$50 allowance remain unchanged.

## Verification

`artifacts/gimbal-navigation-slowdown-review-2026-10-23/audit.cjs` verifies both
visits' retained file hashes against their manifests, current runtime hashes,
the older trace hash, zero SDK/action counts, route proof and timing arithmetic.
Its output is `analysis.json` alongside it. This is an offline evidence audit,
not a new scan or a rerun of the historical diagnostic tests.
