import assert from "node:assert/strict";
import test from "node:test";
import { inspectMeasurementRequest } from "./measurement-request-inspection";
import { createHash } from "node:crypto";
import type { MeasurementStoredIdentifier } from "@certscore/contracts";
const ga = { url: "https://www.google-analytics.com/g/collect?v=2&tid=G-FIXTURE&gcs=G100&en=page_view", method: "POST", body: null, requestId: "req-1", timestampMs: 100, headers: {} };
const rum = { ...ga, url: "https://cloudflareinsights.com/cdn-cgi/rum", body: JSON.stringify({ eventType: 1, firstContentfulPaint: 100, nt: { responseEnd: 100 } }) };

test("exact collection profiles retain bounded inspection facts without sensitive values", () => {
  assert.equal(inspectMeasurementRequest(ga)?.identifierEvidence, "not_observed");
  assert.equal(inspectMeasurementRequest(rum)?.profile, "cloudflare_rum.v1");
  assert.equal(inspectMeasurementRequest({ ...rum, body: JSON.stringify({ eventType: 1, FCP: 100,
    firstPaint: [{ name: "first-paint", entryType: "paint", startTime: 50, duration: 0 }],
    timingV2: { name: "https://example.test/", entryType: "navigation", type: "navigate", responseEnd: 100, nextHopProtocol: "h2" } }) })?.payloadInspection, "complete");
  assert.equal(inspectMeasurementRequest({ ...ga, url: `${ga.url}&cid=123.456` })?.identifierEvidence, "unknown", "an opaque client ID is not proof of a transient identifier");
  const user = inspectMeasurementRequest({ ...ga, url: `${ga.url}&uid=private-user-value` });
  assert.equal(user?.identifierEvidence, "persistent_observed");
  assert.doesNotMatch(JSON.stringify(user), /private-user-value/);
  assert.equal(inspectMeasurementRequest({ ...ga, headers: { Cookie: "_ga=private-cookie-value" } })?.identifierEvidence, "persistent_observed");
  assert.equal(inspectMeasurementRequest({ ...ga, headers: undefined })?.cookieHeader, "unknown");
  assert.equal(inspectMeasurementRequest({ ...rum, body: JSON.stringify({ eventType: 1, customUserId: "private-value" }) })?.payloadInspection, "unknown");
  assert.equal(inspectMeasurementRequest({ ...rum, body: JSON.stringify({ eventType: 1, location: "https://example.test/?email=private-value" }) })?.payloadInspection, "unknown");
  assert.equal(inspectMeasurementRequest({ ...rum, body: JSON.stringify({ eventType: 1, nt: { userId: 12345 } }) })?.payloadInspection, "unknown");
  assert.equal(inspectMeasurementRequest({ ...rum, headers: { "X-User-Id": "private-value" } })?.payloadInspection, "unknown");
  assert.equal(inspectMeasurementRequest({ ...ga, url: `${ga.url}&sid=12345` })?.identifierEvidence, "unknown");
  assert.equal(inspectMeasurementRequest({ ...ga, url: `${ga.url}&gcs=G111` })?.payloadInspection, "unknown");
  assert.equal(inspectMeasurementRequest({ ...rum, url: "https://cloudflareinsights.com/other" }), undefined);
  assert.equal(inspectMeasurementRequest({ ...rum, url: "https://cloudflareinsights.com.example.test/cdn-cgi/rum" }), undefined);
  assert.equal(inspectMeasurementRequest({ ...rum, body: "x".repeat(33_000) })?.payloadInspection, "unknown");
});

test("bounded event batches retain known positive identifiers while opaque IDs and unsupported formats stay unknown", () => {
  const batch = inspectMeasurementRequest({...ga, url:ga.url.replace("&en=page_view",""), body:"en=page_view\nen=scroll&_s=2"});
  assert.equal(batch?.payloadInspection,"complete");assert.equal(batch?.identifierEvidence,"not_observed");
  assert.equal(batch?.diagnostics?.bodyDisposition,"inspected");
  const user = inspectMeasurementRequest({...ga,body:"en=page_view\nen=login&uid=private-batch-user"});
  assert.equal(user?.identifierEvidence,"persistent_observed");assert.doesNotMatch(JSON.stringify(user),/private-batch-user/);
  for (const [body,reason] of [["x".repeat(32769),"payload_size_limit"],["en=a&en=b","duplicate_fields"],
    ["en=page_view&cid=123.456","ambiguous_client_identifier"],["en=page_view&extra=unknown","unsupported_fields"],
    ["en=bad%ZZ","unsupported_payload"],[Array(9).fill("en=page_view").join("\n"),"unsupported_payload"]] as const) {
    const result=inspectMeasurementRequest({...ga,url:"https://www.google-analytics.com/g/collect?v=2&gcs=G100",body});
    assert.equal(result?.identifierEvidence,"unknown");assert.ok(result?.diagnostics?.reasons.includes(reason));
  }
  const missing=inspectMeasurementRequest({...ga,headers:{"content-length":"42"}});
  assert.equal(missing?.payloadInspection,"unknown");assert.ok(missing?.diagnostics?.reasons.includes("body_unavailable"));
});

test("cid is persistent only with one exact same-session stored-value match", () => {
  const identifier: MeasurementStoredIdentifier = {policyVersion:"measurement_cookie_identifier.v1",parameter:"cid",
    source:"pre_action_cookie_snapshot",targetSha256:"a".repeat(64),cookieName:"_ga",hostname:"example.test",
    identityHash:"b".repeat(64),valueHash:"c".repeat(64),identifierSha256:createHash("sha256").update("123.456").digest("hex"),capturedAtMs:90};
  const input={...ga,url:`${ga.url}&cid=123.456`,storedIdentifiers:[identifier],hashIdentifier:(value:string)=>createHash("sha256").update(value).digest("hex")};
  const match=inspectMeasurementRequest(input);
  assert.equal(match?.identifierEvidence,"persistent_observed");assert.deepEqual(match?.cookieIdentifierBinding,identifier);
  assert.doesNotMatch(JSON.stringify(match),/123\.456/);
  for(const storedIdentifiers of [[],[identifier,identifier],[{...identifier,capturedAtMs:101}],
    [{...identifier,identifierSha256:"d".repeat(64)}]]) {
    assert.equal(inspectMeasurementRequest({...input,storedIdentifiers})?.identifierEvidence,"unknown");
  }
  assert.equal(inspectMeasurementRequest({...input,url:`${ga.url}&sid=123.456`})?.identifierEvidence,"unknown");
  assert.equal(inspectMeasurementRequest({...input,hashIdentifier:undefined})?.identifierEvidence,"unknown");
});
