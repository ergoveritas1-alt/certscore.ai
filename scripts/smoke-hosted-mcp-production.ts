import assert from "node:assert/strict";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DEFAULT_MCP_ORIGIN = "https://mcp.certscore.ai";

export const LIGHT_TOOL_NAMES = [
  "certscore_get_scan_bundle",
  "certscore_get_scan_status",
  "certscore_scan_site",
] as const;

export const FULL_TOOL_NAMES = [
  "certscore_explain_finding",
  "certscore_export_findings",
  "certscore_get_evidence",
  "certscore_get_latest_domain_pre_consent_cookies_trackers",
  "certscore_get_latest_domain_scan",
  "certscore_get_pre_consent_cookies_trackers",
  "certscore_get_report",
  "certscore_get_scan",
  "certscore_get_scan_bundle",
  "certscore_get_scan_status",
  "certscore_list_findings",
  "certscore_scan_site",
] as const;

type Surface = "mcp_light" | "mcp_anonymous" | "mcp_authenticated";

type CanaryOptions = {
  accessToken: string;
  mcpOrigin: string;
  scanId: string;
  verifyTelemetry: boolean;
};

type ToolPayload = Record<string, unknown> & {
  scan?: { id?: string; scanId?: string; status?: string };
  scanId?: string;
  status?: string;
};

