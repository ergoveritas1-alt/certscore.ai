import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const apiKey = process.env.CERTSCORE_API_KEY;
const baseUrl = process.env.CERTSCORE_BASE_URL ?? "https://certscore.ai";
const smokeUrl = process.env.CERTSCORE_MCP_SMOKE_URL ?? "https://kbdlab.io";

if (!apiKey) {
  console.log("Skipping CertScore MCP live smoke: set CERTSCORE_API_KEY to run against the live Pulse API.");
  process.exit(0);
}

const transport = new StdioClientTransport({
  command: "node",
  args: ["packages/certscore-mcp/dist/index.js"],
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
        freshness: "latest"
      }
    })
  );
  console.log(`create_scan status=${created.status} jobId=${created.jobId ?? "none"} scanId=${created.scanId ?? "none"}`);

  const scanId = created.scanId ?? created.pulse?.scanId ?? created.pulse?.scan?.scanId;
  if (scanId) {
    const report = parseToolJson(
      await client.callTool({
        name: "get_report",
        arguments: {
          scanId,
          detail: "standard"
        }
      })
    );
    console.log(`get_report scanId=${report.scanId ?? report.scan?.scanId ?? scanId} domain=${report.domain ?? "unknown"}`);
  } else if (created.jobId) {
    const status = parseToolJson(
      await client.callTool({
        name: "get_scan_status",
        arguments: {
          jobId: created.jobId
        }
      })
    );
    console.log(`get_scan_status status=${status.status} scanId=${status.scanId ?? "none"}`);
  } else {
    throw new Error("create_scan returned neither scanId nor jobId.");
  }
} finally {
  await client.close();
}
