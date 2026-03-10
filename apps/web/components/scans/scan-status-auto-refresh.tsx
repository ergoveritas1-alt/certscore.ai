"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type ScanStatusAutoRefreshProps = {
  status: string;
};

export function ScanStatusAutoRefresh({ status }: ScanStatusAutoRefreshProps) {
  const router = useRouter();
  const shouldRefresh = status === "queued" || status === "running";

  useEffect(() => {
    if (!shouldRefresh) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [router, shouldRefresh]);

  if (!shouldRefresh) {
    return null;
  }

  return <p className="text-sm text-slate-500">Refreshing status automatically while this scan is {status}.</p>;
}
