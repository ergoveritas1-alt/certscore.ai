import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createSmokeKey,
  parseToolJson,
  REQUIRED_TOOLS
} from "./smoke-certscore-mcp-production";

const source = readFileSync("scripts/smoke-certscore-mcp-production.ts", "utf8");
const consoleLines = source
  .split("\n")
  .filter((line) => /console\.(log|info|error)/.test(line));

test("production MCP smoke keeps the expected safety rails", () => {
  assert.match(source, /CERTSCORE_MCP_COMMAND/);
  assert.match(source, /command: MCP_COMMAND/);
  assert.match(source, /https:\/\/certscore\.ai\/api\/v2\/health/);
  assert.match(source, /certscore_scan_site/);
  assert.match(source, /certscore_get_scan_status/);
  assert.match(source, /certscore_get_scan/);
  assert.match(source, /certscore_get_scan_bundle/);
  assert.match(source, /certscore_get_report/);
  assert.match(source, /certscore_get_evidence/);
  assert.match(source, /certscore_export_findings/);
  assert.match(source, /certscore_list_findings/);
  assert.match(source, /certscore_explain_finding/);
  assert.match(source, /certscore_get_pre_consent_cookies_trackers/);
  assert.match(source, /certscore_get_latest_domain_scan/);
  assert.match(source, /certscore_get_latest_domain_pre_consent_cookies_trackers/);
  assert.match(source, /Production MCP smoke expected at least one finding/);
  assert.match(source, /Production MCP smoke expected at least one pre-consent cookies\/trackers row/);
  assert.match(source, /set status = 'revoked', updated_at = timezone\('utc', now\(\)\)/);
  assert.doesNotMatch(source, /revoked_at/);
  assert.equal(consoleLines.some((line) => /key\.token(?!Prefix|Hash)|CERTSCORE_API_KEY/.test(line)), false);
  assert.match(source, /CERTSCORE_ALLOW_PAID_ECS_SMOKE/);
  assert.match(source, /Installed legacy CLI version/);
});

test("production MCP smoke requires the exact 12-tool surface", () => {
  assert.deepEqual([...REQUIRED_TOOLS].sort(), [
    "certscore_explain_finding",
    "certscore_export_findings",
    "certscore_get_evidence",
    "certscore_get_latest_domain_pre_consent_cookies_trackers",
    "certscore_get_latest_domain_scan",
    "certscore_get_pre_consent_cookies_trackers",
    "certscore_get_report",
    "certscore_get_scan",
    "certscore_get_scan_bundle",
    "certscore_get_scan_status",
    "certscore_list_findings",
    "certscore_scan_site"
  ]);
});

test("production MCP smoke reads structured tool output before summary text", () => {
  assert.deepEqual(parseToolJson({
    content: [{ type: "text", text: "Human-readable summary." }],
    structuredContent: { scanId: "scan_123", status: "completed" }
  } as never), {
    scanId: "scan_123",
    status: "completed"
  });
});

test("production MCP smoke key helper returns only bounded preview metadata", () => {
  const key = createSmokeKey("static-test", 1);
  assert.match(key.token, /^cs_preview_/);
  assert.match(key.tokenHash, /^[a-f0-9]{64}$/);
  assert.match(key.tokenPrefix, /^cs_preview_[A-Za-z0-9_-]{8}$/);
  assert.equal(key.createdBy, "static-test");
});
