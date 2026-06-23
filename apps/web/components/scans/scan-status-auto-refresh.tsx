"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useRef } from "react";

type ScanStatusAutoRefreshProps = {
  pendingBrowserExtensionNormalization?: boolean;
  pendingPostCompletionWork?: boolean;
  scanId?: string;
  silent?: boolean;
  status: string;
};

export function shouldAutoRefreshScanStatus(input: ScanStatusAutoRefreshProps) {
  return (
    input.status === "queued" ||
    input.status === "running" ||
    input.status === "processing" ||
    input.pendingBrowserExtensionNormalization === true ||
    input.pendingPostCompletionWork === true
  );
}

export function ScanStatusAutoRefresh({
  pendingBrowserExtensionNormalization = false,
  pendingPostCompletionWork = false,
  scanId,
  silent = false,
  status
}: ScanStatusAutoRefreshProps) {
  const shouldRefresh = shouldAutoRefreshScanStatus({
    pendingBrowserExtensionNormalization,
    pendingPostCompletionWork,
    status
  });

  if (!shouldRefresh) {
    return null;
  }

  const statusLabel = pendingBrowserExtensionNormalization
    ? "normalizing browser evidence"
    : pendingPostCompletionWork
      ? "finalizing findings"
      : status;

  return (
    <>
      {typeof window !== "undefined" ? <ScanStatusRefreshEffect scanId={scanId} shouldRefresh={shouldRefresh} status={status} /> : null}
      {silent ? null : (
        <p className="text-sm text-slate-500">
          Refreshing status automatically while this scan is {statusLabel}.
        </p>
      )}
    </>
  );
}

export function isTerminalScanStatus(status: string | null | undefined) {
  return (
    status === "completed" ||
    status === "completed_limited" ||
    status === "failed" ||
    status === "canceled" ||
    status === "cancelled" ||
    status === "expired" ||
    status === "rate_limited"
  );
}

export function getPolledScanStatus(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const scan = record.scan && typeof record.scan === "object" && !Array.isArray(record.scan)
    ? record.scan as Record<string, unknown>
    : null;
  const status = typeof scan?.status === "string"
    ? scan.status
    : typeof record.status === "string"
      ? record.status
      : null;

  return status;
}

function ScanStatusRefreshEffect({
  scanId,
  shouldRefresh,
  status
}: {
  scanId?: string;
  shouldRefresh: boolean;
  status: string;
}) {
  const router = useRouter();
  const lastInteractionAtRef = useRef(Date.now());
  const AUTO_REFRESH_INTERACTION_GRACE_MS = 12_000;
  const HARD_RELOAD_AFTER_MS = 45_000;

  useEffect(() => {
    if (!shouldRefresh) {
      return;
    }

    const markInteraction = () => {
      lastInteractionAtRef.current = Date.now();
    };

    window.addEventListener("pointerdown", markInteraction, true);
    window.addEventListener("keydown", markInteraction, true);
    window.addEventListener("touchstart", markInteraction, true);

    return () => {
      window.removeEventListener("pointerdown", markInteraction, true);
      window.removeEventListener("keydown", markInteraction, true);
      window.removeEventListener("touchstart", markInteraction, true);
    };
  }, [shouldRefresh]);

  useEffect(() => {
    if (!shouldRefresh) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !navigator.onLine) {
        return;
      }

      // Avoid interrupting in-flight navigation or other recent user actions.
      if (Date.now() - lastInteractionAtRef.current < AUTO_REFRESH_INTERACTION_GRACE_MS) {
        return;
      }

      router.refresh();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [router, shouldRefresh]);

  useEffect(() => {
    if (!shouldRefresh || !scanId || isTerminalScanStatus(status)) {
      return;
    }

    let disposed = false;
    let inFlight = false;
    const hardReloadId = window.setTimeout(() => {
      if (!disposed && document.visibilityState === "visible" && navigator.onLine) {
        window.location.reload();
      }
    }, HARD_RELOAD_AFTER_MS);

    const pollTerminalStatus = async () => {
      if (disposed || inFlight || document.visibilityState !== "visible" || !navigator.onLine) {
        return;
      }

      inFlight = true;
      try {
        const response = await fetch(`/api/scan-status/${encodeURIComponent(scanId)}?includeFindings=0`, {
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json() as unknown;
        const nextStatus = getPolledScanStatus(payload);
        if (!disposed && isTerminalScanStatus(nextStatus)) {
          router.refresh();
          window.setTimeout(() => {
            if (!disposed) {
              window.location.reload();
            }
          }, 400);
        }
      } catch {
        // Ignore transient status polling failures; the router refresh loop keeps retrying.
      } finally {
        inFlight = false;
      }
    };

    void pollTerminalStatus();
    const intervalId = window.setInterval(() => {
      void pollTerminalStatus();
    }, 2500);

    return () => {
      disposed = true;
      window.clearTimeout(hardReloadId);
      window.clearInterval(intervalId);
    };
  }, [router, scanId, shouldRefresh, status]);

  return null;
}
