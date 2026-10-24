# CertScore.ai Gimbal pending-script routing review

October 23, 2026. Retained evidence and local routing/dependency source only.
No browser launched, live scan, public request, deployment, flag change or
production runtime edit. Incremental recurring AWS cost: $0.

## Conclusion

No production routing repair is justified yet. The newest diagnostic establishes
unfinished script requests but does not establish that the requests had passed
all local handlers or resumed in Chromium. Its `validated` marker means the
public-network guard accepted the request, not that routing completed.

The narrowest next step is diagnostic-only route-handler checkpoints, with
offline tests first and one separately authorized passive original-route visit
only if approved. Do not remove interception, replace `fallback()` with
`continue()`, alter redirect protection or enable an action flag on this evidence.

## Verified evidence

The previous manifest hashes still match the latest visit, harness, collector
and production helpers. The earlier full trace matches its retained hash.

| Script | Request → guard pending | Guard pending → validated | Validated → freeze | State at freeze |
| --- | ---: | ---: | ---: | --- |
| Bricks | 470 ms | 0 ms | 717 ms | Pending; no response/terminal retained |
| Splide | 471 ms | 0 ms | 716 ms | Pending; no response/terminal retained |
| Search UI | 471 ms | 0 ms | 716 ms | Pending; no response/terminal retained |

All three were parser-initiated at 1,414 ms and remained pending at the 2,601 ms
collector freeze, an elapsed 1,187 ms each. Final HTML completed at 1,416 ms.
Fourteen candidates were inspected, below the 32 cap; the collector returned
`observed`, not a truncated/time-limited result. Document readiness was still
`loading`, the own OneTrust global was absent and no selected stub/banner request
was observed. This is a bounded observation, not permanent absence.

The earlier trace completed these scripts at 1,397/1,439/1,440 ms, with a
201–202 ms request-to-guard interval. The current interval is larger, but two
different local sessions do not establish a regression or a Lambda bottleneck.
The latest capture was local, not a measurement of the 3,008 MB Lambda.

## What the routing code establishes

The local harness registers identity handling first, public-network validation
second and the navigation/subframe restriction last. Installed Playwright 1.58.2
prepends route handlers and runs them in that order of precedence:

1. Navigation/subframe restriction. A script falls through without navigation
   checks or DNS work.
2. Public-network guard. It emits `validation_pending`, awaits the existing
   origin validation promise, emits `validated`, then calls `route.fallback()`.
3. Identity/header handler, **if installed**. It may construct signing/header
   overrides, then falls through. Its registration depends on configuration.
4. Playwright's default continuation after the handler chain finishes.

The prior visit did not retain identity-handler installation/signing mode or
entry/return timing. Current environment values cannot prove its historical
configuration, so signing must not be blamed or assumed absent.

In the installed dependency source, `Route.fallback()` applies overrides and
resolves the current handler as unhandled. It does not await the next handler or
send `Fetch.continueRequest`. `BrowserContext._onRoute()` continues through the
remaining handlers before default continuation; the Chromium delegate sends the
protocol command later. Therefore even a new marker after `await fallback()`
must be called a handler return/handoff, never network release or request sent.
The public guard also does not emit `denied` for an exception after its validated
state, so the current phase list is not a complete downstream-error inventory.

Playwright waits for its own Network/request-paused pairing before exposing an
intercepted request to user routing. The independent diagnostic CDP session can
observe `requestWillBeSent` earlier. The 470–471 ms interval therefore includes
unknown protocol/browser/client scheduling and routing delivery; it is not a
measurement of public DNS, TCP/TLS, server wait or time inside our first handler.
The 716–717 ms later interval also cannot distinguish a later handler from
browser/network work. No response timing was retained to resolve those stages.

The separate exact-route CDP guard enables Fetch interception for **Document**
request/response stages only. The script requests do not match those configured
patterns. No direct script hold is evident in that guard. This is not a proof
that two CDP sessions can never interact; no retained evidence establishes such
an interaction here. Keep the document guard intact.

Playwright's interception code disables HTTP cache while routing is enabled.
That explains why removing routing would change measurement behavior as well as
security. It does not identify this visit's bottleneck and is not a safe proposed
optimization. Likewise, replacing the public guard's fallback with continue
would skip the later identity handler.

## Narrowest next diagnostic — proposed only

