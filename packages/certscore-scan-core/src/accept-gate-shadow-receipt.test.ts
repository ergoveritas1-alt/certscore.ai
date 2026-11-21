import assert from "node:assert/strict";
import test from "node:test";
import type { ConsentActionControlProof } from "@certscore/contracts";
import { createHash } from "node:crypto";
import { dispatchWithAcceptFirstLayerProof, type AcceptGatePassiveDecision } from "./accept-first-layer-gate.js";
import { acceptGateProofDigest, buildAcceptGateShadowReceipt, readAcceptGateWorkerRecheck } from "./accept-gate-shadow-receipt.js";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const passive: Extract<AcceptGatePassiveDecision, { outcome: "qualified" }> = {
  outcome: "qualified",
  documentTokenSha256: sha("local-loader"),
  proof: {
    version: "certscore.accept-first-layer-proof.v1", scanId: "shadow-fixture",
    parentDispatchSha256: sha("dispatch"), sourceSha256: sha("bundle"), geometrySha256: sha("geometry"),
    requestedTargetSha256: sha("url"), documentSha256: sha("url"),
    selectorSha256: sha("#accept"), labelSha256: sha("Accept all"), issuedAtMs: 500, expiresAtMs: 1_000,
  },
};

const action = {
  contractVersion: "certscore.consent_action_control_proof.v2", observedAtMs: 20, action: "accept",
  accessibleLabel: "Accept all", labelSource: "visible_text", recipeId: "fixture",
  actionSemantics: "direct_label", classifierIntent: "accept", classifierConfidence: .91, classifierReasonCodes: [],
  selectorHint: "#accept", frameIdentitySha256: sha("main"), authorizedTargetSha256: passive.proof.documentSha256,
  visible: true, enabled: true, uniquelyActionable: true,
} satisfies ConsentActionControlProof;

test("shadow receipt records late or expired proof and never infers a final check", () => {
  const input = { scanId: passive.proof.scanId, passive, enforcementActive: false, packetVerified: false };
  const late = buildAcceptGateShadowReceipt({ ...input, dispatchAtMs: 499 });
  assert.deepEqual(late.dispatch, { outcome: "would_block", blockReason: "proof_not_verified_at_dispatch" });
  assert.equal(late.binding?.selectorSha256, sha("#accept"));
  assert.equal(late.binding?.documentTokenSha256, sha("local-loader"));
  assert.equal(late.binding?.labelSha256, sha("Accept all"));
  assert.equal(late.timing.proofIssuedAtMs, 500);
  assert.equal(late.timing.proofExpiresAtMs, 1_000);
  assert.deepEqual(late.finalRecheck, { outcome: "not_run", reason: "shadow_only" });
  assert.deepEqual(buildAcceptGateShadowReceipt({ ...input, passiveAtDispatch: passive, dispatchAtMs: 600 }).dispatch, { outcome: "would_allow" });
  assert.deepEqual(buildAcceptGateShadowReceipt({ ...input, passiveAtDispatch: passive, dispatchAtMs: 1_000 }).dispatch,
    { outcome: "would_block", blockReason: "proof_expired" });

  const blockedPassive = { outcome: "blocked", reason: "label_conflict_unresolved", evaluatedAtMs: 500 } as const;
  const blocked = buildAcceptGateShadowReceipt({ ...input, passive: blockedPassive,
    passiveAtDispatch: blockedPassive, dispatchAtMs: 600 });
  assert.deepEqual(blocked.dispatch, { outcome: "would_block", blockReason: "label_conflict_unresolved" });
  assert.equal(blocked.binding, undefined);
  const encoded = JSON.stringify(late);
  assert.ok(Buffer.byteLength(encoded) <= 1536);
  assert.doesNotMatch(encoded, /Accept all|#accept|local-loader/);
});

test("existing exact recheck emits one bound event for success or replacement", async () => {
  for (const replaced of [false, true]) {
    let reads = 0;
    let clicks = 0;
    const events: Array<"passed" | "failed"> = [];
    const run = dispatchWithAcceptFirstLayerProof({
      proof: passive.proof, initial: action, assertCurrent: () => {},
      readCurrent: async () => { reads++; return replaced ? undefined : action; },
      clickExact: async () => { clicks++; },
      onFinalRecheck: outcome => { events.push(outcome); },
    });
    if (replaced) await assert.rejects(run, /control_changed_before_click/);
    else await run;
    assert.equal(reads, 1);
    assert.equal(clicks, replaced ? 0 : 1);
    assert.deepEqual(events, [replaced ? "failed" : "passed"]);
    const worker = { outcome: events[0]!, observedAtMs: 650, proofSha256: acceptGateProofDigest(passive.proof) };
    assert.deepEqual(readAcceptGateWorkerRecheck(worker), worker);
    assert.equal(readAcceptGateWorkerRecheck({ ...worker, extra: "untrusted" }), undefined);
    const input = { scanId: passive.proof.scanId, passive, enforcementActive: true, packetVerified: true, dispatchAtMs: 600 };
    assert.equal(buildAcceptGateShadowReceipt({ ...input, workerRecheck: worker }).finalRecheck.outcome, worker.outcome);
    assert.equal(buildAcceptGateShadowReceipt({ ...input, packetVerified: false, workerRecheck: worker }).finalRecheck.outcome, "unavailable");
    assert.equal(buildAcceptGateShadowReceipt({ ...input, workerRecheck: { ...worker, proofSha256: sha("other proof") } }).finalRecheck.outcome, "unavailable");
  }
});
