# Cookie and tracker evidence graph: implementation and release plan

Status: implementation authorized and in progress; production deployment and activation remain gated. See `cookie-tracker-evidence-graph-release.md` for measured results and current release status. The original scope, spend ceilings and acceptance gates below remain unchanged.
Prepared: 2026-09-04. Incorporates the independent Astra review.

## Outcome and execution scope

Deliver a production cookie/tracker inventory in which an item can explain what was observed, which document/frame/worker it belongs to, what directly initiated or set it, which downstream activity it caused, and the retained evidence supporting each relationship. Ambiguous relationships remain explicitly unresolved. Multiple parents, redirects, ownership, and scenario comparisons have distinct meanings.

This is one implementation effort with incremental commits, automated gates, a deployment with the feature disabled, regional canary activation, and staged customer activation. Completion includes production verification and a bounded observation period, not just merging code.

The approved scope should include:

- Accurate request, response, frame, document, script, and cookie identities; structured initiator evidence; redirects; exact cookie set attempts, acceptance/blocking where observable, snapshots, and transmission.
- Bounded local/session-storage mutation attribution and snapshots; frame and service-worker network coverage; passive IndexedDB/Cache Storage metadata where supported, with explicit capability limitations.
- Passive streaming-connection metadata without recording message bodies or extending the observation window.
- One verified graph representation, persisted typed projection, additive API exposure, and an accessible dependency explorer in the existing inventory.
- Vendor/product/entity joins using canonical registries; per-item disclosure evidence from existing retained policy work; separate baseline/GPC/Accept/Reject comparisons.
- Timing, coverage, privacy, integrity, rollout, and feature-disable controls with tests.

Deferred from this release: site-wide crawling, additional browser lanes, longer observation windows, exhaustive storage-read tracing, deep async-stack tracing, comprehensive IndexedDB record enumeration, new active DNS/CNAME queries, new model calls, new scoring rules, and historical scan backfills. Reuse existing DNS/destination evidence when present. These deferred capabilities are not prerequisites for a complete initial release and must not silently enter implementation.

## Production ownership and governing rules

The later, production-specific `AGENTS.md` section at lines 885–889 explicitly places production scanner changes in WC01's v2 DAG packages. The earlier generic WS01 ownership description is inconsistent with that specific instruction and with the deployed architecture. This plan follows the production-specific rule: observation code in `packages/certscore-scan-core`, orchestration in `apps/v2-dag-lambda`, contracts in `packages/certscore-contracts`, and interpretation/projection in the existing WC01 web pipeline. WS01 remains a fixture/history reference, not a production deployment target.

Production scanner regions are `eu-central-1`, `eu-west-1`, and `us-west-1`. Public web is `certscore.ai` on AWS ECS/Fargate. Deployment uses the checked-in AWS helpers and workflows.

Preserve strict lane ownership, exact-target action authorization, full Chromium, the existing observation deadlines, GPC separation, independent Accept/Reject controls, and the single terminal publication barrier. Preserve canonical assessment -> persisted evidence -> normalized concern -> concern policy -> unified finding/checklist behavior. Inventory descriptions explain verified facts; display code does not decide findings.

The production integration proposed here is limited to deterministic runtime evidence and inventory/API explanations. Existing finding policies may legitimately react to corrected evidence; every resulting finding/score delta must be traced and reviewed. No new weights, legal conclusions, model projection permissions, or absence rules are included.

## Phase 0 — Establish a reproducible starting point

1. Use an isolated `codex/` branch/worktree if needed to preserve unrelated user work. Record the current live web SHA, scanner image digests, browser/protocol version, memory, region configuration, and deployed feature settings using approved read-only paths.
2. Use the live web revision as the deployment comparison base. Record the existing calibration baseline without changing its labels or acceptance rules.
3. Check Node 22–24, pnpm, Chromium, AWS/GitHub authentication, local test services, and production verification access. Local browser review uses `http://localhost:3000`; local test credentials must remain isolated from production.
4. Capture sanitized baseline artifacts and measurements. Start with retained replay and deterministic fixtures; use approved owned canaries for fresh regional baseline measurements once release-test authority and budget are approved.
5. Verify actual artifact retention, scan volume, copy/mirror count, projected graph bytes, and region-specific incremental cost. Complete the cost gate below before cost-increasing implementation.

