import assert from "node:assert/strict";
import test from "node:test";
import { mcpTelemetryEndpoint, mcpTelemetryEventSchema } from "./mcp-telemetry";

test("MCP telemetry accepts only bounded structured metadata", () => {
  const event = mcpTelemetryEventSchema.parse({
    actorId: "a".repeat(24),
    authClass: "anonymous",
    clientFamily: "openai_chatgpt",
    durationMs: 125,
    endpoint: "/mcp/light",
    errorCode: null,
    eventId: "00000000-0000-4000-8000-000000000001",
    freshness: "latest",
    integration: "certscore-mcp",
    isCanary: false,
    occurredAt: "2026-08-19T12:00:00.000Z",
    outcome: "success",
    quotaOutcome: "allowed",
    requestId: "00000000-0000-4000-8000-000000000002",
    scanDecision: "reused",
    scanFrom: "eu_ie",
    scanId: "00000000-0000-4000-8000-000000000003",
    scanStatus: "completed",
    sessionId: "b".repeat(24),
    source: "openai",
    sourceAttribution: "self_declared_header",
    surface: "mcp_light",
    targetHostname: "example.com",
    toolName: "certscore_scan_site",
    transportOutcome: "mcp_result",
  });

  assert.equal(event.targetHostname, "example.com");
  assert.equal(mcpTelemetryEndpoint("mcp_authenticated"), "/mcp");
  assert.equal(mcpTelemetryEndpoint("mcp_anonymous"), "/mcp/anonymous");
});

test("MCP telemetry rejects raw request material", () => {
  assert.equal(mcpTelemetryEventSchema.safeParse({
    actorId: null,
    authClass: "anonymous",
    clientFamily: "unknown",
    durationMs: 1,
    endpoint: "/mcp/light",
    errorCode: null,
    eventId: "00000000-0000-4000-8000-000000000001",
    freshness: null,
    integration: "certscore-mcp",
    occurredAt: "2026-08-19T12:00:00.000Z",
    outcome: "success",
    prompt: "scan my confidential site",
    quotaOutcome: "not_applicable",
    requestId: "00000000-0000-4000-8000-000000000002",
    scanDecision: "not_applicable",
    scanFrom: null,
    scanId: null,
    scanStatus: null,
    sessionId: null,
    source: "unknown",
    sourceAttribution: "unknown",
    surface: "mcp_light",
    targetHostname: null,
    toolName: "certscore_get_scan_status",
    transportOutcome: "mcp_result",
  }).success, false);
});
