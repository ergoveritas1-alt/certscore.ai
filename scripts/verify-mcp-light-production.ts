import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DISCOVERY_URL = "https://certscore.ai/.well-known/certscore-ai.json";
const MCP_ORIGIN = "https://mcp.certscore.ai";
const LIGHT_ENDPOINT = `${MCP_ORIGIN}/mcp/light`;
const EXPECTED_VERSION = "0.2.19";
const EXPECTED_TOOLS = [
  "certscore_get_scan_bundle",
  "certscore_get_scan_status",
  "certscore_scan_site",
] as const;
const TERMINAL_STATUSES = new Set(["completed", "completed_limited", "failed", "expired", "rate_limited"]);

type ToolPayload = Record<string, any>;

function argument(name: string) {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.ok, true, `${url} returned HTTP ${response.status}.`);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/i, `${url} did not return JSON.`);
  return response.json() as Promise<any>;
}

async function verifyLink(url: string) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  assert.equal(response.ok, true, `${url} returned HTTP ${response.status}.`);
  return { status: response.status, url };
}

async function verifyPng(url: string, width: number, height: number) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.ok, true, `${url} returned HTTP ${response.status}.`);
  assert.match(response.headers.get("content-type") ?? "", /^image\/png\b/i, `${url} did not return a PNG.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${url} has an invalid PNG signature.`);
  assert.equal(bytes.readUInt32BE(16), width, `${url} width drifted.`);
  assert.equal(bytes.readUInt32BE(20), height, `${url} height drifted.`);
  return { bytes: bytes.length, height, url, width };
}

function comparableTool(tool: any) {
  return {
    annotations: tool.annotations,
    description: tool.description,
    inputSchema: tool.inputSchema,
    name: tool.name,
    outputSchema: tool.outputSchema,
  };
}

async function listLocalLightTools() {
  const { createCertScoreMcpServer } = await import("../packages/certscore-mcp/dist/server.js");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createCertScoreMcpServer({ toolProfile: "light" });
  const client = new Client({ name: "certscore-light-production-local-contract", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return (await client.listTools()).tools.map(comparableTool).sort((left, right) => left.name.localeCompare(right.name));
  } finally {
    await client.close();
    await server.close();
  }
}

async function withProductionClient<T>(callback: (client: Client) => Promise<T>) {
  const transport = new StreamableHTTPClientTransport(new URL(LIGHT_ENDPOINT));
  const client = new Client({ name: "certscore-light-production-verifier", version: "1.0.0" });
  await client.connect(transport);
  try {
    return await callback(client);
  } finally {
    await client.close();
  }
}

function parseToolPayload(result: Awaited<ReturnType<Client["callTool"]>>) {
  if (result.isError) {
    throw new Error(`MCP tool returned an error: ${JSON.stringify(result.structuredContent ?? result.content).slice(0, 1_500)}`);
  }
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent as ToolPayload;
  }
  const first = result.content?.[0];
  assert.equal(first?.type, "text", "MCP tool returned neither structured content nor text.");
  return JSON.parse(first.text) as ToolPayload;
}

function payloadScanId(payload: ToolPayload) {
  return payload.scanId ?? payload.scan?.scanId ?? payload.scan?.id ?? null;
}

function payloadStatus(payload: ToolPayload) {
  return payload.status ?? payload.scan?.status ?? null;
}

function retryDelayMs(payload: ToolPayload) {
  const seconds = payload.retryAfterSeconds
    ?? payload.recommendedNextAction?.retryAfterSeconds
    ?? payload.retry?.afterSeconds
    ?? 5;
  return Math.min(30, Math.max(1, Number(seconds) || 5)) * 1_000;
}

