#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCertScoreMcpServer } from "./server.js";

export { createCertScoreMcpServer } from "./server.js";
export { explainFinding, exportFindings, findingsFromReport } from "./tools.js";

function parseTimeout(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : undefined;
}

async function main() {
  const server = createCertScoreMcpServer({
    apiKey: process.env.CERTSCORE_API_KEY,
    baseUrl: process.env.CERTSCORE_BASE_URL,
    timeout: parseTimeout(process.env.CERTSCORE_REQUEST_TIMEOUT_MS)
  });
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
