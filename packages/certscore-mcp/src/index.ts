import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCertScoreMcpServer } from "./server.js";
import { CERTSCORE_MCP_VERSION } from "./version.js";

export { createCertScoreMcpServer } from "./server.js";
export { explainFinding, exportFindings, findingsFromReport } from "./tools.js";
export { CERTSCORE_MCP_VERSION } from "./version.js";

const DEFAULT_CERTSCORE_BASE_URL = "https://certscore.ai";
const MIN_NODE_MAJOR = 20;
const MAX_NODE_MAJOR_EXCLUSIVE = 25;

export interface CertScoreMcpDoctorOptions {
  checkAuth?: boolean;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  nodeVersion?: string;
}

function parseTimeout(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : undefined;
}

async function main() {
  if (process.argv.includes("--version")) {
    console.log(CERTSCORE_MCP_VERSION);
    return;
  }
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log([
      "certscore-mcp",
      "",
      "CertScore MCP stdio server.",
      "",
      "Environment:",
      "  CERTSCORE_API_KEY              CertScore API token.",
      "  CERTSCORE_BASE_URL             Optional API base URL. Defaults to https://certscore.ai.",
      "  CERTSCORE_REQUEST_TIMEOUT_MS   Optional request timeout.",
      "",
      "Usage:",
      "  certscore-mcp",
      "  certscore-mcp doctor",
      "  certscore-mcp doctor --check-auth"
    ].join("\n"));
    return;
  }
  if (process.argv.includes("doctor")) {
    const result = await getCertScoreMcpDoctorReport({ checkAuth: process.argv.includes("--check-auth") });
    console.log(result.lines.join("\n"));
    process.exitCode = result.exitCode;
    return;
  }

  const server = createCertScoreMcpServer({
    apiKey: process.env.CERTSCORE_API_KEY,
    baseUrl: process.env.CERTSCORE_BASE_URL,
    timeout: parseTimeout(process.env.CERTSCORE_REQUEST_TIMEOUT_MS)
  });
  await server.connect(new StdioServerTransport());
}

export async function getCertScoreMcpDoctorReport(options: CertScoreMcpDoctorOptions = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const lines = ["CertScore MCP doctor"];
  let exitCode = 0;

  lines.push(`[ok] version ${CERTSCORE_MCP_VERSION}`);

  const nodeMajor = Number(nodeVersion.split(".")[0]);
  if (Number.isInteger(nodeMajor) && nodeMajor >= MIN_NODE_MAJOR && nodeMajor < MAX_NODE_MAJOR_EXCLUSIVE) {
    lines.push(`[ok] Node.js ${nodeVersion} is compatible`);
  } else {
    lines.push(`[error] Node.js ${nodeVersion || "unknown"} is not compatible; use Node.js >=20 <25`);
    exitCode = 1;
  }

  const baseUrlInput = env.CERTSCORE_BASE_URL?.trim() || DEFAULT_CERTSCORE_BASE_URL;
  let healthUrl: URL | null = null;
  try {
    const baseUrl = new URL(baseUrlInput);
    healthUrl = new URL("/api/v2/health", baseUrl);
    lines.push(`[ok] base URL ${baseUrl.origin}`);
  } catch {
    lines.push(`[error] CERTSCORE_BASE_URL is not a valid URL`);
    exitCode = 1;
  }

  if (healthUrl) {
    try {
      const response = await fetchImpl(healthUrl, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000)
      });
      if (response.ok) {
        lines.push(`[ok] API health reachable at ${healthUrl.href}`);
      } else {
        lines.push(`[error] API health returned HTTP ${response.status} at ${healthUrl.href}`);
        exitCode = 1;
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "request failed";
      lines.push(`[error] API health unreachable at ${healthUrl.href}: ${message}`);
      exitCode = 1;
    }
  }

  if (env.CERTSCORE_API_KEY?.trim()) {
    lines.push("[ok] CERTSCORE_API_KEY is present");
    if (options.checkAuth) {
      if (!healthUrl) {
        lines.push("[error] Cannot check credentials until CERTSCORE_BASE_URL is valid");
        exitCode = 1;
      } else {
        const authUrl = new URL("/api/v2/auth/check", healthUrl.origin);
        try {
          const response = await fetchImpl(authUrl, {
            headers: {
              accept: "application/json",
              authorization: `Bearer ${env.CERTSCORE_API_KEY.trim()}`
            },
            signal: AbortSignal.timeout(10_000)
          });
          if (response.ok) {
            lines.push(`[ok] API key authenticated at ${authUrl.href}`);
          } else {
            lines.push(`[error] API key rejected with HTTP ${response.status} at ${authUrl.href}`);
            exitCode = 1;
          }
        } catch (error) {
          const message = error instanceof Error && error.message ? error.message : "request failed";
          lines.push(`[error] API key check failed at ${authUrl.href}: ${message}`);
          exitCode = 1;
        }
      }
    } else {
      lines.push("[info] Run certscore-mcp doctor --check-auth to verify the credential without creating a scan.");
    }
  } else {
    lines.push("[warn] CERTSCORE_API_KEY is not set");
    lines.push(options.checkAuth ? "[error] --check-auth requires CERTSCORE_API_KEY." : "[info] Set CERTSCORE_API_KEY before connecting an MCP client or calling authenticated tools.");
    if (options.checkAuth) {
      exitCode = 1;
    }
  }

  lines.push("CertScore outputs are automated public-web observations for human and agentic review, not legal advice, certification, or a compliance determination.");

  return { exitCode, lines };
}

function isMainModule() {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entrypoint);
  } catch {
    return import.meta.url === `file://${entrypoint}`;
  }
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
