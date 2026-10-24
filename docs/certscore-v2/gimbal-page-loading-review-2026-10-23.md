# CertScore.ai Gimbal page-loading investigation

October 23, 2026. Retained-evidence investigation only. No browser runs, public
requests, runtime changes, deployment or flag changes. Incremental recurring
infrastructure cost: $0.

## Finding

The leading historical candidates are **first-party parser-initiated scripts**,
but the latest visit did not retain enough request detail to identify its blocker.
The latest own OneTrust global was absent while the document remained `loading`
1,305 ms after final commit. That puts the unresolved issue earlier than a
OneTrust method lookup. It does not establish which resource or execution task
prevented the document from progressing.

In the detailed earlier loading trace:

| Resource | Request → finished | Duration | Finished before DOMContentLoaded |
| --- | ---: | ---: | ---: |
| Bricks: `/wp-content/themes/bricks/assets/js/bricks.min.js` | 835 → 1,397 ms | 562 ms | 60 ms |
| Splide: `/wp-content/themes/bricks/assets/js/libs/splide.min.js` | 836 → 1,439 ms | 603 ms | 18 ms |
| Search UI: `/wp-content/themes/bricks-child/addsearch/dist/ui.min.js` | 836 → 1,440 ms | 604 ms | 17 ms |

All three had HTTP 200, parser initiators and retained DOM attributes with
`async: false` and `defer: false`. The older original bundle independently
retained those attributes for these script paths. This is consistent with
parser-blocking candidates, not proof of their exact execution dependencies or
which was critical. Their requests overlap; **do not add the durations**.

The final HTML finished at 836 ms, only 81 ms after commit, in that earlier
trace. DOMContentLoaded occurred at 1,457 ms, and the OneTrust stub started at
1,460 ms. This suggests that page parsing/script work preceded the CMP request
in that run. It does not prove the site universally waits for DOMContentLoaded
to load OneTrust or identify the site's source-level trigger.

The recorded public-network validation phase for each named script began and
ended at 1,037 ms, effectively zero at this timer resolution. The 201–202 ms
between request-event observation and guard-event observation is real retained
spacing, but not a measured DNS lookup or proof of an interception defect.
Protocol delivery, routing/scheduling and browser activity are not separated in
those timestamps. Responses followed another 360–403 ms later; DNS, connection,
server wait, transfer and execution attribution remain unresolved.

The separate historical bundle also shows OneTrust configuration, geolocation
and regional/language JSON requests around the stub/banner sequence. Those are
possible later initialization stages. They cannot explain the latest unfinished
document state by themselves and should not be the next diagnostic's focus. Neither the
historical responses nor their offsets can be substituted for the latest session.

## What is still unknown

The latest passive visit retained a good final HTTP response/loader, one loading
state, absent own OneTrust global and two unknown Resource Timing results. It
did **not** retain final HTML body completion, named script request/response/
completion/failure events, guard timing, or loader-scoped parsing lifecycle.
Completed Resource Timing lookups alone cannot identify an in-flight request.

Consequently, retained evidence cannot distinguish:

- An unfinished HTML response keeping the parser busy.
- One of the named scripts still waiting on request handling or delivery.
- Completed resources followed by parsing/execution work, or another unobserved
  script/stylesheet dependency.
- A different loading path from the earlier trace.

The already-validated setup overlap only overlapped approximately 1 ms of guard
installation in the latest run. There is no evidence that flags, further setup
micro-optimizations, relaxed route checks or a longer getter search would resolve
the remaining page-loading delay.

## Narrowest next diagnostic — proposal, not implemented

Use **one passive Gimbal original-route request/lifecycle diagnostic**, replacing
the current availability-only diagnostic rather than adding another visit or
another terminal snapshot to it.

1. Reuse the tested setup overlap and original-route/TLS/public-network guards.
   Keep the one 2,750 ms absolute capture including launch/setup/navigation, the
   existing cleanup reserve and one terminal snapshot at deadline minus 150 ms.
   No retries, polling, extra wait, direct-final navigation or timeout reset.