async function verifyLifecycle(url: string) {
  return withProductionClient(async (client) => {
    const initial = parseToolPayload(await client.callTool({
      name: "certscore_scan_site",
      arguments: { freshness: "latest", url, waitForCompletion: false },
    }));
    const scanId = payloadScanId(initial);
    assert.equal(typeof scanId, "string", "certscore_scan_site returned no scanId.");
    let status = payloadStatus(initial);
    let latest = initial;
    const deadline = Date.now() + 15 * 60_000;

    while (!status || !TERMINAL_STATUSES.has(status)) {
      assert.ok(Date.now() < deadline, `Timed out waiting for ${scanId}; last status was ${String(status)}.`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(latest)));
      latest = parseToolPayload(await client.callTool({
        name: "certscore_get_scan_status",
        arguments: { scanId },
      }));
      status = payloadStatus(latest);
    }

    assert.ok(status === "completed" || status === "completed_limited", `Scan ${scanId} ended in ${status}.`);
    const bundle = parseToolPayload(await client.callTool({
      name: "certscore_get_scan_bundle",
      arguments: { detail: "findings", maxBytes: 8_000, scanId },
    }));
    assert.equal(payloadScanId(bundle) ?? scanId, scanId, "Bundle scan identity drifted.");

    const reuse = parseToolPayload(await client.callTool({
      name: "certscore_scan_site",
      arguments: { freshness: "latest", url, waitForCompletion: false },
    }));
    assert.equal(payloadScanId(reuse), scanId, "A second freshness=latest call did not reuse the completed scan.");

    return {
      initialResolutionMode: initial.resolutionMode ?? initial.scan?.resolutionMode ?? "unavailable",
      reuseResolutionMode: reuse.resolutionMode ?? reuse.scan?.resolutionMode ?? "unavailable",
      scanId,
      status,
    };
  });
}

async function main() {
  const discovery = await fetchJson(DISCOVERY_URL);
  const light = discovery.mcp?.light;
  assert.equal(light?.registryName, "ai.certscore/mcp-light");
  assert.equal(light?.version, EXPECTED_VERSION);
  assert.equal(discovery.mcp?.hosted?.currentVersion, EXPECTED_VERSION);
  assert.equal(light?.endpoint, LIGHT_ENDPOINT);
  assert.equal(light?.transport, "streamable_http");
  assert.equal(light?.authentication, "none");
  assert.equal(light?.dailyNewScanLimit, 50);
  assert.equal(light?.limitKey, "requester_and_public_light_surface_utc_day");
  assert.equal(light?.rollingNewScanLimit, 5);
  assert.equal(light?.rollingWindowSeconds, 600);
  assert.equal(light?.recentReuseDoesNotConsumeQuota, true);
  assert.equal(discovery.api?.anonymousAgentScan?.dailyNewScanLimit, 20);
  assert.equal(discovery.api?.anonymousAgentScan?.limitKey, "requester_ip_utc_day");
  assert.deepEqual(light?.tools, ["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle"]);
  assert.match(light?.shortDescription ?? "", /^Free website privacy scanner/);
  assert.match(light?.longDescription ?? "", /not legal advice, certification, or a compliance determination/);

  const health = await fetchJson(`${MCP_ORIGIN}/healthz`);
  assert.equal(health.version, EXPECTED_VERSION);

  const productionTools = await withProductionClient(async (client) => {
    return (await client.listTools()).tools.map(comparableTool).sort((left, right) => left.name.localeCompare(right.name));
  });
  assert.deepEqual(productionTools.map((tool) => tool.name), [...EXPECTED_TOOLS]);
  assert.deepEqual(productionTools, await listLocalLightTools(), "Production Light descriptions or schemas drifted from the local contract.");

  const icons = await Promise.all([
    verifyPng(light.iconUrl, 512, 512),
    verifyPng(light.darkBackgroundIconUrl, 512, 512),
    verifyPng(light.clineMarketplaceIconUrl, 400, 400),
  ]);
  const links = await Promise.all([
    verifyLink(light.landingPage),
    verifyLink(light.privacyUrl),
    verifyLink(light.termsUrl),
    verifyLink(light.supportUrl),
    verifyLink(discovery.mcp.docs),
  ]);

  const lifecycleUrl = argument("--lifecycle-url");
  const lifecycle = lifecycleUrl ? await verifyLifecycle(lifecycleUrl) : "skipped (pass --lifecycle-url=https://...)";

  console.log(JSON.stringify({
    event: "mcp_light_production_verification.passed",
    discovery: {
      authentication: light.authentication,
      endpoint: light.endpoint,
      identity: light.registryName,
      lightDailyNewScanLimit: light.dailyNewScanLimit,
      restDailyNewScanLimit: discovery.api.anonymousAgentScan.dailyNewScanLimit,
      transport: light.transport,
      version: light.version,
    },
    health,
    icons,
    lifecycle,
    links,
    tools: productionTools.map((tool) => tool.name),
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
