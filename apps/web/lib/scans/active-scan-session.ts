import type { CampaignAttribution } from "../attribution/campaign-attribution";

const ACTIVE_SCAN_SESSION_KEY = "certscore.active-scan-session.v1";
const PENDING_SCAN_SESSION_KEY = "certscore.pending-scan-session.v1";
const ACTIVE_SCAN_SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1_000;

export type ActiveScanSession = {
  campaignAttribution?: CampaignAttribution;
  destination: string;
  domain: string;
  progressValue?: number;
  scanId: string;
  startedAtMs: number;
};

export type PendingScanSession = {
  campaignAttribution?: CampaignAttribution;
  domain: string;
  mode: "full" | "preview";
  requestId: string;
  startedAtMs: number;
};

export function saveActiveScanSession(session: ActiveScanSession) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(ACTIVE_SCAN_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Session recovery is best effort and must never block scan navigation.
  }
}

export function readActiveScanSession(nowMs = Date.now()): ActiveScanSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(ACTIVE_SCAN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveScanSession>;
    if (
      typeof parsed.destination !== "string" ||
      typeof parsed.domain !== "string" ||
      typeof parsed.scanId !== "string" ||
      (parsed.progressValue !== undefined && (
        typeof parsed.progressValue !== "number" ||
        !Number.isFinite(parsed.progressValue) ||
        parsed.progressValue < 0 ||
        parsed.progressValue > 100
      )) ||
      typeof parsed.startedAtMs !== "number" ||
      !Number.isFinite(parsed.startedAtMs) ||
      nowMs - parsed.startedAtMs > ACTIVE_SCAN_SESSION_MAX_AGE_MS
    ) {
      window.sessionStorage.removeItem(ACTIVE_SCAN_SESSION_KEY);
      return null;
    }
    return parsed as ActiveScanSession;
  } catch {
    window.sessionStorage.removeItem(ACTIVE_SCAN_SESSION_KEY);
    return null;
  }
}

export function clearActiveScanSession(scanId?: string) {
  if (typeof window === "undefined") return;

  try {
    const current = readActiveScanSession();
    if (!scanId || current?.scanId === scanId) {
      window.sessionStorage.removeItem(ACTIVE_SCAN_SESSION_KEY);
    }
  } catch {
    // Session cleanup is best effort.
  }
}

export function savePendingScanSession(session: PendingScanSession) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(PENDING_SCAN_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Pending recovery is best effort and must never block scan submission.
  }
}

export function readPendingScanSession(nowMs = Date.now()): PendingScanSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(PENDING_SCAN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingScanSession>;
    if (
      typeof parsed.domain !== "string" ||
      typeof parsed.mode !== "string" ||
      (parsed.mode !== "full" && parsed.mode !== "preview") ||
      typeof parsed.requestId !== "string" ||
      typeof parsed.startedAtMs !== "number" ||
      !Number.isFinite(parsed.startedAtMs) ||
      nowMs - parsed.startedAtMs > ACTIVE_SCAN_SESSION_MAX_AGE_MS
    ) {
      window.sessionStorage.removeItem(PENDING_SCAN_SESSION_KEY);
      return null;
    }
    return parsed as PendingScanSession;
  } catch {
    window.sessionStorage.removeItem(PENDING_SCAN_SESSION_KEY);
    return null;
  }
}

export function clearPendingScanSession(requestId?: string) {
  if (typeof window === "undefined") return;

  try {
    const current = readPendingScanSession();
    if (!requestId || current?.requestId === requestId) {
      window.sessionStorage.removeItem(PENDING_SCAN_SESSION_KEY);
    }
  } catch {
    // Pending cleanup is best effort.
  }
}
