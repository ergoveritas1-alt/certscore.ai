# Accept/Reject evidence reliability

Approved for implementation by the product owner on September 5, 2026. Not
deployed and not live-calibrated in this change. Evidence policy:
`semantic_consent_registration.v2`; packet versions:
`certscore.post_accept_evidence.v2` and `certscore.post_refusal_evidence.v2`.

## Canonical path and approved policy changes

The existing pipeline remains observed typed evidence → verified retained packet
→ persisted typed projection → normalized concern → concern policy → unified
finding/checklist → report/score. No raw-signal or display fallback is added.
Control inventory under assessment 2.1 and action registration are different:
seeing “VERSTANDEN” is not independently verified acceptance of all purposes.

1. **Semantic registration, not UI change.** A resolved control and completed
   click do not establish a registered decision. Banner disappearance,
   acknowledgment, receipt-ID changes and opaque cookie/storage mutations are
   insufficient. Canonical exact-value recipes, verified all-configured-purpose
   CMP/TCF APIs, or bounded canonical state decoders must establish the intended
   decision after the action. A generic category such as analytics alone cannot
   establish whole-state refusal. Opposite/mixed decisions remain non-projectable
   and retain a state hash and timestamp; no contradiction finding is synthesized
   from an unconfirmed action.
2. **Action-session evidence outranks cross-session absence.** A complete passive
   no-control inventory can cancel a not-yet-invoked action lane. An already
   launched session may return its own result while passive lanes are running.
   A verified returned result is retained. An unfinished lane at that barrier is
   limited, not evidence that no control existed in its session. No additional
   tail wait is introduced for this disagreement, and late results never reopen
   publication. Existing independent Accept/Reject time caps and single publish
   remain unchanged.
3. **Bounded response settling.** Reject waits at most 250 ms after its first
   eligible activity to retain associated response cookies/writes. It cannot
   restart or extend the existing observation window. Unchanged storage remains
   review-only and requires the existing completed persistence settle criteria.
4. **Shared activity is not equivalent outcomes.** Matching sanitized request or
   exact storage identities are described as shared observed activity, not
   indistinguishable outcomes. Query redaction and unequal observation windows
   preclude that stronger conclusion. The legacy machine signal ID is retained
   for compatibility; wording and evidence metadata no longer assert equivalence.

## Evidence and dispatch invariants

### Registered contextual activation

The owner requested the passive/action mismatch fix on September 6, 2026 UTC.
`registered_contextual_accept.v1` is retained under
`certscore.consent_action_control_proof.v2`; legacy v1 remains readable. This is
a narrow activation-policy change, not a change to `semantic_consent_registration.v2`.

The canonical BST registry now contains the published `.bst-panel` first-layer
scope and `.bst-accept` / `.bst-accept-btn` controls. Its reviewed contextual
label “VERSTANDEN” may activate with its original classifier confidence (0.78),
without lowering the generic direct-label threshold (0.8). Last-mile proof must
match the canonical recipe version, exact selector and label, verify one live
banner, one actionable native button/fragment link, and reject form, submission,
transaction-link, contradictory-label and ambiguous contexts. Target/document
hashes and the versioned contextual scope survive the packet and typed projection.
Other unknown/non-CMP explicit controls continue using canonical generic discovery.
No per-site URL or observer-local label list is introduced.

