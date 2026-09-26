import type { ScanSource } from "./data-layer";

export const SCAN_CONVERSION_STORAGE_KEY = "certscore:scan-conversions:v1";
export const SCAN_CONVERSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_JOURNEYS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Store = Pick<Storage, "getItem" | "setItem">;
type Journey = { scanId: string; source: ScanSource; startedAt: number; completed: boolean };

function read(store: Store, now: number): Journey[] {
  const value: unknown = JSON.parse(store.getItem(SCAN_CONVERSION_STORAGE_KEY) ?? "[]");
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Journey => row && UUID.test(row.scanId)
    && ["homepage", "header", "dashboard", "unknown"].includes(row.source)
    && typeof row.startedAt === "number" && row.startedAt <= now && now - row.startedAt < SCAN_CONVERSION_TTL_MS
    && typeof row.completed === "boolean").slice(-MAX_JOURNEYS);
}

/** Browser-journey bookkeeping only; never evidence that a scan completed. */
export function rememberScanSubmission(store: Store, scanId: string, source: ScanSource, now = Date.now()) {
  if (!UUID.test(scanId)) return false;
  try {
    const rows = read(store, now);
    if (rows.some(row => row.scanId === scanId)) return false;
    rows.push({ scanId, source, startedAt: now, completed: false });
    store.setItem(SCAN_CONVERSION_STORAGE_KEY, JSON.stringify(rows.slice(-MAX_JOURNEYS)));
    return true;
  } catch { return false; }
}

/** Call only from a ready, canonical completed report; consume before emitting. */
export function consumeScanCompletion(store: Store, scanId: string, now = Date.now()): ScanSource | null {
  try {
    const rows = read(store, now);
    const row = rows.find(item => item.scanId === scanId && !item.completed);
    if (!row) return null;
    row.completed = true;
    store.setItem(SCAN_CONVERSION_STORAGE_KEY, JSON.stringify(rows));
    return row.source;
  } catch { return null; }
}
