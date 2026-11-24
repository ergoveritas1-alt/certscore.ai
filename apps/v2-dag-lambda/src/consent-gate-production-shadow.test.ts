import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle, PostRefusalEvidencePacket } from "@certscore/contracts";
import { buildProductionConsentGateShadow, evaluatePreparationGateRejectFirst } from "./consent-gate-production-shadow.js";

const scanId = "00000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
const packet = {
  parentScanId: scanId,
  interactionDiagnostics: { click: { outcome:"completed" } },
  actionControlProof: {action:"reject",frameIdentitySha256:hash,authorizedTargetSha256:hash},
} as unknown as PostRefusalEvidencePacket;

const decision = {
  outcome:"qualified", exactSelector:"button.reject", issuedAtMs:2000, expiresAtMs:8000,
  binding:{parentDispatchSha256:hash,sourceSha256:hash,geometrySha256:hash,
    requestedTargetSha256:hash,documentSha256:hash,documentTokenSha256:hash,selectorSha256:hash,
    labelSha256:hash,selectorEvidence:"verified_geometry",labelMatch:"exact"},
} as const;
const base = {
  scanId, channels:{accept:true,reject:true}, nowMs:7000,
  accept:{dispatchAtMs:1000,deadlineAtMs:7000},
  reject:{dispatchAtMs:1000,completedAtMs:6500,deadlineAtMs:7000,packet},
};

test("production shadow distinguishes an existing completed click from an unverified packet and models late proof", () => {
  const result = buildProductionConsentGateShadow({...base, passive:{reject:decision}});
  assert.deepEqual(result.baseline.accept?.click,"unverified");
  assert.deepEqual(result.baseline.reject,{
    click:"completed",boundControl:true,
    dispatch:{outcome:"would_block",blockReason:"proof_not_verified_at_dispatch"},
    passive:{outcome:"qualified"},proofDeltaFromDispatchMs:1000,
    estimatedWorkerReturnSlackMs:-500,proofFreshAtEstimatedDispatch:true,
  });
  assert.deepEqual(result.rejectGateShadowReceipt?.finalRecheck,{outcome:"not_run",reason:"shadow_only"});
  assert.equal(result.rejectGateShadowReceipt?.enforcementActive,false);
  assert.equal(result.acceptGateShadowReceipt?.enforcementActive,false);
  assert.ok(Buffer.byteLength(JSON.stringify(result.rejectGateShadowReceipt)) < 1536);
});

test("production shadow measures a timely verified receipt without treating error confirmation as completed input", () => {
  const result = buildProductionConsentGateShadow({...base, channels:{accept:false,reject:true},
    passive:{reject:{...decision,issuedAtMs:900}},reject:{...base.reject,packet:{
      ...packet,interactionDiagnostics:{click:{outcome:"confirmed_after_error"}},
    } as PostRefusalEvidencePacket}});
  assert.equal(result.acceptGateShadowReceipt,undefined);
  assert.equal(result.baseline.reject?.click,"incomplete");
  assert.equal(result.baseline.reject?.boundControl,false);
  assert.deepEqual(result.baseline.reject?.dispatch,{outcome:"would_allow"});
  assert.equal(result.baseline.reject?.estimatedWorkerReturnSlackMs,500);
});

const noEvidence = {
  channels:{accept:true,reject:true}, targetUrl:"https://fixture.invalid/",scanId,
  sourceSha256:hash,parentDispatchSha256:hash,nowMs:Date.now(),deadlineAtMs:Date.now()+6000,
  bundle:{scanId,url:"https://fixture.invalid/",domSnapshots:[],consentUiObservations:[]} as unknown as CanonicalEvidenceBundle,
};

test("Accept waits for the isolated Reject release acknowledgement", async () => {
  const events: string[] = [];
  let acknowledge!: () => void;
  const release = new Promise<void>(resolve => { acknowledge = resolve; });
  const result = evaluatePreparationGateRejectFirst(noEvidence, async partial => {
    assert.equal(partial.reject?.outcome, "blocked");
    assert.equal(partial.accept, undefined);
    events.push("reject release started");
    await release;
    events.push("reject release acknowledged");
  }).then(combined => {
    events.push("both finalized");
    return combined;
  });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(events, ["reject release started"]);
  acknowledge();
  const combined = await result;
  assert.deepEqual(events, ["reject release started", "reject release acknowledged", "both finalized"]);
  assert.equal(combined.accept?.outcome, "blocked");
  assert.equal(combined.reject?.outcome, "blocked");
});

test("an abort between independent gate phases cannot authorize an Accept action", async () => {
  const abort=new AbortController();
  const result=evaluatePreparationGateRejectFirst(noEvidence, partial => {
    assert.equal(partial.reject?.outcome,"blocked");
    assert.equal(partial.accept,undefined);
    abort.abort(new Error("cancelled"));
  },abort.signal);
  await assert.rejects(result,{message:"cancelled"});
});
