import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("MCP smoke waits for a terminal scan before requesting its report", async () => {
  const source = await readFile("scripts/smoke-certscore-mcp.mjs", "utf8");
  const terminalWait = source.indexOf("await waitForTerminalScan(created)");
  const reportFetch = source.indexOf('name: "get_report"');
  assert.ok(terminalWait >= 0);
  assert.ok(reportFetch > terminalWait);
  assert.match(source, /terminalFailure/);
  assert.match(source, /timeoutMs/);
  assert.match(source, /Math\.random/);
  assert.match(source, /verifyReport/);
  assert.match(source, /CERTSCORE_MCP_SMOKE_FRESHNESS/);
  assert.doesNotMatch(source, /console\.log\([^\n]*apiKey/);
});
