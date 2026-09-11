import assert from "node:assert/strict";
import test from "node:test";
import type { CDPSession } from "playwright";
import { consentControlsFromAccessibilityTree, filterAccessibilityTreeToFirstLayer, type ConsentAccessibilityTreeNode } from "./scanners/pre-consent-runtime-scanner";

function tree(role = "dialog"): ConsentAccessibilityTreeNode[] {
  return [
    { nodeId: "root", role: { value: "RootWebArea" }, childIds: ["surface"] },
    { nodeId: "surface", role: { value: role }, name: { value: "We use cookies for analytics. Choose your preferences." }, childIds: ["control"] },
    { nodeId: "control", backendDOMNodeId: 1, role: { value: "button" }, name: { value: "Settings" } },
  ];
}

test("accessibility proof uses existing bounded box reads and retains unavailable proof honestly", async () => {
  for (const [quad, expected] of [[undefined, "unverified"], [[0, 0, 20, 0, 20, 20, 0, 20], "box_model_verified"]] as const) {
    let calls = 0;
    const client = { send: async (method: string) => { calls++; assert.equal(method, "DOM.getBoxModel"); return { model: { border: quad } }; } } as unknown as CDPSession;
    const nodes = await filterAccessibilityTreeToFirstLayer(client, tree(), { width: 100, height: 100 });
    const control = consentControlsFromAccessibilityTree(nodes).controls[0];
    assert.equal(calls, 1);
    assert.equal(control?.visibilityEvidence, expected);
    assert.equal(control?.visible, expected === "box_model_verified");
    assert.equal(control?.consentContextEvidence, "local_surface");
  }
});

test("zero-area and off-viewport accessibility nodes never count as visible controls", async () => {
  for (const quad of [[10, 10, 10, 10, 10, 10, 10, 10], [0, 110, 20, 110, 20, 120, 0, 120]]) {
    const client = { send: async () => ({ model: { border: quad } }) } as unknown as CDPSession;
    const nodes = await filterAccessibilityTreeToFirstLayer(client, tree(), { width: 100, height: 100 });
    assert.equal(consentControlsFromAccessibilityTree(nodes).controls.length, 0);
  }
});

test("global and navigation accessibility context cannot supply consent Options", () => {
  for (const role of ["RootWebArea", "navigation", "contentinfo", "menubar"]) {
    assert.equal(consentControlsFromAccessibilityTree(tree(role)).controls.length, 0, role);
  }
});

test("accessibility visibility verification retains its forty-query cap", async () => {
  let calls = 0;
  const nodes = Array.from({ length: 45 }, (_, index) => ({ nodeId: String(index), backendDOMNodeId: index + 1, role: { value: "button" }, name: { value: "Accept all" } }));
  const client = { send: async () => { calls++; return { model: { border: [0, 0, 20, 0, 20, 20, 0, 20] } }; } } as unknown as CDPSession;
  const result = await filterAccessibilityTreeToFirstLayer(client, nodes, { width: 100, height: 100 });
  assert.equal(calls, 40);
  assert.equal(result.filter((node) => node.visibilityEvidence === "box_model_verified").length, 40);
  assert.equal(result[44]?.visibilityEvidence, "unverified");
});
