"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type ValidationRunsAutoRefreshProps = {
  enabled: boolean;
  intervalMs?: number;
};

export function ValidationRunsAutoRefresh({ enabled, intervalMs = 4000 }: ValidationRunsAutoRefreshProps) {
  const router = useRouter();
  const lastInteractionAtRef = useRef(Date.now());
  const AUTO_REFRESH_INTERACTION_GRACE_MS = 8_000;

  useEffect(() => {
    if (!enabled) {
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !navigator.onLine) {
        return;
      }

      if (Date.now() - lastInteractionAtRef.current < AUTO_REFRESH_INTERACTION_GRACE_MS) {
        return;
      }

      router.refresh();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, intervalMs, router]);

  return null;
}
