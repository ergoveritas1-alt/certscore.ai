"use client";

import { useEffect } from "react";
import { clearActiveScanSession } from "../../lib/scans/active-scan-session";

export function ScanProgressReportVisible({ scanId }: { scanId: string }) {
  useEffect(() => {
    clearActiveScanSession(scanId);
    const key = `certscore.scanTerminalDetectedAt.${scanId}`;
    const detectedAt = Number.parseInt(window.sessionStorage.getItem(key) ?? "", 10);
    if (!Number.isFinite(detectedAt)) return;
    window.sessionStorage.removeItem(key);
    const body = JSON.stringify({
      durationMs: Math.max(0, Date.now() - detectedAt),
      event: "report_visible",
      scanId,
    });
    navigator.sendBeacon?.("/api/scan-progress-events", new Blob([body], { type: "application/json" }));
  }, [scanId]);
  return null;
}
