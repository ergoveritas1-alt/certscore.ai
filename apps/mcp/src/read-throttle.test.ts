import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { McpReadThrottle, mcpReadCallsFromJsonRpc } from "./read-throttle.js";

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

test("allows five composite reads for one caller and scan, then cools down", () => {
  const throttle = new McpReadThrottle();
  const call = mcpReadCallsFromJsonRpc(toolCall("certscore_get_scan_bundle", { scanId: "scan_1", detail: "evidence" }))[0];
  assert.ok(call);
  for (let index = 1; index <= 5; index += 1) {
    assert.equal(throttle.claim("caller_1", call, index * 1_000).allowed, true);
  }
  const sixth = throttle.claim("caller_1", call, 6_000);
  assert.equal(sixth.allowed, false);
  if (sixth.allowed) return;
  assert.equal(sixth.reason, "mcp_scan_read_caller_target_limit");
  assert.equal(sixth.retryAfterSeconds, 595);
  assert.equal(sixth.profile, "terminal");
  assert.equal(sixth.scope, "callerTarget");
  assert.equal(sixth.windowId, "burst");
  assert.equal(sixth.windowSeconds, 600);
  assert.equal(sixth.limitUnits, 20);
  assert.equal(sixth.usedUnits, 20);
  assert.equal(sixth.requestedUnits, 4);
});

test("bounds low-and-slow composite reads to forty units per rolling day", () => {
  const throttle = new McpReadThrottle();
  const call = mcpReadCallsFromJsonRpc(toolCall("certscore_get_scan_bundle", { scanId: "scan_1", detail: "evidence" }))[0];
  assert.ok(call);
  const elevenMinutes = 11 * 60 * 1_000;
  for (let index = 0; index < 10; index += 1) {
    assert.equal(throttle.claim("caller_1", call, index * elevenMinutes).allowed, true);
  }
  const eleventh = throttle.claim("caller_1", call, 10 * elevenMinutes);
  assert.equal(eleventh.allowed, false);
  if (eleventh.allowed) return;
  assert.equal(eleventh.reason, "mcp_scan_read_daily_caller_target_limit");
  assert.equal(eleventh.retryAfterSeconds, 79_800);
});

test("status polling has a separate bounded allowance", () => {
  const throttle = new McpReadThrottle();
  const call = mcpReadCallsFromJsonRpc(toolCall("certscore_get_scan_status", { scanId: "scan_1" }))[0];
  assert.ok(call);
  for (let index = 0; index < 30; index += 1) {
    assert.equal(throttle.claim("caller_1", call, index).allowed, true);
  }
  assert.equal(throttle.claim("caller_1", call, 31).allowed, false);
});

test("hosted MCP returns a bot-readable 429 and emits a structured safe denial log", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(source, /return json\(res, 429/);
  assert.match(source, /"Retry-After"/);
  assert.match(source, /apiReadRateLimitGuidance/);
  for (const field of ["policyVersion", "profile", "scope", "windowId", "windowSeconds", "limitUnits", "usedUnits", "requestedUnits", "retryAfterSeconds"]) {
    assert.match(source, new RegExp(field));
  }
  const logBlock = source.slice(source.indexOf('event: "mcp_http.scan_read_rate_limited"'), source.indexOf("const rpcRequest"));
  assert.doesNotMatch(logBlock, /target: readCall\.target/);
  assert.doesNotMatch(logBlock, /tokenHash/);
});
