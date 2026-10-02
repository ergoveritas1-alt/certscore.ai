import type { FullSiteReportResponse } from "../../server/scans/full-site-report";

const CACHE_KEY = "certscore:full-site-report:v1";
// A completed site report can exceed the previous 1.5M-character cutoff.
// Storage quota errors remain caught below; this only allows a larger report
// to survive a refresh in browsers with sufficient session storage.
const MAX_CHARS = 4_000_000;
const MAX_AGE_MS = 60 * 60 * 1000;

type CachedReport = {
  version: 1;
  scanId: string;
  scope: string;
  savedAt: number;
  data: FullSiteReportResponse;
};

export function isCompletedFullSiteReport(data: FullSiteReportResponse) {
  return Boolean(data.score && Number.isFinite(data.score.value) &&
    !["waiting_homepage", "running"].includes(data.summary.state.status) &&
    data.summary.counts.active === 0);
}

export function readFullSiteReportSessionCache(storage: Pick<Storage, "getItem">, scanId: string, scope: string, now = Date.now()) {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw || raw.length > MAX_CHARS) return null;
    const cached = JSON.parse(raw) as CachedReport;
    if (cached.version !== 1 || cached.scanId !== scanId || cached.scope !== scope ||
      !Number.isFinite(cached.savedAt) || cached.savedAt > now || now - cached.savedAt > MAX_AGE_MS ||
      !cached.data || !isCompletedFullSiteReport(cached.data)) return null;
    return cached.data;
  } catch {
    return null;
  }
}

export function writeFullSiteReportSessionCache(storage: Pick<Storage, "setItem">, scanId: string, scope: string, data: FullSiteReportResponse, now = Date.now()) {
  if (!isCompletedFullSiteReport(data)) return false;
  try {
    const serialized = JSON.stringify({ version: 1, scanId, scope, savedAt: now, data } satisfies CachedReport);
    if (serialized.length > MAX_CHARS) return false;
    storage.setItem(CACHE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}
