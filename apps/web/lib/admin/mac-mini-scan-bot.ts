// Scanner-origin operational ownership is keyed by daemon credential identity,
// so that portion remains stable when the Mac mini's network changes. Hosted MCP
// telemetry has no daemon credential, so its explicit client and requester-IP
// identities are kept alongside the scanner identities here.
export const MAC_MINI_SCAN_BOT_API_KEY_NAMES = [
  "CertScore paired-region production daemon",
  "CertScore 500/day API key",
  "Production scanning daemon",
  "Codex failed-scan 72h audit"
] as const;

export const MAC_MINI_SCAN_BOT_MCP_CLIENT_NAMES = [
  "codex-jdpp-repeatability-20260820"
] as const;

export const MAC_MINI_SCAN_BOT_REQUESTER_IPS = [
  "66.27.64.248"
] as const;

export type MacMiniScanBotFilterParams = {
  excludeMacMiniScanBot?: string;
  scanBotFilter?: string;
};

export function resolveExcludeMacMiniScanBot(params: MacMiniScanBotFilterParams) {
  return params.scanBotFilter === "1"
    ? params.excludeMacMiniScanBot === "1"
    : true;
}
