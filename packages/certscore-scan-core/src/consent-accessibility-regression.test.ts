import assert from "node:assert/strict";
import test from "node:test";
import type { CDPSession } from "playwright";
import { classifyConsentControlLabel } from "@certscore/contracts";
import {
  consentControlsFromAccessibilityTree,
  filterAccessibilityTreeToFirstLayer,
  type ConsentAccessibilityTreeNode,
} from "./scanners/pre-consent-runtime-scanner";

function consentTree(labels: string[]): ConsentAccessibilityTreeNode[] {
  return [
    { nodeId: "root", role: { value: "RootWebArea" }, childIds: ["dialog"] },
    {
      nodeId: "dialog",
      role: { value: "dialog" },
      name: { value: "We use cookies and similar technologies. Choose your preferences." },
      childIds: labels.map((_, index) => `control-${index}`),
    },
    ...labels.map((label, index) => ({
      nodeId: `control-${index}`,
      backendDOMNodeId: index + 1,
      role: { value: "button" },
      name: { value: label },
    })),
  ];
}

test("retains the reviewed visible AX A/R/O labels as typed candidates", async () => {
  const labels = [
    ["Accept all", "accept"],
    ["More choices", "options"],
    ["Reject optional cookies", "reject"],
    ["Privacy Center", "options"],
    ["Click to show more choices", "options"],
  ] as const;
  const client = {
    send: async (method: string) => {
      assert.equal(method, "DOM.getBoxModel");
      return { model: { border: [0, 0, 160, 0, 160, 40, 0, 40] } };
    },
  } as unknown as CDPSession;
  const nodes = await filterAccessibilityTreeToFirstLayer(client, consentTree(labels.map(([label]) => label)), { width: 800, height: 600 });
  const controls = consentControlsFromAccessibilityTree(nodes).controls;
  assert.deepEqual(controls.map((control) => control.label), labels.map(([label]) => label));
  for (const [label, intent] of labels) {
    const control = controls.find((candidate) => candidate.label === label);
    assert.equal(control?.visible, true, label);
    assert.equal(control?.visibilityEvidence, "box_model_verified", label);
    assert.equal(control?.consentContextEvidence, "local_surface", label);
    assert.equal(classifyConsentControlLabel({ label, contextText: "We use cookies. Choose your preferences.", hasConsentContext: true }).intent, intent, label);
  }
});

test("keeps an AX label unverified when box-model proof is unavailable", async () => {
  const client = { send: async () => ({ model: undefined }) } as unknown as CDPSession;
  const nodes = await filterAccessibilityTreeToFirstLayer(client, consentTree(["Accept all", "Reject optional cookies"]), { width: 800, height: 600 });
  const controls = consentControlsFromAccessibilityTree(nodes).controls;
  assert.equal(controls.length, 2);
  assert.ok(controls.every((control) => control.visible === false && control.visibilityEvidence === "unverified"));
  assert.ok(controls.every((control) => control.consentContextEvidence === "local_surface"));
});


test("AX retains navigation uncertainty from existing URL properties without calling the browser again", () => {
  const tree = consentTree(["Privacy Center", "Accept all"]);
  const link = tree.find(node => node.nodeId === "control-0")!;
  link.role = { value: "link" };
  link.visibilityEvidence = "box_model_verified";
  link.properties = [{ name: "url", value: { value: "http://www.lg.com/privacy" } }];
  const controls = consentControlsFromAccessibilityTree(tree, "https://www.lg.com/us/").controls;
  const retained = controls.find(control => control.label === "Privacy Center");
  assert.equal(retained?.visible, true);
  assert.equal(retained?.linkDestination, "other_document");
  assert.ok(retained?.classifierReasonCodes?.includes("unverified_preferences_navigation"));
  assert.ok(controls.some(control => control.label === "Accept all"));
  link.properties = [];
  const missing = consentControlsFromAccessibilityTree(tree, "https://www.lg.com/us/").controls
    .find(control => control.label === "Privacy Center");
  assert.equal(missing?.linkDestination, "unverified");
  assert.ok(missing?.classifierReasonCodes?.includes("unverified_preferences_navigation"));
});
