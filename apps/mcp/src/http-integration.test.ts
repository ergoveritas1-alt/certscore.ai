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
  const apiServer = createHttpServer((request, response) => {
    if (request.method === "POST" && request.url === "/api/v2/scans") {
      forwardedClientIp = request.headers["x-forwarded-for"]?.toString();
      apiAuthorization = request.headers.authorization;
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
    assert.ok(tools.tools.some((tool) => tool.name === "get_scan"));
    assert.ok(tools.tools.some((tool) => tool.name === "scan_site"));
    await client.close();

    const anonymousTransport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp/anonymous`), {
      requestInit: { headers: { "x-forwarded-for": "203.0.113.44" } }
    });
    const anonymousClient = new Client({ name: "certscore-anonymous-http-integration", version: "0.1.0" });
    await anonymousClient.connect(anonymousTransport);
    const anonymousTools = await anonymousClient.listTools();
    assert.ok(anonymousTools.tools.some((tool) => tool.name === "scan_site"));
    const created = await anonymousClient.callTool({ name: "scan_site", arguments: { url: "https://example.com", waitForCompletion: false } });
    assert.equal(created.isError, undefined);
    assert.match(JSON.stringify(created), /anonymous-mcp-job/);
    assert.equal(forwardedClientIp, "203.0.113.44");
    assert.equal(apiAuthorization, undefined);
    await anonymousClient.close();

    const lightTransport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp/light`), {
      requestInit: { headers: { "x-forwarded-for": "203.0.113.45" } }
    });
    const lightClient = new Client({ name: "certscore-light-http-integration", version: "0.1.0" });
    await lightClient.connect(lightTransport);
    const lightTools = await lightClient.listTools();
    assert.deepEqual(lightTools.tools.map((tool) => tool.name).sort(), ["get_scan_bundle", "get_scan_status", "scan_site"]);
    await lightClient.close();

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
