# CertScore.ai direct Accept/Reject reliability

Local implementation and verification, November 1, 2026. Scoped deployment and
activation were authorized at 18:26 UTC, subject to passing release checks.

Frozen reviewed runtime: `7042ba6fd33bd881b5df5cc5859b11575c1fd531`.
Later commits only repair the evaluation harness or record evidence. The
120-action tables below are historical measurements of `1314f95e`; final
three-arm results are recorded below and in the reviewed evaluation JSON.

The candidate repairs reproduced wrong-click and false-confirmation defects.
Both explicitly approved public canaries produced ready canonical reports from
actual local baseline/candidate scanner code. This does not establish a
population-wide improvement, a best-in-class ranking, or production latency
parity. The single public candidate scan was slower; timing is broken down below.

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
| Nonblocking geometry/proof/CDP cleanup | On | On |
| Preparation-versus-committed production checkpoint distinction | On | On |
| Exact native element across full proof and ordinary dispatch | Off | On |
| Selected-document reload/detach invalidation and bounded fragment identity read | Off | On |
| Selected-frame Reject storage baseline/write/value/hash scope correction | Off | On |
| Closed-shadow current hit/ancestry validation and bounded CDP reads | Off | On |

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

- Frozen reviewed source: **158 passed, zero failed** in the full localhost
  gate. Flags are unset globally; fixtures explicitly exercise enabled,
  disabled and unset behavior. Actual intended clicks and semantic decisions
  are asserted separately. Tests cover replacements/reordering, cancellation,
  deadlines/stalled cleanup, frames, local/session storage, cross-origin frame
  contexts, closed/open shadow controls, document reloads/fragments and clocks.
- Minified/Lambda checks: **8 passed, zero failed**. Scanner, Lambda and web
  type checks passed; scanner build and minified Lambda bundle passed.
  `git diff --check` passed. There is no separate scanner lint script.
- Independent reviewer-confirmed scoped-accessible binding bypass, blocking
  failed-proof cleanup and stale geometry budget were reproduced and repaired.
  Closed-shadow replacement and pre-validation bookkeeping were also repaired.
  The parent-supplied reviewer closed source review with no confirmed blockers;
  no local reviewer was spawned.

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

The parent-supplied independent source reviewer closed review of `7042ba6fd`
with no remaining confirmed source blockers. The initial 120-action cohort is
not evidence for these repairs; the final three-arm cohort is recorded below.
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

## Approved public scanner-to-report checks

Ben approved exactly two scans of the existing owned canary
`https://ergoveritas.com/testar2.html` at 17:16 UTC. The earlier automatic-review
rejection was confirmed unexecuted. Fresh central contact history, canonical
selection and the explicit ordinary-cooldown waiver preceded both actual visits;
blocked/do-not-calibrate states were preserved. Both contacts were persisted
idempotently under `ar-direct-path-20261101-reviewed-7042ba6`; the repository
contact-only ledger records the resulting cooldown. There were no further visits.

Both runs use the real local sharded handler, the original existing scan lanes
and standard settings, then checksum-verified artifacts through the real
canonical publisher/API/export code with repository AWS/DB I/O doubles. Source
pins verified unchanged. This measures local macOS Chromium, not production
Lambda cold starts, queue latency, database locks or UI rendering.

| Measurement | Deployed baseline | Enabled candidate |
|---|---:|---:|
| Scanner harness elapsed | 6,507 ms | 7,733 ms |
| Existing worker invocation phase | 6,358 ms | 4,596 ms |
| First worker invocation through scanner summary | 6,388 ms | 4,619 ms |
| Elapsed outside that measured span | 119 ms | 3,114 ms |
| Accept/reject additional tail wait | 0 / 0 ms | 0 / 0 ms |
| Publication replay/API/HTTP | 670 ms | 513 ms |
| Canonical report | Ready | Ready |
| Semantic Accept / Reject | Unconfirmed / Confirmed | Unconfirmed / Confirmed |

The candidate scanner total is **1,226 ms (18.8%) slower** in this one pair.
The retained phases place the difference outside the worker-invocation span;
the A/R lanes add no tail wait. Startup/setup, local source execution and site
variance are not independently isolated, so this is not evidence of a production
A/R latency regression or a claim that latency parity has passed. The final
controlled cohort evaluates observer cost separately, including closed-shadow
preparation. No fixed sleeps, deadlines or observation windows were changed.

The baseline scan completed at 18:03:12 UTC. Its first local publication attempt
correctly failed because retained files were outside the publisher's permitted
artifact root. Exact hash/size-verified retained bytes were copied into the
existing permitted root and replayed, without another scan or weakened guard.
Thus its 7,177 ms scanner-plus-publication sum is **not an uninterrupted
end-to-end wall time**. Candidate completed the full uninterrupted local path
in **9,076 ms**, including process setup and HTTP200. A precise paired full-report
latency comparison remains unestablished because baseline required recovery.

Both observations match the owned fixture's registered expectation: Accept
remains unconfirmed, Reject is confirmed with six post-refusal activity
observations. This public canary is publication/regression evidence, not proof
of improved Accept success. Actual click counters are unavailable on the public
target; controlled fixtures independently count page/server clicks.

