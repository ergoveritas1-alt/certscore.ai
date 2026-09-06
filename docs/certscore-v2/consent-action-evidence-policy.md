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
