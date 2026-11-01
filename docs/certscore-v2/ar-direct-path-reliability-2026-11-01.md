# CertScore.ai direct Accept/Reject reliability

Local implementation and verification, November 1, 2026. Production rollout is on hold.

Review follow-up: runtime source has changed after implementation `1314f95e`.
The 120-action tables below are historical evidence for that commit; they are
not final measurements of the reviewed source. A new unset/default-off/enabled
cohort and the two explicitly approved public-canary scans remain to complete.

The candidate repairs reproduced wrong-click and false-confirmation defects. It
does not establish a population-wide success-rate improvement or a best-in-class
benchmark result. Full scanner-to-report latency verification remains blocked.

## Baseline and isolation

- Verified deployed baseline: `5894539fbb27acb3130d4afdf55bc196974a50c6`.
- Scanner image: `sha256:06f696d55b7f0a730f55d9c39b2a352b531df5c42bbf57c0c69e5180a74d163b`.
- The release completed scanner, parity, Web Bot Auth and configuration checks at
  15:21:47 UTC. Consumers and all eight GitHub workflows had already passed.
- Worktree: `/tmp/certscore-ar-path-reliability-20261101`;
  branch: `codex/ar-path-reliability-20261101`.
- Main was left clean on the deployed baseline. No source edits, stash/reset,
  branch switch, push, PR, deployment or production flag activation in main.

## Changes

1. Geometry fallback retains the exact inspected native element through its
   single input command. A replacement matching the selector cannot inherit the
   original control's authorization.
2. The default-off bound-dispatch option retains that element across the full
   label/scope/actionability proof and dispatch in both observers. Existing
   uniqueness, classifier, target, transactional-control and semantic rules stay
   authoritative. Detached/uncertain input is never retried.
3. Dispatch timing moves after asynchronous preparation to the input-command
   boundary. This is a command-attempt timestamp, not a measured hardware event
   time. Actual fixture clicks are counted independently by the page/server.
   Synchronous lifecycle cancellation is retained as aborted before input with
   no dispatch timestamp and no receipt/graph dispatch marker.
4. Reject storage baselines, fresh-write correlation and value/hash reads use
   the selected frame. A fresh frame decision is no longer missed, and an
   unrelated main-document write cannot confirm it. Stale/opposite/unknown
   values remain unconfirmed. No additional storage read is introduced.
5. The selected native frame/document is invalidated on document replacement
   or detachment, including reloads with an unchanged URL. A fragment-only
   update receives at most one bounded document-identity read using the exact
   bound element in the current frame realm. There is no ordinary-path extra
   browser command, polling, DOM mutation or new timer-based settling delay.
   Pending/unavailable identity fails closed under the existing deadlines.
6. A limited Accept form artifact retains the confirmed action's clock even
   when navigation has stopped sampling. It remains limited with empty/invalid
   samples excluded; this does not resume capture or certify another document.

The packet schemas and historical readers are unchanged. No scoring, taxonomy,
policy, GPC, API tracing, cookie-read tracing, capture-retention or CMP registry
expansion is included.

## Gating and limits

`boundControlDispatch: true`, or the local process environment variable
`CERTSCORE_AR_BOUND_CONTROL_DISPATCH_ENABLED=1`, enables full element/document
binding and selected-frame Reject storage reads together. It is off by default.
No production environment value changed. Geometry-fallback node retention,
timing/cancellation corrections and the limited-artifact clock repair are ordinary
bug fixes. Geometry handle cleanup is asynchronous and cannot delay the action
result; the stalled-cleanup regression passes.

| Change | Candidate with gate unset/off | Candidate with gate enabled |
|---|---|---|
| Exact native node across geometry fallback inspection and its one click | On | On |
| Input-command timing, synchronous cancellation guard and closed-shadow timing callback | On | On |
| Limited Accept form-artifact clock correction | On | On |
| Nonblocking geometry-handle cleanup | On | On |
| Exact native element across full proof and ordinary dispatch | Off | On |
| Selected-document reload/detach invalidation and bounded fragment identity read | Off | On |
| Selected-frame Reject storage baseline/write/value/hash scope correction | Off | On |

