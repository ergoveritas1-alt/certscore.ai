import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("MCP smoke uses the one-call scan workflow and only polls when needed", async () => {
  const source = await readFile("scripts/smoke-certscore-mcp.mjs", "utf8");
  const terminalWait = source.indexOf("await waitForTerminalScan(created)");
  const findingsFetch = source.indexOf('name: "certscore_list_findings"');
  assert.ok(terminalWait >= 0);
  assert.ok(findingsFetch > terminalWait);
  assert.match(source, /name: "certscore_scan_site"/);
  assert.doesNotMatch(source, /name: "create_scan"/);
  assert.doesNotMatch(source, /name: "certscore_get_report"/);
  assert.match(source, /terminalFailure/);
  assert.match(source, /timeoutMs/);
  assert.match(source, /Math\.random/);
  assert.match(source, /verifyScanAndFindings/);
  assert.match(source, /CERTSCORE_MCP_SMOKE_FRESHNESS/);
  assert.doesNotMatch(source, /console\.log\([^\n]*apiKey/);
});
