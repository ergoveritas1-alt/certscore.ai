import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCertScoreMcpServer } from "@certscore/mcp/server";
import { classifyHostedMcpClient, createHostedMcpTelemetry } from "./telemetry.js";

const secret = "hosted-mcp-telemetry-test-secret";

test("authenticated Claude discovery reaches tools/call and retains the same opaque journey", async () => {
  const bodies: Record<string, any>[] = [];
  const telemetry = createHostedMcpTelemetry({ baseUrl: "https://certscore.ai", secret, headers: {}, surface: "mcp_authenticated",
    authenticatedUserId: "00000000-0000-4000-8000-000000000001", authenticatedActorBinding: "test-owner", sessionId: () => "private-claude-session",
    clientInfoBody: { params: { clientInfo: { name: "claude", version: "1" } } },
    fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(null,{status:202}); }) as typeof fetch });
  const originalFetch = globalThis.fetch;
  let credentialObserved = false;
  globalThis.fetch = (async (_url, init) => {
    credentialObserved = new Headers(init?.headers).get("authorization") === "Bearer fixture-credential";
    return new Response(JSON.stringify({ type:"certscore_auth_check", authenticated:true,scopes:["scan:read"],expiresAt:null,
      diagnostics:{mode:"hosted_oauth",workspaceAccess:"active",createAllowedByScope:false,canRequestScanNow:false,quota:null,nextAction:"Read an existing scan."} }),{status:200,headers:{"content-type":"application/json"}});
  }) as typeof fetch;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createCertScoreMcpServer({ resolveApiKey: () => "fixture-credential", onToolInvocation: row => telemetry.observeToolInvocation(row) });
  const client = new Client({ name:"claude",version:"1" });
  try {
    await Promise.all([server.connect(serverTransport),client.connect(clientTransport)]);
    telemetry.observeActivation("mcp_initialized");
    assert.ok((await client.listTools()).tools.some(tool => tool.name === "certscore_get_connection_status"));
    telemetry.observeActivation("mcp_tools_listed");
    const result = await client.callTool({name:"certscore_get_connection_status",arguments:{}});
    assert.notEqual(result.isError,true,JSON.stringify(result));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(credentialObserved,true);
    assert.equal(bodies.filter(row => row.toolName).length,1);
    assert.equal(new Set(bodies.map(row => row.sessionId)).size,1);
    assert.match(bodies[0]!.sessionId,/^[a-f0-9]{24}$/);
    assert.ok(bodies.some(row => row.stage === "mcp_first_tool_invoked"));
    assert.ok(!JSON.stringify(bodies).includes("private-claude-session"));
    assert.ok(!JSON.stringify(bodies).includes("fixture-credential"));
  } finally { globalThis.fetch=originalFetch; await client.close(); await server.close(); }
});

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

  telemetry.observeToolInvocation({ ...observation(), requestId: "00000000-0000-4000-8000-000000000123" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(deliveries.length, 4);
  assert.equal(deliveries.filter(line => JSON.parse(line).requestId === "00000000-0000-4000-8000-000000000123").length, 2);
  assert.ok(deliveries.some((delivery) => /"event":"mcp\.telemetry_delivery_started"/.test(delivery)));
  const accepted = deliveries.filter(delivery => /"event":"mcp\.telemetry_delivery"/.test(delivery));
  assert.ok(accepted.length > 0);
  assert.ok(accepted.every((delivery) => /"outcome":"accepted"/.test(delivery)));
  assert.ok(deliveries.every(delivery => typeof JSON.parse(delivery).eventId === "string"));
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
      clientInfoBody: { params: { clientInfo: { name: "test client", version: "0.3.1" } } },
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
    assert.equal((events[index]?.requestDetails as Record<string, unknown>)?.clientVersion, "0.3.1");
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

test("Marketplace telemetry retains only validated agreement metadata and fails without leaking a key", async () => {
  const bodies: Record<string, unknown>[] = [];
  const failures: string[] = [];
  const telemetry = createHostedMcpTelemetry({
    baseUrl: "https://certscore.ai",
    clientInfoBody: { params: { clientInfo: { name: "private-marketplace-client", version: "1" } } },
    fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>); throw new Error("private-delivery-error"); }) as typeof fetch,
    headers: {},
    logger: { error: message => { failures.push(String(message)); } },
    marketplaceAttribution: { agreementId: "agmt-test", licenseArn: "arn:aws:license-manager::123456789012:license:l-test" },
    requesterBinding: "private-key-hash",
    requesterIp: "198.51.100.10",
    secret,
    sessionId: () => "private-session",
    surface: "mcp_marketplace_light",
  });
  telemetry.observeActivation("mcp_initialized");
  telemetry.observeToolInvocation({ ...observation(), targetHostname: "private.example" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bodies.length, 2, "one tool event is retried; activation is not retained");
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(bodies[0]?.marketplaceAgreementId, "agmt-test");
  assert.equal(bodies[0]?.marketplaceLicenseArn, "arn:aws:license-manager::123456789012:license:l-test");
  assert.equal(bodies[0]?.requestedResource, "scan_123");
  for (const field of ["requestDetails", "requesterIp", "requesterIpHash", "actorId", "sessionId", "targetHostname", "clientName"]) assert.equal(bodies[0]?.[field], null, field);
  assert.equal(failures.length, 1);
  for (const secretValue of ["private-delivery-error", "private-key-hash", "private-session", "private-marketplace-client", "private.example"]) {
    assert.equal(JSON.stringify(bodies).includes(secretValue), false);
    assert.equal(failures.join(" ").includes(secretValue), false);
  }
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

test("read 429 telemetry retains bounded limit details and honest correlation bases", async () => {
  const bodies: string[] = [];
  const telemetry = createHostedMcpTelemetry({
    baseUrl: "https://certscore.ai", headers: {}, requesterBinding: "anonymous:192.0.2.1",
    secret, sessionId: () => "session-per-request", surface: "mcp_light",
    fetch: (async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body)); return new Response(null, { status: 202 });
    }) as typeof fetch,
  });
  telemetry.observeTransportRateLimit({
    body: { params: { arguments: { scanId: "scan_123", detail: "full", maxBytes: 25000, secret: "must-not-retain" } } },
    responseSummary: { version: 1, captureBasis: "response_generated", templateVersion: "2026-09-11.1", kind: "protocol_error", isError: true, errorCode: "rate_limited", mcpCode: -32029, message: "Read limit reached.", recommendedNextAction: "Wait before retrying.", textOmitted: false, summaryTruncated: false },
    durationMs: 2, toolName: "certscore_get_scan_bundle", scanId: "scan_123",
    rateLimit: { kind: "mcp_read", scope: "callerTarget", windowId: "burst", limit: 120, used: 120, requested: 4, windowSeconds: 600, retryAfterSeconds: 25 },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const event = bodies.map(body => JSON.parse(body)).find(event => !event.eventType);
  assert.equal(event.requestDetails.response.summary.message, "Read limit reached.");
  assert.equal(event.requestDetails.response.bytes, null);
  assert.equal(event.transportOutcome, "http_429");
  assert.equal(event.quotaOutcome, "rate_limited");
  assert.deepEqual(event.requestDetails.arguments, { scanId: "scan_123", detail: "full", maxBytes: 25000 });
  assert.equal(event.requestDetails.argumentsOmitted, true);
  assert.equal(event.requestDetails.actorBasis, "requester_binding");
  assert.equal(event.requestDetails.sessionBasis, "mcp_session");
  assert.equal(event.requestDetails.rateLimit.retryAfterSeconds, 25);
  assert.equal(event.requestDetails.rateLimit.scope, "callerTarget");
  assert.doesNotMatch(JSON.stringify(event), /must-not-retain|session-per-request|anonymous:192/);
});

test("HTTP rate-limit telemetry preserves sanitized caller input, shared context, and initialization provenance", async () => {
  const bodies: Record<string, any>[] = [];
  const telemetry = createHostedMcpTelemetry({ baseUrl: "https://certscore.ai", secret, headers: {}, surface: "mcp_light", sessionId: () => "session_123",
    clientInfoBody: { params: { clientInfo: { name: "Example client", version: "1.2.3" }, protocolVersion: "2025-11-25", capabilities: { roots: { listChanged: true } } } },
    fetch: (async (_url: unknown, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return new Response(null,{status:202}); }) as typeof fetch });
  telemetry.observeTransportRateLimit({ body: { params: { arguments: { scanId: "scan_123", reason: "Vendor review", apiKey: "private-value",
    taskContext: { questionSummary: "Check tracking", questionSource: "user_wording", shareForImprovement: true } }, _meta: { "io.modelcontextprotocol/clientInfo": { name: "Per-call client", version: "2.0" } } } },
    toolName: "certscore_get_scan_status", durationMs: 2 });
  await new Promise(resolve=>setImmediate(resolve));
  const event = bodies.find(body=>body.eventType !== "activation")!;
  assert.equal(event.requestDetails.taskContext.questionSummary, "Check tracking");
  assert.equal(event.requestDetails.callerInput.questionStatus, "retained");
  assert.equal(event.requestDetails.callerInput.fields.find((field: any)=>field.path === "arguments.reason").value, "Vendor review");
  assert.equal(event.requestDetails.callerInput.fields.find((field: any)=>field.path === "request_meta.clientInfo.version").value, "2.0");
  assert.ok(event.requestDetails.callerInput.fields.some((field: any)=>field.path.startsWith("request_meta.client_initialization")));
  assert.ok(!JSON.stringify(bodies).includes("private-value"));
  assert.ok(Buffer.byteLength(JSON.stringify(event.requestDetails,null,1)) <= 4096);
});

test("expanded HTTP telemetry is opt-in and retains long supplied prompt text", async () => {
  const previous = process.env.MCP_EXPANDED_CALLER_INPUT_ENABLED;
  try {
    process.env.MCP_EXPANDED_CALLER_INPUT_ENABLED = "1";
    const bodies: Record<string, any>[] = [];
    const prompt = "Review privacy disclosures. ".repeat(100);
    const telemetry = createHostedMcpTelemetry({ baseUrl: "https://certscore.ai", secret, headers: {}, surface: "mcp_light", sessionId: () => "session_123",
      fetch: (async (_url: unknown, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return new Response(null, { status: 202 }); }) as typeof fetch });
    telemetry.observeTransportRateLimit({ body: { params: { arguments: { scanId: "scan_123", prompt } } }, toolName: "certscore_get_scan_status", durationMs: 2 });
    await new Promise(resolve => setImmediate(resolve));
    const details = bodies.find(body => body.eventType !== "activation")!.requestDetails;
    assert.equal(details.version, 2);
    assert.equal(details.callerInput.version, 2);
    assert.equal(details.callerInput.fields.find((field: any) => field.path === "arguments.prompt").value, prompt);
    assert.ok(Buffer.byteLength(JSON.stringify(details, null, 1)) <= 16384);
  } finally {
    if (previous === undefined) delete process.env.MCP_EXPANDED_CALLER_INPUT_ENABLED;
    else process.env.MCP_EXPANDED_CALLER_INPUT_ENABLED = previous;
  }
});

test('Light marks requester changes without replacing the initialized caller', async () => {
  const requests: string[]=[];
  const telemetry=createHostedMcpTelemetry({baseUrl:'https://certscore.ai',headers:{},secret,surface:'mcp_light',sessionId:()=> 'light-session',requesterBinding:'initial-binding',requesterIp:'192.0.2.1',fetch:(async (_input,init)=>{requests.push(String(init?.body));return new Response(null,{status:202});}) as typeof fetch});
  telemetry.observeToolInvocation(observation(),{requesterIp:'192.0.2.1'});
  telemetry.observeToolInvocation(observation(),{requesterIp:'192.0.2.2'});
  await new Promise(resolve=>setImmediate(resolve));
  const calls=requests.map(x=>JSON.parse(x)).filter(x=>x.toolName);
  assert.equal(calls.length,2);
  assert.equal(calls[0].requestDetails.requesterChanged,false);
  assert.equal(calls[1].requestDetails.requesterChanged,true);
  assert.equal(calls[0].actorId,calls[1].actorId);
  assert.notEqual(calls[0].requesterIp,calls[1].requesterIp);
});
