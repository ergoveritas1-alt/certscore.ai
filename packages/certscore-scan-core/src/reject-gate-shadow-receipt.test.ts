import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { CONSENT_ACTION_CONTROL_PROOF_VERSION, type ConsentActionControlProof } from "@certscore/contracts";
import { buildRejectGateShadowReceipt, readRejectFirstLayerProof, readRejectGateWorkerRecheck, type RejectGateDecision } from "./reject-gate-shadow-receipt.js";

const sha = (value:string) => createHash("sha256").update(value).digest("hex");
const target = sha("http://127.0.0.1:12345/");
const packetSha256 = sha("bound packet");
const proof = {
  contractVersion: CONSENT_ACTION_CONTROL_PROOF_VERSION, action:"reject", observedAtMs:10,
  accessibleLabel:"Reject all",labelSource:"visible_text",actionSemantics:"direct_label",
  classifierIntent:"reject",classifierConfidence:0.91,classifierReasonCodes:[],
  recipeId:"test",selectorHint:"#reject",authorizedTargetSha256:target,
  frameIdentitySha256:target,
  visible:true,enabled:true,uniquelyActionable:true,
} satisfies ConsentActionControlProof;
const learned = {outcome:"qualified",exactSelector:"#reject",issuedAtMs:100,expiresAtMs:6100,binding:{
  parentDispatchSha256:sha("dispatch"),sourceSha256:sha("bundle"),geometrySha256:sha("geometry"),
  requestedTargetSha256:target,documentSha256:target,documentTokenSha256:sha("loader"),
  selectorSha256:sha(proof.selectorHint),selectorEvidence:"verified_geometry",
  labelSha256:sha(proof.accessibleLabel),labelMatch:"exact",
}} satisfies RejectGateDecision;
const established = {scanId:"scan",passive:learned,passiveAtDispatch:learned,dispatchAtMs:120,enforcementActive:true,
  packet:{sha256:packetSha256,proof}};
const observed = {outcome:"passed",packetSha256,observedAtMs:150} as const;

test("Reject shadow receipt preserves whether proof was available at dispatch and its lifetime", () => {
  assert.deepEqual(readRejectFirstLayerProof({...learned,scanId:"scan"}), {...learned,scanId:"scan"});
  assert.equal(readRejectFirstLayerProof({...learned,scanId:"scan",exactSelector:"#changed"}), undefined);
  assert.equal(Object.hasOwn(buildRejectGateShadowReceipt(established),"exactSelector"), false);
  assert.deepEqual(buildRejectGateShadowReceipt({...established,enforcementActive:false,dispatchAtMs:undefined}).dispatch,
    {outcome:"not_attempted"});
  assert.deepEqual(buildRejectGateShadowReceipt({...established,passiveAtDispatch:undefined}).dispatch,
    {outcome:"would_block",blockReason:"proof_not_verified_at_dispatch"});
  assert.deepEqual(buildRejectGateShadowReceipt({...established,dispatchAtMs:learned.expiresAtMs}).dispatch,
    {outcome:"would_block",blockReason:"proof_expired"});
  assert.deepEqual(buildRejectGateShadowReceipt(established).dispatch,{outcome:"would_allow"});
});

test("Reject final recheck requires the exact selector and label in the verified worker packet", () => {
  assert.deepEqual(readRejectGateWorkerRecheck(observed),observed);
  const build = (worker = observed, packet: {sha256:string;proof:ConsentActionControlProof} = established.packet) =>
    buildRejectGateShadowReceipt({...established,packet,worker}).finalRecheck;
  assert.deepEqual(build(),{outcome:"passed",observedAtMs:150});
  assert.deepEqual(buildRejectGateShadowReceipt({...established,worker:{...observed,outcome:"failed"}}).finalRecheck,
    {outcome:"failed",observedAtMs:150,blockReason:"exact_recheck_unverified"});
  for (const candidate of [
    {...established.packet,sha256:sha("different packet")},
    {...established.packet,proof:{...proof,selectorHint:"#replaced"}},
    {...established.packet,proof:{...proof,frameIdentitySha256:sha("different frame")}},
    {...established.packet,proof:{...proof,labelSource:"aria_label" as const}},
  ]) assert.deepEqual(build(observed,candidate),{outcome:"unavailable",reason:"worker_proof_binding_invalid"});
  assert.deepEqual(buildRejectGateShadowReceipt({...established,enforcementActive:false,worker:observed}).finalRecheck,
    {outcome:"not_run",reason:"shadow_only"});
});