Deliverables: release manifest, source/runtime identities, fixture matrix, baseline results, concrete cost estimate, and a list of existing operational prerequisites. Do not treat absent credentials or skipped checks as passes.

## Phase 1 — Define and test the contract

Add focused graph modules instead of expanding the large scanner with another feature-specific data model.

- Define a versioned contract for nodes, typed edges, structured stack frames, evidence pointers, scenario identity, observation times, and capability/coverage diagnostics.
- Request identity includes browser target/session, CDP request ID, and redirect occurrence. Frame identity and document/loader identity remain separate; URL is an attribute, never the identifier.
- Cookie identity preserves name/domain/path/host-only/partition scope as available in the pinned browser. Record source scheme/port as metadata without assuming every browser version uses them as identity components. Missing scope fields cannot be invented for a confident join.
- Separate physical event identity from logical identity used in comparison across sessions. Never stitch independent lane clocks into a causal execution chain.
- Relations distinguish resource loading, direct initiation, async ancestry, response linkage, redirect lineage, cookie/storage attempts and outcomes, transmission, ownership, and disclosure.
- Preserve true stack order and bounded line/column/script references. A stack is not automatically proof that one script loaded another.
- Define capability outcomes such as supported/complete, partial, unavailable, ambiguous, and truncated with reason codes and denominators.
- Use a compact shared stack table and node references. Bound nodes, edges, stacks, bytes, and pending work; retain explicit counts and graph integrity on truncation. Do not remove existing evidence to fit the new graph.
- Extend the existing verified bundle/pointer contract and runtime fixtures. Store one authoritative representation per owning lane; a merged index can reference lane-owned records rather than duplicating full graphs.
- New readers accept old scans; graph absence means unavailable, not a failure or an observed gap. Unknown contract versions fail closed for the graph while preserving valid existing report behavior.

Gate: schema, redaction, integrity, compatibility, and adversarial ordering tests pass before runtime wiring.

## Phase 2 — Repair collection and attribution

Primary implementation areas:

- `packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner.ts`
- New adjacent event correlation, cookie attribution, graph builder, and bounded probe modules.
- Existing action-observer modules where the same capture contract must be applied.

Implementation:

1. Make CDP request identity authoritative for the new network graph. Remove URL-queue guessing from graph correlation. If a Playwright/CDP association is not uniquely supported, retain it as unresolved instead of using undocumented private request fields.
2. Install listeners before navigation; preserve real initiator type, frame/loader identity, direct caller, and bounded stack data. Verify basic Debugger-enabled stack capture against the pinned Chromium release without pauses or deep async tracking.
3. Reconcile Network base and ExtraInfo events regardless of arrival order, including redirects that reuse browser request IDs. Do not require ExtraInfo for every request.
4. Correct cookie-header visibility; parse browser-provided associated cookies and inclusion/blocking reasons in memory. Preserve exact identity where available, and report name-only transmission as such where identity remains ambiguous.
5. Represent response Set-Cookie as a server write attempt. Represent an initiating script as a separate ancestor. Record JS/Cookie Store attempts independently from confirmed storage outcomes.
6. Replace cookie-name-only snapshot attribution with scope/document/time matching. Probe records include exact available attributes, sequence/time, attempted operation, native-call outcome, and bounded stack. Calls that did not persist must not become successful writes.
7. Track asynchronous response work. Retain essential response/cookie metadata promptly, then attach optional size/geography details. Drain tracked tasks within the existing deadline, mark unfinished enrichment, and freeze before serialization. No late mutation or report reopening.
8. Sanitize before persistence and logs: no raw cookie/storage values, consent strings, response bodies, request payloads, sensitive query/path values, or unbounded keys/stacks. Use bounded per-scan keyed digests only where equality checks require them.

