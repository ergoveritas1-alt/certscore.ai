import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeRequesterIpAttributions,
  requesterIpAttributionFromContext,
  requesterIpAttributionFromRequest
} from "./requester-ip-attribution";

const HASH = "a".repeat(64);

test("requesterIpAttributionFromRequest distinguishes source IPs from legacy hashes", () => {
  assert.deepEqual(requesterIpAttributionFromRequest({
    request_context: { provenance: { originIp: HASH } }
  }), { ipHash: HASH, sourceIp: null, source: "hash_only" });
  assert.deepEqual(requesterIpAttributionFromRequest({
    request_context: { ipHash: HASH, sourceIp: "203.0.113.42" }
  }), { ipHash: HASH, sourceIp: "203.0.113.42", source: "request_context" });
});

test("raw Pulse attribution wins without discarding a linked scan-request hash", () => {
  assert.deepEqual(mergeRequesterIpAttributions(
    requesterIpAttributionFromRequest({ request_context: { provenance: { originIp: HASH } } }),
    requesterIpAttributionFromContext({ ipHash: HASH, sourceIp: "198.51.100.9" })
  ), { ipHash: HASH, sourceIp: "198.51.100.9", source: "request_context" });
});

test("historical scan requests can recover retained Pulse source attribution", () => {
  assert.deepEqual(requesterIpAttributionFromRequest({
    request_context: { provenance: { originIp: HASH } },
    pulse_request_context: { ipHash: HASH, sourceIp: "192.0.2.25" }
  }), { ipHash: HASH, sourceIp: "192.0.2.25", source: "pulse_context" });
});

test("malformed legacy values are never displayed as caller IPs", () => {
  assert.deepEqual(requesterIpAttributionFromRequest({
    request_context: { sourceIp: "customer-proxy", originIp: "999.1.1.1" }
  }), { ipHash: null, sourceIp: null, source: "missing" });
});