A preliminary malformed wire-configuration attempt failed validation before
browser/network execution; it is not counted as a visit. Harness fixes now
validate Accept-v6 / Reject-v23 wire enums before scanning, distinguish registry
recipe versions, and preserve every failed attempt. Source pins and reports are
at `/tmp/certscore-ar-approved-report-recovered`; the retained baseline scan is
at `/tmp/certscore-ar-approved-report-wire-fixed`.


## Final reviewed three-arm evaluation

All **216 actions** completed: **72 per arm**, twelve fixture classes, both
actions, three repetitions, with rotated arm order. Source pins matched before
and after all attempts. Chromium `145.0.7632.6`, local macOS, no AWS scan workers.
The runtime is frozen at `7042ba6fd`; all failures remain in the denominator.

| Measurement | Baseline | Candidate gate unset | Candidate enabled |
|---|---:|---:|---:|
| Intended actual clicks | 60 | 60 | 60 |
| Wrong actual clicks | 6 | 6 | 0 |
| Correct semantic confirmations | 42 | 45 | 48 |
| False confirmations | 3 | 3 | 0 |
| Complete observation captures | 63 | 66 | 54 |
| Packet errors | 3 | 0 | 0 |
| Median observer time (ms) | 3443 | 3334 | 3157 |
| p95 observer time (ms) | 8319 | 8326 | 8318 |

The matched ordinary set contains **48 actions per arm** (direct, localized,
open shadow, scoped accessible, closed shadow, frame, readiness and opaque state).

| Measurement | Baseline | Candidate gate unset | Candidate enabled |
|---|---:|---:|---:|
| Intended actual clicks | 48 | 48 | 48 |
| Correct confirmations | 39 | 39 | 42 |
| Complete observations | 48 | 48 | 48 |
| p95 observer time (ms) | 8491 | 8481 | 8524 |

Per-fixture counts, closed-shadow preparation cost, raw rows and source hashes
are retained in `ar-direct-path-reviewed-evaluation-2026-11-01.json` and
`/tmp/certscore-ar-reviewed-three-arm-evaluation`. Shortened failed/limited paths
are not treated as speed improvements. Complete captures retain their entire
configured 3-second Accept / 8-second Reject observation windows.

## Rollout and limitations

No deployment, production flag activation, new scan lanes or infrastructure was
performed. Required contact-audit metadata was written through the canonical
existing helper; no score, account, security or scan configuration changed.
Full native/document binding, selected-frame storage and closed-shadow validation
remain default-off. Disable the gate to roll those features back; reverting the
reviewed source is necessary to roll back ordinary bug fixes. Historical reports
are not rewritten.

Closed-shadow coordinate input is best effort. A DOM change can still race the
press, and timeout after press may leave a partial-input/uncertain result; no
second consent attempt is made. Command-attempt timestamps do not prove physical
hardware delivery. The synchronous internal commit callback is bookkeeping-only;
extensible preparation callbacks execute before final validation. The parent
reviewer classified a hypothetical commit-callback-induced abort as conditional,
not a confirmed reachable production defect. No blanket atomic-input guarantee
is claimed.

Independent source review is closed. Production rollout still requires owner
authorization and a separate operational latency decision.
The controlled failures, public timing limitation, unconfirmed Accept canary and
unsupported Options/category/Save paths must remain visible in that decision.

## Authorized release preparation

The owner explicitly authorized deployment and activation at 18:26 UTC after
clarifying the earlier preparation request. This supersedes the earlier rollout
hold for this scoped release. Remote main and the live AWS web revision were
refreshed at 18:27 UTC and both remained the verified `5894539f` baseline.

The only activation additions are the existing
`CERTSCORE_AR_BOUND_CONTROL_DISPATCH_ENABLED=1` environment setting in canonical
scanner deployment/Terraform configuration and a regional parity requirement,
plus a focused deployment-contract test. These do not alter observer source,
packet contracts, worker topology or budgets. No Terraform apply is required.
The runtime option remains default-off for callers/environments without the flag.

Release through `pnpm deploy:scanners -- --base <live-sha> --plan`, then the
established targeted scanner procedure after exact-source release checks and a
clean committed/pushed branch. Reuse the runtime base, build once, replicate the
same immutable image to existing primary/inventory functions in eu-central-1,
eu-west-1 and us-west-1. No web, MCP, validation or DB release is required: the
changed A/R observers execute in scanners, and the new web file is a test only.
Existing validation imports use unaffected network/full-site helpers.

Verify image/provenance digest, Active/Successful state, the A/R flag on all six
functions, regional parity, unchanged memory/timeouts/budgets and standard
Web Bot Auth HTTP200 health checks. No further public consent scans are included
in this authorization. Report the exact deployed SHA/digest and measured stage
times; do not claim the web version changed for a scanner-only release.

Rollback readiness: retain the verified baseline image digest above and the
pre-release configuration state. A gate-only rollback sets the existing A/R flag
back to its prior value using revision-guarded configuration preservation; a
complete behavior rollback promotes the retained immutable baseline image through
the existing image/provenance helper and restores prior gate state. Keep all
other configuration intact. No rollback has been executed.