Gate: exact expected identities and edges for duplicate requests, redirects, cookie collisions, blocked writes, and shuffled/missing protocol events; no incorrect asserted parent in the deterministic matrix.

## Phase 3 — Add bounded storage, worker, and frame coverage

- Capture local/session-storage mutations with early, behavior-preserving probes and browser snapshots. Verify native behavior and record probe failures/tampering. Enumerate supported mechanisms honestly; property assignment and unusual access paths must not be represented as comprehensively covered without tests.
- Observe IndexedDB/Cache Storage presence and supported change metadata without iterating raw records. Fine-grained writer attribution is optional/unknown unless evidence supports it.
- Observe relevant browser targets and context-level worker traffic. Distinguish a page request handled by a service worker from the worker's upstream network request; deduplicate actual transmissions by identity.
- Preserve same-URL sibling frames, cross-origin frames, out-of-process frames, worker termination, and navigation epochs. Target attachment failures become explicit coverage limitations. Preserve existing private-network guards and crawler identity controls when adding target coverage.
- Retain streaming connection endpoints, initiator metadata, and bounded counters. Routine recurring messages must not hold the scan open indefinitely. Preserve the existing qualifying-activity quiet gate and deadlines.
- Apply the same immutable capture profile to comparable runtime/GPC/action lanes. Keep consent-proof and policy work within their existing lanes.

Gate: behavior-equivalence fixtures with probes off/on, explicit support matrix, no unhandled worker-frame exceptions, no duplicate external-request counting, and no deadline extension. Features that cannot meet these gates stay disabled with documented limitations; a material reduction of the approved scope is reported rather than silently declared complete.

## Phase 4 — Persist and expose the verified evidence

Primary implementation areas:

- `apps/v2-dag-lambda/src/handler.ts`: typed dispatch, lane artifacts, verification, merge, and timing.
- `apps/web/server/scans/local-v2-dag-lambda-dispatch.ts` and the existing result/persistence paths.
- `apps/web/server/scans/local-v2-dag-report.ts` and `apps/web/lib/scans/runtime-inventory-projection.ts`.
- `apps/web/lib/scans/runtime-vendor-disclosure.ts`, canonical concern/policy boundaries where corrected facts are consumed.
- `apps/web/lib/api-v2/scan-resource.ts`, existing public schemas/SDK/MCP adapters that actually consume the changed inventory.
- `apps/web/components/scans/shared-scan-detail-view.tsx` and focused inventory components.

Implementation:

1. Verify artifact size, hash, scan/document identity, lane ownership, and version before projection. Carry provenance and source hash through persistence. Prefer existing typed JSON/artifact persistence; if an additive migration is required, ship it through the exact target web image before ECS promotion.
2. Preserve graph identity through every projection. Replace unexplained first-N truncation with explicit coverage metadata and bounded/paginated access that preserves the relationships shown.
3. Resolve vendor/product/entity/purpose through existing canonical registries. Join existing retained disclosure evidence with mentioned/not-found-in-reviewed-surfaces/unknown semantics; inadequate policy coverage remains unknown. No fresh model call is added to terminal readiness.
4. Label scenario comparisons using exact declared matching rules and compatible coverage. Unchanged post-refusal persistence remains neutral unless existing policy has separate eligible activity evidence.
5. Provide a keyboard-accessible expandable initiator/dependency view and evidence drawer for requests/cookies/storage. Show setter versus ancestor, direct versus inferred, multiple parents, and missing evidence clearly. Explain location as observed endpoint/CDN evidence.
6. Keep the API additive and versioned. Authorize artifact/graph access through existing account/scan permissions and canonical read-rate policy; do not add unprotected S3 or graph traversal paths. Escape untrusted evidence strings in UI/export.
7. Historical scans continue to work with an explicit graph-unavailable state. No rescan or backfill is automatic.

