"use client";

import { useEffect, useRef } from "react";

type ScanStatusAutoRefreshProps = {
  status: string;
};

export function ScanStatusAutoRefresh({ status }: ScanStatusAutoRefreshProps) {
  const shouldRefresh = status === "queued" || status === "running";
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

      // Use a normal page reload here instead of router.refresh() so transient
      // dev-server fetch failures do not throw the scan page into a runtime overlay.
      window.location.reload();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldRefresh]);

  if (!shouldRefresh) {
    return null;
  }

  return <p className="text-sm text-slate-500">Refreshing status automatically while this scan is {status}.</p>;
}
