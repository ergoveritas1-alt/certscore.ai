import { SCAN_NO_GO_REASON_PRESENTATIONS } from "@website-signal-risk-scanner/shared";

/** Read-only projections of the retained response; no current scan data or policy fallback. */
export const MCP_RESPONSE_CATEGORIES = {
  invalid_request: "Invalid request", pending: "Pending", scan_limited: "Scan limited",
  execution_failed: "Execution failed", rate_limited: "Rate limited", success: "Success", not_recorded: "Not recorded",
} as const;
export const MCP_AGENT_NEXT_STEPS = {
  correct_input: "Correct input", poll_status: "Poll status", get_bundle: "Get bundle",
  wait_retry: "Wait and retry", stop_review: "Stop/review", not_recorded: "Not recorded",
} as const;
export const MCP_FAILURE_SOURCES = {
  input_validation: "Input validation", tool_discovery: "Tool discovery", scan_create: "Upstream creation",
  scan_status: "Upstream status", scan_resource: "Upstream resource", findings: "Upstream findings", finding: "Upstream finding",
  report: "Upstream report", evidence: "Upstream evidence", pre_consent: "Upstream pre-consent", domain_latest: "Upstream domain",
  other: "Upstream other", scanner: "Scanner", target_site: "Target site", mcp_rate_limit: "MCP rate limit", not_applicable: "—", not_recorded: "Not recorded",
} as const;
export const MCP_RESPONSE_CAPTURE_OPTIONS = { recorded: "Captured", missing: "Missing capture" } as const;
export type McpResponseCategory = keyof typeof MCP_RESPONSE_CATEGORIES;
export type McpAgentNextStep = keyof typeof MCP_AGENT_NEXT_STEPS;
export type McpFailureSource = keyof typeof MCP_FAILURE_SOURCES;

const summary = `(events.request_details->'response'->'summary')`;
const field = (name: string) => `(${summary}->>'${name}')`;
export const MCP_RESPONSE_CAPTURED_SQL = `coalesce((jsonb_typeof(${summary}->'version') = 'number' and ${field("version")} = '1' and ${field("captureBasis")} = 'response_generated' and ${field("kind")} in ('tool_result', 'protocol_error') and jsonb_typeof(${summary}->'isError') = 'boolean'), false)`;
const code = field("errorCode");
const status = field("status");
const invalid = `${code} in ('invalid_url', 'invalid_scan_id', 'invalid_arguments')`;
const failed = `(${field("isError")} = 'true' or ${status} in ('failed', 'expired'))`;
const action = `lower(coalesce(${field("recommendedNextAction")}, ''))`;
const projection = (cases: string, fallback = "not_recorded") => `(case when not (${MCP_RESPONSE_CAPTURED_SQL}) then 'not_recorded' ${cases} else '${fallback}' end)`;

export const MCP_RESPONSE_CATEGORY_SQL = projection(`
  when ${invalid} or ${code} = 'unknown_tool' then 'invalid_request'
  when ${status} = 'completed_limited' then 'scan_limited'
  when ${status} = 'rate_limited' or ${code} = 'rate_limited' then 'rate_limited'
  when ${failed} then 'execution_failed'
  when ${status} in ('created', 'accepted', 'queued', 'running', 'processing', 'finalizing') then 'pending'
  when ${field("isError")} = 'false' then 'success'`);
export const MCP_AGENT_NEXT_STEP_SQL = projection(`
  when ${field("recommendedNextTool")} = 'certscore_get_scan_status' then 'poll_status'
  when ${field("recommendedNextTool")} = 'certscore_get_scan_bundle' then 'get_bundle'
  when ${action} like '%tool discovery%' or ${action} like '%correct%' or ${action} like '%provide%' or ${action} like '%ask for a publicly%' or ${action} like '%check the spelling%' or ${action} like 'use the unchanged scanid%' then 'correct_input'
  when ${action} like '%call certscore_get_scan_status%' then 'poll_status'
  when ${action} like '%call certscore_get_scan_bundle%' then 'get_bundle'
  when ${action} like '%wait%' and ${action} like '%retry%' then 'wait_retry'
  when ${action} like '%stop%' or ${action} like '%review%' or ${action} like '%contact support%' then 'stop_review'`);
export const MCP_RETRY_SQL = projection(`
  when ${field("retryable")} = 'false' then 'Not retryable'
  when ${field("retryable")} = 'true' and ${action} like '%freshness=refresh%' and ${action} like '%new scan%' then 'New scan required'
  when jsonb_typeof(${summary}->'retryAfterSeconds') = 'number' then 'After ' || ${field("retryAfterSeconds")} || 's'
  when ${field("retryable")} = 'true' then 'Retry allowed'`, "Not recorded").replace("then 'not_recorded'", "then 'Not recorded'");
const operations = Object.keys(MCP_FAILURE_SOURCES).filter(key => !["input_validation", "tool_discovery", "scanner", "target_site", "mcp_rate_limit", "not_applicable", "not_recorded"].includes(key));
const targetReasons = Object.entries(SCAN_NO_GO_REASON_PRESENTATIONS).filter(([, value]) => value.limitationKind !== "scanner_capture_limitation").map(([key]) => `'${key}'`).join(", ");
const captureReasons = Object.entries(SCAN_NO_GO_REASON_PRESENTATIONS).filter(([, value]) => value.limitationKind === "scanner_capture_limitation").map(([key]) => `'${key}'`).join(", ");
export const MCP_FAILURE_SOURCE_SQL = projection(`
  when ${invalid} then 'input_validation'
  when ${code} = 'unknown_tool' then 'tool_discovery'
  when ${summary}->'upstream'->>'operation' in (${operations.map(key => `'${key}'`).join(", ")}) then ${summary}->'upstream'->>'operation'
  when ${code} in ('scanner_runtime_failure', 'scan_expired', ${captureReasons}) then 'scanner'
  when ${status} = 'completed_limited' and ${code} in (${targetReasons}) then 'target_site'
  when ${code} = 'rate_limited' and ${field("mcpCode")} = '-32029' then 'mcp_rate_limit'
  when ${field("isError")} = 'false' and coalesce(${status}, '') not in ('failed', 'expired', 'completed_limited') then 'not_applicable'`);
