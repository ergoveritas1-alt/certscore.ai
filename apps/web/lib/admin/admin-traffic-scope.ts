export const ADMIN_TRAFFIC_SCOPES = [
  "external",
  "include_internal_qa",
  "include_mac_mini",
  "all",
] as const;

export type AdminTrafficScope = (typeof ADMIN_TRAFFIC_SCOPES)[number];

type AdminTrafficScopeParams = {
  audienceFilters?: string;
  excludeInternal?: string;
  excludeMacMiniScanBot?: string;
  includeCanary?: string;
  scanBotFilter?: string;
  traffic?: string;
};

export function resolveAdminTrafficScope(params: AdminTrafficScopeParams): AdminTrafficScope {
  if (ADMIN_TRAFFIC_SCOPES.includes(params.traffic as AdminTrafficScope)) {
    return params.traffic as AdminTrafficScope;
  }

  const includeInternalQa = params.includeCanary === "1"
    || (params.audienceFilters === "1" && params.excludeInternal !== "1");
  const includeMacMini = params.scanBotFilter === "1"
    ? params.excludeMacMiniScanBot !== "1"
    : false;

  if (includeInternalQa && includeMacMini) return "all";
  if (includeInternalQa) return "include_internal_qa";
  if (includeMacMini) return "include_mac_mini";
  return "external";
}

export function adminTrafficScopeVisibility(scope: AdminTrafficScope) {
  return {
    includeInternalQa: scope === "include_internal_qa" || scope === "all",
    includeMacMini: scope === "include_mac_mini" || scope === "all",
  };
}

export function adminTrafficScopeLabel(scope: AdminTrafficScope) {
  if (scope === "include_internal_qa") return "Include Internal / QA";
  if (scope === "include_mac_mini") return "Include Mac mini";
  if (scope === "all") return "Include all traffic";
  return "External traffic only";
}

export const INTERNAL_QA_EMAILS = ["bmasek@gmail.com"] as const;
export const INTERNAL_QA_REQUESTER_IPS = ["66.27.64.248"] as const;
export const INTERNAL_QA_MCP_CLIENT_NAMES = ["codex-jdpp-repeatability-20260820"] as const;
