# Multilingual consent semantics and bounded action binding

The September 11, 2026 implementation addresses shared classification and
control-binding defects identified in the retained 14-hour production cohort.
It changes upstream typed observations and action proof, preserving the canonical
assessment, persistence, concern, policy and projection pipeline.

## Classifier provenance and language coverage

New classifications use `consent-control-label-registry.v3`. Stored v2 assessments
and evidence are not reinterpreted or upgraded on read.

The canonical locale registry retains explicit negative refusal wording such as
“I Do Not Accept Cookies” and necessary-only wording such as “Nur notwendige
Funktionscookies akzeptieren.” A necessary-only phrase takes precedence over an
embedded generic Accept verb. Informational questions, unsupported negation and
conflicting visible/accessibility labels withhold action classification. The final
action proof honors the same semantic vetoes; a preferred accessible label cannot
hide contradictory visible text. Registered qualified refusals such as “Reject
all non-required” remain valid. Registered category spans such as “non-essential
cookies,” “nicht notwendigen Cookies,” and “cookies non essentiels” qualify the
cookie category and do not negate the decision. Negative wording outside those
bounded spans still vetoes the choice. Independent opposed decisions within one
label remain unknown, including short canonical verbs and concatenated banner
text; embedded verbs in a registered refusal or necessary-only phrase are not
independent decisions. Conflicting partial overlaps remain unknown.

All 40 supported locales have bounded negation and informational-prefix guards.
These are shared by observation and action classification, alongside the existing
locale-specific decision vocabulary. This is not unrestricted language
understanding: unregistered grammar can remain unknown, and every unusual
necessary-only construction is not automatically a safe Reject. Tests preserve
registered positive/refusal/options/necessary-only vocabulary and probe each
locale's guards. Synthetic marker combinations are adversarial tests, not a
human-adjudicated multilingual corpus or proof of universal recall.

## Discovery to dispatch

Geometry discovery now records `candidate_detected`, rather than implying a
completed actionable binding. Subsequent bounded snapshots distinguish absent
frames, ambiguous scopes, non-interactive scopes, hidden/disabled controls,
label mismatch, failed hit targets and exhausted binding budgets. The existing
snapshot cap is unchanged.

The final canonical control uniqueness sweep may use up to 750 ms of remaining
outer action-search time. Previously its small inner allocation could discard a
valid candidate repeatedly: a real-Chromium loopback fixture with delayed browser
transport reproduces this Accept failure before the change and completes exactly
one correct click after it. Reject has the same bounded allocation and regression
coverage. Full frame/selector uniqueness checks remain required, and a resolution
that finishes after the outer deadline is not accepted.

There is no increase to the overall search deadline, invocation count, observation
window, action tail cap or model usage. Exact-target authorization, live control
proof, one-action limits, semantic registration, request ancestry and capture
completeness remain separate requirements. Successful dispatch does not imply
confirmed consent or turn unverified capture into registered post-refusal evidence.

## Validation and release

`pnpm preflight:fast` and full preflight include the multilingual semantics and
Accept/Reject dispatch regression gate for affected source changes. New fixtures
exercise both sides of the English negative and German necessary-only button
pairs, conflicting label sources, and delayed final binding. They check exact
click counts, correct intent, complete bounded capture and neutral unverified
registration. Existing observer, contract, geometry and downstream projection
checks remain required.

A separate classifier replay compares the deployed baseline and new source on
686 retained candidate occurrences from 34 passive geometry artifacts (both
observation and action usage). Six occurrences change intent/role: the two
misclassified English/German choices, two copies of a French informational news
headline, and two Spanish informational preference references. The other 680
retain intent/role. This label-only replay does not reproduce DOM binding,
action-session state, or end-to-end scan outcomes.

The local fixtures do not contact public targets and do not test Ireland egress.
No production deployment or new production completion-rate measurement is part
of this implementation. The owner-authorized paired localhost validation completed 19 scans across ten
domains through verified Ireland egress. The matched result was 14 baseline
clicks versus 13 changed-build clicks: PestPac recovered two, while Mackolik
lost two and Blick lost one. Deployment remains on hold; see
[the validation report](consent-action-ireland-validation-20260911.md). The pass used
the existing Ireland proxy, fresh central-ledger selection and the normal
six-lane runtime. Its evidence and disposition are retained separately under
`artifacts/action-path-review-20260911-14h/implementation/final-validation/`. The prior 95/137 (69.3%) click baseline remains historical;
synthetic success is not recovered production scans, and corrected candidate
membership must not be counted as recovered clicks. Evaluate a fresh representative
cohort and overall p95 latency after an authorized rollout before claiming uplift.

## Cost and latency tradeoff

More successful dispatches can consume existing after-click capture windows that
failed dispatches never reached. The conservative planning allowance is up to
$2/month at 100,000 scans, within the owner's previously approved $5/month
incremental allowance. No new infrastructure or paid model calls are introduced.
Individual recovered paths can run longer than failed ones within their existing
budgets; neither lower production latency nor a particular completion uplift is
claimed from local fixtures. Evidence capture is not shortened to improve timing.

The paired local validation has an estimated one-time cost below $0.50 for normal
bounded policy extraction/link selection and existing proxy/ledger diagnostics.
This adds no recurring model call or infrastructure to the production change.

## Bounded final-label rediscovery follow-up

A named recipe can resolve a visible selector whose live label remains weak or
unclassified. The final proof correctly withholds that action, but previously
ended the lane even when its original search budget had time remaining. Accept
and Reject now permit one canonical live rediscovery within that remaining budget
for exactly those two unverified-label reasons. The same weak named selector is
not retried first. Opposite decisions, semantic conflicts, transactional variants,
failed authorization, and expired budgets do not qualify. A recovered control
receives fresh confirmation baselining and the complete existing final proof;
there is still at most one click. No lane, navigation, outer deadline, action tail
cap or observation window is added.

Proof reads also record a bounded `control_proof` operational snapshot using the
labels already read, their source names, and selector/frame identity hashes. It
uses the existing 12-snapshot cap, adds no DOM read, and cannot create findings or
prove dispatch/registration. Both observer types use the shared diagnostic schema.
Estimated incremental metadata cost is below $0.10/month at 100,000 scans and
30-day retention, within the prior $5/month action-fix allowance.

The source-configured late-label fixture fails for both paths on deployed
baseline and recovers both on current code. Opposite/conflicting labels,
duplicates, cancellation and late arrival remain no-click outcomes. Separate
hidden OneTrust fixtures behave identically on baseline/current: a control shown
inside the original budget is clicked, while one appearing afterward is withheld.
The latter is bounded coverage, not a reason to increase deadlines. Fresh Ireland
validation is retained in `artifacts/action-path-followup-20260911/live/`.

The completed follow-up recovers all five targeted live paths versus three on
baseline, with one registered decision and four complete after-click captures.
The new rediscovery branch was exercised in fixtures, not these live clicks.
See the [follow-up report](consent-action-followup-20260911.md) for the current
release recommendation, limited Blick Reject slot and latency tradeoff.
