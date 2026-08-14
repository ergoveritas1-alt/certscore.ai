import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import { anonymousMcpRequester, anonymousMcpRequesterFromHeaders, anonymousSessionBinding, authenticatedMcpCallerBinding } from "./requester-identity.js";

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

test("MCP request metadata resolves the current trusted requester identity", () => {
  assert.deepEqual(anonymousMcpRequesterFromHeaders({
    "cf-connecting-ip": "198.51.100.8",
    "x-forwarded-for": "192.0.2.200, 203.0.113.45",
    "x-real-ip": "192.0.2.201"
  }), { ip: "203.0.113.45", network: "direct" });
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

test("authenticated read identity is stable across OAuth access-token refreshes", () => {
  const first = authenticatedMcpCallerBinding({ iss: "https://certscore.ai", sub: "user_123" });
  const refreshed = authenticatedMcpCallerBinding({ iss: "https://certscore.ai", sub: "user_123" });
  const otherUser = authenticatedMcpCallerBinding({ iss: "https://certscore.ai", sub: "user_456" });
  const otherIssuer = authenticatedMcpCallerBinding({ iss: "https://issuer.example", sub: "user_123" });
  assert.equal(first, refreshed);
  assert.notEqual(first, otherUser);
  assert.notEqual(first, otherIssuer);
  assert.doesNotMatch(first, /clientInfo|anthropic/i);
});
