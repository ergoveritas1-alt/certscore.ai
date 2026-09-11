import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { MCP_RESPONSE_CATEGORY_SQL, MCP_AGENT_NEXT_STEP_SQL, MCP_RETRY_SQL, MCP_FAILURE_SOURCE_SQL, MCP_RESPONSE_CAPTURED_SQL } from "./mcp-response-review";

// Run with MCP_REVIEW_TEST_PG_SOCKET pointing to an isolated local PostgreSQL server.
test("retained-response projections and pagination filters agree in PostgreSQL", { skip: !process.env.MCP_REVIEW_TEST_PG_SOCKET }, () => {
  const cases = [
    { summary: null, expected: ["not_recorded", "not_recorded", "Not recorded", "not_recorded", false] },
    { summary: { version: "1" }, expected: ["not_recorded", "not_recorded", "Not recorded", "not_recorded", false] },
    { summary: { isError: "false" }, expected: ["not_recorded", "not_recorded", "Not recorded", "not_recorded", false] },
    { summary: { version: 99 }, expected: ["not_recorded", "not_recorded", "Not recorded", "not_recorded", false] },
    { summary: { status: "queued", recommendedNextTool: "certscore_get_scan_status", retryAfterSeconds: 15 }, expected: ["pending", "poll_status", "After 15s", "not_applicable", true] },
    { summary: { status: "completed", recommendedNextTool: "certscore_get_scan_bundle" }, expected: ["success", "get_bundle", "Not recorded", "not_applicable", true] },
    { summary: { isError: true, errorCode: "invalid_arguments", retryable: false, recommendedNextAction: "Correct the named fields using the tool input schema." }, expected: ["invalid_request", "correct_input", "Not retryable", "input_validation", true] },
    { summary: { isError: true, errorCode: "unknown_tool", recommendedNextAction: "Refresh tool discovery (tools/list)." }, expected: ["invalid_request", "correct_input", "Not recorded", "tool_discovery", true] },
    { summary: { status: "failed", errorCode: "scanner_runtime_failure", retryable: true, retryAfterSeconds: 30, recommendedNextAction: "Wait 30 seconds, then retry with freshness=refresh. A new scan uses quota." }, expected: ["execution_failed", "wait_retry", "New scan required", "scanner", true] },
    { summary: { status: "completed_limited", errorCode: "authentication_required", retryable: false, recommendedNextAction: "Stop and review the site's access settings." }, expected: ["scan_limited", "stop_review", "Not retryable", "target_site", true] },
    { summary: { isError: true, errorCode: "internal_error", upstream: { operation: "findings", httpStatus: 503 }, textOmitted: true }, expected: ["execution_failed", "not_recorded", "Not recorded", "findings", true] },
    { summary: { isError: true, errorCode: "rate_limited", mcpCode: -32029, retryable: true, retryAfterSeconds: 60, recommendedNextAction: "Wait 60 seconds and retry." }, expected: ["rate_limited", "wait_retry", "After 60s", "mcp_rate_limit", true] },
  ];
  const rows = cases.map((item, id) => ({ id, request_details: { response: { summary: item.summary === null ? null : { version: 1, captureBasis: "response_generated", kind: "tool_result", isError: false, ...item.summary } } }, outcome: "error", scan_status: "failed" }));
  const sql = `with events as (select * from jsonb_to_recordset($fixture$${JSON.stringify(rows)}$fixture$::jsonb) as t(id int, request_details jsonb, outcome text, scan_status text)), projected as (select id, ${MCP_RESPONSE_CATEGORY_SQL} as category, ${MCP_AGENT_NEXT_STEP_SQL} as next_step, ${MCP_RETRY_SQL} as retry, ${MCP_FAILURE_SOURCE_SQL} as source, ${MCP_RESPONSE_CAPTURED_SQL} as captured from events) select jsonb_agg(jsonb_build_array(category,next_step,retry,source,captured) order by id) from projected;`;
  const output = execFileSync(process.env.MCP_REVIEW_TEST_PSQL ?? "psql", ["-h", process.env.MCP_REVIEW_TEST_PG_SOCKET!, "-p", "55484", "-d", "postgres", "-A", "-t", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  assert.deepEqual(JSON.parse(output.trim()), cases.map(item => item.expected));
  // Actual WHERE expressions used before LIMIT/OFFSET, not post-page filtering.
  for (const [expression, expected] of [[MCP_RESPONSE_CATEGORY_SQL, "execution_failed"], [MCP_AGENT_NEXT_STEP_SQL, "not_recorded"], [MCP_FAILURE_SOURCE_SQL, "findings"]]) {
    const query = sql.slice(0, sql.indexOf(", projected as")) + ` select jsonb_agg(id order by id) from events where ${expression} = '${expected}';`;
    const ids = JSON.parse(execFileSync(process.env.MCP_REVIEW_TEST_PSQL ?? "psql", ["-h", process.env.MCP_REVIEW_TEST_PG_SOCKET!, "-p", "55484", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8" }).trim());
    const column = expression === MCP_RESPONSE_CATEGORY_SQL ? 0 : expression === MCP_AGENT_NEXT_STEP_SQL ? 1 : 3;
    assert.deepEqual(ids, cases.flatMap((item, id) => item.expected[column] === expected ? [id] : []));
  }
});