Gate: retained bundle -> persisted projection -> inventory/API -> UI round-trip tests; malformed/cross-scan/hash-mismatched evidence fails closed; normal and old scans render correctly; affected findings remain traceable through canonical policy.

## Phase 5 — Tests before deployment

The release matrix includes document/script/request/response/cookie chains; stylesheets/fonts; nested and same-URL frames; duplicate URLs; redirect reuse; inline/blob/eval scripts; cached and worker-served responses; blocked requests; HTTP and JS cookie writes; Cookie Store support; host-only/domain/path/partition collisions; deletion; storage success/failure; streaming connections; timeouts; cancellation; overflow; redaction; forged/tampered probes; and mismatched lane artifacts.

Test independent and combined GPC/Accept/Reject configurations, exact-target authorization failures, confirmed and unconfirmed actions, pre-registration/in-flight activity, unchanged persistence, and exactly one terminal publication. Compare the full evidence pipeline for every intended gained/lost row and score delta.

Use existing Node/tsx tests and add focused test files to the real package/CI discovery paths. Commands include:

```bash
pnpm --filter @certscore/contracts test
pnpm --filter @certscore/vendor-resolver test
pnpm --filter @certscore/scan-core test
pnpm --filter @website-signal-risk-scanner/v2-dag-lambda test
pnpm --filter @certscore/scan-core test:integration-fixtures
pnpm v2:calibration-registry-check
pnpm preflight:full
```

Run focused web projection/API/concern-policy tests and affected package typechecks. Run review-engine/report-adapter and validation tests when their imports/behavior are affected. Package test globs do not automatically include every nested file; explicitly verify new tests execute. Preflight applies to the exact source state tested and must be repeated after material changes.

Retained replay validates projection and evidence semantics, but cannot establish browser instrumentation overhead. For that, use at least 100 paired local fixture executions across light/heavy pages and mechanisms, randomized old/new order, pinned browser/host settings, and separate warm/cold results. Preserve the workload mix and existing approved baseline; do not relabel expectations to pass.

Proposed additional performance gate: candidate p95 end-to-end latency no more than 5% above baseline, alongside existing canonical gates. Record absolute deltas and uncertainty; insufficient sample or noisy results are inconclusive. Measure scanner capture, enabled lane completion/barrier, artifact write/upload/verify, WC01 handoff/projection, and API/UI latency separately. CPU, memory, bytes, request counts, unresolved links, and coverage are measured even when wall-clock overhead is hidden by parallel lanes.

Browser-test the complete local flow at localhost:3000: scan selection, inventory expansion, multiple-parent navigation, evidence drawer, scenario filtering, API parity, keyboard interaction, empty/limited/old scans, and console errors. Use the permitted browser tooling and existing test infrastructure.

Gate: all required checks pass; no fabricated relationships or privacy leakage in fixtures; no unexplained loss of existing evidence; known limitations and measured overhead are recorded. Tests with missing dependencies are not counted as passing.

## Phase 6 — Deploy compatible code with activation off

Implement a typed release mode such as `off`, `capture_only`, and `project`, defaulting to off. These are proposed controls, not existing knobs. An internal server-controlled rollout decision is bound to the scan and propagated unchanged to all relevant lanes. Public clients cannot enable it through unvalidated debug fields.

Keep capture and presentation independently disableable. Capture-only means verified evidence retained internally without new customer graph projection; it must not bypass existing production artifact permissions. A kill switch controls subsequent scans, while in-flight scans retain their recorded profile and terminal rules.

