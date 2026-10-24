# CertScore.ai Gimbal: stop or increase the budget?

October 23, 2026. Retained evidence and repository code review only. No browser,
target contact, live scan, deployment, flag change or runtime edit. The public
AWS pricing page was consulted for the illustrative cost calculation below.
This investigation adds $0 recurring AWS cost.

## Recommendation

**Stop repeating Gimbal diagnostics under the current deadline. Do not increase
production time, memory or spending budgets now.** Retain a limited/unknown
coverage result, preserve the local repairs and leave rollout inactive.

If Gimbal is commercially important enough to justify one final investigation,
consider one explicitly approved longer **local passive diagnostic**, capped at
6,000 ms. That is a time-budget exception for diagnosis, not a production budget
increase or permission to act. Otherwise stop here. More same-budget visits have
diminishing value because each narrow capture misses a different stage and none
has demonstrated an actionable, verified sale/sharing flow.

## Why the latest page remained loading

| Retained local visit | Final commit | HTML finished | Observation checkpoint | State |
| --- | ---: | ---: | ---: | --- |
| Request/lifecycle | 1,329 ms | 1,416 ms | 2,601 ms | Loading; three selected first-party scripts pending |
| Route-handler | 1,255 ms | 1,317 ms | 2,602 ms | Complete; stub finished, own OneTrust absent |
| CMP initialization, latest | 1,459 ms | 1,668 ms | 2,602 ms | Loading; five exact CMP requests unobserved |

The latest commit was 204 ms later and HTML completion 351 ms later than the
prior visit. Only 934 ms remained between HTML completion and the checkpoint,
versus 1,285 ms in the prior run. This is less opportunity for parsing/scripts
and subsequent CMP loading, but it does not prove which dependency consumed it.

The latest collector had only 14 candidates, approximately 0.77 ms processing,
verified final HTTP 200/loader and no candidate/byte/processing truncation. It
did not still await HTML transport completion. It also retained no matching
DOMContentLoaded event. Pending parser-blocking resources, execution or other
unobserved parsing dependencies are plausible, not established causes.

Crucially, the latest diagnostic deliberately replaced the three first-party
script slots. Their request state is unknown in that visit. The older pending
requests cannot be copied into this timeline. The observed improvement and
later setback do not establish that diagnostic changes caused either outcome;
these are small, differently instrumented local samples, not a controlled
performance experiment or a Lambda reliability estimate.

The earlier route-handler result found near-zero measured navigation-handler
and public-validation intervals and no identity handler in that session. It
does not establish those facts for every visit, but supplies no reason to remove
guards or change routing. Page completion and a downloaded stub also failed to
establish CMP readiness in that earlier run.

## What more time can and cannot buy

The current effective diagnostic capture is 2,750 ms. In the action observer,
preserving the existing reserves leaves a nominal 1,350 ms readiness cutoff;
parent setup/deadlines may shorten it. The latest commit itself was later than
that cutoff. Earlier retained stub/banner downloads were also late relative to
it. Neither a late global nor a loaded banner proves an actionable control and
authoritative sale/sharing state.

More time might reveal configuration, geolocation, banner and regional loading.
It cannot guarantee readiness or resolve the separate GPP/non-GPP verification
gap. Historical unavailable GPP and incomplete category-state binding remain
limitations; no current same-session state proof was captured. A successful
longer passive diagnostic would therefore support a next design decision, not
production opt-out coverage or a finding.

A production deadline increase is not a one-line timeout change. The current
contracts contain a 3,000 ms capture cap, 4,500 ms artifact allowance and 5,000 ms
worker/join limit; elapsed-time and completed-evidence validation also use the
capture cap. The handler subtracts setup/handoff time, and the coordinator joins
once before publication. A route-scoped policy would need coherent versioned
budgets, contract/worker/coordinator validation, preserved action reserves and
provenance, latency/cost checks and an isolated rollout. Do not raise global
constants, borrow reserves, reopen terminal results or add lanes.

## Cost sensitivity, not a production approval

At the existing 3,008 MB (2.9375 GB), using the public AWS x86 example rate of
$0.0000166667/GB-second, the marginal **worker compute only** would be:

| Affected visits per month | +1 second each | +3.25 seconds each |
| --- | ---: | ---: |
| 1,000 | $0.05 | $0.16 |
| 10,000 | $0.49 | $1.59 |
| 100,000 | $4.90 | $15.91 |

The +3.25-second column illustrates moving a 2.75-second allowance to 6 seconds;
it is not a recommended production policy. Rate basis:
[AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/), consulted October
23, 2026. These figures assume every affected visit uses the full increment and
no free-tier offsets. They exclude extra coordinator waiting, other worker work,
redelivery, logging/storage, transfer and any proxy usage. Actual regional billing,
affected volume and remaining allowance must be verified before any rollout.
These local observations do not measure that volume. Do not multiply the
increment by all six lanes, nor assume coordinator impact is zero.

The shared $10/month within $50 is an existing ceiling, not an unspent balance
or authorization to raise scan limits. A global +3.25 seconds would exceed the
$10 incremental allowance in worker compute alone at 100,000 affected scans.
A rare route may be inexpensive, but low cost does not establish useful coverage.
No larger Lambda, new lane or additional monetary envelope is justified now.

## Optional final diagnostic and exact approval boundary

Only if the route merits further investment, the narrow next exception would be:

> Implement and offline-test a Gimbal-only local passive diagnostic with a
> 6,000 ms absolute capture including launch/setup, plus the existing 250 ms
> cleanup reserve. Run exactly one original-route visit, with one terminal
> snapshot at deadline minus 150 ms. Keep the seven exact CMP/document slots,
> shared 32 candidates, 10 ms processing, 2,048-byte diagnostic, 32,000-byte packet,
> isolation, TLS and all route/network guards. Zero SDK calls/actions or external
> forms. No retry, Lambda invocation, deployment, flag or production-budget change.

The cleanup reserve is outside the 6,000 ms capture, as in the existing harness;
total capture plus cleanup is at most 6,250 ms. This proposed local visit adds
$0 recurring AWS cost. It still needs explicit approval because the previous
single-visit grant is consumed and its time budget was smaller. It adds no
second snapshot, new resource inventory, state API or profiling.

Predeclare the stopping rule: one attempt only. If the page/global remains
unavailable, capture caps are reached, or provenance fails, stop and keep limited
coverage. If the page/global becomes available, review the retained sequence;
do not infer action readiness, automatically call APIs, add a new adapter or
activate the canary. A single late snapshot does not measure the exact instant
the global became available and does not establish production reliability.

Any subsequent production time-budget proposal, new SDK/state adapter, privacy
action, external form, capacity/memory change, deployment or activation requires
its own scope approval. Recurring cost increases of $1/month or more require
explicit cost approval under AGENTS.md; smaller increases must still be disclosed.
The cheapest and currently recommended option is to stop here without changes.

## Verification

`artifacts/gimbal-stop-budget-review-2026-10-23/audit.cjs` reverified all three
recent manifests, retained source/evidence hashes and unchanged production
helpers; it calculated timing differences and cost sensitivities in
`analysis.json`. Observer/contracts and Lambda worker/coordinator timeout paths
were inspected locally. No prior evidence or production source was changed.
