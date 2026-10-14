import assert from "node:assert/strict";
import test from "node:test";
import { postRefusalInteractionDiagnosticsSchema } from "../../certscore-contracts/src/post-refusal-observation";
import { retainResolverDiagnostic } from "./consent-action-resolver-diagnostics";

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

test("diagnostic retention bounds arrays, counters and delayed elapsed time without changing valid input", () => {
  const valid = { ...observation, selectorMatchCount: 2, visibleCount: 2, enabledCount: 2, labelMatchCount: 2, controlLabels: ["Reject all"] };
  assert.equal(retainResolverDiagnostic(valid, 1, 100).truncated, false);
  const result = retainResolverDiagnostic({ ...valid, cmpIds: Array(12).fill("x".repeat(130)), controlLabels: Array(9).fill("Reject all") }, 10001, 31000);
  assert.equal(result.truncated, true);
  assert.ok(postRefusalInteractionDiagnosticsSchema.innerType().shape.resolver.safeParse({ snapshots: [result.snapshot], truncated: true }).success);
});