1. Commit and push the tested source. Record the clean SHA and live ancestry. Prepare targeted web/scanner plans against the live SHA. Include validation only if it consumes the changed behavior.
2. Deploy backward-compatible readers/web with activation off, using `pnpm deploy:web -- --base <live-sha> --plan` followed by the matching execution command once its plan is verified.
3. Deploy scanners with activation off through `pnpm deploy:scanners -- --base <recorded-base-sha> --plan` and its matching execution command. Build once in `eu-central-1`, reuse the existing runtime base, replicate to all approved regions, and verify immutable digest parity and Lambda health.
4. The existing scanner helper updates all three regions. Do not describe this as a regional traffic canary or assume weighted Lambda aliases exist. Regional canaries are created by trusted per-scan activation after code deployment.
5. Verify web workflow success, ECS stability, exact live `/api/version` SHA/runtime, migrations if any, Lambda health, deployed feature-off behavior, and continued old-report/API compatibility.

No ad hoc function fleet, region, memory, concurrency, paid dependency, or retention change is included. Any required helper adjustment must be reviewed and tested in the same release.

## Phase 7 — Test after deployment and activate in stages

1. Run registered owned canaries through the deployed scan-to-report flow in all three regions. Use the passive canary registry for passive tests; consent actions are allowed only on the exact targets in the separately authorized post-action registry.
2. Bound the entire release to at most 240 owned-canary scan creations, including baseline/candidate repeats and repair verification, and 10 eligible public calibration scans. Prefer local fixtures/replay for iteration. The spend ceiling can reduce these limits; it never authorizes exceeding them.
3. Compare old/new owned workload measurements with matching region, browser, memory, proxy, scenarios, and workload. Combine with fixture performance results; report per-region sample limitations instead of claiming a reliable regional p95 from a few runs.
4. Perform one release public sample using the canonical registry/central-ledger export/selector. Persist contacts with an idempotent run key, review and commit the manual-ledger candidate. Honor holds, cooldowns, no-go outcomes and no automatic retries. Do not run the same public cohort once before and again after deployment.
5. Check actual retained edges and cookie outcomes, hashes, lane provenance, graph/API/UI parity, safety redaction, canonical findings, timing, artifact size, single publication, health/errors, and cost forecast. Fresh production test records are attributable to this release and use approved diagnostic/owned targets.
6. Promote customer activation through a stable scan-level cohort (proposed 5%, 25%, 100%). Use the same profile across related lanes. At each stage, require successful canaries, no critical integrity/privacy/consent regression, and a recorded review of newly completed normal scans. Define cohort composition/minimum useful sample in the release manifest before examining outcomes.
7. Review the canonical passive sample of 10 normally initiated production scans without creating substitutes. Treat it as operational evidence, not acceptance ground truth. Hold promotion if evidence is insufficient; low traffic does not become a pass.
8. After full activation, observe for 24 hours, including affected errors, latency, coverage, bytes and forecast cost. Use a task heartbeat if continuation is needed; notify only on a meaningful change, completion, failure, or required action. Do not set up a permanent monitoring service as part of this work.

A release can be deployed but still awaiting activation/verification. Status must distinguish those states; never claim completion while a required gate or the post-deploy observation period remains outstanding.

## Failure and recovery behavior

- Before deployment: repair failing code within scope and rerun affected gates. Preserve original expectations and evidence.
- During staged activation: halt promotion and disable the new feature for subsequent scans if graph integrity, privacy, core evidence, latency, or the approved spend forecast fails. Keep retained artifacts and investigation evidence.
- Prefer the tested feature-disable path and a forward fix. An older web SHA must not be forced past the forward-deploy guard; emergency non-descendant rollback requires separate explicit authority.
- Do not delete retained evidence, silently truncate existing artifacts, extend deadlines, weaken scoring/evidence gates, change canary truth, broaden action permissions, or add paid capacity to rescue a failed release.
- Missing AWS/GitHub access, unavailable central contact history, required human baseline adjudication, or changes outside the authorized scope are real prerequisites. Finish independent local work and report the exact blocker rather than inventing approval or a passing result.

## Cost estimate and proposed autonomy budget

