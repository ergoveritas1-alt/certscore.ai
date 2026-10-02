const PREFIX = "certscore:full-site-report-cooldown:v1:";
const MAX_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Share a server-directed read cooldown across tabs viewing the same scan. */
export function readFullSiteReportCooldown(storage: Pick<Storage, "getItem"> | null, scanId: string, now = Date.now()) {
  try {
    const until = Number(storage?.getItem(`${PREFIX}${scanId}`));
    return Number.isFinite(until) && until > now && until <= now + MAX_COOLDOWN_MS ? until : 0;
  } catch { return 0; }
}

export function saveFullSiteReportCooldown(storage: Pick<Storage, "getItem" | "setItem"> | null, scanId: string, retryAfter: string | null, now = Date.now()) {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  const retryAt = retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) : NaN;
  const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000
    : Number.isFinite(retryAt) ? retryAt - now : 60_000;
  const until = Math.max(readFullSiteReportCooldown(storage, scanId, now), now + Math.max(1_000, Math.min(MAX_COOLDOWN_MS, delay)));
  try { storage?.setItem(`${PREFIX}${scanId}`, String(until)); } catch { /* Keep the in-memory cooldown. */ }
  return until;
}

export function clearFullSiteReportCooldown(storage: Pick<Storage, "removeItem"> | null, scanId: string) {
  try { storage?.removeItem(`${PREFIX}${scanId}`); } catch { /* Browser storage is optional. */ }
}