Replace the existing one-visit diagnostic with a local route-checkpoint variant;
do not add production telemetry or another independent capture lane.

- Keep the exact original Gimbal route, tested setup overlap, native TLS,
  contact holds, isolated context, public-network checks, document redirect
  guard, same guard order and existing terminal document verification.
- Keep the seven resource slots and existing Network/lifecycle capture. Add
  only the first checkpoints for the three already-reviewed main-frame script
  requests: public Playwright request-event observation; existing navigation
  handler entry/return; and existing identity handler entry/return if installed.
  Retain bounded return/throw status and one installation-mode enum, without
  header values, key identifiers, signing material or raw exception text.
- Instrument existing callback registrations in the local harness using a thin
  adapter that forwards the original Route and handler unchanged. Do not add a
  terminal route, issue additional continuation commands, reorder callbacks,
  patch Playwright internals or broaden Fetch patterns. Callback throws must
  propagate unchanged. Diagnostic errors must not affect guard enforcement.
- Bind Playwright checkpoints by the same Request object, unique exact URL and
  main frame, with the existing CDP loader checks. Do not equate Playwright,
  Network and Fetch identifiers. Duplicates or mismatches stay ambiguous.
- Share the same 32 candidate-inspection allowance, seven slots, 10 ms
  cooperative processing and 2,048-byte diagnostic limit, inside the 32,000-byte
  packet. Fixed compact checkpoint fields should fit the latest 1,170-byte
  diagnostic; worst-case tests must enforce the cap rather than raise it.
  Disable diagnostic recording at cap/freeze, while keeping security handlers
  active until normal cleanup. Keep one terminal readiness/descriptor snapshot.
- Keep the 2,750 ms absolute capture including launch/setup, 150 ms terminal
  reserve and existing cleanup reserve. No retry, polling, added wait, SDK
  call, action, external form, body/header read or broader resource capture.

Before any public contact, offline tests should exercise delayed request
delivery, navigation and identity handlers, absent identity registration,
fallback return before default continuation, errors after validation,
duplicate requests, cancellation and combined byte/time/candidate caps. Prove
that the adapter preserves callback ordering, route arguments, header override
behavior and thrown errors; it must not call a continuation itself.

Interpretation must stay narrow:

| New observation | Supported next conclusion |
| --- | --- |
| Playwright request event/first handler arrives late | Delay precedes or accompanies user-handler delivery; browser/protocol timing remains unresolved |
| One existing handler has a long entry-to-return interval | Inspect that specific handler using retained facts; guards still cannot be relaxed |
| Handlers return promptly but scripts remain pending | User-handler time does not explain the rest; actual protocol continuation/network timing needs a separately scoped diagnostic |
| Cap, mismatch, error or no commit | Limited result; no automatic retry or causal claim |

This deliberately does not claim to measure actual socket transmission or
Chromium's continuation acknowledgment. Obtaining that would require a broader
diagnostic than the first missing boundary warrants.

## Approval, cost and lower-cost alternative

The prior one-visit authorization is consumed. This turn asks for investigation
and a proposal, and forbids live scans; no diagnostic implementation or visit
above was performed. The exact next approval would be:

> Implement and offline-test the Gimbal-only route-handler checkpoint diagnostic
> locally, preserving existing handlers/order and all current caps, then run one
> bounded passive original-route visit. Zero SDK calls/actions; no external forms,
> retries, deployment, flag changes, Lambda invocation or canary activation.

Implementation/offline tests can also be approved without the visit. Expected
additional recurring AWS cost is **$0**; a local validation would create one
small local artifact. Keep the current Lambda, six lanes and the existing shared
$10/month within $50 allowance. No capacity or budget increase is requested.

The lower-cost alternative is to stop with the retained coverage limitation;
offline ordering tests already establish why current telemetry cannot identify
a routing fault. Resource blocking/reordering, identity changes, broader tracing,
guard changes, longer budgets, extra visits, deployment and flag changes each
need separate scope authorization. No flag change is recommended now.

## Review artifacts

`artifacts/gimbal-routing-review-2026-10-23/audit.cjs` verifies retained hashes and
calculates the intervals into `analysis.json`, including hashes of reviewed
repository and installed Playwright source. `routing-semantics.test.cjs` uses the
installed client methods with mock routes/continuation and no browser/network:
all three tests pass. These establish fallback semantics only; they do not
simulate or prove Gimbal's actual network behavior. No production files changed.
