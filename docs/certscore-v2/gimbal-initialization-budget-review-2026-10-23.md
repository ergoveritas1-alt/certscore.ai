# CertScore.ai Gimbal initialization delay: budget review

October 23, 2026. Retained evidence and local source inspection only. No live
scans, browser runs, deployment, flag changes or runtime modifications. Analysis
adds $0 recurring infrastructure cost.

## Conclusion

There is **no demonstrated scanner-side change that makes Gimbal ready within
the current action budget**. A small setup optimization is possible without
changing evidence or deadlines, but its benefit is unmeasured and it would not
close the gap seen in the fastest retained loading trace. Keep the current
neutral limited outcome and inactive rollout while deciding whether that small
optimization is worth implementing.

The action deadline is materially earlier than the passive diagnostic deadline.
With the effective 2,750 ms capture, the observer preserves its 1,300 ms opening/
submission/observation reserve and 100 ms margin, leaving about 1,350 ms for
readiness. Actual handler setup and canary authorization can reduce the remaining
allowance further; 1,350 ms is not a new guaranteed allocation after navigation.

## What the retained evidence establishes

The fastest retained Gimbal loading trace has:

| Event | Offset from local capture start |
| --- | ---: |
| Launch complete / navigation start | 53 / 79 ms |
| Final document commit | 755 ms |
| First-party synchronous scripts finish | 1,397–1,440 ms |
| DOMContentLoaded | 1,457 ms |
| OneTrust stub starts / finishes | 1,460 / 1,620 ms |
| Exact OneTrust banner starts / finishes | 2,053 / 2,145 ms |

The stub starts three milliseconds after DOMContentLoaded in this run. This is
consistent with late site-controlled loading; the retained material does not
include a source-level execution trace proving which site script caused it.
The 433 ms interval between stub completion and banner request is not measured
scanner sleep. The short trace retained Document/Script/Stylesheet requests,
excluding XHR/fetch, so it cannot explain all work in that interval.

The older original bundle provides additional, separately scoped evidence:

| Historical runtime request | Request / response offset |
| --- | ---: |
| OneTrust stub | 2,706 / 2,919 ms |
| Site configuration JSON | 2,926 / 2,998 ms |
| OneTrust geolocation JSON | 3,005 / 3,048 ms |
| `202604.1.0` banner SDK | 3,051 / 3,109 ms |
| Regional/language `en.json` configuration | 3,148 / 3,249 ms |

These five retained requests each have a unique matching response with HTTP 200,
the same URL, request ID, scanner/scenario and Infillion document context. The
sequence spans 543 ms from stub request to the last response timestamp. It shows
additional configuration/geolocation work; it does not prove a mandatory serial
dependency, download-completion time or getter readiness. It also does not prove
that the same requests occurred in either latest diagnostic. Do not add these
historical offsets to the newer trace or borrow their response bodies/region as
current state.

The most recent approved visit committed at 1,493 ms, already after the nominal
action-readiness cutoff. At 2,602 ms its document was still loading and its own
OneTrust global was absent. That narrows that lookup failure to global discovery,
but missing usable Resource Timing does not identify failed or blocked scripts.

## Scanner overhead and realistic bounds

In `sale-sharing-opt-out-observer.ts`, launch, context creation, HTTP identity
route installation, public-network route installation, blank-page creation and
CDP/redirect-guard setup currently precede navigation in sequence. It uses
`waitUntil: "commit"`; it is not spending navigation time waiting for network
idle. The readiness helper is event-driven with an absolute cutoff, not a fixed
sleep. The passive diagnostic's terminal wait was deliberate measurement time;
it is not present as an equivalent delay in the action observer.

| Local retained session | Launch completion | Navigation start | Entire post-launch setup interval |
| --- | ---: | ---: | ---: |
| Loading trace | 53 ms | 79 ms | 26 ms |
| Category diagnostic | 461 ms | 626 ms | 165 ms |
| Availability diagnostic | 390 ms | 567 ms | 177 ms |

The last column includes context creation and other work that cannot all be
overlapped. It is an upper envelope, not a measured saving or Lambda estimate.
Individual installer/page-creation durations were not retained.

Even the impossible sensitivity case of removing **all 79 ms** before navigation
from the fastest trace leaves DOMContentLoaded at 1,378 ms, stub completion at
1,541 ms and banner completion at 2,066 ms. Those remain past 1,350 ms. This
arithmetic assumes unchanged later timing and is not a predicted result.
Removing at most part of the 26 ms setup interval is substantially smaller.
Neither DOMContentLoaded nor a downloaded script alone proves actionable UI or
the required GPP decision state; the trace's terminal GPP check was unavailable.

