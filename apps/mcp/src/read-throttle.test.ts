import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharedPolicy from "@website-signal-risk-scanner/shared";
import { McpReadThrottle, mcpReadCallsFromJsonRpc, mcpReadRateLimitGuidance } from "./read-throttle.js";

function toolCall(name: string, args: Record<string, unknown>) {
  return { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
}

test("classifies composite and direct MCP scan reads", () => {
  assert.deepEqual(mcpReadCallsFromJsonRpc(toolCall("certscore_get_scan_bundle", { scanId: "scan_1", detail: "summary" })), [{
    profile: "terminal",
    target: "scan:scan_1",
    tool: "certscore_get_scan_bundle",
    units: 4
  }]);
  assert.deepEqual(mcpReadCallsFromJsonRpc(toolCall("certscore_scan_site", { url: "https://example.com" })), []);
  assert.equal(mcpReadCallsFromJsonRpc(toolCall("certscore_get_scan_status", { scanId: "scan_1" }))[0]?.profile, "status");
});

test("cookie/tracker graph reads use the canonical evidence weight on scan and domain paths", () => {
  for (const [name, args] of [
    ["certscore_get_pre_consent_cookies_trackers", { scanId: "scan_1" }],
    ["certscore_get_latest_domain_pre_consent_cookies_trackers", { domain: "example.com" }],
  ] as const) assert.equal(mcpReadCallsFromJsonRpc(toolCall(name, args))[0]?.units, sharedPolicy.apiReadRateUnits("evidence"));
});

test("allows thirty composite reads for one caller and scan, then cools down", () => {
  const throttle = new McpReadThrottle();
  const call = mcpReadCallsFromJsonRpc(toolCall("certscore_get_scan_bundle", { scanId: "scan_1", detail: "evidence" }))[0];
  assert.ok(call);
  for (let index = 1; index <= 30; index += 1) {
    assert.equal(throttle.claim("caller_1", call, index * 1_000).allowed, true);
  }
  const thirtyFirst = throttle.claim("caller_1", call, 31_000);
  assert.equal(thirtyFirst.allowed, false);
  if (thirtyFirst.allowed) return;
  assert.equal(thirtyFirst.reason, "mcp_scan_read_caller_target_limit");
  assert.equal(thirtyFirst.retryAfterSeconds, 570);
  assert.equal(thirtyFirst.profile, "terminal");
  assert.equal(thirtyFirst.scope, "callerTarget");
  assert.equal(thirtyFirst.windowId, "burst");
  assert.equal(thirtyFirst.windowSeconds, 600);
  assert.equal(thirtyFirst.limitUnits, 120);
  assert.equal(thirtyFirst.usedUnits, 120);
  assert.equal(thirtyFirst.requestedUnits, 4);
  const guidance = mcpReadRateLimitGuidance(call, thirtyFirst, { anonymousLight: true });
  assert.match(guidance.message, /this MCP session and scan/i);
  assert.match(guidance.message, /120 terminal-read units per 10-minute rolling window/i);
  assert.match(guidance.message, /up to 30 bundle reads/i);
  assert.match(guidance.message, /login\?mode=create_account/);
  assert.match(guidance.message, /does not automatically change the anonymous Light MCP limit/i);
  assert.equal(guidance.upgradeAvailable, true);
  assert.equal(guidance.accountUrl, "https://certscore.ai/login?mode=create_account");

  const authenticatedGuidance = mcpReadRateLimitGuidance(call, thirtyFirst, { authenticated: true });
  assert.match(authenticatedGuidance.message, /this authenticated OAuth identity and scan/i);
  assert.match(authenticatedGuidance.message, /authenticated MCP account/i);
  assert.doesNotMatch(authenticatedGuidance.message, /create an account/i);
  assert.equal(authenticatedGuidance.accountUrl, null);
});

test("bounds low-and-slow composite reads to twelve hundred units per rolling day", () => {
  const throttle = new McpReadThrottle();
  const call = mcpReadCallsFromJsonRpc(toolCall("certscore_get_scan_bundle", { scanId: "scan_1", detail: "evidence" }))[0];
  assert.ok(call);
  const twoMinutes = 2 * 60 * 1_000;
  for (let index = 0; index < 300; index += 1) {
    assert.equal(throttle.claim("caller_1", call, index * twoMinutes).allowed, true);
  }
  const next = throttle.claim("caller_1", call, 300 * twoMinutes);
  assert.equal(next.allowed, false);
  if (next.allowed) return;
  assert.equal(next.reason, "mcp_scan_read_daily_caller_target_limit");
  assert.equal(next.retryAfterSeconds, 50_400);
});

test("status polling has a separate bounded allowance", () => {
  const throttle = new McpReadThrottle();
  const call = mcpReadCallsFromJsonRpc(toolCall("certscore_get_scan_status", { scanId: "scan_1" }))[0];
  assert.ok(call);
  for (let index = 0; index < 120; index += 1) {
    assert.equal(throttle.claim("caller_1", call, index).allowed, true);
  }
  assert.equal(throttle.claim("caller_1", call, 121).allowed, false);
});

test("many independent callers can read one popular completed scan", () => {
  const throttle = new McpReadThrottle();
  const call = mcpReadCallsFromJsonRpc(toolCall("certscore_get_scan_bundle", { scanId: "cnn", detail: "summary" }))[0];
  assert.ok(call);
  for (let index = 0; index < 250; index += 1) {
    assert.equal(throttle.claim(`caller_${index}`, call, index).allowed, true);
  }
});

test("shared-provider sessions have independent caller limits and a hard provider aggregate", () => {
  const throttle = new McpReadThrottle();
  const call = mcpReadCallsFromJsonRpc(toolCall("certscore_get_scan_bundle", { scanId: "scan_1" }))[0];
  assert.ok(call);
  for (let index = 0; index < 2_000; index += 1) {
    assert.equal(throttle.claim(`session_${index}`, { ...call, target: `scan:${index}` }, index, "anthropic").allowed, true);
  }
  const denied = throttle.claim("fresh_session", { ...call, target: "scan:fresh" }, 2_001, "anthropic");
  assert.equal(denied.allowed, false);
  if (denied.allowed) return;
  assert.equal(denied.scope, "provider");
  assert.equal(denied.limitUnits, 8_000);
  const guidance = mcpReadRateLimitGuidance(call, denied, { anonymousLight: true });
  assert.match(guidance.message, /shared Anthropic provider service/i);
  assert.match(guidance.message, /registering an account will not bypass/i);
  assert.equal(guidance.upgradeAvailable, false);
  assert.equal(guidance.accountUrl, null);
});

test("hosted MCP returns a bot-readable 429 and emits a structured safe denial log", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(source, /\bjson\(res, 429/);
  assert.match(source, /"Retry-After"/);
  assert.match(source, /mcpReadRateLimitGuidance/);
  assert.match(source, /reasonCode: "rate_limited"/);
  for (const field of ["policyVersion", "profile", "scope", "windowId", "windowSeconds", "limitUnits", "usedUnits", "requestedUnits", "retryAfterSeconds"]) {
    assert.match(source, new RegExp(field));
  }
  const logBlock = source.slice(source.indexOf('event: "mcp_http.scan_read_rate_limited"'), source.indexOf("const rpcRequest"));
  assert.doesNotMatch(logBlock, /target: readCall\.target/);
  assert.doesNotMatch(logBlock, /tokenHash/);
});
