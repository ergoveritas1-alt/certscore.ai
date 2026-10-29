import assert from "node:assert/strict";
import test from "node:test";
import { postRefusalInteractionDiagnosticsSchema } from "../../certscore-contracts/src/post-refusal-observation";
import { appendResolverDiagnostic, canonicalResolverDiagnostic, retainResolverDiagnostic } from "./consent-action-resolver-diagnostics";
import type { ConsentControlCandidateEvidence, ConsentControlGeometryArtifact } from "./consent-control-geometry";

const observation = { source: "canonical_geometry" as const, state: "multiple_actionable" as const,
  selectorMatchCount: 70, visibleCount: 70, enabledCount: 70, labelMatchCount: 70, actionableCount: 2,
  cmpIds: ["Borlabs Cookie"], controlLabels: ["Mit diesem Button wird der Dialog geschlossen. ".repeat(6), "Accept essential cookies"] };

test("oversized diagnostic labels cannot invalidate an action packet or change resolver input", () => {
  const original = structuredClone(observation);
  const result = retainResolverDiagnostic(observation, 8, 7000);
  assert.equal(result.truncated, true);
  assert.equal(result.snapshot.controlLabels[0]!.length, 120);
  assert.equal(result.snapshot.state, "multiple_actionable");
  assert.equal(result.snapshot.actionableCount, 2);
  assert.deepEqual(observation, original);
  assert.ok(postRefusalInteractionDiagnosticsSchema.innerType().shape.resolver.safeParse({ snapshots: [result.snapshot], truncated: result.truncated }).success);
});

test("an uncaptured frame cannot turn an empty action inventory into a control-absence diagnostic", () => {
  const geometry = {cmp:{name:"OneTrust"}, candidates:[], controlInspection:{captureCoverage:{
    inventoryTruncated:false, mainFrameAvailable:true, documentAndFramesStable:true,
    documentReadyState:"complete", frameCount:2, capturedFrameCount:1,
  }}} as unknown as ConsentControlGeometryArtifact;
  for (const action of ["accept_all", "reject_all"] as const) {
    assert.equal(canonicalResolverDiagnostic({geometry, action, actionableCount:0}).state, "geometry_unavailable");
    geometry.candidates = [candidate(action)];
    assert.equal(canonicalResolverDiagnostic({geometry, action, actionableCount:1}).state, "candidate_detected",
      "positive retained controls remain independent of unavailable unrelated frames");
    geometry.candidates = [];
  }
  geometry.controlInspection!.captureCoverage.capturedFrameCount = 2;
  assert.equal(canonicalResolverDiagnostic({geometry, action:"reject_all", actionableCount:0}).state, "canonical_reject_absent");
});

test("diagnostic retention bounds arrays, counters and delayed elapsed time without changing valid input", () => {
  const valid = { ...observation, selectorMatchCount: 2, visibleCount: 2, enabledCount: 2, labelMatchCount: 2, controlLabels: ["Reject all"] };
  assert.equal(retainResolverDiagnostic(valid, 1, 100).truncated, false);
  const result = retainResolverDiagnostic({ ...valid, cmpIds: Array(12).fill("x".repeat(130)), controlLabels: Array(9).fill("Reject all") }, 10001, 31000);
  assert.equal(result.truncated, true);
  assert.ok(postRefusalInteractionDiagnosticsSchema.innerType().shape.resolver.safeParse({ snapshots: [result.snapshot], truncated: true }).success);
});

test("bounded resolver history preserves the latest result of every source in chronological order", () => {
  const resolver = {snapshots: [] as ReturnType<typeof retainResolverDiagnostic>["snapshot"][], truncated: false};
  for (let attempt = 1; attempt <= 40; attempt++) {
    appendResolverDiagnostic(resolver, {...observation, source: attempt % 2 ? "canonical_geometry" : "named_recipe",
      state: attempt % 2 ? "control_hidden" : "selector_absent"}, attempt, attempt * 100);
  }
  appendResolverDiagnostic(resolver, {...observation, source: "control_proof", state: "control_binding_unverified"}, 41, 4100);
  assert.equal(resolver.snapshots.length, 12);
  assert.equal(resolver.truncated, true);
  assert.deepEqual(resolver.snapshots.slice(-3).map(row => row.attempt), [39, 40, 41]);
  assert.equal(resolver.snapshots[0]!.attempt, 1);
  assert.ok(postRefusalInteractionDiagnosticsSchema.innerType().shape.resolver.safeParse(resolver).success);
});

function candidate(actionType: ConsentControlCandidateEvidence["actionType"], patch: Partial<ConsentControlCandidateEvidence> = {}): ConsentControlCandidateEvidence {
  return {actionType, layer: "first_layer", normalizedLabel: actionType, classifierConfidence: 0.91,
    enabled: true, intersectsViewport: true, decisionStatus: "confirmed_visible",
    boundingBox: {width: 100, height: 30}, computedStyle: {display: "block", visibility: "visible", opacity: "1"},
    ...patch} as ConsentControlCandidateEvidence;
}

for (const action of ["accept_all", "reject_all"] as const) test(`${action} diagnostic counts exclude unrelated controls and distinguish hidden, disabled and covered choices`, () => {
  const unrelated = candidate(action === "accept_all" ? "reject_all" : "accept_all");
  const geometry = {cmp: {name: "OneTrust"}, candidates: [unrelated]} as ConsentControlGeometryArtifact;
  let row = canonicalResolverDiagnostic({geometry, action, actionableCount: 0});
  assert.equal(row.selectorMatchCount, 0);
  assert.equal(row.state, action === "accept_all" ? "selector_absent" : "canonical_reject_absent");
  for (const [patch, state] of [
    [{decisionStatus: "hidden", computedStyle: {display: "none", visibility: "visible", opacity: "1", pointerEvents: "auto", position: "fixed", zIndex: "1"}}, "control_hidden"],
    [{decisionStatus: "disabled", enabled: false}, "control_disabled"],
    [{decisionStatus: "covered"}, "control_not_hit_target"],
    [{classifierConfidence: 0.5}, "label_mismatch"],
  ] as Array<[Partial<ConsentControlCandidateEvidence>, string]>) {
    geometry.candidates = [unrelated, candidate(action, patch)];
    const original = structuredClone(geometry);
    row = canonicalResolverDiagnostic({geometry, action, actionableCount: 0});
    assert.equal(row.state, state); assert.equal(row.selectorMatchCount, 1); assert.equal(row.actionableCount, 0);
    assert.deepEqual(geometry, original);
  }
  assert.equal(canonicalResolverDiagnostic({geometry, action, actionableCount: 2}).state, "multiple_actionable");
  assert.equal(canonicalResolverDiagnostic({geometry, action, actionableCount: 1}).state, "candidate_detected");
  assert.equal(canonicalResolverDiagnostic({geometry: undefined, action, actionableCount: 0}).state, "geometry_unavailable");
  geometry.controlInspection = {captureCoverage: {inventoryTruncated: false, mainFrameAvailable: true,
    documentAndFramesStable: true, documentReadyState: "loading"}} as ConsentControlGeometryArtifact["controlInspection"];
  assert.equal(canonicalResolverDiagnostic({geometry, action, actionableCount: 0}).state, "document_loading");
  geometry.controlInspection!.captureCoverage.inventoryTruncated = true;
  assert.equal(canonicalResolverDiagnostic({geometry, action, actionableCount: 0}).state, "geometry_unavailable");
});