The original-route public checks totaled 79 ms in that trace, at distinct
enforcement points. The two Infillion checks intentionally validate before
redirect release and again before the destination request connects. They are
not a demonstrated duplicate to delete. The request guard already caches
validation within the context, and the default resolver coalesces concurrent
lookups without caching settled DNS answers across those redirect checks.
The CDN's retained validation intervals were roughly 1 ms and 0 ms; that is not
evidence that DNS dominates OneTrust initialization. No additional DNS caching,
cross-boundary reuse or skipped validation is justified.

## Narrowest candidate fix

If proceeding, implement **Gimbal-only overlap of blank-page creation and the
existing guard-installation chain**, with offline tests first:

1. Select only the validated exact Gimbal original-route dispatch, preserving
   the existing canary/worker authorization before browser work. No broad recipe
   or global browser-path change.
2. After the isolated context exists, start `context.newPage()` while installing
   the existing HTTP identity route and then the public-network guard. Preserve
   those two installers' order and behavior; do not parallelize route registration
   with each other or replace their handlers.
3. Await both branches before continuing with the existing navigation-blocking
   route, CDP setup, exact redirect guard and original `goto`. No target request,
   SDK call or action may occur before every required guard is installed. The
   new page must remain the initial blank document during the overlap.
4. On either failure or cancellation, close the isolated context, observe both
   promises and prevent late completion from navigating or leaking a page.
   Use the original absolute deadline throughout; do not give either branch a
   new timeout, retry, context or browser.
5. Preserve existing timing fields, all source/loader/route checks, readiness
   and action predicates, GPP proof, packet limits, capture/cleanup reserves and
   unchanged behavior for ReadCube and every other target. Add no new production
   telemetry field or retained object for this change.

Offline acceptance tests should hold page creation and guard installation
independently to verify actual overlap; assert `goto` cannot run until both and
the remaining redirect setup finish; preserve route registration order; fail
closed on either rejection, late completion, timeout and cancellation; and
exercise unchanged non-Gimbal behavior, document binding and action reserves.
Synthetic faster execution is not evidence of public-site recovery. Tests should
use owned fixtures/mocks without contacting public hosts.

This is a startup optimization candidate, **not a OneTrust initialization fix**.
The maximum saved time is the overlap between these operations, which was not
measured. There is no honest retained-evidence basis for promising a percentage
improvement, successful opt-out or a particular number of milliseconds.

## Scope, cost and approval boundaries

This request authorizes investigation and a proposal; the candidate is not
implemented. The smallest next approval would be:

> Implement the Gimbal-only blank-page/guard setup overlap locally with offline
> tests. Preserve guard order, the pre-navigation barrier, isolation, all current
> absolute budgets and action checks. No public visits, deployment, flag changes,
> additional workers or SDK calls.

Local implementation/tests add $0 recurring AWS spend. The candidate adds no
invocation, operation, memory, capacity, model call or retained field; it changes
the scheduling of existing setup work. Maximum per-scan allocations remain the
same. Do not claim measured production savings: an attempt that progresses
further can consume more of its existing allowance. Any later activation must
account for that consumption within the shared $10/month inside $50, verifying
remaining allowance rather than treating it as unused. No extra monetary
allowance is requested for this local proposal.

The following are not narrow timing repairs and need separate authorization:

- Any new public diagnostic/canary visit or production deployment/activation.
- Preloading/injecting the SDK, moving site scripts, blocking otherwise permitted
  page resources, overriding geolocation/configuration, or replaying/caching CMP
  responses. These alter the site behavior being measured; they are not recommended
  as an evidence-capture repair even if they fit the clock.
- Reusing browser state across lanes/scans, warming capacity, raising worker
  memory, skipping the original redirect, relaxing DNS/TLS validation, resetting
  the deadline at commit or borrowing the action/observation reserve.
- Earlier Settings opening without its current readiness predicate, new SDK
  reads, a non-GPP adapter, privacy-choice mutation or external forms.

Actual site-side earlier CMP loading could be discussed with the site owner if
they request remediation, but no site modification or outreach is authorized
here, and retained evidence does not identify a safe source edit for their site.
**Flag changes will not accelerate initialization and are not recommended.**
The lower-cost alternative is to retain limited results and defer this small
optimization, since it cannot be shown to close the observed readiness gap.

## Offline verification

`artifacts/gimbal-initialization-review-2026-10-23/audit.cjs` verified four retained
sources against their earlier manifests/receipt, including the historical bundle
byte size, and checked the five unique historical request/response joins. It
computed the timing bounds in `analysis.json`. No prior evidence was rewritten.
Source inspection covered the observer, readiness helper, public-network guard,
redirect guard, browser launch configuration, HTTP identity routing and Lambda
worker deadline/canary handoff. No runtime fix or test of proposed behavior was
performed in this investigation.
