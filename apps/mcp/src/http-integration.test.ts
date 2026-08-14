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

    const lightTransport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp/light`), {
      requestInit: { headers: { "x-forwarded-for": "160.79.104.9" } }
    });
    const lightClient = new Client({ name: "certscore-light-http-integration", version: "0.1.0" });
    await lightClient.connect(lightTransport);
    const lightTools = await lightClient.listTools();
    assert.deepEqual(lightTools.tools.map((tool) => tool.name).sort(), ["certscore_get_scan_bundle", "certscore_get_scan_status", "certscore_scan_site"]);
    assert.deepEqual(lightTools.tools.find((tool) => tool.name === "certscore_scan_site")?.annotations, {
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
