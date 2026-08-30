import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyHostedMcpClient, createHostedMcpTelemetry } from "./telemetry.js";

const secret = "hosted-mcp-telemetry-test-secret";

function requesterIpHashForTest(value: string) {
  return createHmac("sha256", secret)
    .update(`mcp-telemetry:v1:requester-ip:${value}`, "utf8")
    .digest("hex");
}

function observation(toolName = "certscore_get_scan_status") {
  return {
    durationMs: 42,
    errorCode: null,
    freshness: null,
    isCanary: false,
    outcome: "success" as const,
    quotaOutcome: "allowed" as const,
    requestedResource: "scan_123",
    requestedResourceType: "scan_id" as const,
    scanDecision: "not_applicable" as const,
    scanFrom: null,
    scanId: "scan_123",
    scanStatus: "completed",
    targetHostname: null,
    toolName,
    transportOutcome: "mcp_result" as const,
  };
}

test("hosted MCP client classification keeps verified and self-declared attribution distinct", () => {
  const verified = classifyHostedMcpClient({
    clientInfoBody: {}, headers: {}, requesterBinding: "provider-wide-binding",
    requesterNetwork: "anthropic", secret, surface: "mcp_anonymous",
  });
  assert.deepEqual(verified, {
    actorId: null,
    attributionConfidence: "inferred",
    attributionRulesetVersion: "2026-08-20.1",
    attributionSignals: ["anthropic_connector_network"],
    authClass: "anonymous",
    callerProduct: "claude",
    clientFamily: "anthropic_claude",
    clientName: null,
    executionChannel: "hosted_connector",
    installationOrigin: "unknown",
    source: "anthropic",
    sourceAttribution: "verified_network",
  });

  const claimed = classifyHostedMcpClient({
    clientInfoBody: { params: { clientInfo: { name: "ChatGPT", version: "1" } } },
    headers: { "openai-ephemeral-user-id": "opaque-user-value" },
    requesterBinding: "anonymous:198.51.100.10",
    requesterNetwork: "direct",
    secret,
    surface: "mcp_light",
  });
  assert.equal(claimed.source, "openai");
  assert.equal(claimed.sourceAttribution, "self_declared_header");
  assert.equal(claimed.clientFamily, "openai_chatgpt");
  assert.equal(claimed.clientName, "chatgpt");
  assert.equal(claimed.attributionConfidence, "inferred");
  assert.deepEqual(claimed.attributionSignals, ["declared_client_info", "openai_header_claim"]);
  assert.equal(claimed.installationOrigin, "unknown");
  assert.match(claimed.actorId ?? "", /^[a-f0-9]{24}$/);
  assert.equal(JSON.stringify(claimed).includes("opaque-user-value"), false);
});

test("authenticated telemetry accepts the canonical opaque OAuth actor ID", () => {
  const actorId = "0123456789abcdef01234567";
  const classified = classifyHostedMcpClient({
    authenticatedActorBinding: "legacy-binding",
    authenticatedActorId: actorId,
    headers: {},
    secret,
    surface: "mcp_authenticated"
  });
  assert.equal(classified.actorId, actorId);
  assert.equal(classified.authClass, "authenticated");
});

test("lifecycle correlation exposes only bounded client metadata and records accepted delivery", async () => {
  const deliveries: string[] = [];
  const telemetry = createHostedMcpTelemetry({
    baseUrl: "https://certscore.ai",
    clientInfoBody: { params: { clientInfo: { name: "Codex Desktop", version: "1" } } },
    fetch: (async () => new Response(null, { status: 202 })) as typeof fetch,
    headers: { "openai-conversation-id": "private-conversation-value" },
    logger: {
      error: () => {},
      log: (message?: unknown) => deliveries.push(String(message)),
    },
    secret,
    sessionId: () => "private-session-value",
    surface: "mcp_light",
  });

  const context = telemetry.observationContext();
  assert.equal(context.callerProduct, "codex");
  assert.equal(context.clientFamily, "openai_codex");
  assert.match(context.sessionCorrelationId ?? "", /^[a-f0-9]{24}$/);
  assert.equal(JSON.stringify(context).includes("private-conversation-value"), false);
  assert.equal(JSON.stringify(context).includes("private-session-value"), false);

  telemetry.observeToolInvocation(observation());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(deliveries.length, 2);
  assert.ok(deliveries.every((delivery) => /"event":"mcp\.telemetry_delivery"/.test(delivery)));
  assert.ok(deliveries.every((delivery) => /"outcome":"accepted"/.test(delivery)));
});

