export type AdminApiRoute = "MCP" | "Other" | "Pulse" | "SDK";

export const ADMIN_API_ROUTES: readonly AdminApiRoute[] = ["Pulse", "SDK", "MCP", "Other"];

export function adminApiRouteSql(input: { requestChannel: string; requestSource: string }) {
  const value = `lower(concat_ws(' ', ${input.requestChannel}, ${input.requestSource}))`;
  return `(case
    when ${value} ~ '(^|[^a-z])mcp([^a-z]|$)' then 'MCP'
    when ${value} ~ '(^|[^a-z])sdk([^a-z]|$)' then 'SDK'
    when ${value} ~ 'pulse|gpt_action|public_page' then 'Pulse'
    else 'Other'
  end)`;
}

export function classifyAdminApiRoute(input: {
  requestChannel?: string | null;
  requestSource?: string | null;
}): AdminApiRoute {
  const value = `${input.requestChannel ?? ""} ${input.requestSource ?? ""}`.trim().toLowerCase();
  if (/(^|[^a-z])mcp([^a-z]|$)/.test(value)) return "MCP";
  if (/(^|[^a-z])sdk([^a-z]|$)/.test(value)) return "SDK";
  if (/pulse|gpt_action|public_page/.test(value)) return "Pulse";
  return "Other";
}
