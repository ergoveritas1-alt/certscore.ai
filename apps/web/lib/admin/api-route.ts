export type AdminApiRoute = "MCP" | "Other" | "Pulse" | "SDK";

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
