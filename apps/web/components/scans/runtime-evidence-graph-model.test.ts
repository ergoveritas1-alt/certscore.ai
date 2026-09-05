import assert from "node:assert/strict";
import test from "node:test";
import { buildRelationshipForest, flattenRetainedFields, nodeEvidenceClass, observationTime, SCENARIOS, type InventoryEvidenceContext } from "./runtime-evidence-graph-model";
import { runtimeGraphUiFixture } from "./runtime-evidence-graph-ui-fixture";

test("spanning tree keeps all nodes and every secondary source without cycles", () => {
  const graph = runtimeGraphUiFixture().graphs[0]!;
  graph.edges.push({ id: "cycle", from: "cookie", to: "widget", relation: "initiated_by", basis: "cdp", directness: "direct" });
  const forest = buildRelationshipForest(graph);
  const visited = new Set<string>();
  function visit(id: string) { assert.ok(!visited.has(id)); visited.add(id); for (const node of forest.children.get(id) ?? []) visit(node.id); }
  for (const root of forest.roots) visit(root.id);
  assert.equal(visited.size, graph.nodes.length);
  assert.equal(forest.incoming.get("request")!.length, 2);
  assert.equal(forest.parent.get("request")!.relation, "initiated_by");
});

test("necessity never propagates by vendor or across scenarios", () => {
  const nodes = runtimeGraphUiFixture().graphs[0]!.nodes;
  const context: InventoryEvidenceContext[] = [{ vendor: "Google", purpose: "analytics", classification: "Non-essential", cookieDetails: [{ cookieName: "fixture_id", domain: "metrics.fixture.test", cookiePath: "/", essentiality: "non_essential", evidenceRefs: ["cookie"] }], requestDetails: [] }];
  const cookie = nodes.find(node => node.id === "cookie")!;
  assert.equal(nodeEvidenceClass(cookie, "pre_consent", context), "Non-essential");
  assert.equal(nodeEvidenceClass(cookie, "post_reject", context), "Review");
  assert.equal(nodeEvidenceClass(nodes.find(node => node.id === "widget")!, "pre_consent", context), "Review");
  assert.equal(nodeEvidenceClass({ ...cookie, id: "unbound" }, "pre_consent", context), "Review");
  assert.equal(nodeEvidenceClass({ ...cookie, cookie: { ...cookie.cookie!, path: "/other" } }, "pre_consent", context), "Review");
});

test("field browser preserves false, zero, null, empties and exact paths", () => {
  const fields = flattenRetainedFields({ node: { secure: false, valueSize: 0, unknown: null, omitted: undefined, reasons: [], metadata: {}, label: "" }, stacks: [{ line: 0 }] });
  const values = Object.fromEntries(fields.map(field => [field.path, field.value]));
  assert.deepEqual(values, { "node.secure": "false", "node.valueSize": "0", "node.unknown": "Not retained (null)", "node.reasons": "[]", "node.metadata": "{}", "node.label": "", "stacks[0].line": "0" });
  assert.equal(observationTime(0), "0s");
  assert.equal(observationTime(3576), "3.58s");
  assert.equal(observationTime(4050), "4.05s");
  assert.deepEqual(SCENARIOS.map(([key]) => key), ["pre_consent", "post_accept", "post_reject", "gpc"]);
});
