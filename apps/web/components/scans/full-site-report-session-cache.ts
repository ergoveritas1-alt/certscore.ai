import { groupStoredReportScorePriorities } from "../../lib/scans/accessibility-priority-group";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";

// Keep the key stable so a refreshed report replaces the old payload without
// consuming a second report-sized entry in session storage.
const CACHE_KEY = "certscore:full-site-report:v1";
// A completed site report can exceed the previous 1.5M-character cutoff.
// Storage quota errors remain caught below; this only allows a larger report
// to survive a refresh in browsers with sufficient session storage.
const MAX_CHARS = 4_000_000;
const MAX_AGE_MS = 60 * 60 * 1000;

type CachedReport = {
  version: 2;
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
    // Version 2 invalidates priorities cached before accessibility grouping.
    if (cached.version !== 2 || cached.scanId !== scanId || cached.scope !== scope ||
      !Number.isFinite(cached.savedAt) || cached.savedAt > now || now - cached.savedAt > MAX_AGE_MS ||
      !cached.data || !isCompletedFullSiteReport(cached.data)) return null;
    return { ...cached.data, score: groupStoredReportScorePriorities(cached.data.score!) };
  } catch {
    return null;
  }
}

export function writeFullSiteReportSessionCache(storage: Pick<Storage, "setItem">, scanId: string, scope: string, data: FullSiteReportResponse, now = Date.now()) {
  if (!isCompletedFullSiteReport(data)) return false;
  try {
    const serialized = JSON.stringify({ version: 2, scanId, scope, savedAt: now, data } satisfies CachedReport);
    if (serialized.length > MAX_CHARS) return false;
    storage.setItem(CACHE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

// The first view has its own small browser entry; detailed inventories remain optional.
const PREVIEW_KEY = "certscore:full-site-overview:v1";
type Preview = import("../../server/scans/full-site-report").FullSiteReportPreview;
export function isCompletedFullSitePreview(data: Preview) {
  return Boolean(data.cacheable && data.score && Number.isFinite(data.score.value) &&
    !["waiting_homepage", "running"].includes(data.summary.state.status) && data.summary.counts.active === 0);
}
export function readFullSitePreviewSessionCache(storage: Pick<Storage, "getItem">, scanId: string, scope: string, now = Date.now()): Preview | null {
  try {
    const raw = storage.getItem(PREVIEW_KEY);
    if (!raw || raw.length > 500_000) return null;
    const cached = JSON.parse(raw) as { scanId: string; scope: string; savedAt: number; data: Preview };
    return cached.scanId === scanId && cached.scope === scope && Number.isFinite(cached.savedAt) &&
      cached.savedAt <= now && now - cached.savedAt <= MAX_AGE_MS &&
      cached.data?.version === "full-site-report-preview.v1" && cached.data.summary.state.scanId === scanId &&
      isCompletedFullSitePreview(cached.data) ? cached.data : null;
  } catch { return null; }
}
export function writeFullSitePreviewSessionCache(storage: Pick<Storage, "setItem">, scanId: string, scope: string, data: Preview, now = Date.now()) {
  if (!isCompletedFullSitePreview(data)) return false;
  try {
    const raw = JSON.stringify({ scanId, scope, savedAt: now, data });
    if (raw.length > 500_000) return false;
    storage.setItem(PREVIEW_KEY, raw);
    return true;
  } catch { return false; }
}
