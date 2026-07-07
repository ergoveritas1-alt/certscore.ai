import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createSmokeKey, getEcsContext, insertProductionKey, revokeProductionKeys } from "./smoke-certscore-mcp-production";

const DEFAULT_BASE_URL = "https://certscore.ai";
const DEFAULT_DOMAINS = ["https://www.cnn.com", "https://www.target.com", "https://www.webmd.com"];
const MAX_TOKENS = 25_000;
const WARN_TOKENS = 20_000;

type ToolMeasurement = {
  chars: number;
  estimatedTokens: number;
  status: "pass" | "warn" | "fail";
};

type ScanStatusPayload = {
  scan?: {
    id?: string;
    scanId?: string;
    status?: string;
  };
  scanId?: string | null;
  status?: string | null;
};

function domainsFromArgs() {
  const arg = process.argv.find((value) => value.startsWith("--domains="))?.slice("--domains=".length);
  return (arg ? arg.split(",") : DEFAULT_DOMAINS).map((value) => value.trim()).filter(Boolean);
}

function getText(result: Awaited<ReturnType<Client["callTool"]>>) {
  const first = result.content?.[0];
  if (!first || first.type !== "text") {
    throw new Error("MCP tool returned no text content.");
  }
  return first.text;
}

function parseJson(text: string) {
  return JSON.parse(text) as Record<string, unknown>;
}

function scanIdFrom(payload: Record<string, unknown>) {
  const scan = payload.scan && typeof payload.scan === "object" ? (payload.scan as Record<string, unknown>) : null;
  const pulse = payload.pulse && typeof payload.pulse === "object" ? (payload.pulse as Record<string, unknown>) : null;
  const pulseScan = pulse?.scan && typeof pulse.scan === "object" ? (pulse.scan as Record<string, unknown>) : null;
  return (
    (typeof payload.scanId === "string" && payload.scanId) ||
    (typeof scan?.scanId === "string" && scan.scanId) ||
    (typeof scan?.id === "string" && scan.id) ||
    (typeof pulse?.scanId === "string" && pulse.scanId) ||
    (typeof pulseScan?.scanId === "string" && pulseScan.scanId) ||
    null
  );
}

function statusFrom(payload: ScanStatusPayload) {
  return payload.status ?? payload.scan?.status ?? null;
}

function measure(text: string): ToolMeasurement {
  const chars = text.length;
  const estimatedTokens = Math.ceil(chars / 4);
  return {
    chars,
    estimatedTokens,
    status: estimatedTokens >= MAX_TOKENS ? "fail" : estimatedTokens >= WARN_TOKENS ? "warn" : "pass"
  };
}

async function callToolText(client: Client, name: string, args: Record<string, unknown>) {
  return getText(await client.callTool({ name, arguments: args }));
}

async function pollScan(client: Client, scanId: string) {
  const started = Date.now();
  const timeoutMs = Number(process.env.MCP_SIZE_CHECK_TIMEOUT_MS ?? 12 * 60 * 1000);
  let lastStatus: string | null = null;
  while (Date.now() - started < timeoutMs) {
    const text = await callToolText(client, "get_scan_status", { scanId });
    const payload = parseJson(text) as ScanStatusPayload;
    lastStatus = statusFrom(payload);
    if (lastStatus === "completed") {
      return;
    }
    if (lastStatus === "failed" || lastStatus === "error") {
      throw new Error(`Scan ${scanId} ended with status ${lastStatus}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(`Timed out waiting for scan ${scanId}; last status ${lastStatus ?? "unknown"}.`);
}

async function runProbe(token: string) {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["packages/certscore-mcp/dist/certscore-mcp.mjs"],
    env: {
      ...process.env,
      CERTSCORE_API_KEY: token,
      CERTSCORE_BASE_URL: DEFAULT_BASE_URL
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "certscore-mcp-large-site-size-check", version: "0.1.0" });
  await client.connect(transport);
  try {
    const results = [];
    for (const domain of domainsFromArgs()) {
      const createdText = await callToolText(client, "scan_site", { freshness: "refresh", scanFrom: "eu_ie", url: domain });
      const created = parseJson(createdText);
      const scanId = scanIdFrom(created);
      if (!scanId) {
        throw new Error(`scan_site did not return scanId for ${domain}.`);
      }
      await pollScan(client, scanId);

      const toolResults: Record<string, ToolMeasurement> = {};
      for (const tool of ["export_findings", "get_report", "list_findings"] as const) {
        const text = await callToolText(client, tool, { scanId });
        toolResults[tool] = measure(text);
      }
      results.push({ domain, scanId, tools: toolResults });
      console.log(JSON.stringify({ event: "mcp_size_check.domain_complete", domain, scanId, tools: toolResults }));
    }
    const failed = results.some((result) => Object.values(result.tools).some((tool) => tool.status === "fail"));
    const warned = results.some((result) => Object.values(result.tools).some((tool) => tool.status === "warn"));
    console.log(JSON.stringify({ event: "mcp_size_check.complete", failed, warned, results }, null, 2));
    if (failed) {
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

async function main() {
  const context = getEcsContext();
  const createdBy = `codex-mcp-size-check-${Date.now()}`;
  const key = createSmokeKey(createdBy, 6);
  let inserted = false;
  try {
    insertProductionKey(context, key);
    inserted = true;
    await runProbe(key.token);
  } finally {
    if (inserted) {
      revokeProductionKeys(context, createdBy);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
