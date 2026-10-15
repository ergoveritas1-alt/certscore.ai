import assert from "node:assert/strict";
import test from "node:test";
import { inspectMeasurementRequest } from "./measurement-request-inspection";
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
