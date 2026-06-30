import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSmokeKey } from "./smoke-certscore-mcp-production";

const source = readFileSync("scripts/smoke-certscore-mcp-production.ts", "utf8");
const consoleLines = source
  .split("\n")
  .filter((line) => /console\.(log|info|error)/.test(line));

test("production MCP smoke keeps the expected safety rails", () => {
  assert.match(source, /command: "certscore-mcp"/);
  assert.match(source, /https:\/\/certscore\.ai\/api\/v2\/health/);
  assert.match(source, /scan_site/);
  assert.match(source, /get_scan_status/);
  assert.match(source, /get_scan/);
  assert.match(source, /list_findings/);
  assert.match(source, /explain_finding/);
  assert.match(source, /get_pre_consent_cookies_trackers/);
  assert.match(source, /get_latest_domain_scan/);
  assert.match(source, /get_latest_domain_pre_consent_cookies_trackers/);
  assert.match(source, /Production MCP smoke expected at least one finding/);
  assert.match(source, /Production MCP smoke expected at least one pre-consent cookies\/trackers row/);
  assert.match(source, /set status = 'revoked', updated_at = timezone\('utc', now\(\)\)/);
  assert.doesNotMatch(source, /revoked_at/);
  assert.equal(consoleLines.some((line) => /key\.token(?!Prefix|Hash)|CERTSCORE_API_KEY/.test(line)), false);
});

test("production MCP smoke key helper returns only bounded preview metadata", () => {
  const key = createSmokeKey("static-test", 1);
  assert.match(key.token, /^cs_preview_/);
  assert.match(key.tokenHash, /^[a-f0-9]{64}$/);
  assert.match(key.tokenPrefix, /^cs_preview_[A-Za-z0-9_-]{8}$/);
  assert.equal(key.createdBy, "static-test");
});
