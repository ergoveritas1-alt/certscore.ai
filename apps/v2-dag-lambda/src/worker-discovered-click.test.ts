import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { CONSENT_ACTION_CONTROL_PROOF_VERSION, type ConsentActionControlProof } from "@certscore/contracts";
import { buildWorkerDiscoveredClick, verifyWorkerDiscoveredClick } from "./worker-discovered-click";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const url = "https://fixture.example.com/";
const scanId = "842f5466-1781-4939-bc2f-3d9ee981976b";

for (const action of ["accept", "reject"] as const) {
  test(`worker-discovered ${action} receipt binds the exact completed click to its retained packet`, () => {
    const control = {
      contractVersion: CONSENT_ACTION_CONTROL_PROOF_VERSION, action, actionSemantics: "direct_label",
      classifierIntent: action, classifierConfidence: 0.91, classifierReasonCodes: [], observedAtMs: 125,
      accessibleLabel: action === "accept" ? "Accept all" : "Reject all", labelSource: "visible_text",
      selectorHint: "#confirmed", recipeId: "reviewed fixture", visible: true, enabled: true, uniquelyActionable: true,
      authorizedTargetSha256: sha(url), frameIdentitySha256: sha(url),
    } satisfies ConsentActionControlProof;
    const binding = { scanId, action, parentDispatchSha256: sha("dispatch"), requestedUrl: url };
    const packet = { parentScanId: scanId, targetUrl: url, normalizedUrl: url, actionControlProof: control,
      interactionDiagnostics: { click: { outcome: "completed" } } };
    const packetBytes = Buffer.from(JSON.stringify(packet));
    const click = { control, recheckedAtMs: 1100, dispatchedAtMs: 1102, completedAtMs: 1120, deadlineAtMs: 1320 };
    const body = buildWorkerDiscoveredClick(binding, click, packetBytes);
    assert.ok(body);
    const input = { body, metadataSha256: sha(body), packetBytes, packetSha256: sha(packetBytes),
      binding, workerDispatchedAtMs: 1000, readAtMs: 1350 };
    assert.equal(verifyWorkerDiscoveredClick(input)?.reserveMs, 200);
    assert.equal(verifyWorkerDiscoveredClick({ ...input, workerDispatchedAtMs: 1101 }), undefined);
    assert.equal(verifyWorkerDiscoveredClick({ ...input, readAtMs: 1119 }), undefined);
    assert.equal(verifyWorkerDiscoveredClick({ ...input, packetSha256: sha("changed packet") }), undefined);
    assert.equal(verifyWorkerDiscoveredClick({ ...input, binding: { ...binding, parentDispatchSha256: sha("other parent") } }), undefined);
    assert.equal(buildWorkerDiscoveredClick(binding, { ...click, deadlineAtMs: 1319 }, packetBytes), undefined);
    assert.equal(buildWorkerDiscoveredClick(binding, { ...click, control: { ...control, selectorHint: "#different" } }, packetBytes), undefined);
    assert.equal(buildWorkerDiscoveredClick(binding, click, Buffer.from(JSON.stringify({ ...packet, targetUrl: url + "changed" }))), undefined);
  });
}
