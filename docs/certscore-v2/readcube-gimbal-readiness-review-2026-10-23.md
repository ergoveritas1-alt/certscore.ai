# CertScore.ai ReadCube/Gimbal retained readiness review

October 23, 2026. Investigation and proposal only. No runtime implementation,
external request, live scan, deployment or flag change. The offline audit in
`artifacts/settings-readiness-review-2026-10-23/audit.ts` reverified both latest
packet hashes and sizes, their file receipts, both historical bundle hashes and
sizes, and the earlier passive-check receipts. Results and code hashes are in
`analysis.json` in that directory.

## Conclusion

There are narrow local improvements worth making within the current budgets,
but retained evidence does not establish that either real site can complete an
opt-out within them. Waiting longer after the observed readiness checkpoints
cannot recover these two attempts while preserving the opening reserve.

| Retained action attempt | Usable-document checkpoint | Remaining out of 3,000 ms | Required before opening | Minimum time to recover upstream |
| --- | --- | --- | --- | --- |
| ReadCube | 1,846 ms | 1,154 ms | 1,300 ms | More than approximately 146 ms once checks are included |
| Gimbal | 2,349 ms | 651 ms | 1,300 ms | More than approximately 649 ms once checks are included |

An illustrative 100 ms margin for selection/checks would target the checkpoint
by 1,600 ms, requiring approximately 246 ms and 749 ms savings respectively.
That margin is a planning target, not a measured sufficient action allowance.
The existing budget check, not a new static timestamp, must decide whether to act.

The current opening reserve is 750 ms anchored grace/observation, 50 ms terminal
read, 250 ms cleanup and 250 ms entrance allowance. Submission still requires
more than 1,100 ms remaining and independently verified same-session GPP. The
actual remaining deadline can be shorter than the nominal 3,000 ms cap.

## What the evidence supports

**ReadCube:** the approved two-hop route completed with native TLS and HTTP 200.
At DOMContentLoaded the existing single discovery read found neither an eligible
entrance nor its dialog. Earlier passive evidence showed the OneTrust stub and
banner script URLs without the button, consistent with asynchronous UI loading;
this is not proof of when the button becomes usable. A separate October 21
session retained the button at 4,868 ms. That is a sampling timestamp, not its
first appearance, and cannot be transplanted into this action session. No
post-opening controls or GPP transition have been retained.

**Gimbal:** the approved redirect completed and the scoped Settings recipe passed
its entrance checks, but the opening reserve rejected the attempt. The packet
does not retain whether the selected entrance was the native button or anchor.
Only about 57 ms separates usable-document time from the final packet timestamp,
including checks and finalization. Eliminating those checks cannot recover the
roughly 649 ms missing before the checkpoint; weakening them is not justified.
The earlier 1,588 ms passive direct-destination check is another session and omits
the authorized source navigation, so it is not an achievable action timing claim.

**A separate exact-label defect:** Gimbal's historical native button accessible
name is `Cookie Settings, Opens the preference center dialog`. The new scoped
allowlist contains `cookie settings, opens preference center dialog`, omitting
`the`. Its visible `Cookie Settings` label matches, but its accessible name would
fail the current check. Add the exact retained variant only to Gimbal's scoped
entry, preserve the other approved labels, and version the corrected variant.
This is not the latest attempt's failure: that attempt got past entrance safety
and stopped at the budget gate. The global classifier needs no change.

## Readiness behavior and the limits of the diagnosis

`waitForSaleSharingDocument` checks the parsed document only once. It may finish
early when a callable GPP API and one registered recipe already exist. Otherwise
it waits for DOMContentLoaded, then finishes regardless of CMP availability.
It does not recheck an asynchronously appearing CMP between the initial parsed
check and DOMContentLoaded, or wait for one after DOMContentLoaded.

This creates plausible missed-readiness cases: a CMP can become usable while an
unrelated deferred script still blocks DOMContentLoaded, or its UI can arrive
just after DOMContentLoaded. The retained attempts contain no browser-launch,
context-setup, final-commit, interactive, CMP-first-appearance or per-hop timing.
They cannot distinguish those cases from slow startup, network or parsing. They
also do not establish that GPP was callable before the cutoff. A new wait alone
is therefore not an evidence-backed recovery claim.

## Important Lambda deadline distinction

The local harness supplied `started + 5,000 ms` as `deadlineAtMs`, allowing the
observer's full independent 3,000 ms cap. The actual handler computes scanner
work time as 3,000 ms minus elapsed handler setup, passes that scanner deadline,
and the observer reserves another 250 ms before it. Ignoring small clock-handoff
deltas, the observer ends around handler-start + 2,750 ms; the latest opening is
around handler-start + 1,450 ms, with selection/check time still to account for.

This is not permission to reclaim the handoff or artifact reserves. Future
local fixtures should exercise the real handler-derived scanner deadline,
including simulated setup time, as well as the standalone observer cap. Do not
infer production success rates or savings from the more generous local clock.
Keep the 5,000 ms worker and 4,500 ms artifact deadline separate from capture.

