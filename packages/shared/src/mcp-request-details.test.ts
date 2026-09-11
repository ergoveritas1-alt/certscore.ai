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

test("response summaries fit the existing request-details envelope and reject raw bodies", async () => {
  const { boundMcpRequestDetails } = await import("./mcp-telemetry");
  const baseSummary = { version: 1 as const, captureBasis: "response_generated" as const, templateVersion: "2026-09-11.1" as const, kind: "tool_result" as const, isError: true, textOmitted: false, summaryTruncated: false, message: "m".repeat(400), recommendedNextAction: "a".repeat(800) };
  const input = mcpRequestDetailsSchema.parse({ ...details, response: { bytes: null, truncated: null, summary: baseSummary } });
  const { captureMcpCallerInput } = await import("./mcp-caller-input");
  input.callerInput = captureMcpCallerInput(Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`reason${i}`, "ordinary context ".repeat(17)])));
  const originalFieldCount = input.callerInput.fields.length;
  const bounded = boundMcpRequestDetails(input);
  assert.equal(input.callerInput.fields.length, originalFieldCount);
  assert.ok((bounded.callerInput?.fields.length ?? 0) < originalFieldCount);
  assert.equal(bounded.response?.summary?.message, baseSummary.message);
  assert.ok(Buffer.byteLength(JSON.stringify(bounded, null, 1)) <= 4096);
  assert.equal(mcpRequestDetailsSchema.safeParse(bounded).success, true);
  assert.equal(mcpRequestDetailsSchema.safeParse({ ...details, response: { bytes: null, truncated: null, summary: { ...baseSummary, body: "secret" } } }).success, false);
  assert.equal(mcpRequestDetailsSchema.safeParse({ ...details, response: { bytes: 20, truncated: null, summary: { ...baseSummary, recommendedNextAction: "🙂".repeat(800) } } }).success, false);
});