The 120-action comparison explicitly enabled `boundControlDispatch: true` and
the environment value `1` for the candidate; it explicitly used `false` and `0`
for baseline. The input Boolean takes precedence over the environment fallback.
The deployed baseline does not contain this new gate. **This comparison does not
measure the candidate with its new gate off.** Its wrong-click and replaced-
document improvements must not be attributed to default behavior. Unit tests
exercise enabled/disabled paths, but do not substitute for a paired default-off
cohort or real-site validation. All candidate code remains undeployed.

No new Lambda lane, function, worker, parallel scan execution, browser visit,
model call, fixed sleep, action deadline or observation-window increase was
added. Existing 3-second Accept and 8-second Reject windows are used in the
paired evaluation. Abort/target-change/uncertain-input outcomes retain their
existing limited status rather than acquiring another wait or click.

Closed-shadow controls keep their dedicated CDP executor; they do not acquire
the native ElementHandle binding. When the binding gate is enabled, two concurrent
CDP reads recheck the current hit target and complete ancestry under the bound
button (depth four, at most 64 nodes). Preparation and input reads share a
conservative two-second cap clipped by the existing branch deadline. Failed or
cancelled validation never commits an action timestamp, receipt or production
checkpoint. CDP cleanup does not block the result. This remains best-effort
coordinate dispatch with a residual DOM race before the press; it is not atomic
element binding. Duplicate frame URLs remain conservatively
ambiguous where the existing resolver cannot identify a unique scope. Actual
cross-origin/OOPIF and closed-shadow production coverage has not been newly
benchmarked. Multiple fragment transitions can remain limited under the bound
identity-read cap. Native controls exposed before a delegated handler becomes
ready may still produce unconfirmed outcomes; no generic handler guess or
speculative second click was introduced.

Options-to-Reject, category toggles and generic Save exploration are deferred.

## Reference implementation decisions

DuckDuckGo Autoconsent (`567b836fea941537c11fcc210fe2ff4cfd2903e7`,
17.2.0, MPL-2.0) and Consent-O-Matic
(`8ca8500d26434c586039e126ad091e1bfccd205d`, MIT) were the strongest relevant
reviewed automation references. Adopt their explicit provider rules, contextual
resolution and fixture-driven testing ideas. No code was copied. Do not import
first-match/handled-as-success semantics, blind retries, provider-specific fixed
settling sleeps or banner-disappearance-as-registration proof.

This candidate's concrete distinction is retaining the proven native control and
source document through input and independent semantic readback, while retaining
uncertainty and failures. This is a demonstrated safety improvement over the
reproduced deployed behavior. It does not establish a standardized head-to-head
ranking against those projects or broader CMP coverage than their rule sets.


## Completed verification

- Candidate-enabled A/R plus publication-safeguard gate: **106 passed, zero failed**;
  final cleanup/deadline follow-up: **9 passed, zero failed**. Actual intended
  clicks and semantic decisions are asserted separately. The 9-test follow-up includes the new nonblocking
  geometry-cleanup regression. Coverage includes
  cancellation, replacements/rerenders, semantic/stale/opposite decisions,
  multilingual labels, ambiguity, frames, shadow scope, document reloads,
  same-document fragments, deadlines and form-artifact clocks.
- Final minified/Lambda checks: **8 passed, zero failed**, including the new
  serialized document-identity callback, native runtime probes, startup imports
  and existing action-tail limits. The new browser probe also passed from the
  Lambda package's normal working directory after its path fix.
- Scanner, Lambda and web type checks passed; scanner build and minified Lambda
  bundle passed. All 14 workspace package builds passed, followed by the final
  scanner rebuild. `git diff --check` passed. There is no separate scanner lint
  script.
