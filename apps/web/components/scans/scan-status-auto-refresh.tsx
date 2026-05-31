"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useRef } from "react";

type ScanStatusAutoRefreshProps = {
  pendingBrowserExtensionNormalization?: boolean;
  pendingPostCompletionWork?: boolean;
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
      {typeof window !== "undefined" ? <ScanStatusRefreshEffect shouldRefresh={shouldRefresh} /> : null}
      <p className="text-sm text-slate-500">
        Refreshing status automatically while this scan is {statusLabel}.
      </p>
    </>
  );
}

function ScanStatusRefreshEffect({ shouldRefresh }: { shouldRefresh: boolean }) {
  const router = useRouter();
  const lastInteractionAtRef = useRef(Date.now());
  const AUTO_REFRESH_INTERACTION_GRACE_MS = 12_000;

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

  return null;
}
