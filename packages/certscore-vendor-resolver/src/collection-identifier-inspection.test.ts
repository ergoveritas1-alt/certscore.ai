import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { inspectMeasurementRequest } from "./measurement-request-inspection";
import { COOKIE_PURPOSE_POLICY, resolveCanonicalCookieKnowledge } from "./cookie-knowledge-base";
import { readBoundMeasurementRequestEvidence, type MeasurementStoredIdentifier } from "@certscore/contracts";
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");

test("Heap and HubSpot persist only exact transmitted pre-action cookie matches; opaque IDs remain unknown",()=>{
 for(const [url,parameter,cookieName,value] of [
  ["https://heapanalytics.com/h?a=123&u=987654321","u","_hp2_id.123","987654321"],
  ["https://track.hubspot.com/__ptc.gif?vi="+"a".repeat(32),"vi","hubspotutk","a".repeat(32)],
 ] as const){
  const binding:MeasurementStoredIdentifier={policyVersion:"measurement_cookie_identifier.v1",parameter,cookieName,
   source:"pre_action_cookie_snapshot",targetSha256:sha("target"),hostname:"example.test",identityHash:sha("identity"),
   valueHash:sha("cookie"),identifierSha256:sha(value),capturedAtMs:10};
  const input={url,method:"GET",body:null,requestId:"r",timestampMs:30,headers:{},storedIdentifiers:[binding],hashIdentifier:sha};
  const evidence=inspectMeasurementRequest(input)!;
  assert.equal(evidence.version,"measurement_request_evidence.v3");assert.equal(evidence.identifierEvidence,"persistent_observed");
  assert.equal(evidence.payloadInspection,"unknown");assert.deepEqual(evidence.cookieIdentifierBinding,binding);
  const request={requestId:"r",startedAtMs:30,method:"GET",sanitizedUrl:url.split("?")[0]!};
  const storage={targetSha256:binding.targetSha256,actionDispatchedAtMs:20,preActionCapturedAtMs:10,
   preActionStorage:[{storageType:"cookie",name:cookieName,hostname:binding.hostname,identityHash:binding.identityHash,valueHash:binding.valueHash,
    nonEssential:true,expiresAtEpochSeconds:200,capturedAtEpochSeconds:100}]};
  assert.ok(readBoundMeasurementRequestEvidence(evidence,request,storage));
  assert.equal(readBoundMeasurementRequestEvidence(evidence,{...request,sanitizedUrl:request.sanitizedUrl.replace(".com/",".com.example.test/")},storage),null);
  for(const change of [{storedIdentifiers:[]},{storedIdentifiers:[binding,binding]},{storedIdentifiers:[{...binding,capturedAtMs:31}]},
   {url:url+'&'+parameter+'='+value},{url:url.replace(value,"0")},{body:"x".repeat(32769)}, {method:"OPTIONS"}])
    assert.equal(inspectMeasurementRequest({...input,...change})?.identifierEvidence,"unknown");
  assert.equal(inspectMeasurementRequest({...input,url:url.replace(".com/",".com.example.test/")}),undefined);
  assert.doesNotMatch(JSON.stringify(evidence),/987654321|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
 }
});
test("Shopify mixed telemetry cannot imply optional purpose or identifier absence",()=>{
 const e=inspectMeasurementRequest({url:"https://monorail-edge.shopifysvc.com/v1/produce",method:"POST",requestId:"r",timestampMs:1,
  body:JSON.stringify({schema_id:"opaque",payload:{user_id:"secret"}}),headers:{}})!;
 assert.equal(e.profile,"shopify_mixed_telemetry.v1");assert.equal(e.identifierEvidence,"unknown");assert.equal(e.payloadInspection,"unknown");
 assert.ok(e.diagnostics?.reasons.includes("purpose_unresolved"));assert.doesNotMatch(JSON.stringify(e),/secret|schema_id/);
});
test("Heap cookie purpose is a versioned fresh-capture rule; frozen historical tables keep unknown",()=>{
 assert.equal(resolveCanonicalCookieKnowledge("_hp2_id.123",{purposePolicyVersion:COOKIE_PURPOSE_POLICY}).essentiality,"non_essential");
 for(const purposePolicyVersion of [undefined,"certscore.cookie-purpose.v2","certscore.cookie-purpose.v3"] as const)
  assert.equal(resolveCanonicalCookieKnowledge("_hp2_id.123",{purposePolicyVersion}).essentiality,"unknown");
 assert.equal(resolveCanonicalCookieKnowledge("_hp2_id.unreviewed",{purposePolicyVersion:COOKIE_PURPOSE_POLICY}).essentiality,"unknown");
});
