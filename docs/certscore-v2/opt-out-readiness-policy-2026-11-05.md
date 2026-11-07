# CertScore.ai explicit opt-out readiness

Status: implemented locally following the owner's November 5, 2026 instruction.
No deployment, production flag change, capture-cap increase or new CMP recipe.
Luna evaluation remains excluded.

## Behavior

Only dispatches carrying `explicit_opt_out_controls.v1` use the new readiness
helper. Historical direct controls and the held exact-route Settings workers keep
their existing readiness behavior. Accept, Reject, GPC and canonical scoring are
unchanged.

The opt-in lane no longer treats DOMContentLoaded alone as CMP readiness. One
page evaluation observes document lifecycle and DOM mutations for a visible
reviewed entrance or dialog. An interactive document may proceed before unrelated
deferred scripts finish. A completed document without a reviewed control stays
unknown until the cutoff. This is readiness only: exact target/document, unique
control, explicit accessible/visible name, banner ancestry, form exclusion,
actionability and before/after/terminal state checks still govern every action.
Readiness makes no SDK call and does not require a GPP API merely to observe a
control. Existing submission confirmation requirements remain unchanged.

The readiness and commit-navigation cutoff leaves the existing 1,050 ms reserve
plus 250 ms opening allowance and 100 ms margin inside the original 3,000 ms
capture limit. The 4,500 ms artifact and 5,000 ms worker allowances are unchanged.
The helper performs at most 32 inspections with one shared 10 ms cooperative DOM
processing bound. An over-budget native query cannot be preempted, but its result
is discarded and cannot authorize an action. Host capture cancellation remains
independent. Mutation bursts coalesce across the available window; their timer
is armed only by a mutation, not by polling. Lifecycle slots remain available.
All listeners, observers and pending timers are removed on completion; closing
the isolated context handles cancellation and document replacement.

`explicit_opt_out_readiness.v1` retains a fixed-size reason, trigger, check count,
processing/elapsed time, remaining capture time, document ready state and bounded
recipe match count. Loading/uninspected inventories retain a null match count.
Cutoff is a limited observation, not absence or failure to honor opt-out. The
operational funnel includes this diagnostic; daily audit stop reasons continue
through the existing verified packet summary. Old packets gain no invented data.

## Evidence and live outcome

The prior retained Evernote worker stopped at 517 ms after DOMContentLoaded with
no matching recipe; the prior ColoCrossing worker exhausted navigation/readiness.
Five prior consent bundles and two action packets replayed with identical
eligibility and outcomes. No original evidence was rewritten.

This follow-up made three consent captures and three action-worker visits across
two approved exact targets. Central history and canonical selection were checked;
the owner cooldown waiver was recorded. No blocked/challenged result was retried.

| Attempt | Result | Retained readiness evidence |
| --- | --- | --- |
| Evernote, initial | No actions or submission | 32 checks, 3 ms rounded processing; check limit reached with 1,572 ms remaining. |
| ColoCrossing | No actions or submission | Still loading at cutoff; zero selector inspections, 1,398 ms remaining. |
| Evernote, after event coalescing | No actions or submission | Still loading at cutoff; zero selector inspections, 1,396 ms remaining. |

The first live result exposed premature inspection-slot consumption; coalescing
was then implemented and tested with a mutation-heavy delayed-control fixture.
The last live result does not establish a coalescing benefit because the document
was still loading and no selector check ran. All attempts preserved the reserved
time. None proves successful public-site opt-out, permanent CMP absence, or a
population success-rate improvement. They are local lane diagnostics; geographic
egress and live end-to-end coordinator timing were not independently verified.

Local browser fixtures demonstrate delayed-control submission, confirmed state
and the full anchored follow-up inside the existing cap. Negative cases cover
missing/hidden controls, changed documents, ambiguous recipes, cancellation,
expired cutoffs, shared processing/inspection limits and generic/unsafe controls.
The absent-control fixture verifies zero actions and at least 1,300 ms of the
reserve remaining, allowing small timer scheduling variation.

## TrustArc scope

Retained, generation-matched summaries show first-layer opt-out controls on
Red Hat, Ustream and Battlelog: three of ten observed controls in the frozen
24-hour cohort, versus five OneTrust, one consentmanager and one CookieYes.
Red Hat and Ustream carry limited inspection; Battlelog's is complete. These are
coverage leads, not an executable-recipe success estimate.

The hash-verified local public exports do not retain native locator binding or
explicit-action state-transition packets. The next TrustArc work should obtain
and review those original artifacts, then identify an exact safe control, target,
frame and supported state proof. No TrustArc action recipe, generic Settings
opening or unsupported state adapter was added from provider identity alone.
No TrustArc public contact occurred in this turn.

## Verification, cost and release

Evidence, tests, selection and contact receipts:
`outputs/opt-out-readiness-2026-11-05/verification-receipt.json`.
The final browser suite, 176 coordinator tests, 11 audit tests and all three
application typechecks passed. The registry and original-source hash checks pass.
Contact recording uses an idempotent run key and preserves existing holds.
AWS waiter disconnects are recovered from the existing task, without duplication.

Local work enables $0 recurring spend. The fixed-size diagnostic remains within
the previously disclosed sub-$1/month metadata estimate at 100,000 scans and
30-day retention. Waiting longer for a late CMP can increase actual billed time
within the previously approved additional-lane allowance; unchanged caps alone
do not establish cost neutrality. Ledger bookkeeping is conservatively estimated
below $0.05 one-off. No model call, production scan/report write, held-site contact,
external form, deployment, historical rewrite or capture-budget change occurred.
