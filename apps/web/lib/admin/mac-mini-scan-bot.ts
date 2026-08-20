// Operational ownership is keyed by the daemon credential identity, not a raw IP
// or IP hash, so the filter remains stable when the Mac mini's network changes.
export const MAC_MINI_SCAN_BOT_API_KEY_NAMES = [
  "CertScore paired-region production daemon",
  "CertScore 500/day API key",
  "Production scanning daemon",
  "Codex failed-scan 72h audit"
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
