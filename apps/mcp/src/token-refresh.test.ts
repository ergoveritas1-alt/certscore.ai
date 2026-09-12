import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";
import { signCertScoreAccessToken } from "@certscore/mcp-auth";

test("authenticated HTTP sessions rotate credentials, isolate identities and preserve request-local fan-out", { timeout: 30_000 }, async () => {
  const secret = "local-only-token-refresh-regression-secret";
  const scanId = "00000000-0000-4000-8000-000000000123";
  const concurrentIds = ["00000000-0000-4000-8000-000000000124", "00000000-0000-4000-8000-000000000125"];
  const tokens = new Map<string, string>();
  const upstreamCalls: { path: string; credential: string }[] = [];
  let arrivals = 0;
  let release!: () => void;
  const bothArrived = new Promise<void>(resolve => { release = resolve; });
  const api = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    // Exclude telemetry from assertions about tool API requests.
    if (!path.startsWith("/api/v2/scans") && !path.startsWith("/api/v2/domains") && !path.startsWith("/api/v1/pulse")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"accepted":true}');
      return;
    }
    const credential = tokens.get(req.headers.authorization?.replace(/^Bearer /, "") ?? "") ?? "unknown";
    upstreamCalls.push({ path: req.url ?? path, credential });
    if (path === `/api/v2/scans/${scanId}/status`) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ scanId, status: "completed" }));
      return;
    }
    if (concurrentIds.some(id => path === `/api/v2/scans/${id}`)) {
      if (++arrivals === 2) release();
      await bothArrived;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ scanId: path.split("/").at(-1), status: "completed", domain: "fixture.test" }));
      return;
    }
    const bundleId = concurrentIds.find(id => req.url?.includes(id));
    if (bundleId) {
      const body = path === "/api/v1/pulse"
        ? { type: "certscore_pulse", scanId: bundleId, domain: "fixture.test", summary: { headline: "Local fixture" }, findings: [] }
        : path.endsWith("/findings")
          ? { type: "certscore_finding_list", scanId: bundleId, findings: [] }
          : { type: "certscore_pre_consent_cookies_trackers", scanId: bundleId, domain: "fixture.test", summary: { rowCount: 0 }, rows: [] };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    // Deliberate downstream denial: exercises each tool without creating data.
    res.writeHead(403, { "content-type": "application/json" });
    res.end('{"error":{"code":"forbidden","message":"Local regression fixture"}}');
  });
  await new Promise<void>(resolve => api.listen(0, "127.0.0.1", resolve));
  const apiAddress = api.address();
  assert.ok(apiAddress && typeof apiAddress === "object");
  const portProbe = createServer();
  await new Promise<void>(resolve => portProbe.listen(0, "127.0.0.1", resolve));
  const address = portProbe.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>(resolve => portProbe.close(() => resolve()));
  const origin = `http://127.0.0.1:${address.port}`;
  const runtimeArgs = process.env.MCP_TEST_COMPILED_RUNTIME === "1"
    ? ["dist/index.js"] : ["--import", "tsx", "src/index.ts"];
  const child = spawn(process.execPath, runtimeArgs, {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, NODE_ENV: "test", PORT: String(address.port), MCP_PUBLIC_URL: origin,
      OAUTH_ISSUER: origin, CERTSCORE_BASE_URL: `http://127.0.0.1:${apiAddress.port}`,
      CERTSCORE_OAUTH_JWT_SECRET: secret, CERTSCORE_MICROSOFT_MCP_ENABLED: "0", SESSION_TTL_SECONDS: "60" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", data => { logs += data; });
  child.stderr.on("data", data => { logs += data; });
  const identity = { audience: origin, issuer: origin, jwtSecret: secret, clientId: "client-a", subject: "user-a",
    userId: "user-a", organizationId: "org-a", scopes: ["scan:read", "scan:create", "mcp"] };
  function token(label: string, changes: Partial<Parameters<typeof signCertScoreAccessToken>[0]> = {}) {
    const value = signCertScoreAccessToken({ ...identity, ...changes });
    tokens.set(value, label);
    return value;
  }
  let rpcId = 0;
  const initialize = { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "certscore-token-refresh-test", version: "1" } };
  async function post(bearer: string | null, session: string | null, method: string, params: unknown = {}, path = "/mcp") {
    return fetch(origin + path, { method: "POST", headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(session ? { "mcp-session-id": session, "mcp-protocol-version": "2025-11-25" } : {}),
    }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  }
  async function expectStatus(response: Response, status: number) {
    const text = await response.text();
    assert.equal(response.status, status, text);
    return text;
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(origin + "/healthz")).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, "local MCP server starts");
    const a = token("A", { expiresInSeconds: 2 });
    const b = token("B");
    const c = token("C", { scopes: ["mcp", "scan:create", "scan:read"] });
    const init = await post(a, null, "initialize", initialize);
    const session = init.headers.get("mcp-session-id");
    assert.ok(session);
    await expectStatus(init, 200);
    await expectStatus(await post(a, session, "tools/list"), 200);
    await expectStatus(await post(b, session, "tools/list"), 200);
    await expectStatus(await post(c, session, "ping"), 200);

    const tools: [string, Record<string, unknown>][] = [
      ["certscore_scan_site", { url: "https://fixture.test/" }],
      ["certscore_get_scan", { scanId }], ["certscore_get_scan_status", { scanId }],
      ["certscore_get_report", { scanId }], ["certscore_get_evidence", { scanId }],
      ["certscore_get_scan_bundle", { scanId }], ["certscore_export_findings", { scanId }],
      ["certscore_list_findings", { scanId }], ["certscore_get_pre_consent_cookies_trackers", { scanId }],
      ["certscore_explain_finding", { scanId, findingId: "fixture-finding" }],
      ["certscore_get_latest_domain_scan", { domain: "fixture.test" }],
      ["certscore_get_latest_domain_pre_consent_cookies_trackers", { domain: "fixture.test" }],
    ];
    for (const [name, args] of tools) {
      const before = upstreamCalls.length;
      await expectStatus(await post(b, session, "tools/call", { name, arguments: args }), 200);
      assert.ok(upstreamCalls.length > before, `${name} reaches the local API`);
      assert.ok(upstreamCalls.slice(before).every(call => call.credential === "B"), `${name} uses replacement B`);
    }
    // A is now expired while its session remains active. B still works.
    await new Promise(resolve => setTimeout(resolve, 2100));
    await expectStatus(await post(a, session, "tools/list"), 401);
    await expectStatus(await post(b, session, "tools/list"), 200);
    const refreshedStatus = await expectStatus(await post(b, session, "tools/call", {
      name: "certscore_get_scan_status", arguments: { scanId },
    }), 200);
    assert.ok(refreshedStatus.includes('"status":"completed"'));
    assert.ok(!refreshedStatus.includes('"isError":true'));
    const beforeConcurrent = upstreamCalls.length;
    await Promise.all(concurrentIds.map(async (id, index) => {
      const bundle = await expectStatus(await post(index === 0 ? b : c, session, "tools/call", {
        name: "certscore_get_scan_bundle", arguments: { scanId: id, detail: "full" },
      }), 200);
      assert.ok(bundle.includes('"type":"certscore_scan_bundle"'), bundle);
      assert.ok(!bundle.includes('"isError":true'), bundle);
    }));
    const fanOut = upstreamCalls.slice(beforeConcurrent);
    for (const [index, id] of concurrentIds.entries()) {
      const calls = fanOut.filter(call => call.path.includes(id));
      assert.ok(calls.length >= 4, `bundle exercises resource, report, findings and inventory after the overlap barrier: ${JSON.stringify(fanOut)}`);
      assert.ok(calls.every(call => call.credential === (index === 0 ? "B" : "C")), "concurrent bundle keeps its own token");
    }
    const beforeDenials = upstreamCalls.length;
    for (const changes of [
      { subject: "other" }, { clientId: "other" }, { organizationId: null }, { userId: null },
      { scopes: ["scan:read", "mcp"] }, { audience: "https://other.test" }, { issuer: "https://other.test" },
    ]) {
      const other = token("other", changes);
      await expectStatus(await post(other, session, "tools/call", { name: "certscore_get_scan_status", arguments: { scanId } }), 401);
    }
    await expectStatus(await post(null, session, "tools/list"), 401);
    await expectStatus(await post("not-a-valid-token", session, "tools/list"), 401);
    for (const method of ["GET", "DELETE"]) {
      const denied = await fetch(origin + "/mcp", { method, headers: {
        authorization: `Bearer ${token("other", { clientId: "other" })}`,
        "mcp-session-id": session, "mcp-protocol-version": "2025-11-25", accept: "text/event-stream",
      } });
      await expectStatus(denied, 401);
    }
    await expectStatus(await post(null, session, "tools/call", { name: "certscore_get_scan_status", arguments: { scanId } }, "/mcp/light"), 401);
    assert.equal(upstreamCalls.length, beforeDenials, "rejected requests never reach tool APIs");

    const lightInit = await post(null, null, "initialize", initialize, "/mcp/light");
    const lightSession = lightInit.headers.get("mcp-session-id");
    assert.ok(lightSession);
    await expectStatus(lightInit, 200);
    await expectStatus(await post(b, lightSession, "tools/list"), 401);
    await expectStatus(await post(b, session, "tools/list"), 200);
    const stream = await fetch(origin + "/mcp", { headers: {
      authorization: `Bearer ${c}`, "mcp-session-id": session, "mcp-protocol-version": "2025-11-25", accept: "text/event-stream",
    } });
    assert.equal(stream.status, 200);
    await stream.body?.cancel();
    const removed = await fetch(origin + "/mcp", { method: "DELETE", headers: {
      authorization: `Bearer ${c}`, "mcp-session-id": session, "mcp-protocol-version": "2025-11-25",
    } });
    await expectStatus(removed, 200);
    await expectStatus(await post(b, session, "tools/list"), 404);
    const fresh = await post(b, null, "initialize", initialize);
    await expectStatus(fresh, 200);
    assert.notEqual(fresh.headers.get("mcp-session-id"), session);
    assert.ok(logs.includes('"bindingMismatch":"client"'));
    assert.ok(logs.includes('"rpcMethod":"tools/call"'));
    for (const value of tokens.keys()) assert.ok(!logs.includes(value), "logs never include bearer tokens");
    assert.ok(!logs.includes('"subject":"user-a"'), "binding diagnostics do not log identity values");
  } finally {
    release();
    const stopped = new Promise<void>(resolve => child.once("exit", () => resolve()));
    if (child.exitCode === null) { child.kill("SIGTERM"); await stopped; }
    api.closeAllConnections();
    await new Promise<void>(resolve => api.close(() => resolve()));
  }
});