function argValue(name: string, argv = process.argv.slice(2)) {
  const prefix = `${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)?.trim() || null;
}

export function readCanaryOptions(
  env: NodeJS.ProcessEnv = process.env,
  argv = process.argv.slice(2),
): CanaryOptions {
  const mcpOrigin = (argValue("--mcp-origin", argv) || env.CERTSCORE_MCP_ORIGIN || DEFAULT_MCP_ORIGIN).replace(/\/$/, "");
  const scanId = argValue("--scan-id", argv) || env.CERTSCORE_MCP_CANARY_SCAN_ID?.trim() || "";
  const accessToken = env.CERTSCORE_MCP_ACCESS_TOKEN?.trim()
    || env.CERTSCORE_MCP_HTTP_BEARER_TOKEN?.trim()
    || "";

  if (!/^https:\/\//.test(mcpOrigin)) {
    throw new Error("Hosted production MCP canary requires an https:// MCP origin.");
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(scanId)) {
    throw new Error("Set CERTSCORE_MCP_CANARY_SCAN_ID to an existing retained scan ID. This canary never creates a scan.");
  }
  if (!accessToken) {
    throw new Error("Set CERTSCORE_MCP_ACCESS_TOKEN to a short-lived scan:read mcp token. Tokens are never logged.");
  }
  if (argv.some((value) => value.startsWith("--access-token"))) {
    throw new Error("Pass the access token only through CERTSCORE_MCP_ACCESS_TOKEN, not a command-line argument.");
  }

  return {
    accessToken,
    mcpOrigin,
    scanId,
    verifyTelemetry: env.CERTSCORE_MCP_CANARY_VERIFY_TELEMETRY?.trim() === "1",
  };
}

export function assertExactToolNames(surface: Surface, actualNames: string[], expectedNames: readonly string[]) {
  const actual = [...actualNames].sort();
  const expected = [...expectedNames].sort();
  assert.deepEqual(actual, expected, `${surface} tools/list contract changed.`);
}

function parseToolPayload(result: Awaited<ReturnType<McpClient["callTool"]>>): ToolPayload {
  if (result.isError) {
    throw new Error(`Hosted MCP tool call failed: ${JSON.stringify(result.structuredContent ?? result.content).slice(0, 1_000)}`);
  }
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent as ToolPayload;
  }
  const first = result.content?.[0];
  if (!first || first.type !== "text") {
    throw new Error("Hosted MCP tool returned no structured or text content.");
  }
  try {
    return JSON.parse(first.text) as ToolPayload;
  } catch {
    return {};
  }
}

function payloadScanId(payload: ToolPayload) {
  return payload.scanId ?? payload.scan?.scanId ?? payload.scan?.id ?? null;
}

async function verifySurface(input: {
  accessToken?: string;
  expectedTools: readonly string[];
  path: "/mcp/light" | "/mcp/anonymous" | "/mcp";
  scanId: string;
  surface: Surface;
}) {
  const transport = new StreamableHTTPClientTransport(new URL(input.path, currentOptions.mcpOrigin), {
    ...(input.accessToken
      ? { requestInit: { headers: { Authorization: `Bearer ${input.accessToken}` } } }
      : {}),
  });
  const client = new McpClient({ name: "certscore-hosted-production-canary", version: "1.0.0" });
  const startedAt = performance.now();

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assertExactToolNames(input.surface, tools.tools.map((tool) => tool.name), input.expectedTools);

    const statusResult = await client.callTool({
      name: "certscore_get_scan_status",
      arguments: { scanId: input.scanId },
    });
    const payload = parseToolPayload(statusResult);
    const returnedScanId = payloadScanId(payload);
    if (returnedScanId) assert.equal(returnedScanId, input.scanId, `${input.surface} returned a different scan ID.`);

    return {
      durationMs: Math.round(performance.now() - startedAt),
      status: payload.status ?? payload.scan?.status ?? "available",
      surface: input.surface,
      toolCount: tools.tools.length,
    };
  } finally {
    await client.close();
  }
}

let currentOptions: CanaryOptions;

async function verifyLightBundle(scanId: string) {
  const transport = new StreamableHTTPClientTransport(new URL("/mcp/light", currentOptions.mcpOrigin));
  const client = new McpClient({ name: "certscore-hosted-production-canary", version: "1.0.0" });
  try {
    await client.connect(transport);
    parseToolPayload(await client.callTool({
      name: "certscore_get_scan_bundle",
      arguments: { detail: "summary", scanId },
    }));
  } finally {
    await client.close();
  }
}

async function verifyPersistedTelemetry(input: { scanId: string; startedAt: Date }) {
  if (!currentOptions.verifyTelemetry) return "skipped" as const;
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("CERTSCORE_MCP_CANARY_VERIFY_TELEMETRY=1 requires DATABASE_URL.");
  }

  const { Client: PgClient } = await import("pg");
  const mode = process.env.DATABASE_SSL_MODE?.trim();
  const ssl = mode === "disable" ? false : mode === "require" ? { rejectUnauthorized: false } : undefined;
  const database = new PgClient({ connectionString: process.env.DATABASE_URL, ssl });
  const expected = new Set([
    "mcp_light:certscore_get_scan_status",
    "mcp_light:certscore_get_scan_bundle",
    "mcp_anonymous:certscore_get_scan_status",
    "mcp_authenticated:certscore_get_scan_status",
  ]);

  await database.connect();
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await database.query<{ surface: Surface; tool_name: string }>(
        `select surface, tool_name
           from public.mcp_tool_invocation_events
          where scan_id = $1
            and occurred_at >= $2::timestamptz
            and outcome = 'success'`,
        [input.scanId, new Date(input.startedAt.getTime() - 5_000).toISOString()],
      );
      const observed = new Set(result.rows.map((row) => `${row.surface}:${row.tool_name}`));
      if ([...expected].every((value) => observed.has(value))) return "passed" as const;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error("Hosted MCP calls succeeded, but the expected four telemetry rows were not observed.");
  } finally {
    await database.end();
  }
}

async function main() {
  currentOptions = readCanaryOptions();
  const startedAt = new Date();

  const results = [];
  results.push(await verifySurface({
    expectedTools: LIGHT_TOOL_NAMES,
    path: "/mcp/light",
    scanId: currentOptions.scanId,
    surface: "mcp_light",
  }));
  await verifyLightBundle(currentOptions.scanId);
  results.push(await verifySurface({
    expectedTools: FULL_TOOL_NAMES,
    path: "/mcp/anonymous",
    scanId: currentOptions.scanId,
    surface: "mcp_anonymous",
  }));
  results.push(await verifySurface({
    accessToken: currentOptions.accessToken,
    expectedTools: FULL_TOOL_NAMES,
    path: "/mcp",
    scanId: currentOptions.scanId,
    surface: "mcp_authenticated",
  }));

  const telemetryVerification = await verifyPersistedTelemetry({ scanId: currentOptions.scanId, startedAt });
  console.log(JSON.stringify({
    event: "hosted_mcp_production_canary.passed",
    mcpOrigin: currentOptions.mcpOrigin,
    results,
    scanId: currentOptions.scanId,
    telemetryVerification,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
