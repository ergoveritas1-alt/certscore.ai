import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { signCertScoreAccessToken } from "../packages/certscore-mcp-auth/src/index";

const DEFAULT_MCP_URL = "https://mcp.certscore.ai/mcp";
const DEFAULT_ISSUER = "https://certscore.ai";
const LIGHT_TOOL_NAMES = new Set([
  "certscore_get_scan_bundle",
  "certscore_get_scan_status",
  "certscore_scan_site"
]);

function getArg(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stable(record[key])]));
  }
  return value;
}

function stableToolsPayload(tools: { tools: unknown[] }) {
  return stable({
    tools: [...tools.tools].sort((a, b) => {
      const left = typeof a === "object" && a && "name" in a ? String((a as { name?: unknown }).name) : "";
      const right = typeof b === "object" && b && "name" in b ? String((b as { name?: unknown }).name) : "";
      return left.localeCompare(right);
    })
  });
}

function stableJson(value: unknown) {
  return JSON.stringify(stable(value), null, 2);
}

function makeLocalBearer(mcpUrl: string) {
  const secret = process.env.CERTSCORE_OAUTH_JWT_SECRET?.trim() || process.env.JWT_SIGNING_KEY?.trim();
  if (!secret) {
    return null;
  }
  const audience = process.env.MCP_PUBLIC_URL?.trim() || new URL(mcpUrl).origin;
  return signCertScoreAccessToken({
    audience,
    clientId: "mcp_tools_diff_local",
    issuer: process.env.OAUTH_ISSUER?.trim() || DEFAULT_ISSUER,
    jwtSecret: secret,
    organizationId: "mcp_tools_diff_org",
    scopes: ["scan:read", "mcp"],
    subject: "mcp_tools_diff_user",
    userId: "mcp_tools_diff_user"
  });
}

async function listLocalTools() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["packages/certscore-mcp/dist/certscore-mcp.mjs"],
    env: {
      ...process.env,
      CERTSCORE_API_KEY: process.env.CERTSCORE_API_KEY ?? "cs_preview_tools_diff_not_used",
      CERTSCORE_BASE_URL: process.env.CERTSCORE_BASE_URL ?? "https://certscore.ai"
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "certscore-mcp-stdio-diff", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await client.listTools();
  } finally {
    await client.close();
  }
}

async function listHttpTools(mcpUrl: string, bearerToken?: string) {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    ...(bearerToken
      ? { requestInit: { headers: { Authorization: `Bearer ${bearerToken}` } } }
      : {})
  });
  const client = new Client({ name: "certscore-mcp-http-diff", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await client.listTools();
  } finally {
    await client.close();
  }
}

async function main() {
  const mcpUrl = getArg("--mcp-url") || process.env.CERTSCORE_MCP_HTTP_URL || DEFAULT_MCP_URL;
  const bearerToken = getArg("--bearer-token") || process.env.CERTSCORE_MCP_HTTP_BEARER_TOKEN || makeLocalBearer(mcpUrl);

  if (!bearerToken) {
    throw new Error(
      "Set CERTSCORE_MCP_HTTP_BEARER_TOKEN for a deployed endpoint, or CERTSCORE_OAUTH_JWT_SECRET/JWT_SIGNING_KEY for a local endpoint."
    );
  }

  const lightMcpUrl = `${new URL(mcpUrl).origin}/mcp/light`;
  const [localTools, httpTools, lightHttpTools] = await Promise.all([
    listLocalTools(),
    listHttpTools(mcpUrl, bearerToken),
    listHttpTools(lightMcpUrl)
  ]);
  const localPayload = stableToolsPayload(localTools);
  const httpPayload = stableToolsPayload(httpTools);
  const localJson = stableJson(localPayload);
  const httpJson = stableJson(httpPayload);

  if (localJson !== httpJson) {
    const localNames = (localTools.tools ?? []).map((tool) => tool.name).sort();
    const httpNames = (httpTools.tools ?? []).map((tool) => tool.name).sort();
    console.error(JSON.stringify({ event: "mcp_http_tools_diff.failed", localNames, httpNames }, null, 2));
    assert.equal(httpJson, localJson, "Remote Streamable HTTP tools/list differs from the shared stdio MCP tool list.");
  }

  const localLightTools = {
    tools: localTools.tools.filter((tool) => LIGHT_TOOL_NAMES.has(tool.name))
  };
  const localLightJson = stableJson(stableToolsPayload(localLightTools));
  const lightHttpJson = stableJson(stableToolsPayload(lightHttpTools));
  if (lightHttpJson !== localLightJson) {
    const localNames = localLightTools.tools.map((tool) => tool.name).sort();
    const httpNames = lightHttpTools.tools.map((tool) => tool.name).sort();
    console.error(JSON.stringify({ event: "mcp_http_light_tools_diff.failed", localNames, httpNames }, null, 2));
    assert.equal(lightHttpJson, localLightJson, "Remote Light MCP tools/list differs from the shared stdio MCP Light profile.");
  }

  console.log(JSON.stringify({
    event: "mcp_http_tools_diff.passed",
    lightMcpUrl,
    lightToolCount: lightHttpTools.tools.length,
    lightTools: lightHttpTools.tools.map((tool) => tool.name).sort(),
    mcpUrl,
    toolCount: localTools.tools.length,
    tools: localTools.tools.map((tool) => tool.name).sort()
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
