import assert from "node:assert/strict";
import test from "node:test";
import { measurementRequestEvidenceSchema, readBoundMeasurementRequestEvidence } from "./measurement-request-evidence";
const request = { requestId: "request-1", startedAtMs: 100, method: "POST", sanitizedUrl: "https://cloudflareinsights.com/cdn-cgi/rum" };
const evidence = { version: "measurement_request_evidence.v1", requestId: request.requestId, timestampMs: 100,
  requestOrigin: "https://cloudflareinsights.com", requestPath: "/cdn-cgi/rum", profile: "cloudflare_rum.v1", method: "POST",
  payloadInspection: "complete", identifierEvidence: "not_observed", cookieHeader: "absent", authorizationHeader: "absent" };

test("measurement evidence stays request-bound and rejects raw or mismatched payload context", () => {
  assert.ok(readBoundMeasurementRequestEvidence(evidence, request));
  for (const changed of [{ requestId: "other" }, { startedAtMs: 101 }, { method: "OPTIONS" },
    { sanitizedUrl: "https://cloudflareinsights.com/other" }, { sanitizedUrl: "https://example.test/cdn-cgi/rum" }]) {
    assert.equal(readBoundMeasurementRequestEvidence(evidence, { ...request, ...changed }), null);
  }
  assert.equal(measurementRequestEvidenceSchema.safeParse({ ...evidence, rawBody: "private" }).success, false);
  assert.equal(measurementRequestEvidenceSchema.safeParse({ ...evidence, headers: { Cookie: "private" } }).success, false);
});

test("v2 stored-identifier proof must bind the exact pre-action cookie, target, snapshot clock and lifetime",()=>{
 const request={requestId:"ga-request",startedAtMs:200,method:"POST",sanitizedUrl:"https://www.google-analytics.com/g/collect"};
 const proof={policyVersion:"measurement_cookie_identifier.v1",parameter:"cid",source:"pre_action_cookie_snapshot",targetSha256:"a".repeat(64),
  cookieName:"_ga",hostname:"example.test",identityHash:"b".repeat(64),valueHash:"c".repeat(64),identifierSha256:"d".repeat(64),capturedAtMs:100} as const;
 const observation={...evidence,version:"measurement_request_evidence.v2",requestId:request.requestId,timestampMs:200,
  requestOrigin:"https://www.google-analytics.com",requestPath:"/g/collect",profile:"google_analytics_collection.v1",
  identifierEvidence:"persistent_observed",payloadInspection:"unknown",cookieIdentifierBinding:proof,
  diagnostics:{policyVersion:"bounded_measurement_inspection.v1",reasons:[],bodyDisposition:"inspected"}};
 const cookie={storageType:"cookie",name:"_ga",hostname:"example.test",identityHash:proof.identityHash,valueHash:proof.valueHash,
  nonEssential:true,expiresAtEpochSeconds:2000,capturedAtEpochSeconds:1000};
 const context={targetSha256:proof.targetSha256,actionDispatchedAtMs:110,preActionCapturedAtMs:100,preActionStorage:[cookie]};
 assert.ok(readBoundMeasurementRequestEvidence(observation,request,context));
 assert.equal(readBoundMeasurementRequestEvidence(observation,request),null);
 for(const change of [{targetSha256:"e".repeat(64)},{actionDispatchedAtMs:99},{actionDispatchedAtMs:201},{actionDispatchedAtMs:undefined},{preActionCapturedAtMs:101},{preActionStorage:[]},
  {preActionStorage:[{...cookie,valueHash:"e".repeat(64)}]},{preActionStorage:[{...cookie,expiresAtEpochSeconds:1000}]},
  {preActionStorage:[{...cookie,nonEssential:false}]}]) assert.equal(readBoundMeasurementRequestEvidence(observation,request,{...context,...change}),null);
 assert.equal(measurementRequestEvidenceSchema.safeParse({...observation,version:"measurement_request_evidence.v1"}).success,false);
 assert.equal(measurementRequestEvidenceSchema.safeParse({...observation,diagnostics:undefined}).success,false);
 assert.equal(measurementRequestEvidenceSchema.safeParse({...observation,cookieIdentifierBinding:{...proof,rawValue:"private"}}).success,false);
});

test("new collector profiles cannot assert persistent IDs or telemetry absence without bound proof",()=>{
 const v3={...evidence,version:"measurement_request_evidence.v3",profile:"heap_collection.v1",requestOrigin:"https://heapanalytics.com",requestPath:"/h",
  identifierEvidence:"persistent_observed",payloadInspection:"unknown",diagnostics:{policyVersion:"bounded_measurement_inspection.v1",reasons:[],bodyDisposition:"empty"}};
 assert.equal(measurementRequestEvidenceSchema.safeParse(v3).success,false);
 assert.equal(measurementRequestEvidenceSchema.safeParse({...v3,identifierEvidence:"unknown"}).success,true);
 assert.equal(measurementRequestEvidenceSchema.safeParse({...v3,version:"measurement_request_evidence.v2",identifierEvidence:"unknown"}).success,false);
 assert.equal(measurementRequestEvidenceSchema.safeParse({...v3,profile:"shopify_mixed_telemetry.v1",identifierEvidence:"not_observed"}).success,false);
 assert.equal(measurementRequestEvidenceSchema.safeParse({...v3,profile:"shopify_mixed_telemetry.v1",identifierEvidence:"unknown",payloadInspection:"complete"}).success,false);
});

test('supplemental GA identifier facts validate without changing measurement conclusions',()=>{
 const row={...evidence,profile:'google_analytics_collection.v1',requestOrigin:'https://www.google-analytics.com',requestPath:'/g/collect',version:'measurement_request_evidence.v2',diagnostics:{policyVersion:'bounded_measurement_inspection.v1',reasons:[],bodyDisposition:'empty'},identifierEvidence:'unknown',
  identifierObservation:{policyVersion:'measurement_identifier_observation.v1',fieldInventoryComplete:false,fields:[{field:'cid',source:'query',disposition:'observed',valueHash:'a'.repeat(64)}]}};
 assert.equal(measurementRequestEvidenceSchema.safeParse(row).success,true);
 assert.equal(measurementRequestEvidenceSchema.safeParse({...row,identifierObservation:{...row.identifierObservation,fields:[{field:'cid',source:'query',disposition:'observed'}]}}).success,false);
 assert.equal(measurementRequestEvidenceSchema.safeParse({...row,profile:'cloudflare_rum.v1'}).success,false);
 assert.equal(measurementRequestEvidenceSchema.safeParse({...row,identifierObservation:{...row.identifierObservation,fields:[row.identifierObservation.fields[0],row.identifierObservation.fields[0]]}}).success,false);
});
