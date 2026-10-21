import assert from "node:assert/strict";
import test from "node:test";
import { createLocalGpcAdaptivePair } from "./local-gpc-adaptive";

function pair() {
  let time = 0;
  const group = createLocalGpcAdaptivePair({scanId:"fixture",now:()=>time});
  const baseline = group.participant("fixture","runtime_evidence"),gpc = group.participant("fixture","gpc_observation");
  baseline.commit("baseline-loader");gpc.commit("gpc-loader");
  return {baseline,gpc,setTime:(value:number)=>{time=value;},group};
}

test("adaptive pair shares a rolling request-start deadline and ignores requests after a stop",()=>{
  const {baseline,gpc,setTime}=pair();
  setTime(4000);baseline.request(4000);
  setTime(5500);gpc.request(5500);
  setTime(6500);baseline.request(6500);
  assert.equal(baseline.poll(),undefined);
  setTime(8500);
  assert.deepEqual(baseline.poll(),{durationMs:8500,peerDocumentToken:"gpc-loader",outcome:"quiet"});
  gpc.request(8600);
  assert.equal(gpc.poll()?.durationMs,8500);
});

test("both capture durations stay equal despite commit skew and hard-cap delivery",()=>{
  let time=0;
  const group=createLocalGpcAdaptivePair({scanId:"fixture",now:()=>time});
  const baseline=group.participant("fixture","runtime_evidence"),gpc=group.participant("fixture","gpc_observation");
  baseline.commit("baseline");time=200;gpc.commit("gpc");
  for(const offset of [4000,5500,7000,8500,10000,11500,13000,14500])baseline.request(offset);
  time=15000;
  assert.equal(baseline.poll()?.durationMs,15000);
  assert.equal(gpc.poll(),undefined);
  time=15200;
  assert.equal(gpc.poll()?.durationMs,15000);
});

test("quiet outcome is not incorrectly extended because unrelated initial work delayed polling",()=>{
  const {baseline,gpc,setTime}=pair();
  setTime(16000);
  assert.equal(baseline.poll()?.durationMs,5000);
  assert.equal(gpc.poll()?.outcome,"quiet");
});

test("missing peers, duplicate participants, changed documents and cancellation fail closed",async()=>{
  const {baseline,gpc,setTime,group}=pair();
  assert.throws(()=>group.participant("fixture","runtime_evidence"),/mismatch/);
  assert.throws(()=>group.participant("other","gpc_observation"),/mismatch/);
  gpc.commit("replaced");assert.throws(()=>baseline.poll(),/pair_unavailable/);
  let time=0;
  const absent=createLocalGpcAdaptivePair({scanId:"alone",now:()=>time}).participant("alone","runtime_evidence");
  absent.commit("loader");time=15000;
  assert.throws(()=>absent.poll(),/pair_unavailable/);
  const fresh=pair();setTime(0);
  const controller=new AbortController();controller.abort(new Error("parent cancellation"));
  await assert.rejects(fresh.baseline.wait(controller.signal),/parent cancellation/);
});