- Adversarial review reproduced and repaired new-document false confirmations
  and the same-document fragment compatibility issue. Independent reviewer
  sign-off remains required before rollout.

The first frozen cohort retained 48 actions per arm (eight fixtures, both
actions, three repetitions), on Chromium `145.0.7632.6`, local macOS, no AWS
scanner. Source pins verified unchanged. Intended clicks stayed 36/48; provoked
opposite clicks fell from 6 to 0. Confirmations remained 27/48 before the later
frame repair. Complete observations fell 42 to 36 because the six unsafe
baseline clicks became failed/limited paths. p95 was 8,529 ms versus 8,497 ms;
that small difference is not a speedup claim. Raw failures and packets remain at
`/tmp/certscore-ar-paired-evaluation`.

The final frozen-source cohort at
`/tmp/certscore-ar-final-source-paired-evaluation` completed all **120 actions**
(60 per arm; ten fixture classes, both actions, three repetitions). Source
manifests matched before/after the complete cohort. Chromium was `145.0.7632.6`, macOS,
local execution without AWS. This includes the final gate-coherence and
nonblocking-disposal repairs.

| Measurement | Deployed baseline | Final candidate |
|---|---:|---:|
| Intended actual clicks | 48/60 | 48/60 |
| Wrong actual clicks | 6/60 | 0/60 |
| Correct semantic confirmations | 30/60 | 36/60 |
| False/new-document confirmations | 3/60 | 0/60 |
| Complete observation captures | 51/60 | 42/60 |
| Packet errors | 3/60 | 0/60 |
| Median observer wall time | 3,367 ms | 3,151 ms |
| p95 observer wall time | 8,316 ms | 8,317 ms |

All failures remain in the denominator. Complete captures drop because wrong
clicks and replaced-document paths now fail closed; early aborts are not claimed
as speed improvements. Separately, the same 36 ordinary comparable actions per
arm (direct, localized, open-shadow, frame, readiness, opaque-state) completed
all configured windows: p95 **8,531 ms baseline / 8,529 ms candidate**. No meaningful
observer-latency increase was measured in this bounded cohort. This does not
establish full-report or population-wide latency. Intended click throughput did
not increase; improvements are correct source-specific confirmation, rejection
of unsafe clicks/receipts, and recovery from the reproduced fragment packet error.

The prior 120-action iteration remains preserved at
`/tmp/certscore-ar-final-paired-evaluation`; it predates the two final corrections.
The machine-readable final summary is
`docs/certscore-v2/ar-direct-path-evaluation-2026-11-01.json`. Raw packets, every
attempt and before/after source manifests remain in the final evidence directory.

The denominator is **120 total = 60 actions in each arm**: ten fixture classes
times Accept/Reject times three repetitions. Each row below has six attempts
per arm. “Complete” is observation-window completion, not choice confirmation.

| Fixture | Baseline: intended / correct confirmed / complete / packet errors | Enabled candidate: intended / correct confirmed / complete / packet errors |
|---|---|---|
| Direct | 6 / 6 / 6 / 0 | 6 / 6 / 6 / 0 |
| German labels | 6 / 6 / 6 / 0 | 6 / 6 / 6 / 0 |
| Open shadow | 6 / 6 / 6 / 0 | 6 / 6 / 6 / 0 |
| Frame | 6 / 3 / 6 / 0 | 6 / 6 / 6 / 0 |
| Disabled until handler ready | 6 / 6 / 6 / 0 | 6 / 6 / 6 / 0 |
| Ambiguous | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Opaque state | 6 / 0 / 6 / 0 | 6 / 0 / 6 / 0 |
| Opposite replacement | 0 / 0 / 6 / 0 | 0 / 0 / 0 / 0 |
| Same-document fragment | 6 / 3 / 3 / 3 | 6 / 6 / 6 / 0 |
| Selected-frame reload | 6 / 0 / 6 / 0 | 6 / 0 / 0 / 0 |

Unsafe/incomplete cases are separate from ordinary-path throughput:

