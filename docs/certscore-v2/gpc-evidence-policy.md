# GPC evidence reliability policy

Owner-approved September 5, 2026. Implemented locally; deployment and public
re-scan are not authorized by this change.

## Canonical path and migration

The production v2 scanner captures typed observations in this repository's
`packages/certscore-scan-core`. The Lambda coordinator verifies lane artifacts
and constructs `certscore.gpc-response-assessment.v2`, which follows the existing
typed runtime projection → normalized concern → concern policy → unified
finding → persisted report, score, API/Pulse/MCP and display path. There is no
display-layer inference or secondary report publication.

New assessments use v2; dispatch remains v1. Stored assessment v1 remains
readable without being relabelled or silently supplied with v2 readback proof.
Only a future authorized scan can provide missing observations. Public clients
must handle v2's explicit nullable unavailable evidence and additional fields.

## Three independent outcomes

All isolated passive workers receive the coordinator-owned scan ID at capture,
while physical invocation and document/capture identities stay lane-specific.
The GPC verifier requires that retained ID to match its envelope before pairing
it with baseline. Do not rewrite evidence on receipt or relax identity/checksum
verification. A real Chromium worker → artifact upload → verifier → assessment
regression covers this handoff. No new wait, retry, or browser is introduced.

- **Delivery:** verified, limited, or unavailable. The GPC context configures
  `Sec-GPC: 1` before navigation and exposes a readonly true navigator preference;
  the isolated baseline exposes false without that header. Retained requests
  must prove main-document and subresource delivery. Actual same-session
  navigator readback covers the main window and up to 32 frames. Read failures,
  changed frame/document identities, missing frames or mismatched values limit
  delivery. URLs including query identity are hashed, not exposed in this proof.
- **Coverage:** complete, limited, or unavailable. Both verified artifacts must
  belong to the same scan, region, exact effective document and passive browser
  configuration, have usable runtime coverage and a completed existing quiet
  gate. Classified activity is compared only within the shared duration from
  each document's time origin, ending at the earlier signal snapshot. Raw
  evidence outside that interval is retained but cannot decide the comparison.
- **Response:** responsive, no observable response, or indeterminate. Only a
  complete, delivery-verified comparison is determinate. A responsive result
  requires fewer retained canonically classified tracker/service identities
  without newly added tracker identities. This is an observed reduction, not
  proof of causation, GPC compliance or a legal determination.

Cookie and web-storage identities and consent-management vendor variation are
descriptive deltas only. Snapshot identities are not claimed to be synchronized
state/value comparisons. Receipt changes, cookie churn, new advertising, or a
different CMP identity cannot independently establish a privacy response. This
version does not infer or decode a semantic GPC opt-out decision from CMP state.

## Worker scope limitation

Playwright window init scripts do not establish WorkerNavigator at worker
startup. Observed dedicated/service workers therefore produce an explicit
`worker_navigator_delivery_unverified` limitation. The implementation does not
retrofit a running worker and call it verified delivery. This is not a promise
of universal worker/shared-worker coverage. Broader worker support requires a
separately tested browser-runtime solution; no browser-runtime substitution is
part of this approval.

## Full sets, bounded output, unchanged scoring

Compare full retained sets before sampling. Each delta retains full baseline,
GPC, shared and condition-only counts; serialized identity samples are capped
at 100 with an explicit truncation flag. Contract validation checks count
arithmetic, disjoint/unique samples, sample lengths and truncation consistency.
Canonical advertising/marketing activity has its own full-count delta so
California scoring cannot depend on a truncated sample or a display regex.

The existing California-only 15-point no-suppression policy and its exemptions
remain unchanged. Analytics-only, partial suppression and indeterminate
comparisons remain score-neutral. GPC capture itself has no legal/score effect.

## Failures, latency and cost

The coordinator awaits the enabled GPC lane's terminal outcome under existing
caps. Invocation, retained-artifact integrity/schema and auxiliary-copy failures
become explicit indeterminate coverage without discarding other verified lanes.
They have no synthetic GPC artifact pointer or affirmative delivery proof.
Telemetry records the failure and does not claim its evidence was joined.