The plugin's [published markup](https://plugins.svn.wordpress.org/bst-dsgvo-cookie/trunk/bst.php)
and [click handler](https://plugins.svn.wordpress.org/bst-dsgvo-cookie/trunk/includes/js/scripts.js)
show notice dismissal and `bst_dsgvo_cookie=1` acknowledgment. That receipt is not
registered as a granted-consent value. A completed click captures the existing
bounded window and retains `decision: unknown` unless separate semantic state is
verified. It does not create a successful-consent result, findings or deductions.
The original report and retained packet are not rewritten.

No new timeout, intentional wait, lane, screenshot, invocation, model call or
public re-scan is added. The already approved after-action window is unchanged;
scope checks use bounded local DOM reads. Additional contextual proof is under
0.5 KiB per affected packet/projection, estimated below $1/month at 100,000
scans/month with 30-day retention and no capacity-tier change. The full-window
capture cost remains covered by the owner's existing approval below.

Verification uses both published DOM variants in real loopback Chromium with the
complete production recipe set, one-click accounting, retained after-click
requests/storage, passive geometry, malformed proof rejection, scope/label safety
negatives, and legacy proof compatibility. These are deterministic fixtures, not
a new public-site calibration or a promise of universally verified consent.

Local verification for this change: 249 distinct focused tests passed across
registry, action proof, Accept/Reject observers, actionability, semantic decoding,
typed projection and canonical concern boundaries. Contracts build and scan-core,
Lambda and web type checks passed. Both published BST control variants completed
one click and the requested after-click window with no granted-consent promotion.

Accept discovery interleaves bounded named-selector probes with live canonical
control/geometry review throughout the existing search deadline, including after
runtime CMP recognition. A stale named selector cannot monopolize that deadline.
Truncated multi-recipe sweeps never establish uniqueness, and no final unbudgeted
registry sweep runs after the deadline. Total worker and coordinator-tail budgets
are unchanged; there is no new wait, retry, screenshot, or browser session.

- Fresh isolated contexts, exact-target authorization and one deterministic
  first-layer action remain mandatory. Named CMPs use the canonical registry.
- Live label, uniqueness, visibility, enabled-state and hit-target checks occur
  after trial/baseline work. Abort/target checks occur immediately before dispatch,
  including after asynchronous geometry or closed-shadow resolution. No guessed
  strings or deeper preference-center exploration are introduced.
- Decision timestamps bind a verified value to a fresh same-scope instrumented
  write of the matching storage type where available. Otherwise the retained
  timestamp is explicitly the later verified observation, not an invented write
  time. State hashes, policy version and timestamp basis survive projection.
- Browser request timing is used when available; zero means unavailable, not scan
  start. Redirect ancestry survives pre-action retention caps. Pre-action traffic
  cannot displace the bounded post-action sample. Drops after the action make
  coverage limited and non-projectable. Cookie clearing is not active storage use.
- Raw state values are bounded, private, ephemeral confirmation inputs; retained
  packets contain hashes, never raw consent cookies or TC strings.
- Legacy v1 packets remain readable. Previously “confirmed” UI-only, opaque-change
  or loose generic refusal witnesses project neutrally on rematerialization.
  Original retained artifacts are not rewritten; no backfill is performed.

## Supported decoding and limits

### After-click capture independent of decision verification

The owner approved `bounded_after_action_capture.v1` on September 5, 2026.
CMP brand recognition is not a prerequisite for canonical generic control
discovery or activation. If a safely completed action has no verified decision,
capture continues through the remaining configured window, measured from action
dispatch. Confirmation time overlaps that window; a second whole window is not
started on confirmation failure. Existing result/lane caps, aborts and exact-target
checks remain binding. An uncertain or failed click cannot trigger another wait.

`afterActionCapture` retains activation outcome, requested/actual timing, stop
reason, request references, capture drops, snapshot availability and a bounded
main-document write sample. The validated report projection also retains the
referenced sanitized requests and hashed post-action storage snapshot. Both remain
bound to the packet hash and retained control proof. No raw state values are added.
Sampled writes and storage presence do not establish active use or absence.

These fields describe **after-click** activity, not activity after registered
consent/refusal. Unknown, opposite and mixed decisions stay explicit. Existing
independently supported scoring deductions are not removed by unverified action
evidence; new unverified-refusal deductions are not enabled by this capture policy.
The existing successful-path UI filter is unchanged; the additional facts survive
the canonical retained projection instead of being discarded as empty results.

Canonical decoding accepts CookieYes category flags, bounded standard OneTrust
group IDs, Cookiebot's complete flat preferences/statistics/marketing object,
and exact whole-state scalars on canonical or recipe-registered state keys.
Duplicate fields, custom unknown groups, malformed, oversized, opaque and partial
generic state stay unknown. This is deliberately not a claim of universal CMP
coverage. Unknown formats require a canonical recipe/decoder and fixtures, not a
per-site regex or a relaxed success check.

Primary format references: [Cookiebot developer documentation](https://www.cookiebot.com/us/developer/)
and [OneTrust events and active-group semantics](https://developer.onetrust.com/onetrust/docs/javascript-events-guide).
Existing canonical registry recipes remain authoritative for supported controls
and exact provider-specific values. Decoder fixtures are not live-site calibration.

## Cost, verification and rollout

### Empty storage names and action-worker failure containment

The September 6 Lambda incident exposed a retained-evidence schema mismatch:
Chromium can return an empty cookie name (and web storage permits an empty key),
but the original action packet required every name to be non-empty. Action packet
v2 now preserves an observed empty string exactly, requiring the retained hostname
and exact identity hash; snapshot identity basis and value hash remain required.
Missing/null names, malformed hashes, and over-bound fields still fail validation.
Legacy v1 packets retain the original non-empty-name constraint. No original
artifact is rewritten, and empty names do not change purpose or consent decisions.
Canonical post-refusal persistence projection preserves the identity hash for an
unnamed row, so report projection cannot reintroduce the same schema failure.

Accept finalization is awaited before asynchronous browser cleanup, as Reject
already was. Validation failures can therefore reach the worker handler rather
than becoming unhandled rejections while the browser closes. The existing failed
lane outcome carries bounded schema paths/codes, never rejected values or a bundled
source/stack dump. It remains coverage-limited and cannot invent successful consent
or a scoring finding. The coordinator still publishes one canonical result.

This fix adds no intentional wait, invocation, model call, timeout/capacity increase,
or expanded capture limit. Estimated incremental recurring cost: $0; compact failure
diagnostics replace larger raw validation messages. Verification uses loopback
Chromium fixtures and injected failures, not public-site scans or deployment.
Incident-fix verification: 278 observer, contract, Lambda/orchestration, and
canonical projection regression tests passed, including empty cookie/local/session
names with verified and unverified decisions, forced finalization failures during
async cleanup, bounded worker diagnostics, and score-neutral failed-lane coverage.
Contracts, scan-core, Lambda, and web TypeScript checks passed. These tests do not
establish the exact cause of the second production failure, whose exception was
truncated in the original log; its missing evidence is not reconstructed.

The owner explicitly approved the bounded response-settle increase: approximately
$1–$2 per 100,000 affected worker runs (about $0.00001–$0.00002 each; compute-only
estimate varies with Lambda memory/architecture). It adds no invocations or model
calls, no timeout increase, and may fit under already-running passive lanes.
Additional bounded decision/coverage metadata is under 1 KiB per packet/projection;
estimated incremental retained storage is below $1/month at 100,000 scans/month
without a capacity-tier change. Both estimates must be revisited at higher scale.

For the additional unverified-action capture, the owner explicitly approved roughly
$30–$60 per 100,000 scans affected on **both** paths: up to about 1 additional second
for Accept and 6.5 for Reject at default windows, before existing lane caps. Actual
cost depends on the affected fraction and Lambda allocation. Bounded after-action
projection data adds storage, estimated below $1/month at 100,000 scans/month with
30-day retention and no capacity-tier change. No live scans or paid model calls
are required to verify this change locally.

Verification uses deterministic loopback fixtures and contract/projection tests:
opposite and mixed decisions, UI-only acknowledgments, stale/opaque state, malformed
decoders, after-trial cancellation/navigation/duplicate/label changes, iframe and
shadow controls, synchronous traffic, capture floods, redirect grace, response
cookies, source-hash preservation, neutral legacy projection, policy/scoring, and
single-result lane reconciliation. No public scan, deployment, report republish,
or new paid API call is part of this implementation. Fresh canonical calibration
is still required before claiming improved production coverage.

Local verification: 302 focused observer/contract/orchestration/projection tests
and 140 existing concern/report/structured-control regression tests passed.
The contracts build and scan-core, Lambda, and web TypeScript checks passed.
This is deterministic regression coverage, not a measured live-site success rate.

After-action capture verification: 77 focused capture/contract/projection tests
and 219 broader observer/concern/scoring tests passed (the sets overlap). Coverage
includes delayed activity after the confirmation deadline, exact-target changes,
abort during capture, storage-write retention without raw values, rejected forged
request/proof bindings, canonical projection and preservation of an independent
existing score deduction. Contracts, scan-core, web and Lambda type checks passed.
That capture-only stage performed no deployment, public scan, existing-report
rewrite or scoring-policy expansion.

## Owner-approved Reject-click tracking risk policy

On September 5, 2026, the owner separately approved scoring observed tracking
after a verified Reject click even when refusal registration remains unverified.
`reject_click_tracking.v1` is a WC01 policy, not a relaxed semantic decoder.
The corresponding GDPR/ePrivacy posture score is `gdpr-eprivacy-posture.v13`.

The retained packet now supports `bounded_after_action_capture.v2`, carrying
earliest redirect-chain start times keyed to retained requests. This includes
ancestors excluded by the pre-action retention cap. Main-document controls also
retain their document identity hash, just as iframe controls do. There are no
additional browser evaluations, intentional waits, model calls, invocations or
expanded lane deadlines for these additions.

The canonical materializer builds and persists `rejectClickTrackingAssessment`
from the verified packet projection. It binds the policy version, source packet
hash, authorized control/document proof, completed click, unconfirmed registration,
complete window with no dropped post-action requests, the eligible request count,
and up to eight earliest eligible request references. All bounded original request
evidence remains in the retained packet/projection; this does not downsample capture.
Normalization revalidates that assessment against its retained source projection;
concern policy alone authorizes the new `post_reject_click_tracking` review signal.
Report surfacing and checklist scoring consume that canonical result.

Eligibility requires at least one canonically classified, non-essential analytics,
advertising or session-replay request whose entire redirect chain started strictly
after the Reject click. No CMP brand is required. A request continuing a pre-click
redirect chain does not qualify. Neither missing/unknown decision state by itself,
an uncertain click, incomplete capture, changed target, missing provenance,
essential/CMP traffic, nor stored identifiers alone creates this deduction.
Legacy v1 captures without ancestry remain neutral for this new policy. Raw
storage writes remain evidence aids; this policy does not create a new scoring
route from them or infer active use from stored presence.

The new outcome is explicitly **Review signal — tracking after Reject click;
decision unverified**, not confirmed refusal, a proven ignored registered decision,
or a legal violation. It receives the existing 12-point post-Reject activity
deduction. The family takes only its strongest eligible effect: repeated activity
or both click/refusal representations stay at 12; a confirmed consent contradiction
uses the existing 15-point effect instead, not an additional deduction. Independent
pre-consent and other evidence-backed deductions remain in place. Accept baseline,
California scoring, and successful-path UI filters are unchanged.

Cost estimate for the additional bounded ancestry and assessment metadata is below
$1/month at 100,000 scans/month with 30-day retention and no capacity-tier change;
revisit at higher scale. This is separate from the previously approved $30–$60 per
100,000 scans affected on both unverified paths for full-window capture.

Verification includes real Chromium loopback fixtures with intercepted synthetic
analytics endpoints: direct post-click tracking qualifies, while a pre-click request
redirecting after the click remains neutral. Contract/policy tests cover malformed
ancestry, proof loss, stale source hashes, target changes, aborted/uncertain clicks,
dropped requests, unknown/essential/CMP categories, neutral legacy captures,
canonical report surfacing, independent deductions and strongest-only scoring.
No deployment, public re-scan, backfill or existing-report rewrite is included.

Local verification for the scoring addition: 221 concern/projection/scoring/
surfacing/taxonomy tests, 486 broader checklist/concern-policy/unified-finding tests,
157 capture-contract and Accept/Reject observer tests, and 2 runtime-to-score
loopback browser tests passed (866 distinct tests). Contracts, scan-core, Lambda
and web type checks plus diff whitespace checks passed. This is deterministic
regression verification, not a measured production CMP success rate.

### September 10, 2026 bounded resolver reliability corrections

The owner approved implementation and an allowance of up to $5/month in
incremental compute/metadata at 100,000 scans/month, with deployment deferred.
This is a planning allowance, not a measured bill increase. Successful actions
may use more of the existing after-action windows; faster resolution may instead
reduce billed duration. No browser invocation, model call, observation-window
extension, or action-tail extension is added.

Action resolvers collapse recipe aliases only after live browser node equality
and identical confirmation/scope contracts are verified. Distinct buttons,
conflicting recipes, inaccessible nodes and ambiguous frame identities remain
unresolved. Closed-shadow host equality does not establish action-node equality.
Geometry retains exact structural container selectors when label-unique hints
would identify multiple containers; action resolution intersects the control and
container scopes. Static headings and tabs do not compete as action controls.
Explicitly labelled semantic consent regions retain their local consent context.

Existing geometry CMP observations prioritize registered recipe searches without
excluding other recipes based on a stale cookie or fingerprint. Accept retains
bounded resolver snapshots, including accessibility actionability and deadline
limitations. Reject searches exact child-frame scopes, preserves incomplete-sweep
ambiguity, and leaves time for its existing control-stability check inside the
original search deadline.

A late `resolved_control_no_longer_actionable` proof failure can trigger one
pre-dispatch re-resolution using only the time remaining from the original
resolver start. Recovery rebuilds control proof and semantic baselines; Reject
refreshes its storage baseline and necessary-only precondition. Exhausted budgets,
label conflicts, redirects, aborts, and uncertain or completed clicks do not
receive a new attempt. Malformed storage entries are omitted with explicit
coverage limitations; valid empty keys, names and values remain exact.

The canonical label registry now recognizes context-bound German `Nur notwendige`,
Portuguese `Rejeitar cookies`, and Polish `Akceptuj niezbędne` as refusal choices.
The latter is necessary-only, not Accept. These changes do not confirm consent
registration, lower generic action thresholds, or change scoring. `Akkoord` was
already recognized; a cross-session mismatch is not grounds for inventing a new
synonym. Accessibility-only and label-source cases remain live-calibration targets
through the existing registered action mechanisms.

### Boxless consent scopes and Polish necessary-only controls

A unique consent wrapper or open-shadow host may have no layout box while its
first-layer controls remain visible and actionable. The shared scope check tests
connectedness and hidden/inert/ARIA-hidden/visibility suppression through composed
ancestors; it does not require the wrapper itself to be a pointer target. Both
canonical discovery paths retain the individual control's visibility, label,
uniqueness and viewport hit proof. Final control proof independently checks those
ancestors from the actual control, including descendants inside the retained scope.
This does not make banner disappearance or a successful click semantic consent.
The guard rejects fully transparent ancestors; the existing geometry inventory
continues to apply its stricter near-transparency threshold to candidates.

Polish `Zezwól tylko na niezbędne` is a canonical context-bound necessary-only
Reject label. `Zezwól na wszystkie` remains Accept. These changes add no invocation,
retry, capture window, tail wait, model call or evidence-retention increase.
Existing overflow and deadline outcomes remain explicit coverage limitations.

### Semantic baseline and bounded post-click retention

Generic Accept and Reject confirmation preserve the existing visible-surface
check and may also bind a boxless scope to the already-resolved action control.
The fallback requires a unique available scope and control, and verifies exact
composed ancestry through open-shadow hosts. It does not select a new control,
permit another click, or use banner disappearance to establish a decision.
Fresh value-bound semantic proof and exact-target authorization remain required.
Opposite, mixed, opaque, and missing decisions remain unconfirmed.

`CONSENT_ACTION_POST_CLICK_REQUEST_LIMIT` in the shared action-evidence contract
sets the post-click network bound to 192. Both observers and the typed packet,
after-action reference/ancestry, and persisted report-projection schemas consume
that bound. Pre-click retention remains 96. The final request inventory grows
beyond 96 only when more than 96 post-click requests were directly observed;
additional capacity does not retain extra pre-click traffic. Every retained
post-click request keeps its ordinary classification and provenance. Reject
ancestry remains complete for all after-click references. Storage bounds and
bounded display samples are unchanged.

Overflow beyond 192 remains explicitly incomplete and non-projectable under the
existing completeness gates. No capture window, confirmation deadline, action
tail, invocation, retry, or model call is added. Historical packets are not
rewritten or upgraded; missing historical requests cannot be reconstructed from
the drop counter. Contract readers must support the expanded bound before or
together with scanner writers in any separately authorized deployment.

The engineering estimate is less than $1/month incremental compute/metadata at
100,000 scans/month with 30-day retention, within the owner's existing $5/month
approval. The calibration basis is 269 dropped requests over 712 terminal scans
and roughly 302 bytes per retained request row before replicated metadata. This
is a workload-based planning estimate, not a billing or production-latency result.

### Modern TCF callbacks and configuration-bound OneTrust decisions

The shared action TCF reader subscribes once per live API/document through
`addEventListener`, invalidates failed updates, and ignores callbacks from a
replaced API. The existing bounded `getTCData` compatibility read remains for
older CMPs. Neither operation changes consent. Confirmation still requires a
fresh fingerprint and post-action `useractioncomplete`; cached pre-action state
and UI changes alone do not confirm registration.

`iab_tcf_sparse_purposes.v1` decodes the IAB API's documented `false | undefined`
no-consent encoding only from a loaded, successful GDPR-applicable TCData
response with supported TCF policy version 4 or 5, bounded CMP identifiers,
its own required protocol fields, a present valid purpose map, and a bounded
v2 TC string. All 24 normalized purpose flags must agree with the encoded
purpose bits. Missing envelopes, malformed maps, unsupported versions, invalid
or truncated purpose-bearing cores, and conflicting values remain unknown.
The outer TCData may be a vendor SDK class instance; validation uses its own
protocol fields, rather than its constructor name. This is protocol decoding,
not a conversion of missing generic category evidence to refusal. The existing
v2 purpose-bit decoder is not a validator for every variable vendor segment.

The typed decision proof retains the API source, sparse-encoding policy,
TCF policy version, CMP identifiers, explicit purpose IDs, exact state hash,
and timestamp provenance. These fields travel through the verified retained
packet and canonical persisted action projection. Historical packets remain
readable without these optional fields and are not upgraded on read.

`onetrust_cookie_groups.v1` binds cookie interpretation to the same session's
read-only `OneTrust.GetDomainData().Groups`, exact cookie identity, changed value
hash, and unchanged configuration hash. Baseline, returned cookie, and configured
group identities must match completely. Only groups explicitly configured
`always active` are excluded from the optional-purpose decision. Unknown IDs,
ambiguous cookies, malformed configuration, missing groups, configuration drift,
and all-essential inventories do not confirm a decision. A missing domain-data
API preserves legacy registry decoding; a present but unverifiable API must not
fall back to guessed group semantics. Opposite/mixed decisions remain neutral.

No invocation, retry, confirmation timeout, observation window, tail cap, or
model call is added. Read-only browser API checks add small local work within
existing deadlines. Bounded provenance metadata is estimated below $1/month
at 100,000 scans/month with 30-day retention, within the existing owner-approved
$5/month allowance. Support these optional proof fields in contract readers
before or together with scanner writers in a separately authorized deployment.

Primary protocol references:
- [IAB CMP API v2](https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework/blob/master/TCFv2/IAB%20Tech%20Lab%20-%20CMP%20API%20v2.md)
- [OneTrust JavaScript API](https://developer.onetrust.com/onetrust/docs/javascript-api)

### Customer presentation of action outcomes

Lead Accept/Reject results with the directly observed behavior. For the existing
eligible Reject-click tracking finding, use “Tracking observed after Reject” and
explain the recorded requests, services and timing. Consent-state confirmation
belongs in supporting details; it must not qualify the finding title or suggest
that valid observed requests are speculative. A review classification must not
be relabeled as confirmed refusal.

Completed interactions with schema-valid persisted after-action capture remain
visible as “Observation recorded” or “Partial observation,” even when the
canonical decision state remains incomplete. These labels describe capture,
not consent registration or finding eligibility. Preserve the canonical state,
score and retained provenance. Never infer tracking from an all-purpose request
count, a completed observation from a click alone, or a successful refusal from
an unknown decision. Keep early-stop and dropped-request limitations explicit.
Missing/uncertain/malformed capture must not create an observation badge.

Executive and detailed results consume the same persisted projection/checklist
facts. Do not infer a confirmed decision from a review/issue display state.
Historical assessments and persisted finding text are not rewritten on read.
This presentation change adds no scanner work, paid calls or recurring cost.

### Bounded first-layer context and accessible scope binding

Geometry retains an exact, unique container for a canonical control when its
consent context comes from bounded independent readable prose, including in a
child frame with generic CSS names. The prose and control must belong to that
same live document and scope. A label alone, page chrome, a main/article body,
script/style/template content, or hidden/inert/aria-hidden prose must not supply
this context. Readability follows composed ancestors, including open-shadow
hosts, and is cached within each bounded geometry capture. This repairs retained
scope provenance; it does not introduce a site-specific recipe or promote an
unclassified control.

Accessible action resolution permits a boxless scope only when both the exact
scope and candidate control permit interaction. Existing unique-label, enabled,
hit-target, exact-target authorization, one-action and semantic-decision guards
remain authoritative. More than the bounded 24 accessible controls fails closed;
never truncate a larger set and infer uniqueness from the remaining subset.

No invocation, retry, model call, observation window or tail cap is added.
Bounded geometry work/metadata is estimated below $1/month at 100,000 scans and
30-day retention, within the approved allowance; successful dispatch may use
more of the already-approved action-capture budget. Targeted Ireland replays
measure recoveries and retained evidence, not production precision/recall or a
production latency percentile. Keep access holds and all non-cooldown eligibility
rules in force even when the owner waives calibration cooldowns.


### Consistent multilingual action-control proof

The final action proof uses the same canonical `multilingual_v1` label profile as
structured control discovery. Classify the preferred retained accessible label,
and independently check other label sources for conflicting intents using that
same profile. A native button's submission `value` is not an accessible label;
only native input button/submit/reset controls use their rendered value as a label.
Do not concatenate opaque submission payloads into visible or ARIA labels.

Apply these rules both to the selected control and to the final uniqueness check.
Keep the 0.8 direct-label threshold, exact-target authorization, one-action guard,
container interaction checks and separate semantic registration requirements.
Unknown preferred labels, mixed label intents, generic “OK”, privacy opt-out
controls, hidden/inert scopes and distinct matching controls remain fail-closed.
Retained diagnostics distinguish `resolved_control_scope_not_interactive` from
`resolved_control_no_longer_actionable`; both retain the existing bounded stale
control recovery eligibility. Neither outcome creates a finding.

This adds no browser reads, waits, lanes or model calls. The broader in-memory
label checks are estimated below $1/month at 100,000 scans, within the prior
owner-approved allowance. Additional successful action capture uses the previously
approved existing observation windows.
