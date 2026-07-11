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
    if (!created.jobId) {
      throw new Error(`MCP scan is non-terminal (${status}) but create_scan returned no jobId.`);
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`MCP scan timed out after ${timeoutMs}ms status=${status} jobId=${created.jobId}.`);
    }
    await sleep(delayMs + Math.floor(Math.random() * Math.max(1, delayMs * 0.2)));
    current = parseToolJson(await client.callTool({
      name: "get_scan_status",
      arguments: { jobId: created.jobId }
    }));
    console.log(`get_scan_status status=${current.status ?? "unknown"} phase=${current.phase ?? "unknown"} scanId=${getScanId(current) ?? "none"}`);
    delayMs = Math.min(5_000, Math.round(delayMs * 1.7));
  }
}

function verifyReport(report, expectedScanId, terminalStatus, terminal) {
  const reportScanId = getScanId(report) ?? expectedScanId;
  const domain = report.domain ?? report.scan?.domain ?? report.scan?.domainHostname ?? terminal?.domain ?? new URL(smokeUrl).hostname;
  const score = report.summary?.score ?? report.score;
  const topFindings = report.topFindings;
  if (reportScanId !== expectedScanId) throw new Error(`MCP report scanId mismatch: expected ${expectedScanId}, received ${reportScanId ?? "none"}.`);
  if (typeof domain !== "string" || !domain.trim()) throw new Error("MCP report did not include a domain.");
  if (terminalStatus === "completed" && typeof score !== "number") throw new Error("Completed MCP report did not include a numeric score.");
  if (terminalStatus === "completed" && !Array.isArray(topFindings)) throw new Error("Completed MCP report did not include topFindings.");
  return {
    domain,
    score: typeof score === "number" ? score : "limited",
    topFindingCount: Array.isArray(topFindings) ? topFindings.length : "limited",
    privacy: report.summary?.privacyPolicyPresent ?? report.privacyPolicyPresent ?? "unknown",
    cmp: report.summary?.cmpVendorName ?? report.cmpVendorName ?? "unknown",
    scanTime: report.summary?.scanTimeSeconds ?? report.scanTimeSeconds ?? "unknown",
    location: report.summary?.scanFrom ?? report.scanFrom ?? "unknown",
    freshness: report.meta?.freshness ?? report.freshness ?? "unknown",
    language: report.summary?.primaryLanguage ?? report.primaryLanguage ?? "unknown",
    industry: report.summary?.industry ?? report.industry ?? "unknown"
  };
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
      name: "create_scan",
      arguments: {
        url: smokeUrl,
        detail: "standard",
        freshness: smokeFreshness
      }
    })
  );
  console.log(`create_scan status=${created.status} jobId=${created.jobId ?? "none"} scanId=${created.scanId ?? "none"}`);

  if (!getScanId(created) && !created.jobId) {
    throw new Error("create_scan returned neither scanId nor jobId.");
  }
  const terminal = await waitForTerminalScan(created);
  const scanId = getScanId(terminal) ?? getScanId(created);
  if (!scanId) throw new Error("Terminal MCP scan response did not include scanId.");
  const report = parseToolJson(await client.callTool({
    name: "get_report",
    arguments: { scanId, detail: "standard" }
  }));
  const verified = verifyReport(report, scanId, terminal.status, terminal);
  console.log(`get_report verified scanId=${scanId} domain=${verified.domain} score=${verified.score} topFindings=${verified.topFindingCount} privacy=${printable(verified.privacy)} cmp=${printable(verified.cmp)} scanTime=${printable(verified.scanTime)} location=${printable(verified.location)} freshness=${printable(verified.freshness)} language=${printable(verified.language)} industry=${printable(verified.industry)}`);
} finally {
  await client.close();
}
