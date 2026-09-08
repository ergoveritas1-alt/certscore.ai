import assert from "node:assert/strict";
import test from "node:test";
import { mcpRequestDetailsSchema } from "./mcp-telemetry";

const details = {
  version: 1, arguments: { scanId: "scan-123", detail: "full", maxBytes: 25000 }, argumentsOmitted: false,
  actorBasis: "requester_binding", sessionBasis: "mcp_session", rateLimit: null,
};

test("bounded request details reject unallowlisted payloads and unsafe URL forms", () => {
  assert.equal(mcpRequestDetailsSchema.safeParse(details).success, true);
  for (const argumentsValue of [
    { prompt: "private conversation" }, { token: "private credential" },
    { url: "https://user:pass@example.com" }, { url: "https://example.com/path?secret=value" },
    { url: "not-a-url" }, { url: "file:///tmp/private" }, { maxBytes: Infinity }, { limit: -1 },
  ]) assert.equal(mcpRequestDetailsSchema.safeParse({ ...details, arguments: argumentsValue }).success, false);
  assert.equal(mcpRequestDetailsSchema.safeParse({ ...details, arguments: { url: "https://example.com" } }).success, true);
});

test("correlation provenance and rate limits require the versioned bounded contract", () => {
  assert.equal(mcpRequestDetailsSchema.safeParse({ ...details, actorBasis: "verified_person" }).success, false);
  assert.equal(mcpRequestDetailsSchema.safeParse({ ...details, rateLimit: { kind: "mcp_read", retryAfterSeconds: -1 } }).success, false);
  assert.equal(mcpRequestDetailsSchema.safeParse({ ...details, rateLimit: { kind: "mcp_read", headers: { authorization: "secret" } } }).success, false);
});
