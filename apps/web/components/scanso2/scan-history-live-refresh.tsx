"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type ScanHistoryLiveRefreshProps = {
  enabled: boolean;
};

export function ScanHistoryLiveRefresh({ enabled }: ScanHistoryLiveRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, router]);

  return null;
}
