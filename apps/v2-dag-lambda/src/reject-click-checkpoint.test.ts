import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { ConsentActionControlProof } from "@certscore/contracts";
import type { RejectFirstLayerProof } from "@certscore/scan-core/reject-gate-shadow-receipt";
import { buildRejectClickCheckpoint, verifyRejectClickCheckpoint } from "./reject-click-checkpoint.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const documentSha256 = hash("https://fixture.example/");
const proof: RejectFirstLayerProof = {
  scanId: "fixture-scan", outcome: "qualified", issuedAtMs: 1000, expiresAtMs: 7000, exactSelector: "#reject",
  binding: {
    parentDispatchSha256: hash("dispatch"), sourceSha256: hash("source"), geometrySha256: hash("geometry"),
    requestedTargetSha256: documentSha256, documentSha256, documentTokenSha256: hash("loader"),
    selectorSha256: hash("#reject"), selectorEvidence: "verified_geometry", labelSha256: hash("Reject all"), labelMatch: "exact",
  },
};
const control = {
  action: "reject", actionSemantics: "direct_label", authorizedTargetSha256: documentSha256,
  frameIdentitySha256: documentSha256, selectorHint: "#reject", accessibleLabel: "Reject all", labelSource: "visible_text",
} as ConsentActionControlProof;
const timing = { recheckedAtMs: 3100, dispatchedAtMs: 3101, completedAtMs: 3110 };

test("a proof-bound click can be retained before the same cutoff as a late observation packet", () => {
  const body = buildRejectClickCheckpoint(proof, control, timing);
  assert.ok(body);
  const inputs = { body, metadataSha256: hash(body), proof, coordinatorDispatchAtMs: 1500,
    verifiedAtMs: 8240, deadlineAtMs: 9000 };
  const receipt = verifyRejectClickCheckpoint(inputs);
  assert.equal(receipt?.completedAtMs, 3110);
  assert.equal(receipt?.verifiedAtMs, 8240);
  assert.equal(verifyRejectClickCheckpoint({ ...inputs, verifiedAtMs: 9000 }), undefined);
  assert.equal(verifyRejectClickCheckpoint({ ...inputs, verifiedAtMs: 8999 })?.completedAtMs, 3110);
  assert.equal(verifyRejectClickCheckpoint({ ...inputs, verifiedAtMs: 3109 }), undefined);
});

test("a changed control, proof, timestamp, or object digest cannot produce a click count", () => {
  assert.equal(buildRejectClickCheckpoint(proof, { ...control, selectorHint: "#replacement" }, timing), undefined);
  assert.equal(buildRejectClickCheckpoint(proof, control, { ...timing, recheckedAtMs: 3102 }), undefined);
  assert.equal(buildRejectClickCheckpoint(proof, control, { recheckedAtMs: 6999, dispatchedAtMs: 7000, completedAtMs: 7010 }), undefined);
  const body = buildRejectClickCheckpoint(proof, control, timing)!;
  const inputs = { body, metadataSha256: hash(body), proof, coordinatorDispatchAtMs: 1500,
    verifiedAtMs: 8240, deadlineAtMs: 9000 };
  assert.equal(verifyRejectClickCheckpoint({ ...inputs, coordinatorDispatchAtMs: 3101 }), undefined);
  assert.equal(verifyRejectClickCheckpoint({ ...inputs, metadataSha256: hash("different bytes") }), undefined);
  assert.equal(verifyRejectClickCheckpoint({ ...inputs, proof: { ...proof, scanId: "another-scan" } }), undefined);
  assert.equal(verifyRejectClickCheckpoint({ ...inputs, proof: { ...proof, binding: { ...proof.binding,
    parentDispatchSha256: hash("another dispatch") } } }), undefined);
});