test("authenticated telemetry signs bounded MCP activation stages", async () => {
  const requests: string[] = [];
  const telemetry = createHostedMcpTelemetry({
    authenticatedActorId: "0123456789abcdef01234567",
    authenticatedOrganizationId: "00000000-0000-4000-8000-000000000002",
    authenticatedUserId: "00000000-0000-4000-8000-000000000003",
    baseUrl: "https://certscore.ai",
    clientInfoBody: { params: { clientInfo: { name: "Claude", version: "do-not-store" } } },
    fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(init?.body ?? ""));
      return new Response(null, { status: 202 });
    }) as typeof fetch,
    headers: {},
    secret,
    sessionId: () => null,
    surface: "mcp_authenticated"
  });
  telemetry.observeActivation("mcp_initialized");
  telemetry.observeActivation("mcp_tools_listed");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((body) => JSON.parse(body).stage), ["mcp_initialized", "mcp_tools_listed"]);
  for (const body of requests) {
    assert.equal(body.includes("do-not-store"), false);
    assert.equal(JSON.parse(body).eventType, "activation");
  }
});

test("authenticated activation telemetry keeps non-database subjects actor-only", async () => {
  const requests: string[] = [];
  const telemetry = createHostedMcpTelemetry({
    authenticatedActorId: "0123456789abcdef01234567",
    authenticatedOrganizationId: "00000000-0000-4000-8000-000000000002",
    authenticatedUserId: null,
    baseUrl: "https://certscore.ai",
    fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(init?.body ?? ""));
      return new Response(null, { status: 202 });
    }) as typeof fetch,
    headers: {},
    secret,
    sessionId: () => null,
    surface: "mcp_authenticated"
  });

  telemetry.observeActivation("mcp_initialized");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0] ?? "{}").userId, null);
});

test("all hosted MCP surfaces record initialization and tool discovery", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(source, /telemetry\.observeActivation\("mcp_initialized"\)/);
  assert.match(source, /session\.telemetry\?\.observeActivation\("mcp_tools_listed"\)/);
  assert.match(source, /jsonRpcMethod\(parsedBody\) === "tools\/list"/);
  assert.doesNotMatch(source, /!anonymous && !microsoft && res\.statusCode < 400 && transport\.sessionId/);
  assert.match(source, /authenticatedUserId = auth\.claims\.certscore\.userId \?\? null/);
  assert.doesNotMatch(source, /authenticatedUserId = auth\.claims\.certscore\.userId \?\? auth\.claims\.sub/);
});

test("hosted tool telemetry records first-tool and attempted scan-request activation once per session", async () => {
  const requests: string[] = [];
  const telemetry = createHostedMcpTelemetry({
    authenticatedActorId: "0123456789abcdef01234567",
    authenticatedOrganizationId: "00000000-0000-4000-8000-000000000002",
    authenticatedUserId: "00000000-0000-4000-8000-000000000003",
    baseUrl: "https://certscore.ai",
    fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(init?.body ?? ""));
      return new Response(null, { status: 202 });
    }) as typeof fetch,
    headers: {},
    secret,
    sessionId: () => null,
    surface: "mcp_authenticated"
  });
  const scanObservation = {
    ...observation("certscore_scan_site"),
    errorCode: "upstream_unavailable",
    outcome: "error" as const,
    requestedResource: "https://example.com",
    requestedResourceType: "url" as const,
    scanDecision: "unavailable" as const,
    scanId: null,
    scanStatus: "failed",
    targetHostname: "example.com"
  };
  telemetry.observeToolInvocation(scanObservation);
  telemetry.observeToolInvocation(scanObservation);
  await new Promise((resolve) => setImmediate(resolve));

  const activationStages = requests
    .map((body) => JSON.parse(body) as { eventType?: string; stage?: string })
    .filter((event) => event.eventType === "activation")
    .map((event) => event.stage);
  assert.deepEqual(activationStages, ["mcp_first_tool_invoked", "mcp_scan_requested"]);
  assert.equal(requests.length, 4);
});

