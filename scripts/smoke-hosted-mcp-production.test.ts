import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertExactToolNames,
  FULL_TOOL_NAMES,
  LIGHT_TOOL_NAMES,
  readCanaryOptions,
} from "./smoke-hosted-mcp-production";

const source = readFileSync("scripts/smoke-hosted-mcp-production.ts", "utf8");

test("hosted MCP canary protects the exact Light and full tool contracts", () => {
  assert.deepEqual([...LIGHT_TOOL_NAMES].sort(), [
    "certscore_get_scan_bundle",
    "certscore_get_scan_status",
    "certscore_scan_site",
  ]);
  assert.equal(FULL_TOOL_NAMES.length, 12);
  assert.doesNotThrow(() => assertExactToolNames("mcp_light", [...LIGHT_TOOL_NAMES], LIGHT_TOOL_NAMES));
  assert.throws(
    () => assertExactToolNames("mcp_light", ["certscore_scan_site"], LIGHT_TOOL_NAMES),
    /tools\/list contract changed/,
  );
});

test("hosted MCP canary requires a retained scan and environment-only bearer", () => {
  assert.throws(() => readCanaryOptions({}, []), /canonical UUID/);
  assert.throws(
    () => readCanaryOptions({ CERTSCORE_MCP_CANARY_SCAN_ID: "scan_123" }, []),
    /canonical UUID/,
  );
  assert.throws(
    () => readCanaryOptions({ CERTSCORE_MCP_ACCESS_TOKEN: "secret", CERTSCORE_MCP_CANARY_SCAN_ID: "11111111-1111-4111-8111-111111111111" }, ["--access-token=secret"]),
    /only through CERTSCORE_MCP_ACCESS_TOKEN/,
  );
});

test("hosted MCP canary is bounded to reads and can optionally verify persistence", () => {
  assert.match(source, /certscore_get_scan_status/);
  assert.match(source, /certscore_get_scan_bundle/);
  assert.match(source, /mcp_tool_invocation_events/);
  assert.doesNotMatch(source, /name:\s*"certscore_scan_site"/);
  assert.doesNotMatch(source, /CERTSCORE_MCP_ACCESS_TOKEN[^\n]*console/);
  assert.doesNotMatch(source, /run-task|integration_api_keys|pulse:scan/);
});
