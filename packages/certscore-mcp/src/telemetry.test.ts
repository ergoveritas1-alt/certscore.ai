import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCertScoreMcpServer, projectMcpToolInvocationObservation, type McpToolInvocationObservation } from "./server.js";

test("protocol observation captures validation errors, unknown tools and stripped inputs exactly once", async () => {
  const observations: McpToolInvocationObservation[] = [];
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createCertScoreMcpServer({ toolProfile: "light", onToolInvocation: observation => { observations.push(observation); } });
  const client = new Client({ name: "boundary-qc", version: "1" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    for (const request of [
      { name: "certscore_scan_site", arguments: {} },
      { name: "qc_unknown_tool", arguments: {} },
      { name: "certscore_get_scan_status", arguments: { scanId: "invalid", hidden: "secret-value" } },
      { name: "certscore_scan_site", arguments: { taskContext: { purpose: "vendor_review", questionSummary: "Review vendor tracking", questionSource: "agent_paraphrase", shareForImprovement: true, integrationId: "qc", integrationVersion: "1" } } },
    ]) {
      if (request.name === "qc_unknown_tool") {
        await assert.rejects(client.callTool(request), (error: any) => {
          assert.equal(error.code, -32602);
          assert.match(error.message, /MCP client's tool discovery \(tools\/list\)/);
          return true;
        });
      } else assert.equal((await client.callTool(request)).isError, true);
    }
    assert.equal(observations.length, 4);
    assert.equal(observations[2]?.scanId, null);
    assert.equal(observations[2]?.requestedResource, "invalid");
    assert.deepEqual(observations.map(row => row.errorCode), ["invalid_arguments", "unknown_tool", "invalid_scan_id", "invalid_arguments"]);
    assert.ok(observations.every(row => row.captureBasis === "protocol_request"));
    assert.equal(observations[2]?.requestArguments?.omitted, true);
    assert.equal(JSON.stringify(observations).includes("secret-value"), false);
    assert.equal(observations[3]?.taskContext?.purpose, "vendor_review");
    assert.ok(observations[0]?.response?.bytes);
    assert.equal(observations[0]?.response?.summary?.errorCode, "invalid_arguments");
    assert.equal(observations[1]?.response?.summary?.kind, "protocol_error");
    assert.equal(observations[1]?.response?.summary?.mcpCode, -32602);
    assert.match(observations[1]?.response?.summary?.recommendedNextAction ?? "", /tool discovery/);
    assert.equal(observations[1]?.response?.bytes, null);
    assert.equal(observations[3]?.callerInput?.questionStatus, "retained");
    assert.equal(observations[2]?.callerInput?.fields.find(field => field.path === "arguments.hidden")?.disposition, "redacted");
  } finally { await client.close(); await server.close(); }
});

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
    requestArguments: { values: { freshness: "refresh", scanFrom: "eu_de", url: "https://www.example.com" }, omitted: true },
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

test("request details retain supplied options but omit secrets, free text, and invalid values", () => {
  const event = projectMcpToolInvocationObservation({
    toolName: "certscore_scan_site", durationMs: 1,
    args: {
      url: "https://user:password@example.com/private?token=secret#fragment",
      freshness: "refresh", scanFrom: "eu_ie", waitForCompletion: false, maxWaitSeconds: 20,
      detail: "full", format: "markdown", prompt: "private prompt", token: "private-token",
      maxBytes: Infinity, offset: -1,
    },
    result: { structuredContent: { status: "queued" } },
  });
  assert.deepEqual(event.requestArguments, {
    values: { url: "https://example.com", freshness: "refresh", scanFrom: "eu_ie", waitForCompletion: false, maxWaitSeconds: 20, detail: "full", format: "markdown" },
    omitted: true,
  });
  assert.doesNotMatch(JSON.stringify(event), /password|private|secret|fragment|Infinity/);
});

test("creation limits keep their scope, usage and retry delay separate from target errors", () => {
  const limited = projectMcpToolInvocationObservation({
    toolName: "certscore_scan_site", args: { url: "https://example.com" }, durationMs: 1,
    result: { isError: true, structuredContent: { error: { code: "rate_limited", retryAfterSeconds: 30,
      creationRateLimit: { scope: "session", windowId: "concurrent", limit: 4, used: 4 } } } },
  });
  assert.deepEqual(limited.rateLimit, { kind: "scan_creation", scope: "session", windowId: "concurrent", retryAfterSeconds: 30, limit: 4, used: 4 });
  const target = projectMcpToolInvocationObservation({
    toolName: "certscore_get_scan_status", args: { scanId: "scan-1" }, durationMs: 1,
    result: { isError: true, structuredContent: { error: { code: "rate_limited_429" } } },
  });
  assert.equal(target.quotaOutcome, "allowed");
  assert.equal(target.rateLimit, undefined);
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

test("completed no-go retrievals remain successful MCP results", () => {
  for (const toolName of ["certscore_get_scan_status", "certscore_get_scan_bundle"]) {
    const observation = projectMcpToolInvocationObservation({
      args: { scanId: "scan_no_go" },
      durationMs: 185,
      result: {
        structuredContent: {
          error: {
            code: "authentication_required",
            message: "The requested page requires authentication.",
            retryable: false,
          },
          noGo: {
            reasonCode: "authentication_required",
          },
          resultDisposition: "no_go",
          scanId: "scan_no_go",
          status: "completed_limited",
        },
      },
      toolName,
    });

    assert.equal(observation.outcome, "success");
    assert.equal(observation.errorCode, null);
    assert.equal(observation.transportOutcome, "mcp_result");
    assert.equal(observation.scanStatus, "completed_limited");
    assert.equal(observation.scanId, "scan_no_go");
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
    initialPreConsentPreviewWaitMs: 0,
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
    assert.match(JSON.stringify(result.content), /This request did not start a scan/);
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


test("unknown and unavailable tools return discovery guidance without breaking the MCP session", async () => {
  for (const toolProfile of ["light", "full"] as const) {
    const observations: McpToolInvocationObservation[] = [];
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createCertScoreMcpServer({ toolProfile, onToolInvocation: observation => { observations.push(observation); } });
    const client = new Client({ name: "discovery-recovery-test", version: "1" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const availableNames = (await client.listTools()).tools.map(tool => tool.name);
      const names = toolProfile === "light" ? ["__probe__", "certscore_get_report"] : ["__probe__"];
      for (const name of names) {
        await assert.rejects(client.callTool({ name, arguments: { scanId: "test" } }), (error: any) => {
          assert.equal(error.code, -32602);
          assert.equal(error.data.code, "unknown_tool");
          assert.equal(error.data.retryable, false);
          assert.deepEqual([...error.data.availableTools].sort(), [...availableNames].sort());
          assert.match(error.data.recommendedNextAction, /then call a supported tool/);
          for (const availableName of availableNames) assert.ok(error.message.includes(availableName));
          if (toolProfile === "light") assert.ok(!error.message.includes("certscore_get_report"));
          assert.match(error.message, /MCP client's tool discovery \(tools\/list\)/);
          return true;
        });
      }
      const listed = await client.listTools();
      assert.ok(listed.tools.some(tool => tool.name === "certscore_scan_site"));
      assert.equal(listed.tools.some(tool => tool.name === "certscore_get_report"), toolProfile === "full");
      assert.equal(observations.length, names.length);
      assert.ok(observations.every(row => row.outcome === "error" && row.errorCode === "unknown_tool" && row.scanId === null));
    } finally { await client.close(); await server.close(); }
  }
});

test("a rejected bare-domain scan preserves the reason, guides correction, and creates no scan link or retry", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ type: "certscore_pulse_error", error: {
      code: "invalid_url", message: "We could not find DNS records for that domain. Check the spelling and try again.",
    } }), { status: 400, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const observations: McpToolInvocationObservation[] = [];
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createCertScoreMcpServer({ toolProfile: "light", onToolInvocation: observation => { observations.push(observation); } });
  const client = new Client({ name: "target-rejection-test", version: "1" });
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name: "certscore_scan_site", arguments: { url: "aaronbux.com" } });
    assert.equal(result.isError, true);
    const text = JSON.stringify(result.content);
    assert.match(text, /No scan was started/);
    assert.match(text, /could not find DNS records/);
    assert.match(text, /bare domain is accepted/);
    assert.match(text, /Do not repeat the same invalid request/);
    assert.equal(calls, 1);
    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.errorCode, "invalid_url");
    assert.equal(observations[0]?.outcome, "error");
    assert.equal(observations[0]?.scanId, null);
    assert.equal(observations[0]?.requestedResource, "https://aaronbux.com");
  } finally {
    globalThis.fetch = previousFetch;
    await client.close(); await server.close();
  }
});
