import assert from "node:assert/strict";
import test from "node:test";
import { mcpScanLimitationLabel, MCP_SCAN_LIMITED_SQL, mcpRequestValidationLabel, MCP_INVALID_REQUEST_SQL, MCP_EXECUTION_ERROR_SQL } from "./mcp-request-outcome";

test("historical validation failures are distinct from scan and execution failures", () => {
  for (const [error_code, label] of [
    ["invalid_url", "Invalid target URL"],
    ["invalid_scan_id", "Invalid scan ID"],
    ["invalid_arguments", "Invalid arguments"],
    ["unknown_tool", "Unknown tool"],
  ] as const) {
    assert.equal(mcpRequestValidationLabel({ outcome: "error", error_code }), label);
    assert.equal(mcpRequestValidationLabel({ outcome: "success", error_code }), null);
    assert.equal(mcpRequestValidationLabel({ outcome: "rate_limited", error_code }), null);
    assert.ok(MCP_INVALID_REQUEST_SQL.includes(`'${error_code}'`));
  }
  for (const error_code of [null, "handler_exception", "scan_failed", "protocol_error", "scan_not_found", "toString", "__proto__"]) {
    assert.equal(mcpRequestValidationLabel({ outcome: "error", error_code }), null);
  }
  assert.ok(MCP_EXECUTION_ERROR_SQL.includes(`not ${MCP_INVALID_REQUEST_SQL}`));
});


test("limited classification requires retained limited status and a canonical reason", () => {
  assert.equal(mcpScanLimitationLabel({ outcome: "error", error_code: "authentication_required", scan_status: "completed_limited" }), "Sign-in required");
  for (const scan_status of [null, "failed", "completed", "queued"]) {
    assert.equal(mcpScanLimitationLabel({ outcome: "error", error_code: "authentication_required", scan_status }), null);
  }
  assert.equal(mcpScanLimitationLabel({ outcome: "error", error_code: "handler_exception", scan_status: "completed_limited" }), null);
  assert.equal(mcpScanLimitationLabel({ outcome: "success", error_code: null, scan_status: "completed_limited" }), "Completed with limited coverage");
  assert.ok(MCP_SCAN_LIMITED_SQL.includes("coalesce(events.scan_status, '')"));
  assert.ok(MCP_EXECUTION_ERROR_SQL.includes(`not ${MCP_SCAN_LIMITED_SQL}`));
});
