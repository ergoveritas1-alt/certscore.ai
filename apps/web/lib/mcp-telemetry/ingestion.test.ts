import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyMcpTelemetryEnvelope } from "./ingestion";

const secret = "mcp-telemetry-ingestion-test-secret";
const nowMs = Date.parse("2026-08-19T12:00:00.000Z");
const timestamp = String(Math.floor(nowMs / 1_000));

function event() {
  return {
    actorId: null,
    authClass: "anonymous",
    clientFamily: "unknown",
    durationMs: 25,
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
    scanDecision: "new",
    scanFrom: "eu_ie",
    scanId: "00000000-0000-4000-8000-000000000003",
    scanStatus: "queued",
    sessionId: "a".repeat(24),
    source: "unknown",
    sourceAttribution: "unknown",
    surface: "mcp_light",
    targetHostname: "example.com",
    toolName: "certscore_scan_site",
    transportOutcome: "mcp_result",
  };
}

function envelope(value: unknown) {
  const body = JSON.stringify(value);
  const proof = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64url");
  return { body, proof };
}

test("MCP telemetry ingestion accepts a fresh signed strict event", () => {
  const signed = envelope(event());
  const result = verifyMcpTelemetryEnvelope({ ...signed, nowMs, secret, timestamp });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.event.toolName, "certscore_scan_site");
});

test("MCP telemetry ingestion rejects stale, altered, or sensitive payloads", () => {
  const signed = envelope(event());
  assert.deepEqual(verifyMcpTelemetryEnvelope({ ...signed, nowMs, secret, timestamp: "1" }), { ok: false, reason: "stale_authentication" });
  assert.deepEqual(verifyMcpTelemetryEnvelope({ ...signed, body: `${signed.body} `, nowMs, secret, timestamp }), { ok: false, reason: "invalid_authentication" });

  const sensitive = envelope({ ...event(), authorization: "Bearer secret" });
  assert.deepEqual(verifyMcpTelemetryEnvelope({ ...sensitive, nowMs, secret, timestamp }), { ok: false, reason: "invalid_event" });
});
