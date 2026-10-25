import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTraffic, sourceFacets, actionFacts, applyAssessment, summarizeRows, compareRows, prioritize, type Row } from "./daily-reliability-scorecard";
function row(scanId = "one"): Row {
  return { scanId, site: "example.test", createdAt: "2026-10-25T00:00:00.000Z", source: "sdk", region: "eu_de", status: "completed", cohort: "ordinary",
    producer: "abc", profile: "presence_only_six_workers.v1", provider: "OneTrust", assessmentVersion: "2.2.4", projectionVersion: "v27",
    reportability: "reportable", bundleVerification: "verified", projectionVerification: "canonical_persisted_reader", controls: { accept: { state: "unknown", reasons: ["inventory_incomplete", "inventory_incomplete"] } },
    facets: { gpc_dispatch: { state: "enabled", reasons: [], counts: {} }, gpc_observation: { state: "limited", reasons: ["delivery_limited"], counts: {} }, cmp_dispatch: { state: "intentionally_omitted", reasons: [], counts: {} } },
    actions: { reject: actionFacts({ afterActionCapture: { activationStatus: "completed", stopReason: "window_elapsed" }, refusalRegistration: { status: "unconfirmed" } }) },
    cmpRows: [{ id: "categories", state: "not_assessed" }], sourceRefs: [] };
}
test("ordinary traffic requires production evidence; routine canaries and diagnostics stay separate", () => {
  const inventory = { source: "sdk", lambda_config: { targetEnvironment: "production" } };
  assert.equal(classifyTraffic(inventory, { url: "https://example.test/" }), "ordinary");
  assert.equal(classifyTraffic(inventory, { url: "https://example.test/.well-known/certscore-canary/a" }), "routine_canary");
  assert.equal(classifyTraffic({ ...inventory, traffic_class: "test" }, { url: "https://example.test/" }), "excluded_test");
  assert.equal(classifyTraffic({ ...inventory, traffic_class: "internal" }, { url: "https://example.test/" }), "excluded_test");
  assert.equal(classifyTraffic(inventory), "classification_unknown");
  assert.equal(classifyTraffic({ source: "sdk" }, { url: "https://example.test/" }), "classification_unknown");
});
test("unknown, not checked, no-go and canaries have distinct denominators", () => {
  const a = row(), noGo = { ...row("noGo"), reportability: "no_go" as const }, canary = { ...row("canary"), cohort: "routine_canary" as const };
  const summary = summarizeRows([a, noGo, canary]);
  assert.equal(summary.population.ordinaryCompleted, 2);
  assert.equal(summary.population.ordinaryReportable, 1);
  assert.deepEqual(summary.priorities.arUnknowns.accept?.unknown, { numerator: 1, denominator: 1, rate: 1, definition: "unknown internal control states / ordinary reportable scans with canonical readable disposition" });
  assert.equal(summary.priorities.arUnknowns.reject?.states.not_checked, 1);
  assert.equal(summary.priorities.arUnknowns.accept?.reasons.inventory_incomplete, 1);
  assert.equal(summarizeRows([]).priorities.gpcGaps.limitedOrUnavailable.rate, null);
});
test("complete GPC observation never becomes honoring or confirmed choice", () => {
  const facets = sourceFacets({ gpcResponseAssessment: { observation: { status: "complete", delivery: { httpHeaderRetained: true }, registration: { sale: "unknown" } } } }, {}, {});
  assert.equal(facets.gpc_observation?.state, "complete"); assert.equal(facets.gpc_sale?.state, "unknown");
  assert.equal(facets.gpc_comparison?.state, "not_checked");
  assert.equal(summarizeRows([{ ...row(), facets }]).websiteHonoringRate, null);
});
test("intentionally omitted CMP workers are neither failures nor recovered assessed rows", () => {
  const facets = sourceFacets({}, { privacyCaptureProfile: "presence_only_six_workers.v1" }, {});
  assert.equal(facets.cmp_dispatch?.state, "intentionally_omitted");
  assert.equal(sourceFacets({}, { privacyCaptureProfile: "presence_only_six_workers.v1" }, { workerLanes: ["cmp_preferences"] }).cmp_dispatch?.state, "profile_dispatch_conflict");
  const summary = summarizeRows([row()]);
  assert.deepEqual(summary.priorities.cmpCoverage.dispatchedRows, {});
  assert.equal(prioritize([row()]).some(r => r.area === "cmp_details"), false);
  const dispatched = row(); dispatched.facets.cmp_dispatch!.state = "dispatch_recorded";
  assert.equal(prioritize([dispatched]).some(r => r.area === "cmp_details"), true);
});
test("clicks and registration are independent; missing proof is not a completed action", () => {
  assert.equal(actionFacts().click, "not_checked");
  assert.equal(actionFacts({ acceptanceRegistration: { status: "confirmed" } }).click, "not_checked");
  assert.equal(actionFacts({ interactionDiagnostics: { click: { outcome: "completed" } }, acceptanceRegistration: { status: "confirmed" }, timing: { observationExitReason: "non_essential_request_observed" } }).click, "completed");
  assert.equal(actionFacts({ interactionDiagnostics: { click: { outcome: "failed" } }, afterActionCapture: { activationStatus: "completed" } }).click, "conflicting_click_diagnostics");
  const summary = summarizeRows([row()]);
  assert.equal(summary.actions.reject?.completedClicks, 1);
  assert.equal(summary.actions.reject?.registrationAmongCompletedClicks.unconfirmed, 1);
  assert.equal(summary.actions.reject?.confirmedRegistration.numerator, 0);
});
test("assessment identity is mandatory; absent controls never become verified absence", () => {
  assert.throws(() => applyAssessment(row(), { scan: { scanId: "other", noGo: false } }, {}));
  const applied = applyAssessment(row(), { scan: { scanId: "one", noGo: false } }, {});
  assert.equal(applied.controls.reject?.state, "not_checked");
});
test("comparisons exclude overlap and reject mixed or unknown producer/capability strata", () => {
  assert.equal(compareRows([row()], [row()]).status, "not_comparable");
  assert.equal(compareRows([{ ...row("next"), producer: "other" }], [row()]).status, "not_comparable");
  assert.equal(compareRows([{ ...row("next"), provider: "unknown" }], [{ ...row(), provider: "unknown" }]).status, "not_comparable");
  const result = compareRows([row("next")], [row()]);
  assert.equal(result.matchedStrata.length, 1); assert.equal(result.causalImprovementClaim, false);
});
test("priority queue retains all source candidates without inventing product defects", () => {
  const candidate = row(); candidate.controls.reject = { state: "unknown", reasons: [] };
  const queue = prioritize([candidate, { ...row("test"), cohort: "excluded_test" }]);
  assert.deepEqual(queue.map(q => q.priority), [1, 1, 1, 2]);
  assert.equal(queue.every(q => q.scanId === "one"), true);
});
test("disabled or unknown GPC dispatch never supplies enabled-path gap denominators", () => {
  const disabled = row(); disabled.facets.gpc_dispatch!.state = "disabled";
  const unknown = row("unknown"); unknown.facets.gpc_dispatch!.state = "unknown";
  const result = summarizeRows([disabled, unknown]);
  assert.equal(result.priorities.gpcGaps.eligibleCompleted, 0);
  assert.equal(result.priorities.gpcGaps.limitedOrUnavailable.rate, null);
  assert.equal(prioritize([disabled, unknown]).some(c => c.area === "gpc"), false);
});
test("latency uses retained coordinator timestamps and reports missing observations as null", () => {
  const a = row(), b = row("two");
  a.facets = sourceFacets({}, {}, { laneTimingSummary: { lanes: [{ lane: "runtime_evidence", outcome: "completed", coordinatorElapsedMs: 20, workerReportedHandlerDurationMs: 10 }] } });
  b.facets = sourceFacets({}, {}, { laneTimingSummary: { lanes: [{ lane: "runtime_evidence", outcome: "completed", coordinatorElapsedMs: 100, workerReportedHandlerDurationMs: 50 }] } });
  assert.deepEqual(summarizeRows([a,b]).timings.lane_runtime_evidence, { samples: 2, p50Ms: 20, p95Ms: 100 });
  assert.deepEqual(summarizeRows([{ ...a, facets: { publication_latency: { state: "not_checked", reasons: [], counts: {} } } }]).timings.publication_latency, { samples: 0, p50Ms: null, p95Ms: null });
});