No extra sessions, retries, model calls, intentional settle delays or increased
coordinator/worker time caps are introduced. Readback runs alongside existing
bounded page capture within its remaining budget. Existing raw artifacts are
not removed or downsampled. Estimated incremental bounded metadata retention:
less than $1/month at 100,000 scans with 30-day retention (typical small
inventories; large inventories, replication and longer retention require a
fresh estimate). This is not a measured live-cohort cost or latency benchmark.

## Verification

Deterministic fixtures cover actual HTTP and window/frame signal delivery,
baseline false preference, honest worker limitation, the existing 250ms quiet
gate restart, mismatched/partial/missing proof, matched observation windows,
unanchored classifications, cookie/CMP noise, web-storage identities, 150-item
comparison/scoring, artifact failures and failed-lane telemetry. Contract tests
preserve v1 and reject inconsistent v2 proof/counts. End-to-end fixtures verify
all three v2 outcomes through normalized concern/policy, unified finding,
checksum-bound persistence, report and public API/status output without private
artifact URLs. Live public calibration remains a separate authorized step.

Local verification on September 5, 2026 passed: final combined GPC/scoring/
report/API/Lambda regression suite (184 tests), full contracts (342), broader
web concern/policy/materialization suite (362), API contracts (16), SDK (25),
and MCP (86). These suites overlap and should not be summed as unique cases.
Contracts/API builds and scan-core, Lambda, web, SDK and MCP typechecks passed;
`git diff --check` was clean. One legacy Accept fixture assertion was corrected
to require completed click/capture but unverified consent when its only witness
was banner dismissal, consistent with the separately approved action policy.

## September 10, 2026 comparison corrections

The owner approved implementing the retained-cohort audit recommendations
locally. Deployment remains a separate step. These correct v2's implementation
of the existing evidence policy; they do not change its contract or scoring
schedule. Existing stored assessments and scores are not recomputed on read.
New scanner builds retain their normal build provenance and verified source
artifact pointers. Diagnostic replay outputs are internal artifacts, never
replacement historical evidence or production materializations.

- Bind each readback to a retained main-document request at or after that
  document's time origin and no later than the readback. Both final URL hashes
  must match, including query identity. Permit earlier redirect hops, but fail
  closed on missing, repeated same-URL, simultaneous conflicting, or later
  main-document requests. Later navigation after readback also makes that
  readback insufficient for the terminal document. `firstEffectiveUrl` remains
  first-response telemetry; it is not final-document proof. Delivery, scan,
  region, browser configuration, representative access, runtime coverage and
  settle checks still apply.
- Admit a journey's purpose only when its own referenced canonical vendor
  observation has the same vendor, purpose and product (when specified), and
  the two share a retained purpose-bearing event inside the matched window.
  An early tag-manager bootstrap cannot backdate later advertising/analytics
  activity. Use event timestamps from the raw retained inventory, not an
  aggregate journey's first timestamp. Preserve full raw artifacts and existing
  identity formatting; introduce no local vendor rules or inferred evidence.

The cached 884-pair production replay (ErgoVeritas excluded) increased
determinate comparisons from 58 to 116: 60 redirects recovered and two stale
readbacks newly limited. LaunchDarkly's out-of-window advertising deduction is
removed in replay; Mozilla's late analytics does not become a false responsive
result. These are diagnostic results, not changes to stored production scans
or a measured population false-positive/false-negative rate.

No browser work, model calls, added retention, waits, retries, timeouts, lanes,
or infrastructure are introduced. Expected incremental recurring cost is
approximately $0/month at 100,000 scans; comparison-only local computation is
not a live latency benchmark. The quiet gate is unchanged: 605 cohort scans
have a settle limitation, and 203 have no other remaining blocker after these
corrections. Existing artifacts retain timeout outcomes but not the exact
in-flight count/quiet age at the gate. Request/response metadata cannot prove
request completion, so these scans must not be promoted by assuming they
settled during later capture. Any further settle optimization requires direct
completion evidence within the existing budgets and focused calibration.
