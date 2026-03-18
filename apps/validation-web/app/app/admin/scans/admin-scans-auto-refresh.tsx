"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type AdminScansAutoRefreshProps = {
  hasActiveScans: boolean;
};

export function AdminScansAutoRefresh({ hasActiveScans }: AdminScansAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!hasActiveScans) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveScans, router]);

  if (!hasActiveScans) {
    return null;
  }

  return <p className="text-sm text-slate-500">Refreshing automatically while queued or running scans are present.</p>;
}
