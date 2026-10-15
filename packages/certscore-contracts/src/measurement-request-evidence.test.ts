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
