import { SCAN_NO_GO_REASON_CODES, SCAN_NO_GO_REASON_PRESENTATIONS } from "@website-signal-risk-scanner/shared";
/** Request validation is separate from execution failure, including historical events. */
const requestErrorLabels: Record<string, string> = {
  invalid_url: "Invalid target URL",
  invalid_scan_id: "Invalid scan ID",
  invalid_arguments: "Invalid arguments",
  unknown_tool: "Unknown tool",
};

type RequestOutcome = { outcome: string; error_code: string | null; scan_status?: string | null };

export function mcpRequestValidationLabel(event: RequestOutcome): string | null {
  return event.outcome === "error" && event.error_code && Object.hasOwn(requestErrorLabels, event.error_code)
    ? requestErrorLabels[event.error_code]! : null;
}

export function mcpScanLimitationLabel(event: RequestOutcome): string | null {
  if (event.scan_status === "completed_limited" && event.outcome === "success") return "Completed with limited coverage";
  return event.outcome === "error" && event.scan_status === "completed_limited" && event.error_code && Object.hasOwn(SCAN_NO_GO_REASON_PRESENTATIONS, event.error_code)
    ? SCAN_NO_GO_REASON_PRESENTATIONS[event.error_code as keyof typeof SCAN_NO_GO_REASON_PRESENTATIONS].customerTitle : null;
}

// Use retained invocation state, never the scan's current snapshot.
export const MCP_SCAN_LIMITED_SQL = `(coalesce(events.scan_status, '') = 'completed_limited' and (events.outcome = 'success' or (events.outcome = 'error' and coalesce(events.error_code, '') in (${SCAN_NO_GO_REASON_CODES.map(code => `'${code}'`).join(", ")}))))`;

// Fixed registry values only; this SQL fragment never interpolates caller input.
export const MCP_INVALID_REQUEST_SQL = `(events.outcome = 'error' and coalesce(events.error_code, '') in (${Object.keys(requestErrorLabels).map(code => `'${code}'`).join(", ")}))`;
export const MCP_EXECUTION_ERROR_SQL = `(events.outcome = 'error' and not ${MCP_INVALID_REQUEST_SQL} and not ${MCP_SCAN_LIMITED_SQL})`;
