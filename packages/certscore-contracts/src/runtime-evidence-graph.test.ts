import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEvidenceBundleSchema } from "./index";
import { runtimeEvidenceGraphSchema, type RuntimeEvidenceGraph } from "./runtime-evidence-graph";
import { selectRuntimeGraphDispatch, sanitizeRuntimeGraphName, sanitizeRuntimeGraphUrl, runtimeGraphDispatchSchema } from "./runtime-evidence-graph";

test("runtime graph rollout is off by default, server-bound, stable and strictly bounded", () => {
  assert.equal(selectRuntimeGraphDispatch("scan", {}), undefined);
  assert.equal(selectRuntimeGraphDispatch("scan", { CERTSCORE_RUNTIME_GRAPH_MODE: "project" }), undefined);
  assert.equal(selectRuntimeGraphDispatch("scan", { CERTSCORE_RUNTIME_GRAPH_MODE: "project", CERTSCORE_RUNTIME_GRAPH_PERCENT: "101" }), undefined);
  const env = { CERTSCORE_RUNTIME_GRAPH_MODE: "capture_only", CERTSCORE_RUNTIME_GRAPH_PERCENT: "5" };
  const sample = Array.from({ length: 1000 }, (_, i) => selectRuntimeGraphDispatch(`scan-${i}`, env));
  assert.ok(sample.filter(Boolean).length > 20 && sample.filter(Boolean).length < 80);
  assert.deepEqual(sample, Array.from({ length: 1000 }, (_, i) => selectRuntimeGraphDispatch(`scan-${i}`, env)));
  const canary = selectRuntimeGraphDispatch("canary", { ...env, CERTSCORE_RUNTIME_GRAPH_PERCENT: "0", CERTSCORE_RUNTIME_GRAPH_CANARY_SCAN_IDS: "canary" });
  assert.equal(canary?.scanId, "canary"); assert.equal(canary?.mode, "capture_only");
  assert.equal(runtimeGraphDispatchSchema.safeParse({ ...canary, browserLanes: 8 }).success, false);
});

test("runtime graph redaction excludes credentials, query values, fragments and identifier-like names/paths", () => {
  assert.equal(sanitizeRuntimeGraphUrl("https://user:password@site.test/jane%40example.com/12345678?token=private#secret"), "https://site.test/_redacted_/_redacted_");
  assert.equal(sanitizeRuntimeGraphUrl("javascript:alert(1)"), undefined);
  assert.ok(!sanitizeRuntimeGraphName("user-jane@example.com").includes("@"));
  assert.equal(sanitizeRuntimeGraphName("_ga"), "_ga");
});

test("deployment-controlled canary target activation is exact, bounded, and never a host or prefix match", () => {
  const target = "https://ergoveritas.com/testar1.html";
  const env = { CERTSCORE_RUNTIME_GRAPH_MODE: "project", CERTSCORE_RUNTIME_GRAPH_PERCENT: "0", CERTSCORE_RUNTIME_GRAPH_CANARY_TARGET_URLS: JSON.stringify([target]) };
  assert.equal(selectRuntimeGraphDispatch("new-scan", env, target)?.scanId, "new-scan");
  for (const url of [undefined, "https://ergoveritas.com/", `${target}/child`, `${target}?query=1`, target.replace("https:", "http:"), "https://www.ergoveritas.com/testar1.html"]) assert.equal(selectRuntimeGraphDispatch("new-scan", env, url), undefined);
  assert.equal(selectRuntimeGraphDispatch("new-scan", { ...env, CERTSCORE_RUNTIME_GRAPH_MODE: "off" }, target), undefined);
  for (const value of ["invalid", JSON.stringify(Array(21).fill(target))]) assert.equal(selectRuntimeGraphDispatch("new-scan", { ...env, CERTSCORE_RUNTIME_GRAPH_CANARY_TARGET_URLS: value }, target), undefined);
});

test("optional graph compatibility preserves legacy facts, rejects unknown versions and never selects one ambiguous parent graph", async () => {
  const baseline = canonicalEvidenceBundleSchema.parse(JSON.parse(await readFile(path.join(__dirname, "../fixtures/saved-bundles/ga-collection.json"), "utf8")));
  const graph: RuntimeEvidenceGraph = { contractVersion: "certscore.runtime-evidence-graph.v1", scanId: baseline.scanId, captureId: "fixture", scenario: "pre_consent", mode: "project", startedAt: baseline.startedAt, completedAt: baseline.completedAt, browserVersion: "fixture", nodes: [], edges: [], stacks: [], coverage: { status: "complete", capabilities: [], reasons: [], droppedNodes: 0, droppedEdges: 0, unresolvedRequests: 0, pendingTasks: 0 }, timing: { setupMs: 0, finalizeMs: 0 }, valuesRedacted: true, sourceHash: "a".repeat(64) };
  const future = { ...graph, contractVersion: "certscore.runtime-evidence-graph.v999" };
  assert.equal(runtimeEvidenceGraphSchema.safeParse(future).success, false);
  for (const [graphs, reason] of [[ [future], "unsupported_version" ], [[graph, future], "ambiguous"], [[{ ...graph, nodes: [{ id: "invalid" }] }], "malformed"]] as const) {
    const parsed = canonicalEvidenceBundleSchema.parse({ ...baseline, runtimeEvidenceGraphs: graphs });
    assert.equal(parsed.runtimeEvidenceGraphs, undefined);
    assert.equal(parsed.runtimeEvidenceGraphDiagnostics?.[0]?.reason, reason);
    const { runtimeEvidenceGraphDiagnostics: _diagnostic, ...legacy } = parsed;
    assert.deepEqual(legacy, baseline);
  }
  const siblings = canonicalEvidenceBundleSchema.parse({ ...baseline, runtimeEvidenceGraphs: [future, { ...graph, scenario: "gpc" }] });
  assert.deepEqual(siblings.runtimeEvidenceGraphs?.map(row => row.scenario), ["gpc"]);
  assert.equal(canonicalEvidenceBundleSchema.safeParse({ ...baseline, scanId: null, runtimeEvidenceGraphs: [future] }).success, false, "invalid legacy evidence still fails");
});
