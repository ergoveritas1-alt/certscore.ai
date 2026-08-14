import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { signCertScoreAccessToken } from "@certscore/mcp-auth";

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(url: string, child: ChildProcess) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`MCP HTTP test server exited with ${child.exitCode}.`);
    }
    try {
      const response = await fetch(`${url}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for MCP HTTP test server.");
}

type McpRequestObservation = Record<string, unknown> & {
  event: "mcp_http.request_observed";
};

function mcpRequestObservations(diagnostics: string) {
  const observations: McpRequestObservation[] = [];
  for (const line of diagnostics.split(/\r?\n/)) {
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      if (value.event === "mcp_http.request_observed") {
        observations.push(value as McpRequestObservation);
      }
    } catch {}
  }
  return observations;
}

async function waitForMcpObservation(
  diagnostics: () => string,
  predicate: (event: McpRequestObservation) => boolean
) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const event = mcpRequestObservations(diagnostics()).find(predicate);
    if (event) return event;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for MCP request observation.\n${diagnostics()}`);
}

test("expired Light sessions retain the existing invalid-session behavior", async () => {
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const requesterIp = "198.51.100.70";
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      CERTSCORE_BASE_URL: "https://certscore.ai",
      CERTSCORE_OAUTH_JWT_SECRET: "mcp-expired-session-test-secret",
      MCP_PUBLIC_URL: origin,
      OAUTH_ISSUER: "https://certscore.ai",
      SESSION_TTL_SECONDS: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let diagnostics = "";
  child.stdout?.on("data", (chunk) => { diagnostics += String(chunk); });
  child.stderr?.on("data", (chunk) => { diagnostics += String(chunk); });

  try {
    await waitForHealth(origin, child);
    const initialized = await fetch(`${origin}/mcp/light`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-forwarded-for": requesterIp
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "certscore-expired-session-test", version: "0.1.0" }
        }
      })
    });
    assert.equal(initialized.status, 200);
    const sessionId = initialized.headers.get("mcp-session-id");
    assert.ok(sessionId);
    await initialized.text();
    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const expired = await fetch(`${origin}/mcp/light`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-protocol-version": "2025-11-25",
        "mcp-session-id": sessionId,
        "x-forwarded-for": "198.51.100.71"
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
    });
    assert.equal(expired.status, 404);
    assert.deepEqual(await expired.json(), {
      error: "invalid_session",
      error_description: "MCP session is missing or expired."
    });
    const observation = await waitForMcpObservation(
      () => diagnostics,
      (event) => event.surface === "mcp_light" && event.reasonCode === "invalid_session_unknown"
    );
    assert.equal(observation.sessionFound, false);
    assert.equal(diagnostics.includes(sessionId), false);
    assert.equal(diagnostics.includes(requesterIp), false);
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", () => resolve());
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 3_000).unref();
    });
  }
});

