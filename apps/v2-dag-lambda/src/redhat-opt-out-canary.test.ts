import assert from "node:assert/strict";
import test, {type TestContext} from "node:test";
import { CONDITIONAL_OPT_OUT_CAPTURE_PROFILE, REDHAT_OPT_OUT_POLICY, REDHAT_OPT_OUT_TARGET } from "@certscore/contracts";
import packet from "../../../packages/certscore-contracts/src/test-fixtures/redhat-terminal-choice.json";
import { claimRedHatCanary } from "./redhat-opt-out-canary";
import { redHatCanaryFixture } from "./test-fixtures/redhat-canary";
import { runSaleSharingOptOutArtifactChain, type LocalV2DagLambdaDispatchPayload } from "./handler";

function fixture() {
  const gate = redHatCanaryFixture(packet.scanId);
  const input = {
    stage: "coordinator" as "coordinator" | "worker",
    scanId: packet.scanId, targetUrl: REDHAT_OPT_OUT_TARGET, region: gate.grant.region, functionName: gate.grant.functionName,
    parentDispatchSha256: packet.parentDispatchSha256,
    dispatch: {
      enabled: true, scanId: packet.scanId, exactTargetUrl: REDHAT_OPT_OUT_TARGET,
      policyVersion: REDHAT_OPT_OUT_POLICY, redHatAuthorization: packet.redHatChoice.source,
    },
  };
  return {gate, input};
}

function enable(t: TestContext) {
  const keys = ["CERTSCORE_REDHAT_OPT_OUT_RELOAD_ENABLED", "CERTSCORE_REDHAT_OPT_OUT_CANARY", "CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED"];
  const prior = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key,i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; }));
  process.env.CERTSCORE_REDHAT_OPT_OUT_RELOAD_ENABLED = "1";
  process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED = "1";
  delete process.env.CERTSCORE_REDHAT_OPT_OUT_CANARY;
}

test("Red Hat worker rejects a flag-only attempt before starting the scanner", async t => {
  enable(t);
  const {input} = fixture();
  const payload = {
    scanId: input.scanId, targetUrl: input.targetUrl, awsRegion: input.region, functionName: input.functionName,
    orchestrationMode: "worker", workerLane: "sale_sharing_opt_out", parentDispatchSha256: input.parentDispatchSha256,
    privacyCaptureProfile: CONDITIONAL_OPT_OUT_CAPTURE_PROFILE, saleSharingOptOut: input.dispatch,
  } as LocalV2DagLambdaDispatchPayload;
  await assert.rejects(runSaleSharingOptOutArtifactChain(payload, {artifactRoot: "/unused"}), /not_authorized/);
  process.env.CERTSCORE_REDHAT_OPT_OUT_CANARY = "{";
  await assert.rejects(runSaleSharingOptOutArtifactChain(payload, {artifactRoot: "/unused"}), /not_authorized/);
});

test("Red Hat grants bind one target and scan to a live immutable build before touching storage", async t => {
  enable(t);
  const {gate,input} = fixture();
  let io = 0;
  gate.ledger = {async read(){io++;return null;},async create(){io++;}};
  for (const change of [
    {targetUrl:"https://www.redhat.com/en"}, {region:"eu-west-1"}, {functionName:"certscore-redhat-fixture:latest"},
    {scanId:"other-scan",dispatch:{...input.dispatch,scanId:"other-scan"}}, {parentDispatchSha256:"invalid"},
  ]) await assert.rejects(claimRedHatCanary({...input,...change},gate),/not_authorized/);
  for (const change of [
    {functionName:"another-function"},{functionVersion:"$LATEST"},{functionVersion:"43"},
    {buildGitSha:"b".repeat(40)},{region:"eu-west-1"},{memoryMb:4096},
  ]) await assert.rejects(claimRedHatCanary(input,{...gate,runtime:{...gate.runtime,...change}}),/runtime_mismatch/);
  for (const grant of [
    null,
    {...gate.grant,issuedAt:new Date(Date.now()-100_000).toISOString(),expiresAt:new Date(Date.now()-1000).toISOString()},
    {...gate.grant,issuedAt:new Date(Date.now()+100_000).toISOString(),expiresAt:new Date(Date.now()+150_000).toISOString()},
    {...gate.grant,expiresAt:new Date(Date.now()+100_000_000).toISOString()},
  ]) await assert.rejects(claimRedHatCanary(input,{...gate,grant}),/not_authorized/);
  assert.equal(io,0);
});

test("Red Hat claims enforce exact source and parent, stage order, one winner and revocation", async t => {
  enable(t);
  const {gate,input} = fixture();
  const worker = {...input, stage:"worker" as const};
  gate.approval.value = null;
  await assert.rejects(claimRedHatCanary(input,gate),/approval_missing_or_revoked/);
  assert.equal(gate.claims.size,0);
  gate.approval.value = {grant:gate.grant,approved:true};
  await assert.rejects(claimRedHatCanary(worker,gate),/prior_claim_missing/);
  const coordinators = await Promise.allSettled([claimRedHatCanary(input,gate),claimRedHatCanary(input,gate)]);
  assert.equal(coordinators.filter(r=>r.status==="fulfilled").length,1);
  await assert.rejects(claimRedHatCanary({...worker,parentDispatchSha256:"f".repeat(64)},gate),/prior_claim_missing/);
  await assert.rejects(claimRedHatCanary({...worker,dispatch:{...worker.dispatch,redHatAuthorization:{...worker.dispatch.redHatAuthorization,sourceSha256:"f".repeat(64)}}},gate),/prior_claim_missing/);
  gate.approval.value = {grant:gate.grant,approved:false};
  await assert.rejects(claimRedHatCanary(worker,gate),/revoked/);
  gate.approval.value = {grant:gate.grant,approved:true};
  const workers = await Promise.allSettled([claimRedHatCanary(worker,gate),claimRedHatCanary(worker,gate)]);
  assert.equal(workers.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(gate.claims.size,2);
});

test("Red Hat authorization ends at the existing deadline and a late read cannot write a claim", async t => {
  enable(t);
  const {gate,input} = fixture();
  let release!: (value: unknown) => void;
  const blocked = new Promise<unknown>(resolve => {release=resolve;});
  const keepAlive = setTimeout(()=>{},1000);
  try {
    await assert.rejects(claimRedHatCanary(input,{...gate,deadlineAtMs:Date.now()+20,ledger:{read:()=>blocked,create:gate.ledger.create}}),/deadline/);
    release(gate.approval.value);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(gate.claims.size,0);
  } finally { clearTimeout(keepAlive); }
});
