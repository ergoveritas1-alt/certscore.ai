"use client";

import { useEffect } from "react";

export const POST_REFUSAL_GENERATION_WATCH_INITIAL_MS = 4_000;
export const POST_REFUSAL_GENERATION_WATCH_INTERVAL_MS = 4_000;
export const POST_REFUSAL_GENERATION_WATCH_MAX_MS = 24_000;

export function shouldReloadForReportGeneration(input: {
  currentGeneration: string;
  polledGeneration: string | null;
  reportReady: boolean;
}) {
  return input.reportReady &&
    input.polledGeneration !== null &&
    input.polledGeneration !== input.currentGeneration;
}

export function ScanReportGenerationRefresh({
  enabled,
  reportGeneration,
  scanId,
}: {
  enabled: boolean;
  reportGeneration: string | null;
  scanId: string;
}) {
  useEffect(() => {
    if (!enabled || !reportGeneration) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = Date.now() + POST_REFUSAL_GENERATION_WATCH_MAX_MS;

    const schedule = (delayMs: number) => {
      if (canceled || Date.now() >= deadline) return;
      timer = setTimeout(() => void check(), delayMs);
    };
    const check = async () => {
      if (canceled) return;
      try {
        const response = await fetch(
          `/api/scan-status/${encodeURIComponent(scanId)}?includeFindings=0`,
          { cache: "no-store" },
        );
        if (response.ok) {
          const payload = await response.json() as Record<string, unknown>;
          const readiness = payload.reportReadiness &&
            typeof payload.reportReadiness === "object" &&
            !Array.isArray(payload.reportReadiness)
            ? payload.reportReadiness as Record<string, unknown>
            : null;
          const polledGeneration = typeof readiness?.generation === "string"
            ? readiness.generation
            : null;
          if (shouldReloadForReportGeneration({
            currentGeneration: reportGeneration,
            polledGeneration,
            reportReady: readiness?.status === "ready",
          })) {
            window.location.reload();
            return;
          }
        }
      } catch {
        // A missed background check must not disturb the already-ready report.
      }
      schedule(POST_REFUSAL_GENERATION_WATCH_INTERVAL_MS);
    };

    schedule(POST_REFUSAL_GENERATION_WATCH_INITIAL_MS);
    return () => {
      canceled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [enabled, reportGeneration, scanId]);

  return null;
}