test("Streamable HTTP runtime initializes, lists tools, enforces auth, CORS, and sessions", async () => {
  const port = await unusedPort();
  const apiPort = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const secret = "mcp-http-integration-secret-long-enough";
  let forwardedClientIp: string | undefined;
  let apiAuthorization: string | undefined;
  let anonymousSurface: string | undefined;
  let anonymousRequesterIp: string | undefined;
  let anonymousRequesterProof: string | undefined;
  let authenticatedInternalOperation: string | undefined;
  let authenticatedInternalProof: string | undefined;
  let authenticatedInternalTimestamp: string | undefined;
  const apiServer = createHttpServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", apiOrigin);
    if (request.method === "POST" && request.url === "/api/v2/scans") {
      forwardedClientIp = request.headers["x-forwarded-for"]?.toString();
      apiAuthorization = request.headers.authorization;
      anonymousSurface = request.headers["x-certscore-anonymous-surface"]?.toString();
      anonymousRequesterIp = request.headers["x-certscore-anonymous-requester-ip"]?.toString();
      anonymousRequesterProof = request.headers["x-certscore-anonymous-requester-proof"]?.toString();
      response.writeHead(202, { "content-type": "application/json" });
      response.end(JSON.stringify({
        type: "certscore_scan_job",
        jobId: "anonymous-mcp-job",
        scanId: "00000000-0000-4000-8000-000000000123",
        domain: "example.com",
        status: "queued"
      }));
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/api/v2/scans/00000000-0000-4000-8000-000000000123") {
      if (request.headers.authorization) {
        authenticatedInternalOperation = request.headers["x-certscore-mcp-internal-operation"]?.toString();
        authenticatedInternalProof = request.headers["x-certscore-mcp-internal-proof"]?.toString();
        authenticatedInternalTimestamp = request.headers["x-certscore-mcp-internal-timestamp"]?.toString();
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        type: "certscore_scan",
        scanId: "00000000-0000-4000-8000-000000000123",
        domain: "caltech.edu",
        url: "https://caltech.edu/",
        status: "completed",
        score: 46,
        coverage: { status: "partial" }
      }));
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/api/v1/pulse" && requestUrl.searchParams.get("scanId")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        type: "certscore_pulse_summary",
        scanId: "00000000-0000-4000-8000-000000000123",
        domain: "caltech.edu",
        summary: { score: 46 },
        findings: [],
        topFindings: [],
        coverage: { limitations: ["Automated public-web scan only."] },
        disclaimer: "Automated public-web observations for review."
      }));
      return;
    }
    if (request.method === "GET" && requestUrl.pathname.endsWith("/findings")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        type: "certscore_finding_list",
        scanId: "00000000-0000-4000-8000-000000000123",
        findings: [{
          type: "certscore_finding",
          id: "consent_reject_not_observed",
          scanId: "00000000-0000-4000-8000-000000000123",
          label: "First-layer reject control not observed",
          criticality: "high",
          confidence: "good",
          plainEnglish: "The canonical consent assessment did not establish a same-layer reject control.",
          evidence: { basis: "public_report_projection", summary: "Retained first-layer controls were assessed.", exampleCount: 1, examplesShown: 1, hasTimingAnchor: false, hasVendorAnchor: true },
          reviewLenses: ["GDPR / ePrivacy"],
          disclaimer: "Automated public-web observations for review."
        }]
      }));
      return;
    }
    if (request.method === "GET" && requestUrl.pathname.endsWith("/pre-consent-cookies-trackers")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        type: "certscore_pre_consent_cookies_trackers",
        scanId: "00000000-0000-4000-8000-000000000123",
        domain: "caltech.edu",
        summary: { rowCount: 1, trackerCount: 1, cookieCount: 1, requestCount: 1 },
        rows: [{
          id: "tracker:google-analytics",
          kind: "tracker",
          name: "Google Analytics",
          vendor: "Google",
          purpose: "Audience measurement",
          category: "Analytics",
          confidence: "high",
          party: "third_party",
          priority: "high",
          domains: ["google-analytics.com"],
          cookieDetails: [{ name: "_ga", domain: ".caltech.edu" }],
          firstObservedAtMs: 928,
          phase: "pre_consent",
          observedBeforeConsent: true,
          evidenceBasis: "public_report_projection"
        }]
      }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise<void>((resolve, reject) => {
    apiServer.once("error", reject);
    apiServer.listen(apiPort, "127.0.0.1", resolve);
  });
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      CERTSCORE_BASE_URL: apiOrigin,
      CERTSCORE_OAUTH_JWT_SECRET: secret,
      MCP_PUBLIC_URL: origin,
      OAUTH_ISSUER: "https://certscore.ai",
      CORS_ALLOWED_ORIGINS: "https://allowed.example"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let diagnostics = "";
  child.stdout?.on("data", (chunk) => { diagnostics += String(chunk); });
  child.stderr?.on("data", (chunk) => { diagnostics += String(chunk); });

  try {
    await waitForHealth(origin, child);
    const health = await fetch(`${origin}/healthz`).then((response) => response.json());
    assert.equal(health.anonymousEndpoint, `${origin}/mcp/anonymous`);
    assert.equal(health.lightEndpoint, `${origin}/mcp/light`);
    const rootMetadata = await fetch(`${origin}/.well-known/oauth-protected-resource`);
    assert.equal(rootMetadata.status, 404);
    const pathMetadata = await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`).then((response) => response.json());
    assert.deepEqual(pathMetadata.authorization_servers, ["https://certscore.ai"]);
    assert.equal(pathMetadata.resource, `${origin}/mcp`);
    const lightMetadata = await fetch(`${origin}/.well-known/oauth-protected-resource/mcp/light`);
    assert.equal(lightMetadata.status, 404);
    assert.equal(lightMetadata.headers.get("www-authenticate"), null);

    const unauthenticated = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })
    });
    assert.equal(unauthenticated.status, 401);
    assert.match(unauthenticated.headers.get("www-authenticate") ?? "", /oauth-protected-resource\/mcp/);

    const token = signCertScoreAccessToken({
      audience: origin,
      clientId: "integration_client",
      issuer: "https://certscore.ai",
      jwtSecret: secret,
      organizationId: null,
      scopes: ["scan:read", "mcp"],
      subject: "integration_user",
      userId: "integration_user"
    });
    const forbiddenOrigin = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        origin: "https://forbidden.example"
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })
    });
    assert.equal(forbiddenOrigin.status, 403);

    const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } }
    });
    const client = new Client({ name: "certscore-http-integration", version: "0.1.0" });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "certscore_get_scan"));
    assert.ok(tools.tools.some((tool) => tool.name === "certscore_scan_site"));
    const authenticatedBundle = await client.callTool({
      name: "certscore_get_scan_bundle",
      arguments: { scanId: "00000000-0000-4000-8000-000000000123" }
    });
    assert.equal(authenticatedBundle.isError, undefined, JSON.stringify(authenticatedBundle));
    const authenticatedContent = (authenticatedBundle as { content?: Array<{ type: string; text?: string }> }).content ?? [];
    const authenticatedText = authenticatedContent[0]?.type === "text" ? authenticatedContent[0].text ?? "" : "";
    assert.match(authenticatedText, /First-layer reject control not observed/);
    assert.match(authenticatedText, /Google Analytics/);
    assert.match(authenticatedText, /cookies=_ga/);
    assert.equal(authenticatedInternalOperation, "scan_bundle");
    assert.match(authenticatedInternalTimestamp ?? "", /^\d+$/);
    assert.match(authenticatedInternalProof ?? "", /^[A-Za-z0-9_-]+$/);
    await client.close();

    const anonymousTransport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp/anonymous`), {
      requestInit: { headers: {
        "cf-connecting-ip": "192.0.2.90",
        "x-forwarded-for": "192.0.2.91, 203.0.113.44",
        "x-real-ip": "192.0.2.92"
      } }
    });
    const anonymousClient = new Client({ name: "certscore-anonymous-http-integration", version: "0.1.0" });
    await anonymousClient.connect(anonymousTransport);
    const anonymousTools = await anonymousClient.listTools();
    assert.ok(anonymousTools.tools.some((tool) => tool.name === "certscore_scan_site"));
    const created = await anonymousClient.callTool({ name: "certscore_scan_site", arguments: { url: "https://example.com", waitForCompletion: false } });
    assert.equal(created.isError, undefined);
    assert.match(JSON.stringify(created), /anonymous-mcp-job/);
    assert.equal(forwardedClientIp, "203.0.113.44");
    assert.equal(anonymousRequesterIp, "203.0.113.44");
    assert.match(anonymousRequesterProof ?? "", /^[A-Za-z0-9_-]+$/);
    assert.equal(anonymousSurface, "mcp_anonymous");
    assert.equal(apiAuthorization, undefined);
    await anonymousClient.close();
    const anonymousInitializeObservation = await waitForMcpObservation(
      () => diagnostics,
      (event) => event.surface === "mcp_anonymous" && event.jsonRpcMethod === "initialize"
    );
    assert.equal(anonymousInitializeObservation.route, "/mcp/anonymous");
    assert.equal(anonymousInitializeObservation.finalHttpStatus, 200);

    const observedRequesterIp = "198.51.100.60";
    const changedRequesterIp = "198.51.100.61";
    const secondChangedRequesterIp = "198.51.100.62";
    const getRequesterIp = "198.51.100.63";
    const toolRequesterIp = "198.51.100.64";
    const readRequesterIp = "198.51.100.65";
    const independentReadRequesterIp = "198.51.100.66";
    const observedProtocolVersion = "2025-11-25";
    const observedInitialize = await fetch(`${origin}/mcp/light`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-forwarded-for": observedRequesterIp
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7001,
        method: "initialize",
        params: {
          protocolVersion: observedProtocolVersion,
          capabilities: {},
          clientInfo: { name: "certscore-observability-test", version: "0.1.0" }
        }
      })
    });
    assert.equal(observedInitialize.status, 200);
    assert.match(observedInitialize.headers.get("content-type") ?? "", /^text\/event-stream/);
    const observedSessionId = observedInitialize.headers.get("mcp-session-id");
    assert.ok(observedSessionId);
    await observedInitialize.text();

    const observedInitialized = await fetch(`${origin}/mcp/light`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": observedProtocolVersion,
        "mcp-session-id": observedSessionId,
        "x-forwarded-for": changedRequesterIp
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
    });
    assert.equal(observedInitialized.status, 202);
    assert.equal(await observedInitialized.text(), "");

    const observedToolsList = await fetch(`${origin}/mcp/light`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": observedProtocolVersion,
        "mcp-session-id": observedSessionId,
        "x-forwarded-for": secondChangedRequesterIp
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7002, method: "tools/list", params: {} })
    });
    assert.equal(observedToolsList.status, 200);
    assert.match(observedToolsList.headers.get("content-type") ?? "", /^text\/event-stream/);
    await observedToolsList.text();

    const observedGet = await fetch(`${origin}/mcp/light`, {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        "mcp-protocol-version": observedProtocolVersion,
        "mcp-session-id": observedSessionId,
        "x-forwarded-for": getRequesterIp
      }
    });
    assert.equal(observedGet.status, 200);
    assert.match(observedGet.headers.get("content-type") ?? "", /^text\/event-stream/);
    await observedGet.body?.cancel();

    const currentRequesterScan = await fetch(`${origin}/mcp/light`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": observedProtocolVersion,
        "mcp-session-id": observedSessionId,
        "x-forwarded-for": toolRequesterIp
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7003,
        method: "tools/call",
        params: {
          name: "certscore_scan_site",
          arguments: { url: "https://example.com", waitForCompletion: false }
        }
      })
    });
    assert.equal(currentRequesterScan.status, 200);
    await currentRequesterScan.text();
    assert.equal(forwardedClientIp, toolRequesterIp);
    assert.equal(anonymousRequesterIp, toolRequesterIp);
    assert.equal(anonymousSurface, "mcp_light");

    for (let index = 0; index < 30; index += 1) {
      const currentRequesterRead: Response = await fetch(`${origin}/mcp/light`, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": observedProtocolVersion,
          "mcp-session-id": observedSessionId,
          "x-forwarded-for": readRequesterIp
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 7100 + index,
          method: "tools/call",
          params: {
            name: "certscore_get_scan_bundle",
            arguments: { scanId: "00000000-0000-4000-8000-000000000123" }
          }
        })
      });
      assert.equal(currentRequesterRead.status, 200);
      await currentRequesterRead.text();
    }
    const exhaustedCurrentRequesterRead = await fetch(`${origin}/mcp/light`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": observedProtocolVersion,
        "mcp-session-id": observedSessionId,
        "x-forwarded-for": readRequesterIp
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7130,
        method: "tools/call",
        params: {
          name: "certscore_get_scan_bundle",
          arguments: { scanId: "00000000-0000-4000-8000-000000000123" }
        }
      })
    });
    assert.equal(exhaustedCurrentRequesterRead.status, 429);
    await exhaustedCurrentRequesterRead.text();

    const independentCurrentRequesterRead = await fetch(`${origin}/mcp/light`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": observedProtocolVersion,
        "mcp-session-id": observedSessionId,
        "x-forwarded-for": independentReadRequesterIp
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7131,
        method: "tools/call",
        params: {
          name: "certscore_get_scan_bundle",
          arguments: { scanId: "00000000-0000-4000-8000-000000000123" }
        }
      })
    });
    assert.equal(independentCurrentRequesterRead.status, 200);
    await independentCurrentRequesterRead.text();

    const unknownLightSession = await fetch(`${origin}/mcp/light`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-session-id": "unknown-light-session",
        "x-forwarded-for": changedRequesterIp
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7132, method: "tools/list", params: {} })
    });
    assert.equal(unknownLightSession.status, 404);
    assert.deepEqual(await unknownLightSession.json(), {
      error: "invalid_session",
      error_description: "MCP session is missing or expired."
    });

    const missingLightSession = await fetch(`${origin}/mcp/light`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": changedRequesterIp
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7133, method: "tools/list", params: {} })
    });
    assert.equal(missingLightSession.status, 400);
    assert.deepEqual(await missingLightSession.json(), {
      error: "invalid_session",
      error_description: "MCP session is missing or expired."
    });

    const anonymousMismatchInitialize = await fetch(`${origin}/mcp/anonymous`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-forwarded-for": observedRequesterIp
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7200,
        method: "initialize",
        params: {
          protocolVersion: observedProtocolVersion,
          capabilities: {},
          clientInfo: { name: "certscore-mismatch-test", version: "0.1.0" }
        }
      })
    });
    assert.equal(anonymousMismatchInitialize.status, 200);
    const anonymousMismatchSessionId = anonymousMismatchInitialize.headers.get("mcp-session-id");
    assert.ok(anonymousMismatchSessionId);
    await anonymousMismatchInitialize.text();

    const anonymousMismatchedToolsList = await fetch(`${origin}/mcp/anonymous`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": observedProtocolVersion,
        "mcp-session-id": anonymousMismatchSessionId,
        "x-forwarded-for": changedRequesterIp
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7201, method: "tools/list", params: {} })
    });
    assert.equal(anonymousMismatchedToolsList.status, 401);
    assert.deepEqual(await anonymousMismatchedToolsList.json(), {
      error: "session_requester_mismatch",
      error_description: "The MCP session belongs to a different anonymous requester."
    });

    const mismatchObservation = await waitForMcpObservation(
      () => diagnostics,
      (event) => event.surface === "mcp_anonymous" && event.reasonCode === "session_requester_mismatch"
    );
    const lightObservations = mcpRequestObservations(diagnostics).filter((event) => event.surface === "mcp_light");
    const initializeObservation = lightObservations.find((event) => event.jsonRpcMethod === "initialize");
    const initializedObservation = lightObservations.find((event) => event.jsonRpcMethod === "notifications/initialized");
    const toolsListObservation = lightObservations.find((event) => event.jsonRpcMethod === "tools/list" && event.finalHttpStatus === 200);
    const getObservation = lightObservations.find((event) => event.httpMethod === "GET" && event.finalHttpStatus === 200);
    const unknownSessionObservation = lightObservations.find((event) => event.reasonCode === "invalid_session_unknown");
    const missingSessionObservation = lightObservations.find((event) => event.reasonCode === "invalid_session_missing");
    assert.ok(initializeObservation);
    assert.ok(initializedObservation);
    assert.ok(toolsListObservation);
    assert.ok(getObservation);
    assert.ok(unknownSessionObservation);
    assert.ok(missingSessionObservation);
    assert.deepEqual({
      route: initializeObservation.route,
      surface: initializeObservation.surface,
      httpMethod: initializeObservation.httpMethod,
      finalHttpStatus: initializeObservation.finalHttpStatus,
      jsonRpcMethod: initializeObservation.jsonRpcMethod,
      requestedMcpProtocolVersion: initializeObservation.requestedMcpProtocolVersion,
      negotiatedMcpProtocolVersion: initializeObservation.negotiatedMcpProtocolVersion,
      sessionHeaderSupplied: initializeObservation.sessionHeaderSupplied,
      sessionFound: initializeObservation.sessionFound,
      requesterSessionIdentityMatched: initializeObservation.requesterSessionIdentityMatched,
      responseContentType: initializeObservation.responseContentType,
      reasonCode: initializeObservation.reasonCode
    }, {
      route: "/mcp/light",
      surface: "mcp_light",
      httpMethod: "POST",
      finalHttpStatus: 200,
      jsonRpcMethod: "initialize",
      requestedMcpProtocolVersion: observedProtocolVersion,
      negotiatedMcpProtocolVersion: observedProtocolVersion,
      sessionHeaderSupplied: false,
      sessionFound: false,
      requesterSessionIdentityMatched: true,
      responseContentType: "text/event-stream",
      reasonCode: null
    });
    assert.match(String(initializeObservation.timestamp), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(initializedObservation.finalHttpStatus, 202);
    assert.equal(initializedObservation.mcpProtocolVersionHeader, observedProtocolVersion);
    assert.equal(initializedObservation.sessionHeaderSupplied, true);
    assert.equal(initializedObservation.sessionFound, true);
    assert.equal(initializedObservation.requesterSessionIdentityMatched, false);
    assert.equal(initializedObservation.reasonCode, "session_requester_changed_allowed");
    assert.equal(toolsListObservation.finalHttpStatus, 200);
    assert.equal(toolsListObservation.mcpProtocolVersionHeader, observedProtocolVersion);
    assert.equal(toolsListObservation.requesterSessionIdentityMatched, false);
    assert.equal(toolsListObservation.responseContentType, "text/event-stream");
    assert.equal(toolsListObservation.reasonCode, "session_requester_changed_allowed");
    assert.equal(getObservation.requesterSessionIdentityMatched, false);
    assert.equal(getObservation.reasonCode, "session_requester_changed_allowed");
    assert.equal(unknownSessionObservation.finalHttpStatus, 404);
    assert.equal(missingSessionObservation.finalHttpStatus, 400);
    assert.equal(mismatchObservation.finalHttpStatus, 401);
    assert.equal(mismatchObservation.sessionHeaderSupplied, true);
    assert.equal(mismatchObservation.sessionFound, true);
    assert.equal(mismatchObservation.requesterSessionIdentityMatched, false);
    assert.equal(mismatchObservation.reasonCode, "session_requester_mismatch");
    assert.match(String(initializeObservation.requesterIdentityHash), /^[a-f0-9]{12}$/);
    assert.equal(initializeObservation.requesterIdentityHash, initializedObservation.sessionIdentityHash);
    assert.equal(initializeObservation.requesterIdentityHash, toolsListObservation.sessionIdentityHash);
    assert.equal(initializeObservation.requesterIdentityHash, getObservation.sessionIdentityHash);
    assert.notEqual(initializeObservation.requesterIdentityHash, initializedObservation.requesterIdentityHash);
    assert.notEqual(initializeObservation.requesterIdentityHash, toolsListObservation.requesterIdentityHash);
    assert.notEqual(initializeObservation.requesterIdentityHash, getObservation.requesterIdentityHash);
    assert.equal(initializeObservation.requesterIdentityHash, mismatchObservation.sessionIdentityHash);
    assert.notEqual(mismatchObservation.requesterIdentityHash, mismatchObservation.sessionIdentityHash);
    for (const event of lightObservations) {
      assert.equal("sessionId" in event, false);
      assert.equal("ip" in event, false);
      assert.equal("requestBody" in event, false);
      assert.equal("authorization" in event, false);
    }
    assert.equal(diagnostics.includes(observedSessionId), false);
    assert.equal(diagnostics.includes(observedRequesterIp), false);
    assert.equal(diagnostics.includes(changedRequesterIp), false);
    assert.equal(diagnostics.includes(secondChangedRequesterIp), false);
    assert.equal(diagnostics.includes(getRequesterIp), false);
    assert.equal(diagnostics.includes(toolRequesterIp), false);
    assert.equal(diagnostics.includes(readRequesterIp), false);
    assert.equal(diagnostics.includes(independentReadRequesterIp), false);

    const lightTransport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp/light`), {
      requestInit: { headers: { "x-forwarded-for": "160.79.104.9" } }
    });
    const lightClient = new Client({ name: "certscore-light-http-integration", version: "0.1.0" });
    await lightClient.connect(lightTransport);
    const lightTools = await lightClient.listTools();
    assert.deepEqual(lightTools.tools.map((tool) => tool.name).sort(), ["certscore_get_scan_bundle", "certscore_get_scan_status", "certscore_scan_site"]);
    const lightScanTool = lightTools.tools.find((tool) => tool.name === "certscore_scan_site");
    assert.match(lightScanTool?.description ?? "", /scan or check a public website for observable privacy and consent signals/);
    assert.match(lightScanTool?.description ?? "", /cookies or browser storage, third-party or pre-consent tracking/);
    assert.match(lightScanTool?.description ?? "", /GDPR\/ePrivacy or applicable CCPA\/CPRA review signals/);
    assert.match(lightScanTool?.description ?? "", /accessibility or transport-security signals where available/);
    assert.match(lightScanTool?.description ?? "", /Starts or reuses a public-web scan and waits up to 45 seconds by default/);
    assert.deepEqual(lightScanTool?.annotations, {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    });
    assert.deepEqual(lightTools.tools.find((tool) => tool.name === "certscore_get_scan_status")?.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    assert.deepEqual(lightTools.tools.find((tool) => tool.name === "certscore_get_scan_bundle")?.annotations, {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    });
    const invalidLightScan = await lightClient.callTool({ name: "certscore_scan_site", arguments: {} });
    assert.equal(invalidLightScan.isError, true);
    assert.equal((invalidLightScan.structuredContent as { type?: string } | undefined)?.type, "certscore_tool_error");
    assert.equal(((invalidLightScan.structuredContent as { error?: { field?: string } } | undefined)?.error)?.field, "url");
    const lightCreated = await lightClient.callTool({ name: "certscore_scan_site", arguments: { url: "https://example.com", waitForCompletion: false } });
    assert.equal(lightCreated.isError, undefined);
    assert.equal(anonymousSurface, "mcp_light");
    assert.equal(anonymousRequesterIp, "160.79.104.9");

    const completedBundle = await lightClient.callTool({
      name: "certscore_get_scan_bundle",
      arguments: { scanId: "00000000-0000-4000-8000-000000000123" }
    });
    assert.equal(completedBundle.isError, undefined, JSON.stringify(completedBundle));
    assert.equal((completedBundle.structuredContent as { scoreLabel?: string })?.scoreLabel, "CertScore score");
    const bundleContent = (completedBundle as { content?: Array<{ type: string; text?: string }> }).content ?? [];
    const bundleText = bundleContent[0]?.type === "text" ? bundleContent[0].text ?? "" : "";
    assert.match(bundleText, /Full report: https:\/\/certscore\.ai\/scan\/00000000-0000-4000-8000-000000000123/);
    assert.match(bundleText, /First-layer reject control not observed/);
    assert.match(bundleText, /Google Analytics/);
    assert.match(bundleText, /cookies=_ga/);
    assert.match(bundleText, /not legal advice, certification, or a compliance determination/i);

    for (let index = 0; index < 29; index += 1) {
      const result = await lightClient.callTool({
        name: "certscore_get_scan_bundle",
        arguments: { scanId: "00000000-0000-4000-8000-000000000123" }
      });
      assert.equal(result.isError, undefined);
    }
    assert.ok(lightTransport.sessionId);
    const throttled = await fetch(`${origin}/mcp/light`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-session-id": lightTransport.sessionId,
        "x-forwarded-for": "160.79.104.9"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 9001,
        method: "tools/call",
        params: { name: "certscore_get_scan_bundle", arguments: { scanId: "00000000-0000-4000-8000-000000000123" } }
      })
    });
    assert.equal(throttled.status, 429);
    const retryAfter = Number(throttled.headers.get("retry-after"));
    assert.ok(retryAfter > 0 && retryAfter <= 600);
    const throttledBody = await throttled.json() as any;
    assert.equal(throttledBody.error.code, -32029);
    assert.equal(throttledBody.error.data.retryAfterSeconds, retryAfter);
    assert.equal(throttledBody.error.data.scope, "callerTarget");
    assert.match(throttledBody.error.message, new RegExp(`Retry after ${retryAfter} seconds`));
    assert.match(throttledBody.error.message, /120 terminal-read units per 10-minute rolling window/i);
    assert.match(throttledBody.error.message, /up to 30 bundle reads/i);
    assert.match(throttledBody.error.message, /login\?mode=create_account/);
    assert.match(throttledBody.error.message, /does not automatically change the anonymous Light MCP limit/i);
    assert.match(throttledBody.error.data.recommendedNextAction, /one bounded retrieval/);
    assert.equal(throttledBody.error.data.limitDescription, "120 terminal-read units per 10-minute rolling window");
    assert.equal(throttledBody.error.data.scopeDescription, "this MCP session and scan");
    assert.equal(throttledBody.error.data.operationCostUnits, 4);
    assert.equal(throttledBody.error.data.equivalentRequestLimit, 30);
    assert.equal(throttledBody.error.data.accountUrl, "https://certscore.ai/login?mode=create_account");
    assert.equal(throttledBody.error.data.supportEmail, "support@certscore.ai");
    assert.equal(throttledBody.error.data.upgradeAvailable, true);
    assert.equal(throttledBody.error.data.anonymousLightLimitChangedByAccount, false);
    await lightClient.close();

    const secondProviderTransport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp/light`), {
      requestInit: { headers: { "x-forwarded-for": "160.79.104.9" } }
    });
    const secondProviderClient = new Client({ name: "independent-claude-session", version: "0.1.0" });
    await secondProviderClient.connect(secondProviderTransport);
    const secondProviderBundle = await secondProviderClient.callTool({
      name: "certscore_get_scan_bundle",
      arguments: { scanId: "00000000-0000-4000-8000-000000000123" }
    });
    assert.equal(secondProviderBundle.isError, undefined);
    await secondProviderClient.close();

    const invalidSession = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "mcp-session-id": "missing-session"
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
    });
    assert.equal(invalidSession.status, 404);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${diagnostics}`);
  } finally {
    child.kill("SIGTERM");
    apiServer.close();
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", () => resolve());
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 3_000).unref();
    });
  }
});