- Opposite replacement: baseline made six wrong actual clicks; enabled candidate
  made none and retained six failed/limited paths without retry.
- Reload: both arms made six intended clicks. Baseline incorrectly confirmed
  three decisions from the new document and retained six complete captures;
  enabled candidate confirms none and retains six cancelled/limited paths.
- Ambiguity: both safely make no click in all six attempts.
- Opaque state: both click the intended control and observe the whole window,
  but all six decisions remain unconfirmed. This is not verified A/R success.
- Fragment: three baseline Accept packet errors recover; candidate confirms and
  completes all six same-document cases.

Thus baseline has nine incomplete attempts (six ambiguous, three fragment
errors); enabled candidate has eighteen (six ambiguous, six replacements, six
reloads). No ordinary comparable path lost an intended click, confirmation or
full window in this cohort; frame confirmation improves. These are fixture
results, not proof that no real-world path can regress.

## Independent review status

A separate reviewer supplied by the parent identified the scoped-accessible
binding bypass and failed-proof cleanup/deadline defects. All were reproduced
locally and repaired. Additional closed-shadow replacement and pre-validation
dispatch-bookkeeping defects were reproduced and repaired under the same gate.
Legacy preparation callbacks remain available for compatibility; production
checkpoints now use a separate notification after actual dispatch commitment.
No user callback runs between final validation and the internal input commit.

Final code/evidence sign-off remains pending the frozen follow-up diff and
verification. The initial 120-action cohort is not evidence for these repairs.
No reviewer was spawned locally and no permissions changed.

## Local core-to-publication integration

The existing genuine node:test loopback mode ran the real standard-profile
scanner and both real action observers against localhost:3000, then parsed the
typed bundle and checksum-bound artifact pointers through the actual canonical
publisher with repository DB/AWS I/O doubles. A loopback-only deterministic empty
policy provider was used; no credentials, remote model or fabricated policy
findings were introduced. Exactly one actual Accept and one actual Reject click
were observed, both independently semantically confirmed, with full configured
observation windows.

The HTTP-only fixture cannot supply reportable production posture scores.
Publication correctly rejects `posture_scores_unavailable`, writes no ready
snapshot and does not produce a report. This is a passing safeguard integration
test, not successful full-report verification. Artifacts, packets and diagnostic
receipt are retained in `/tmp/certscore-ar-local-publication-evidence`; failed
setup/publication attempts remain separately retained. Production network and
publication guards were not relaxed.

## Unresolved full-report check

The existing local sharded-handler harness rejected loopback before scanning:
`public_network_guard_failure.v1 / disallowed_hostname`. Both baseline and
candidate guard failures remain logged at `/tmp/certscore-ar-report-trial`.
The guard was not disabled or bypassed. These are not completed scan results.

A SELECT-only export through the existing contact-ledger helper completed at
16:02:39 UTC. The canonical selector chose the existing owned canary
`https://ergoveritas.com/testar2.html` under the owner's explicit cooldown waiver;
blocked/do-not-calibrate states were not waived. No production data or
configuration was changed by that read-only export.

Automatic approval review then rejected the proposed sequential baseline and
candidate local scans of that public canary, before execution, because public
website scans/consent actions exceeded its interpretation of the explicit
localhost scope. No external canary scan occurred, no indirect workaround was
attempted, and there is no full-report latency acceptance result. The prepared
`scripts/evaluate-ar-local-report.ts` uses actual local scanner code and the
repository's AWS/DB I/O doubles; it must not be presented as production queue,
database-lock or browser-rendering performance.

Ben explicitly approved the two public scans of `https://ergoveritas.com/testar2.html`
on November 1 at 17:16 UTC. The previous rejected operation is confirmed
unexecuted. A fresh central-history/eligibility check and the frozen reviewed
source must precede the permitted retry. The scans have not yet started. Keep production rollout off meanwhile. A broader binding rollback
is the default-off option; ordinary bug-fix rollback would require reverting
the reviewed source commit. Historical reports are not rewritten.