test("hosted MCP client classification keeps Codex distinct from generic OpenAI client names", () => {
  const codex = classifyHostedMcpClient({
    clientInfoBody: { params: { clientInfo: { name: "OpenAI Codex CLI", version: "1" } } },
    headers: {}, requesterNetwork: "direct", secret, surface: "mcp_light",
  });
  const unknown = classifyHostedMcpClient({
    clientInfoBody: { params: { clientInfo: { name: "generic-mcp-bridge", version: "1" } } },
    headers: {}, requesterNetwork: "direct", secret, surface: "mcp_light",
  });

  assert.equal(codex.clientFamily, "openai_codex");
  assert.equal(codex.source, "openai");
  assert.equal(codex.sourceAttribution, "self_declared_client");
  assert.equal(codex.callerProduct, "codex");
  assert.equal(codex.attributionConfidence, "declared");
  assert.equal(codex.executionChannel, "desktop_cli");
  assert.equal(unknown.clientFamily, "other");
  assert.equal(unknown.clientName, "generic-mcp-bridge");
  assert.equal(unknown.sourceAttribution, "unknown");
  assert.equal(unknown.source, "unknown");
});

test("classification recognizes Gemini, Grok, and per-request MCP client metadata without claiming directory origin", () => {
  const gemini = classifyHostedMcpClient({
    clientInfoBody: { params: { _meta: { "io.modelcontextprotocol/clientInfo": { name: "Gemini CLI", version: "2" } } } },
    headers: {}, requesterNetwork: "direct", secret, surface: "mcp_light",
  });
  const grok = classifyHostedMcpClient({
    clientInfoBody: { params: { clientInfo: { name: "Grok xAI", version: "1" } } },
    headers: {}, requesterNetwork: "direct", secret, surface: "mcp_light",
  });

  assert.equal(gemini.source, "google");
  assert.equal(gemini.callerProduct, "gemini_cli");
  assert.equal(gemini.attributionConfidence, "declared");
  assert.equal(gemini.installationOrigin, "unknown");
  assert.equal(grok.source, "xai");
  assert.equal(grok.callerProduct, "grok");
  assert.equal(grok.installationOrigin, "unknown");
});

test("telemetry differentiates all hosted MCP entrypoints and signs minimized events", async () => {
  const requests: Array<{ body: string; headers: Headers }> = [];
  const fetchMock = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ body: String(init?.body ?? ""), headers: new Headers(init?.headers) });
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  for (const surface of ["mcp_light", "mcp_anonymous", "mcp_authenticated"] as const) {
    createHostedMcpTelemetry({
      authenticatedActorBinding: surface === "mcp_authenticated" ? "oauth:issuer:user" : null,
      baseUrl: "https://certscore.ai",
      clientInfoBody: { params: { clientInfo: { name: "test client", version: "do-not-store" } } },
      fetch: fetchMock,
      headers: { authorization: "Bearer do-not-store", "openai-conversation-id": "opaque-conversation" },
      requesterBinding: "anonymous:do-not-store",
      requesterIp: "198.51.100.10",
      requesterNetwork: "direct",
      secret,
      sessionId: () => "raw-session-do-not-store",
      surface,
    }).observeToolInvocation(observation());
  }
  await new Promise((resolve) => setImmediate(resolve));

  const activationEvents = requests
    .map((request) => JSON.parse(request.body) as Record<string, unknown>)
    .filter((event) => event.eventType === "activation");
  const toolRequests = requests.filter((request) => JSON.parse(request.body).eventType !== "activation");
  assert.equal(toolRequests.length, 3);
  assert.equal(activationEvents.length, 3);
  assert.deepEqual(activationEvents.map((event) => event.surface), ["mcp_light", "mcp_anonymous", "mcp_authenticated"]);
  assert.ok(activationEvents.every((event) => event.userId === null));
  const events = toolRequests.map((request) => JSON.parse(request.body) as Record<string, unknown>);
  assert.deepEqual(events.map((event) => event.endpoint), ["/mcp/light", "/mcp/anonymous", "/mcp"]);
  assert.deepEqual(events.map((event) => event.surface), ["mcp_light", "mcp_anonymous", "mcp_authenticated"]);
  for (const [index, request] of toolRequests.entries()) {
    const timestamp = request.headers.get("x-certscore-mcp-telemetry-timestamp") ?? "";
    const expected = createHmac("sha256", secret).update(`${timestamp}.${request.body}`).digest("base64url");
    assert.equal(request.headers.get("x-certscore-mcp-telemetry-proof"), expected);
    assert.equal(request.body.includes("Bearer"), false);
    assert.equal(request.body.includes("do-not-store"), false);
    assert.match(String(events[index]?.sessionId), /^[a-f0-9]{24}$/);
    assert.equal(events[index]?.requesterIp, "198.51.100.10");
    assert.match(String(events[index]?.requesterIpHash), /^[a-f0-9]{64}$/);
    assert.equal(events[index]?.requestedResource, "scan_123");
    assert.equal(events[index]?.clientName, "test client");
    assert.equal(events[index]?.attributionConfidence, "inferred");
    assert.equal(events[index]?.installationOrigin, "unknown");
  }
});

