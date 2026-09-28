import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { verifyMarketplaceKeyProof } from "@certscore/mcp-auth";
import { validateMarketplaceCredential } from "./marketplace-auth.js";

test("Marketplace credential check fails closed without redirecting or forwarding malformed tokens", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return new Response(null, { status: 503 }); }) as typeof fetch;
  assert.deepEqual(await validateMarketplaceCredential({ token: "cs_live_other", baseUrl: "https://certscore.ai", secret: "test-secret" }, fetcher), { status: "invalid" });
  assert.equal(calls, 0);
  assert.deepEqual(await validateMarketplaceCredential({ token: `cs_mp_light_${"a".repeat(43)}`, baseUrl: "https://certscore.ai", secret: "test-secret" }, fetcher), { status: "unavailable" });
  const malformed = (async () => Response.json({ agreementId: "agmt-valid", licenseArn: "client-supplied-license" })) as typeof fetch;
  assert.deepEqual(await validateMarketplaceCredential({ token: `cs_mp_light_${"a".repeat(43)}`, baseUrl: "https://certscore.ai", secret: "test-secret" }, malformed), { status: "unavailable" });
});

test("Marketplace Light requires a current key on every request and isolates sessions and workspace tools", { timeout: 30_000 }, async () => {
  const secret = "marketplace-test-secret-not-production";
  const keyA = `cs_mp_light_${"a".repeat(43)}`;
  const keyB = `cs_mp_light_${"b".repeat(43)}`;
  const keyC = `cs_mp_light_${"c".repeat(43)}`;
  const active = new Set([keyA, keyB]);
  const agreement = new Map([[keyA, "agmt-original"], [keyB, "agmt-other"]]);
  const licenseArn = "arn:aws:license-manager::123456789012:license:l-test";
  const telemetry: Record<string, unknown>[] = [];
  const calls: { path: string; authorization: string | undefined }[] = [];
  const api = createServer((req, res) => {
    if (req.url === "/api/internal/marketplace-light-auth") {
      const key = req.headers.authorization?.slice(7) ?? "";
      assert.ok(verifyMarketplaceKeyProof(secret, String(req.headers["x-certscore-timestamp"]), key, String(req.headers["x-certscore-proof"])));
      if (!active.has(key)) { res.writeHead(401); res.end(); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ agreementId: agreement.get(key), licenseArn })); return;
    }
    if (req.url?.startsWith("/api/internal/mcp-telemetry")) {
      let body = ""; req.on("data", chunk => { body += chunk; }); req.on("end", () => {
        try { telemetry.push(JSON.parse(body) as Record<string, unknown>); } catch {}
        res.writeHead(202); res.end();
      }); return;
    }
    calls.push({ path: req.url ?? "", authorization: req.headers.authorization });
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: "forbidden", message: "Test fixture denial" } }));
  });
  await new Promise<void>(resolve => api.listen(0, "127.0.0.1", resolve));
  const address = api.address(); assert.ok(address && typeof address === "object");
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address(); assert.ok(port && typeof port === "object");
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const origin = `http://127.0.0.1:${port.port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, NODE_ENV: "test", PORT: String(port.port), MCP_PUBLIC_URL: origin,
      CERTSCORE_BASE_URL: `http://127.0.0.1:${address.port}`, CERTSCORE_OAUTH_JWT_SECRET: secret,
      CERTSCORE_MARKETPLACE_LIGHT_ENABLED: "1", CERTSCORE_MICROSOFT_MCP_ENABLED: "0", CERTSCORE_MICROSOFT_DELEGATED_ENABLED: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = ""; child.stdout.on("data", chunk => { logs += chunk; }); child.stderr.on("data", chunk => { logs += chunk; });
  let id = 0;
  const init = { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "marketplace-test", version: "1" } };
  const post = (key: string | null, session: string | null, method: string, params: unknown = {}, path = "/mcp/marketplace/light") => fetch(origin + path, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(session ? { "Mcp-Session-Id": session } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(origin + "/healthz")).ok) break; } catch {}
      if (attempt === 99) throw new Error(logs);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal((await post(null, null, "initialize", init)).status, 401);
    assert.equal((await post("cs_live_workspace_key", null, "initialize", init)).status, 401);
    const initialized = await post(keyA, null, "initialize", init);
    assert.equal(initialized.status, 200); await initialized.text();
    const session = initialized.headers.get("mcp-session-id"); assert.ok(session);
    const listed = await post(keyA, session, "tools/list");
    assert.equal(listed.status, 200);
    const body = await listed.text();
    for (const name of ["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle", "certscore_get_report_evidence_page"]) assert.ok(body.includes(name));
    assert.ok(!body.includes('"name":"certscore_list_scans"'));
    assert.equal((await post(keyB, session, "tools/list")).status, 401);
    assert.equal((await post(null, session, "tools/list", {}, "/mcp/light")).status, 401);
    assert.equal((await post(keyA, session, "tools/list", {}, "/mcp")).status, 401);
    const called = await post(keyA, session, "tools/call", { name: "certscore_get_scan_status", arguments: { scanId: "00000000-0000-4000-8000-000000000001" } });
    await called.text();
    for (let attempt = 0; attempt < 50 && telemetry.length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(telemetry.length > 0, "validated tool request must produce telemetry");
    const event = telemetry.find(item => item.eventType !== "activation") ?? telemetry[0]!;
    assert.equal(event.surface, "mcp_marketplace_light");
    assert.equal(event.marketplaceAgreementId, "agmt-original");
    assert.equal(event.marketplaceLicenseArn, licenseArn);
    for (const field of ["requestDetails", "requesterIp", "requesterIpHash", "actorId", "sessionId", "targetHostname", "clientName"]) assert.equal(event[field], null, field);
    assert.ok(!JSON.stringify(telemetry).includes(keyA));
    assert.ok(calls.length > 0);
    assert.ok(calls.every(call => !call.authorization), "Marketplace credentials must never reach workspace APIs");
    agreement.set(keyA, "agmt-resubscribed");
    assert.equal((await post(keyA, session, "tools/list")).status, 401, "agreement changes cannot inherit a previous session");
    const resubscribed = await post(keyA, null, "initialize", init);
    assert.equal(resubscribed.status, 200); await resubscribed.text();
    const newSession = resubscribed.headers.get("mcp-session-id"); assert.ok(newSession);
    assert.equal((await post(keyA, newSession, "tools/list")).status, 200);
    active.add(keyC); agreement.set(keyC, "agmt-resubscribed");
    active.delete(keyA);
    assert.equal((await post(keyA, newSession, "tools/list")).status, 401, "Revocation applies to existing sessions");
    assert.equal((await post(keyC, newSession, "tools/list")).status, 401, "rotated key cannot inherit the former session");
    const rotated = await post(keyC, null, "initialize", init);
    assert.equal(rotated.status, 200); await rotated.text();
    const rotatedSession = rotated.headers.get("mcp-session-id"); assert.ok(rotatedSession);
    assert.equal((await post(keyC, rotatedSession, "tools/list")).status, 200);
    active.delete(keyC);
    assert.equal((await post(keyC, rotatedSession, "tools/list")).status, 401, "cancellation defeats an active rotated session");
    const publicInit = await post(null, null, "initialize", init, "/mcp/light");
    assert.equal(publicInit.status, 200); await publicInit.text();
    assert.equal((await post(keyB, publicInit.headers.get("mcp-session-id"), "tools/list")).status, 401);
    assert.ok(!logs.includes(keyA) && !logs.includes(keyB) && !logs.includes(keyC));
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>(resolve => child.once("exit", () => resolve()));
    api.closeAllConnections(); await new Promise<void>(resolve => api.close(() => resolve()));
  }
});
