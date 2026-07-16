import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const apiKey = process.env.CERTSCORE_API_KEY;
const baseUrl = process.env.CERTSCORE_BASE_URL ?? "https://certscore.ai";
const smokeUrl = process.env.CERTSCORE_MCP_SMOKE_URL ?? "https://kbdlab.io";
const smokeFreshness = process.env.CERTSCORE_MCP_SMOKE_FRESHNESS === "refresh" ? "refresh" : "latest";
const timeoutMs = Number(process.env.CERTSCORE_MCP_SMOKE_TIMEOUT_MS ?? 120_000);
const terminalSuccess = new Set(["completed", "completed_limited"]);
const terminalFailure = new Set(["failed", "expired", "rate_limited"]);

if (!apiKey) {
  console.log("Skipping CertScore MCP live smoke: set CERTSCORE_API_KEY to run against the live Pulse API.");
  process.exit(0);
}

const transport = new StdioClientTransport({
  command: "node",
  args: ["packages/certscore-mcp/dist/certscore-mcp.mjs"],
  env: {
    ...process.env,
    CERTSCORE_API_KEY: apiKey,
    CERTSCORE_BASE_URL: baseUrl
  },
  stderr: "pipe"
});

const client = new Client({
  name: "certscore-mcp-live-smoke",
  version: "0.1.0"
});

function parseToolJson(result) {
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const first = result.content?.[0];
  if (!first || first.type !== "text") {
    throw new Error("MCP tool returned no text content.");
  }
  return JSON.parse(first.text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getScanId(value) {
  return value?.scanId ?? value?.pulse?.scanId ?? value?.pulse?.scan?.scanId ?? value?.scan?.scanId ?? null;
}

async function waitForTerminalScan(created) {
  const startedAt = Date.now();
  let current = created;
  let delayMs = 500;
  while (true) {
    const status = String(current?.status ?? "unknown");
    if (terminalSuccess.has(status)) return current;
    if (terminalFailure.has(status)) {
      throw new Error(`MCP scan reached terminal failure status=${status} phase=${current?.phase ?? "unknown"}.`);
    }
    const scanId = getScanId(created);
    if (!scanId && !created.jobId) {
      throw new Error(`MCP scan is non-terminal (${status}) but scan_site returned no scanId or jobId.`);
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`MCP scan timed out after ${timeoutMs}ms status=${status} jobId=${created.jobId}.`);
    }
    const recommendedDelayMs = typeof current.retryAfterSeconds === "number" ? current.retryAfterSeconds * 1_000 : delayMs;
    await sleep(Math.min(5_000, recommendedDelayMs) + Math.floor(Math.random() * Math.max(1, delayMs * 0.2)));
    current = parseToolJson(await client.callTool({
      name: "get_scan_status",
      arguments: scanId ? { scanId } : { jobId: created.jobId }
    }));
    console.log(`get_scan_status status=${current.status ?? "unknown"} phase=${current.phase ?? "unknown"} scanId=${getScanId(current) ?? "none"}`);
    delayMs = Math.min(5_000, Math.round(delayMs * 1.7));
  }
}

function verifyScanAndFindings(scan, findings, expectedScanId) {
  if (getScanId(scan) !== expectedScanId) throw new Error(`MCP scanId mismatch: expected ${expectedScanId}, received ${getScanId(scan) ?? "none"}.`);
  if (typeof scan.domain !== "string" || !scan.domain.trim()) throw new Error("MCP scan did not include a domain.");
  if (scan.status === "completed" && typeof scan.score !== "number") throw new Error("Completed MCP scan did not include a numeric score.");
  if (!Array.isArray(findings.findings)) throw new Error("MCP list_findings did not include a findings array.");
  return { domain: scan.domain, score: scan.score ?? "limited", findingCount: findings.findings.length, scanTime: scan.scanTimeSeconds ?? "unknown" };
}

function printable(value) {
  if (value === null || value === undefined) return "unknown";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  console.log(`Tools: ${names.join(", ")}`);

  const created = parseToolJson(
    await client.callTool({
      name: "scan_site",
      arguments: {
        url: smokeUrl,
        freshness: smokeFreshness
      }
    })
  );
  console.log(`scan_site status=${created.status} jobId=${created.jobId ?? "none"} scanId=${created.scanId ?? "none"}`);

  if (!getScanId(created) && !created.jobId) {
    throw new Error("scan_site returned neither scanId nor jobId.");
  }
  const terminal = await waitForTerminalScan(created);
  const scanId = getScanId(terminal) ?? getScanId(created);
  if (!scanId) throw new Error("Terminal MCP scan response did not include scanId.");
  const scan = terminal.type === "certscore_scan" ? terminal : parseToolJson(await client.callTool({
    name: "get_scan",
    arguments: { scanId }
  }));
  const findings = parseToolJson(await client.callTool({
    name: "list_findings",
    arguments: { scanId }
  }));
  const verified = verifyScanAndFindings(scan, findings, scanId);
  console.log(`workflow verified scanId=${scanId} domain=${verified.domain} score=${verified.score} findings=${verified.findingCount} scanTime=${printable(verified.scanTime)}`);
} finally {
  await client.close();
}