test("tool-call request context overrides session initialization IP attribution", async () => {
  const requests: string[] = [];
  const telemetry = createHostedMcpTelemetry({
    baseUrl: "https://certscore.ai",
    clientInfoBody: { params: { clientInfo: { name: "request-context-client", version: "1" } } },
    fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(init?.body ?? ""));
      return new Response(null, { status: 202 });
    }) as typeof fetch,
    headers: {},
    requesterIp: "198.51.100.10",
    requesterNetwork: "direct",
    secret,
    sessionId: () => "session_123",
    surface: "mcp_light",
  });

  telemetry.observeToolInvocation(observation(), {
    requesterIp: "203.0.113.44",
    requesterNetwork: "anthropic",
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 2);
  const event = requests
    .map((body) => JSON.parse(body) as Record<string, unknown>)
    .find((candidate) => candidate.eventType !== "activation") ?? {};
  assert.equal(event.requesterIp, "203.0.113.44");
  assert.equal(event.requesterNetwork, "anthropic");
  assert.notEqual(event.requesterIpHash, requesterIpHashForTest("198.51.100.10"));
  assert.equal(event.requesterIpHash, requesterIpHashForTest("203.0.113.44"));
});

test("telemetry delivery failure is contained and transport quota events are recorded", async () => {
  const failures: string[] = [];
  let attempts = 0;
  const telemetry = createHostedMcpTelemetry({
    baseUrl: "https://certscore.ai",
    fetch: (() => { attempts += 1; throw new Error("database unavailable"); }) as typeof fetch,
    headers: {},
    logger: { error: (message?: unknown) => { failures.push(String(message)); } },
    requesterBinding: "anonymous:203.0.113.1",
    requesterNetwork: "direct",
    secret,
    sessionId: () => "session_123",
    surface: "mcp_light",
  });
  assert.doesNotThrow(() => telemetry.observeTransportRateLimit({
    body: { params: { arguments: { scanId: "scan_123" } } },
    durationMs: 3,
    scanId: "scan_123",
    toolName: "certscore_get_scan_bundle",
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 4);
  assert.equal(failures.length, 2);
  assert.ok(failures.every((failure) => /mcp\.telemetry_write_failed/.test(failure)));
  assert.ok(failures.every((failure) => /"attempts":2/.test(failure)));
  assert.ok(failures.every((failure) => !failure.includes("database unavailable")));
});

test("telemetry retries the same idempotent event before reporting a delivery failure", async () => {
  const bodies: string[] = [];
  const failures: string[] = [];
  const telemetry = createHostedMcpTelemetry({
    baseUrl: "https://certscore.ai",
    fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      if (bodies.length === 1) {
        const error = new Error("acknowledgement deadline exceeded");
        error.name = "TimeoutError";
        throw error;
      }
      return new Response(null, { status: 202 });
    }) as typeof fetch,
    headers: {},
    logger: { error: (message?: unknown) => { failures.push(String(message)); } },
    secret,
    sessionId: () => "session_123",
    surface: "mcp_light",
  });

  telemetry.observeToolInvocation(observation());
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(bodies.length, 3);
  assert.equal(bodies[0], bodies[2]);
  assert.equal(JSON.parse(bodies[1] ?? "{}").eventType, "activation");
  assert.equal(failures.length, 0);
});

test("invalid projected metadata is rejected without throwing or sending", async () => {
  let fetched = false;
  const failures: string[] = [];
  const telemetry = createHostedMcpTelemetry({
    baseUrl: "https://certscore.ai",
    fetch: (async () => { fetched = true; return new Response(null, { status: 202 }); }) as typeof fetch,
    headers: {},
    logger: { error: (message?: unknown) => { failures.push(String(message)); } },
    secret,
    sessionId: () => null,
    surface: "mcp_authenticated",
  });
  assert.doesNotThrow(() => telemetry.observeToolInvocation({
    ...observation(),
    durationMs: Number.NaN,
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetched, false);
  assert.equal(failures.length, 1);
  assert.match(failures[0] ?? "", /mcp\.telemetry_event_rejected/);
});
