/** Request validation is separate from execution failure, including historical events. */
const requestErrorLabels: Record<string, string> = {
  invalid_url: "Invalid target URL",
  invalid_scan_id: "Invalid scan ID",
  invalid_arguments: "Invalid arguments",
  unknown_tool: "Unknown tool",
};

type RequestOutcome = { outcome: string; error_code: string | null };

export function mcpRequestValidationLabel(event: RequestOutcome): string | null {
  return event.outcome === "error" && event.error_code && Object.hasOwn(requestErrorLabels, event.error_code)
    ? requestErrorLabels[event.error_code]! : null;
}

// Fixed registry values only; this SQL fragment never interpolates caller input.
export const MCP_INVALID_REQUEST_SQL = `(events.outcome = 'error' and coalesce(events.error_code, '') in (${Object.keys(requestErrorLabels).map(code => `'${code}'`).join(", ")}))`;
export const MCP_EXECUTION_ERROR_SQL = `(events.outcome = 'error' and not ${MCP_INVALID_REQUEST_SQL})`;
