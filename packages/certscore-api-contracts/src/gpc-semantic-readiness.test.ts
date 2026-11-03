import assert from "node:assert/strict";
import test from "node:test";
import {gpcBoundedObservationSchema} from "./gpc-bounded-observation";

test("optional readiness facts preserve strict public and canonical validation and legacy omission",async()=>{
  const {gpcBoundedObservationSchema:canonical}=await import("../../certscore-contracts/src/gpc-bounded-observation");
  const {gpcProductFixture}=await import("../../../apps/web/lib/scans/test-fixtures/gpc-product");
  const {observation:o}=gpcProductFixture({notReady:"cmp_status_not_loaded"}).assessment;
  assert.ok(o.semanticReadiness);
  for(const schema of [canonical,gpcBoundedObservationSchema]) {
    assert.deepEqual(schema.parse(o),o);
    const legacy=structuredClone(o); delete legacy.semanticReadiness;
    assert.deepEqual(schema.parse(legacy),legacy);
    for(const change of [
      {reason:"unknown"}, {rawGpp:"secret"}, {observedAfterDocumentCommitMs:-1},
      {observedAfterDocumentCommitMs:120001}, {observedAfterDocumentCommitMs:0.5},
      {observedAfterDocumentCommitMs:o.requests.throughMs!+1},
      {cmpStatusLoaded:true,signalStatusReady:true}, {cmpStatusLoaded:null},
      {reason:"synchronous_ping_unavailable",cmpStatusLoaded:false},
    ]) assert.equal(schema.safeParse({...o,semanticReadiness:{...o.semanticReadiness,...change}}).success,false);
    for(const change of [{semanticProbe:"observed"},{status:"complete"},{sourceSha256:null},{sessionSha256:null},
      {documentUrlSha256:null},{scanId:undefined}, {requests:{...o.requests,documentCommittedAtMs:null}}])
      assert.equal(schema.safeParse({...o,...change}).success,false);
  }
});

test("API-unavailable facts are bound observations, with unknown readiness and no inferred legacy reason",async()=>{
  const {gpcBoundedObservationSchema:canonical}=await import("../../certscore-contracts/src/gpc-bounded-observation");
  const {gpcProductFixture}=await import("../../../apps/web/lib/scans/test-fixtures/gpc-product");
  const {observation:o}=gpcProductFixture({apiUnavailable:true}).assessment;
  assert.equal(o.semanticProbe,"unavailable");assert.equal(o.semanticReadiness?.reason,"api_unavailable");
  for(const schema of [canonical,gpcBoundedObservationSchema]){
    assert.deepEqual(schema.parse(o),o);
    for(const status of ["complete","limited"] as const)assert.equal(schema.safeParse({...o,status}).success,true);
    for(const semanticProbe of ["observed","not_ready","invalid","unsupported","incomplete"])
      assert.equal(schema.safeParse({...o,semanticProbe}).success,false);
    for(const change of [{cmpStatusLoaded:false},{signalStatusReady:true},{observedAfterDocumentCommitMs:-1},
      {observedAfterDocumentCommitMs:120001},{observedAfterDocumentCommitMs:o.requests.throughMs!+1},{rawGpp:"secret"}])
      assert.equal(schema.safeParse({...o,semanticReadiness:{...o.semanticReadiness,...change}}).success,false);
    for(const change of [{sourceSha256:null},{sessionSha256:null},{documentUrlSha256:null},{scanId:undefined},{status:"unavailable"}])
      assert.equal(schema.safeParse({...o,...change}).success,false);
    const legacy=structuredClone(o);delete legacy.semanticReadiness;assert.deepEqual(schema.parse(legacy),legacy);
  }
});
