import assert from "node:assert/strict";
import test from "node:test";
import { listLocalLightTools } from "./smoke-certscore-mcp-http-tools-diff";

test("deployment parity reads the built Light profile rather than filtering the full schema", async () => {
  const { tools } = await listLocalLightTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), [
    "certscore_get_report_evidence_page", "certscore_get_scan_bundle", "certscore_get_scan_status", "certscore_scan_site",
  ]);
  const scan = tools.find(tool => tool.name === "certscore_scan_site")!;
  assert.equal(scan.inputSchema.properties?.waitForCompletion, undefined);
  assert.equal(scan.inputSchema.properties?.maxWaitSeconds, undefined);
  assert.deepEqual(scan.inputSchema.required, ["url"]);
  const report = tools.find(tool => tool.name === "certscore_get_report_evidence_page")!;
  assert.deepEqual((report.inputSchema.properties?.section as { enum: string[] }).enum, [
    "consent", "gpc", "policy", "tracking", "transport", "forms",
  ]);
});
