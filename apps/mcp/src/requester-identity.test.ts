import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import { anonymousMcpRequester, anonymousSessionBinding } from "./requester-identity.js";

function request(headers: IncomingMessage["headers"]) {
  return { headers } as IncomingMessage;
}

test("MCP identity uses the ALB-appended source and ignores spoofable headers", () => {
  const requester = anonymousMcpRequester(request({
    "cf-connecting-ip": "198.51.100.8",
    "x-forwarded-for": "192.0.2.200, 203.0.113.44",
    "x-real-ip": "192.0.2.201"
  }));
  assert.deepEqual(requester, { ip: "203.0.113.44", network: "direct" });
  assert.equal(anonymousSessionBinding(requester), "anonymous:203.0.113.44");
});

test("verified Anthropic egress is provider-classified without treating clientInfo as identity", () => {
  const first = anonymousMcpRequester(request({ "x-forwarded-for": "192.0.2.10, 160.79.104.9" }));
  const second = anonymousMcpRequester(request({ "x-forwarded-for": "192.0.2.11, 160.79.111.250" }));
  assert.equal(first.network, "anthropic");
  assert.equal(second.network, "anthropic");
  assert.equal(anonymousSessionBinding(first), "anonymous-provider:anthropic");
  assert.equal(anonymousSessionBinding(second), "anonymous-provider:anthropic");
});

test("missing ALB forwarding does not fall back to caller-controlled X-Real-IP", () => {
  assert.deepEqual(anonymousMcpRequester(request({ "x-real-ip": "203.0.113.90" })), { ip: null, network: "unknown" });
});