2. Before the original navigation, enable passive CDP Network/lifecycle events
   in the existing session. That setup consumes the same absolute allowance.
   Retain at most **seven request slots**: the original and final route documents,
   the three exact HTTPS Infillion script paths above, and the two exact reviewed
   OneTrust stub/banner URLs. Match script paths observationally without retaining
   query values; distinguish duplicates as ambiguous instead of merging them.
   This does not grant authority to navigate to or fetch any of those resources.
3. Retain only bounded timing/state metadata: request start, response/status,
   completion or failure, initiator kind, and existing guard pending/validated/
   denied checkpoints where available. Capture at most 32 candidate Document/
   Script request inspections; retain only the first response and first terminal
   event per selected request. Use request identity plus redirect ordinal where
   needed because CDP may reuse a network request ID across redirects. Never join
   unrelated network and Fetch identifiers. Keep main-frame/loader provenance;
   mismatches or incomplete correlation remain unknown.
4. Retain at most the current document's DOMContentLoaded and load lifecycle
   checkpoints. At the single existing snapshot, read only `document.readyState`
   and the own OneTrust descriptor classification, without invoking it. Replace
   the previous method/prototype and Resource Timing reads; no SDK, GPP, category,
   cookie, screenshot or whole-DOM inspection is needed for this question.
5. Use fixed role/slot names instead of arbitrary URLs or error strings. Keep
   all new trace plus snapshot metadata within **2,048 bytes**, inside the existing
   **32,000-byte packet**. Share the existing **10 ms cooperative processing
   allowance** across collector work and terminal evaluation. Stop collectors
   at the deadline/cap and remove listeners. Mark truncation, late events and
   unfinished requests explicitly; never infer absence from a full buffer.
   Native/protocol work is not preemptible by a JavaScript stopwatch, so retain
   the outer abort and reject over-budget/late evidence.
6. Preserve the exclusive attempt receipt, exact redirect proof and before/after
   terminal loader/URL checks. No response bodies, headers, cookies, source code,
   stacks, CPU profiling, SDK calls, privacy actions or external-form visits.

This is narrower than a general performance trace and would distinguish whether
HTML or the three leading script candidates are still unfinished. If all are
complete while the document remains loading, the result must say the cause is
still unresolved; it cannot attribute CPU execution or exclude other resources.
Likewise, request events never observed before a cap/deadline remain unknown.
The diagnostic cannot promise a successful capture or a repair within this budget.

Offline tests should precede any public visit: delayed HTML versus delayed named
scripts; completed resources with a still-loading document; duplicate URLs and
redirect ID reuse; frame/loader changes; event/byte/time caps; late callbacks and
cleanup; zero SDK/action execution. Use mocks/owned fixtures only.

## Approval and cost

The earlier one-visit authorization is consumed. This request prohibits live
scans and asks for a proposal, so **nothing above has been implemented or run**.
The exact next approval would be:

> Implement/test the bounded Gimbal-only request/lifecycle diagnostic locally,
> then run exactly one passive original-route visit under the existing 2,750 ms
> capture, shared 10 ms processing, 2,048-byte diagnostic and 32,000-byte packet
> caps. Zero SDK calls or actions; exclude external forms. No retry, deployment,
> flag changes, Lambda invocation or canary activation.

Expected additional recurring AWS cost is **$0** for that local diagnostic,
with one small local artifact. No new monthly allowance, larger worker, lane or
capacity is requested. Current Lambda and the shared $10/month inside $50 remain
unchanged. This is not authorization to add permanent production instrumentation.
Deployment, canary activation, further visits, blocking/injecting/reordering page
resources, changing region/configuration, profiling, SDK/state reads or longer
budgets would need separate authorization. No flag change is recommended.

The lower-cost alternative is to retain the limited result and stop live
investigation for this route. There is still no evidence-supported source fix
to apply to Gimbal's page from the retained material alone.

## Verification

`artifacts/gimbal-page-load-review-2026-10-23/audit.cjs` verified the detailed trace
and latest visit against retained manifests and the historical bundle against its
original receipt/hash and size. It extracted the three script records, DOM flags,
guard timestamps and calculated intervals into `analysis.json`. No prior evidence
was rewritten and no runtime files changed.