No new browser lane or runtime model call is planned. Incremental costs come from execution overhead, larger artifacts/mirrors, storage requests, logging, and transfer. Deployment and fresh canary runs also have bounded one-time costs.

Planning example, not a measured forecast: at 3,008 MB, an extra 250 ms in each of four runtime-bearing lanes is 2.9375 GB-seconds per scan. Using AWS's published illustrative x86 rate of $0.0000166667/GB-second, this is approximately $0.049 per 1,000 scans, or $0.49 per 10,000 scans, for those worker durations alone. Add coordinator/handoff overhead and other charges separately. Actual region rates, architecture, observed overhead, and invocation mix must replace these assumptions before release.

If all new persisted copies total 1 MB per scan, each 10,000 scans adds approximately 10 GB of retained data. The checked-in S3 rule at `infra/aws/v2-dag-lambda/modules/regional-scanner/main.tf:315` expires noncurrent versions after 90 days; it does not establish a 90-day expiration for current artifacts. Therefore the estimate must account for accumulated current objects and the actual live policy, not assume a steady 30-day storage bill. At that illustrative volume, twelve months adds approximately 120 GB before other copies/versions. Do not shorten retention as an optimization.

Sources: [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/) and [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/). Obtain exact regional storage/request/transfer rates and current volume during Phase 0. Build forecasts for initial operation and month 12. Graph limits are evidence-quality controls, not a substitute for calculating storage cost.

Proposed authorization ceiling: **$25/month incremental infrastructure spend, including projected month-12 retained-storage growth, and $15 total incremental release/testing charges**. These are approval ceilings, not estimates of the eventual bill. Before implementation that increases cost, require the concrete forecast to fit them; otherwise return with the estimate, benefit, and lower-cost option. Continue tracking the forecast during activation and stop expansion before exceeding the ceiling. This is a rollout budget, not a guarantee that AWS has an instantaneous billing cap.

Lower-cost options are compact shared stacks/references, no new object for each event, reuse of existing verified artifacts, local replay before paid canaries, and a smaller capture-enabled customer cohort. Reduced coverage must be disclosed. No scope change or reduction is silently accepted to fit the budget.

## One-time execution authorization

Approval of this plan should explicitly cover the implementation scope and deterministic production inventory/API integration; the proposed spend ceilings; normal branch/commit/push and targeted AWS deployments; the bounded owned and ledger-selected public test scans; contact-ledger persistence; staged feature activation; feature disabling and forward fixes if a gate fails; and the 24-hour post-deployment verification.

For calibration, approval must authorize this release's operator to execute the existing SO eligibility/contact process and existing approved quality gates. It does not authorize impersonating Luna/SO, inventing attestations, changing human labels, changing the canonical baseline, or re-enabling blocked targets. If the workflow still requires an unavailable named approver, that remains an explicit prerequisite.

Once that execution scope is approved, routine implementation choices, retries of local tests, relevant fixes, deployment dispatch, and prescribed post-deploy checks do not require repeated permission. A new decision is needed only for an exceeded budget, missing required access/attestation, a gate that cannot be met within scope, a material scope change, or an otherwise unapproved destructive action.

## Completion evidence

- Tested source SHA, commits, deployment workflow results, live web SHA, and verified scanner digests in all three regions.
- Contract/fixture/replay/browser-test results and the exact commands/source state tested.
- Sanitized before/after evidence examples showing direct setter, initiating ancestor, multiple parents, redirects, storage and scenario comparisons.
- Measured latency by phase/region/workload, resource and artifact growth, attribution coverage/precision diagnostics, and actual cost forecast.
- Public contact-ledger run key/candidate commit, owned-canary results, passive production review, feature state, and 24-hour observation outcome.
- Known unsupported mechanisms and unresolved evidence explicitly listed.
- Feature-disable verification and operational handoff. Historical scans remain readable; no unrequested backfill or rescan occurred.

No implementation or production verification check is claimed as completed by writing this plan.
