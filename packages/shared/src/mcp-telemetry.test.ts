import assert from "node:assert/strict";
import test from "node:test";
import { mcpActivationEventSchema, mcpTelemetryEndpoint, mcpTelemetryEventSchema } from "./mcp-telemetry";

test("MCP activation telemetry accepts only bounded authenticated funnel stages", () => {
  const event = mcpActivationEventSchema.parse({
    actorId: "a".repeat(24),
    authClass: "authenticated",
    attributionConfidence: "corroborated",
    attributionRulesetVersion: "2026-08-20.1",
    attributionSignals: ["anthropic_connector_network", "declared_client_info"],
    callerProduct: "claude",
    clientFamily: "anthropic_claude",
    clientName: "claude",
    eventId: "00000000-0000-4000-8000-000000000001",
    eventType: "activation",
    executionChannel: "hosted_connector",
    installationOrigin: "unknown",
    occurredAt: "2026-08-27T12:00:00.000Z",
    organizationId: "00000000-0000-4000-8000-000000000002",
    sessionId: "b".repeat(24),
    source: "anthropic",
    sourceAttribution: "verified_network",
    stage: "mcp_initialized",
    surface: "mcp_authenticated",
    userId: "00000000-0000-4000-8000-000000000003"
  });
  assert.equal(event.stage, "mcp_initialized");
  assert.equal(mcpActivationEventSchema.safeParse({ ...event, authorization: "Bearer secret" }).success, false);
  assert.equal(mcpActivationEventSchema.safeParse({ ...event, userId: null }).success, true);
  assert.equal(mcpActivationEventSchema.safeParse({ ...event, actorId: null }).success, true);
  assert.equal(mcpActivationEventSchema.safeParse({ ...event, actorId: null, sessionId: null }).success, false);
  assert.equal(mcpActivationEventSchema.safeParse({ ...event, surface: "mcp_light" }).success, false);
  assert.equal(mcpActivationEventSchema.safeParse({ ...event, surface: "mcp_light", authClass: "anonymous", organizationId: null, userId: null }).success, true);
  assert.equal(mcpActivationEventSchema.safeParse({ ...event, userId: "non-database-subject" }).success, false);
});

test("MCP telemetry accepts only bounded structured metadata", () => {
  const event = mcpTelemetryEventSchema.parse({
    actorId: "a".repeat(24),
    attributionConfidence: "declared",
    attributionRulesetVersion: "2026-08-20.1",
    attributionSignals: ["declared_client_info"],
    authClass: "anonymous",
    callerProduct: "chatgpt",
    clientName: "chatgpt",
    clientFamily: "openai_chatgpt",
    durationMs: 125,
    endpoint: "/mcp/light",
    errorCode: null,
    executionChannel: "unknown",
    eventId: "00000000-0000-4000-8000-000000000001",
    freshness: "latest",
    integration: "certscore-mcp",
    installationOrigin: "unknown",
    isCanary: false,
    occurredAt: "2026-08-19T12:00:00.000Z",
    outcome: "success",
    quotaOutcome: "allowed",
    requestId: "00000000-0000-4000-8000-000000000002",
    requestedResource: "scan_123",
    requestedResourceType: "scan_id",
    requesterIp: "198.51.100.10",
    requesterIpHash: "c".repeat(64),
    requesterNetwork: "direct",
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
    clientName: null,
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
    requestedResource: null,
    requestedResourceType: null,
    requesterIp: null,
    requesterIpHash: null,
    requesterNetwork: "unknown",
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
