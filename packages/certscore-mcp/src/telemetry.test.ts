import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCertScoreMcpServer, projectMcpToolInvocationObservation, type McpToolInvocationObservation } from "./server.js";

test("scan-site telemetry classifies new and reused scans without retaining a URL path", () => {
  const created = projectMcpToolInvocationObservation({
    args: { freshness: "refresh", scanFrom: "eu_de", url: "https://WWW.Example.com/private/path?token=secret" },
    durationMs: 151.8,
    result: { structuredContent: { executionMode: "new_scan", reused: false, scanId: "scan_new", scanFrom: "eu_de", status: "queued" } },
    toolName: "certscore_scan_site",
  });
  const reused = projectMcpToolInvocationObservation({
    args: { url: "example.com" },
    durationMs: 8,
    result: { structuredContent: { executionMode: "reused_scan", reused: true, scanId: "scan_reused", status: "completed" } },
    toolName: "certscore_scan_site",
  });

  assert.deepEqual(created, {
    durationMs: 152,
    errorCode: null,
    freshness: "refresh",
    isCanary: false,
    outcome: "success",
    quotaOutcome: "allowed",
    requestedResource: "https://www.example.com",
    requestedResourceType: "url",
    scanDecision: "new",
    scanFrom: "eu_de",
    scanId: "scan_new",
    scanStatus: "queued",
    targetHostname: "www.example.com",
    toolName: "certscore_scan_site",
    transportOutcome: "mcp_result",
  });
  assert.equal(reused.scanDecision, "reused");
  assert.equal(JSON.stringify(created).includes("private/path"), false);
  assert.equal(JSON.stringify(created).includes("secret"), false);
});

test("scan-site telemetry classifies the bounded CertScore canary path without retaining it", () => {
  const observation = projectMcpToolInvocationObservation({
    args: { url: "https://ergoveritas.com/.well-known/certscore-canary/sentinels/consent-stress.html?secret=value" },
    durationMs: 5,
    result: { structuredContent: { scanId: "scan_canary", status: "queued" } },
    toolName: "certscore_scan_site",
  });
  assert.equal(observation.isCanary, true);
  assert.equal(JSON.stringify(observation).includes("consent-stress"), false);
  assert.equal(JSON.stringify(observation).includes("secret=value"), false);

  for (const url of [
    "https://ergoveritas.com/",
    "https://ergoveritas.com/services/privacy",
    "https://ergoveritas.com/?example=/.well-known/certscore-canary/sentinels/demo.html",
  ]) {
    const regular = projectMcpToolInvocationObservation({
      args: { url }, durationMs: 5,
      result: { structuredContent: { scanId: "scan_regular", status: "queued" } },
      toolName: "certscore_scan_site",
    });
    assert.equal(regular.isCanary, false, `${url} must remain regular traffic`);
  }
});

test("status and bundle telemetry retain only stable scan metadata", () => {
  for (const toolName of ["certscore_get_scan_status", "certscore_get_scan_bundle"]) {
    const observation = projectMcpToolInvocationObservation({
      args: { detail: "full", scanId: "scan_123" },
      durationMs: 92,
      result: { structuredContent: { scanId: "scan_123", status: "completed" } },
      toolName,
    });
    assert.equal(observation.toolName, toolName);
    assert.equal(observation.scanId, "scan_123");
    assert.equal(observation.scanDecision, "not_applicable");
    assert.equal(observation.requestedResource, "scan_123");
    assert.equal(observation.requestedResourceType, "scan_id");
    assert.equal(observation.targetHostname, null);
  }
});

test("full-profile domain tools contribute a normalized requested hostname", () => {
  for (const toolName of [
    "certscore_get_latest_domain_scan",
    "certscore_get_latest_domain_pre_consent_cookies_trackers",
  ]) {
    const observation = projectMcpToolInvocationObservation({
      args: { domain: "HTTPS://News.Example.com/private/path?secret=value" },
      durationMs: 12,
      result: { structuredContent: { status: "completed" } },
      toolName,
    });
    assert.equal(observation.targetHostname, "news.example.com");
    assert.equal(JSON.stringify(observation).includes("private/path"), false);
    assert.equal(JSON.stringify(observation).includes("secret=value"), false);
  }
});

test("failed and rate-limited tool results produce bounded outcomes", () => {
  const failed = projectMcpToolInvocationObservation({
    args: { scanId: "scan_123" },
    durationMs: 14,
    result: { content: [{ type: "text", text: JSON.stringify({ error: { code: "not_found", message: "sensitive detail" } }) }], isError: true },
    toolName: "certscore_get_scan_status",
  });
  const limited = projectMcpToolInvocationObservation({
    args: { url: "https://example.com" },
    durationMs: 9,
    result: { content: [{ type: "text", text: JSON.stringify({ error: { code: "rate_limited" } }) }], isError: true },
    toolName: "certscore_scan_site",
  });
  assert.equal(failed.outcome, "error");
  assert.equal(failed.errorCode, "not_found");
  assert.equal(failed.requestedResource, "scan_123");
  assert.equal(failed.requestedResourceType, "scan_id");
  assert.equal(JSON.stringify(failed).includes("sensitive detail"), false);
  assert.equal(limited.outcome, "rate_limited");
  assert.equal(limited.quotaOutcome, "rate_limited");
  assert.equal(limited.scanDecision, "unavailable");
  assert.equal(limited.requestedResource, "https://example.com");
  assert.equal(limited.requestedResourceType, "url");
});

test("telemetry observer failure never changes an MCP tool result", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    type: "certscore_scan_job",
    status: "queued",
    jobId: "job_123",
    scanId: "scan_123",
    executionMode: "new_scan",
    reused: false,
  }), { status: 202, headers: { "content-type": "application/json" } })) as typeof fetch;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createCertScoreMcpServer({
    onToolInvocation: () => { throw new Error("storage unavailable"); },
    toolProfile: "light",
  });
  const client = new Client({ name: "telemetry-failure-test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.callTool({
      name: "certscore_scan_site",
      arguments: { url: "https://example.com", waitForCompletion: false },
    });
    assert.equal(result.isError, undefined);
    assert.equal((result.structuredContent as Record<string, unknown>).scanId, "scan_123");
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    globalThis.fetch = previousFetch;
    await client.close();
    await server.close();
  }
});

test("malformed scan IDs fail before origin work and still emit bounded telemetry", async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("origin request must not start");
  }) as typeof fetch;
  const observations: McpToolInvocationObservation[] = [];
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createCertScoreMcpServer({
    onToolInvocation: (observation) => { observations.push(observation); },
    toolProfile: "light",
  });
  const client = new Client({ name: "invalid-scan-id-test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.callTool({
      name: "certscore_get_scan_bundle",
      arguments: { scanId: "x" },
    });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /invalid_scan_id/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fetchCalls, 0);
    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.errorCode, "invalid_scan_id");
    assert.equal(observations[0]?.requestedResource, "x");
    assert.equal(observations[0]?.requestedResourceType, "scan_id");
  } finally {
    globalThis.fetch = previousFetch;
    await client.close();
    await server.close();
  }
});
