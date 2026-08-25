// Scanner-origin operational ownership is keyed by daemon credential identity,
// so the classification remains stable when the Mac mini's network changes.
export const MAC_MINI_SCAN_BOT_API_KEY_NAMES = [
  "CertScore paired-region production daemon",
  "CertScore 500/day API key",
  "Production scanning daemon",
  "Codex failed-scan 72h audit"
] as const;
