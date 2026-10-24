import assert from "node:assert/strict";
import test from "node:test";
import {GetObjectCommand,PutObjectCommand,type S3Client} from "@aws-sdk/client-s3";
import {consumeSaleSharingCanary,saleSharingExactRouteAuthorization,type SaleSharingCanaryLedger} from "@certscore/contracts";
import {saleSharingCanaryFixture} from "../../../packages/certscore-contracts/src/sale-sharing-canary.fixture";
import {authorizeSaleSharingCanaryStage,postRefusalParentDispatchSha256,runLocalV2DagLambdaShardedArtifactChain,runSaleSharingOptOutArtifactChain,type LocalV2DagLambdaDispatchPayload} from "./handler";
import {createSaleSharingCanaryStore} from "./sale-sharing-canary-store";
import {createSaleSharingCanaryStore as webStore} from "../../web/server/scans/sale-sharing-canary-store";

function fixture(){
  const campaign=saleSharingCanaryFixture(),a=campaign.slots[0];
  const payload={scanId:a.scanId,targetUrl:a.targetUrl,awsRegion:a.region,functionName:a.functionName,orchestrationMode:"sharded",saleSharingOptOut:{policyVersion:"bounded_sale_sharing_opt_out.v3-exact-routes",enabled:true,scanId:a.scanId,exactTargetUrl:a.targetUrl,exactRouteAuthorization:saleSharingExactRouteAuthorization(a.targetUrl),canaryAuthorization:a}} as LocalV2DagLambdaDispatchPayload;
  const runtime={buildGitSha:a.buildGitSha,functionVersion:"42",region:a.region,memoryMb:3008};
  const values=new Map<string,unknown>();
  const ledger:SaleSharingCanaryLedger={async read(k){return values.get(k)??null;},async create(k,v){if(values.has(k))throw Error("already_claimed");values.set(k,v);}};
  return {campaign,a,payload,runtime,ledger,values};
}
test("coordinator and worker boundaries require trusted activation before any browser or lane work",async()=>{
  const {payload}=fixture();let invocations=0;
  await assert.rejects(runLocalV2DagLambdaShardedArtifactChain(payload,{artifactRoot:"/tmp/certscore-canary-must-not-create",lambdaClient:{async send(){invocations++;return {} as never;}}}),/not_authorized/);
  assert.equal(invocations,0);
  const prior=process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED;
  process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED="1";
  try{await assert.rejects(runSaleSharingOptOutArtifactChain({...payload,orchestrationMode:"worker",workerLane:"sale_sharing_opt_out",parentDispatchSha256:"c".repeat(64)},{artifactRoot:"/tmp/certscore-canary-must-not-create"}),/not_authorized/);}
  finally{if(prior===undefined)delete process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED;else process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED=prior;}
});
test("both boundaries consume distinct claims and bind worker to the original parent hash",async()=>{
  const {payload,a,campaign,runtime,ledger}=fixture();
  await consumeSaleSharingCanary(a,"dispatch",ledger);
  await authorizeSaleSharingCanaryStage(payload,"coordinator",{campaign,runtime,ledger});
  await assert.rejects(authorizeSaleSharingCanaryStage(payload,"coordinator",{campaign,runtime,ledger}),/already_claimed/);
  const worker={...payload,orchestrationMode:"worker" as const,workerLane:"sale_sharing_opt_out" as const,parentDispatchSha256:postRefusalParentDispatchSha256(payload)};
  await assert.rejects(authorizeSaleSharingCanaryStage({...worker,parentDispatchSha256:"d".repeat(64)},"worker",{campaign,runtime,ledger}),/prior_claim/);
  await authorizeSaleSharingCanaryStage(worker,"worker",{campaign,runtime,ledger});
  await assert.rejects(authorizeSaleSharingCanaryStage(worker,"worker",{campaign,runtime,ledger}),/already_claimed/);
  assert.notEqual(postRefusalParentDispatchSha256(payload),postRefusalParentDispatchSha256({...payload,saleSharingOptOut:{...payload.saleSharingOptOut!,canaryAuthorization:undefined}}));
});
test("gate I/O consumes the existing deadline; a stalled store cannot extend it",async()=>{
  const {payload,campaign,runtime}=fixture();let writes=0;
  const start=Date.now();
  // Keep the event loop alive because AbortSignal.timeout's timer is unref'ed.
  const keepAlive=setTimeout(()=>{},1000);
  try{await assert.rejects(authorizeSaleSharingCanaryStage(payload,"coordinator",{campaign,runtime,deadlineAtMs:start+30,ledger:{async read(){return new Promise(()=>{});},async create(){writes++;}}}),/deadline/);}
  finally{clearTimeout(keepAlive);}
  assert.equal(writes,0);assert.ok(Date.now()-start<250);
});
test("existing v1 dispatch does no canary storage I/O",async()=>{
  const {payload}=fixture();payload.saleSharingOptOut={enabled:true,policyVersion:"bounded_sale_sharing_opt_out.v1",scanId:payload.scanId,exactTargetUrl:payload.targetUrl};
  await authorizeSaleSharingCanaryStage(payload,"coordinator",{ledger:{async read(){throw Error("must_not_read");},async create(){throw Error("must_not_write");}}});
});
test("web and Lambda stores use conditional creates and distinguish absence from failure",async()=>{
  for(const factory of [createSaleSharingCanaryStore,webStore]){
    const m=saleSharingCanaryFixture(),signal=new AbortController().signal;let mode="missing",calls=0;
    const client={async send(command:GetObjectCommand|PutObjectCommand,options:{abortSignal:AbortSignal}){
      calls++;assert.equal(options.abortSignal,signal);assert.equal(command.input.Bucket,m.bucket);
      if(command instanceof PutObjectCommand){assert.equal(command.input.IfNoneMatch,"*");return {};}
      if(mode==="missing")throw Object.assign(Error(),{name:"NoSuchKey"});
      if(mode==="denied")throw Object.assign(Error(),{name:"AccessDenied"});
      return {ContentLength:mode==="large"?9000:2,Body:{transformToString:async()=>"{}"}};
    }} as unknown as Pick<S3Client,"send">;
    const store=factory(m,signal,client);
    assert.equal(await store.read("key"),null);mode="denied";await assert.rejects(store.read("key"));
    mode="large";await assert.rejects(store.read("key"));mode="ok";assert.deepEqual(await store.read("key"),{});
    await store.create("key",{});assert.equal(calls,5);
  }
});
