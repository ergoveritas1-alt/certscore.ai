"use client";

import { useEffect } from "react";

type ScanStatusAutoRefreshProps = {
  status: string;
};

export function ScanStatusAutoRefresh({ status }: ScanStatusAutoRefreshProps) {
  const shouldRefresh = status === "queued" || status === "running";

  useEffect(() => {
    if (!shouldRefresh) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !navigator.onLine) {
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