## Narrow proposed changes

1. **Correct Gimbal's exact accessible label and add deadline-faithful fixtures.**
   Use the verified retained label, scoped to the existing original/final route.
   Test native-button precedence, anchor fallback only when the native selector
   is absent, and no clicks when setup has consumed the opening reserve. Keep
   existing route, geometry, document, field/form and GPP checks. This corrects
   existing authorized behavior without adding a new action or target.
2. **Add bounded timing diagnostics at existing boundaries.** Retain monotonic
   offsets for launch/context completion, navigation start/final commit,
   readiness completion and entrance decision, plus the effective deadline and
   selected entrance kind. Reuse existing reads to distinguish a matched control
   from a callable GPP API; do not add SDK calls or DOM sampling for diagnostics.
   Use an optional typed, versioned diagnostics object, a fixed small field set
   and a target below 500 serialized bytes within the existing 32,000-byte
   packet. Preserve historical records and canonical neutral coverage outcomes.
   A source-proven browser/protocol round-trip consolidation can follow if it
   preserves immediate pre-click checks; no retained timing proves its benefit.
3. **Only with the bounded-readiness authorization below, replace the existing
   readiness wait for these two scoped recipes.** Reuse its initial parsed and
   DOMContentLoaded checks; permit at most two additional checks triggered by
   completion of already-requested, recognized OneTrust loader/banner scripts.
   No new script fetch, SDK callback override, MutationObserver loop, polling,
   fixed sleep or retry. Each callback may inspect only registered selectors and
   whether the existing GPP API is callable, with a total additional execution
   ceiling of 10 ms and a hard stop before the opening reserve plus 100 ms margin
   is consumed. Timeout/cancellation must remove all listeners and invalidate
   late callbacks. If no eligible deadline remains, stop immediately.

For step 3, an early result must preserve the existing callable-GPP plus unique
recipe predicate. The subsequent full action checks still run. At
DOMContentLoaded, preserve the current permitted Settings path even if GPP is
not yet callable; actual submission still requires its original baseline proof.
When no registered control exists, an already-requested CMP script load may
supply a bounded later check only before that same cutoff. Do not extend the
absolute deadline or start a new observation period. If controls are inserted
later without one of these bounded triggers, coverage remains limited.

This deliberately does not remove the early GPP predicate, hook CMP internals,
add an unbounded mutation listener or guarantee discovery of every asynchronous
UI. Those are broader proposals. Step 3 cannot recover the retained ReadCube
attempt by waiting after its recorded checkpoint; only an earlier legitimate
readiness opportunity or upstream latency reduction could change that result.
It likewise cannot recover Gimbal if its delay precedes document parsing.

Suggested fixtures: CMP/GPP present at initial parse; CMP appears on an existing
script load while an unrelated defer script remains pending; late UI before and
after the opening cutoff; no callable GPP for early completion; duplicate/hidden
controls; callbacks after cancellation; changed loader/history; real handler
setup/deadline reduction; and unchanged three semantic reads and two-action cap.
These are synthetic mechanism tests, not reconstructions of unseen site timing.

## Approval and cost

The user requested a proposal in this turn, so none of the runtime changes above
was implemented. Exact-label correction, diagnostics using existing reads and
local synthetic tests fit the existing action authorization; they need no new
external-form, target, action-count or memory permission.

Step 3 introduces additional bounded readiness checks and can keep a currently
early-exiting attempt alive longer. The prior navigation policy explicitly added
no waits or probes beyond its existing readiness gate, so recommend explicit
approval for this replacement even though all absolute budgets remain fixed:

> Approve local, route-scoped readiness replacement and offline tests for
> ReadCube/Gimbal: at most two additional existing-script-load checkpoints, no
> new network request, polling, sleep or retry, at most 10 ms additional probe
> execution, and stop before the existing opening reserve plus 100 ms margin.
> Preserve early GPP readiness, all submission proof, current Lambda, capture,
> artifact and worker deadlines, and the shared $10 inside $50 allowance.
> No live scans, deployment or flag changes.

No additional funding is proposed. This investigation costs $0 recurring AWS.
At the prior planning rate and illustrative 2/169 share of 100,000 monthly scans,
10 ms extra execution is about $0.0006/month compute and one extra second of
existing-worker residence about $0.058/month. A conservative all-scans sensitivity
for 10 ms is about $0.049/month. Up to 500 bytes of diagnostics is approximately
50 MB/month before copies; allow under $0.10/month retained storage under the
prior 30-day/four-copy assumptions. Actual affected frequency, combined allowance
usage and traffic remain unmeasured; all increases share the existing allowance.
The lower-cost alternative is label correction and truthful limited coverage.

Separate approval remains necessary for another live attempt, opening ReadCube's
Cookie Policy footer anchor, Gimbal's external form, direct-final-target action
dispatch, additional targets, new state adapters, broader action semantics,
removing reserves, larger workers, new lanes or deployment/flag changes. Skipping
redirect ancestry, TLS or public-network guards is not recommended. The existing
six core lanes and two optional workers remain unchanged.
