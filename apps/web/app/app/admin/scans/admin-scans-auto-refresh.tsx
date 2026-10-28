"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useTransition } from "react";
import { refreshAdminScanActivity } from "../../../../server/admin/list-admin-scans";
import type { AdminScanLiveTarget } from "../../../../server/admin/admin-scan-live-status";

type AdminScansAutoRefreshProps = {
  targets: AdminScanLiveTarget[];
};

export function AdminScansAutoRefresh({ targets }: AdminScansAutoRefreshProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const refresh = () => startTransition(async () => {
    await refreshAdminScanActivity();
    router.refresh();
  });
  const hasActiveScans = targets.some((target) => ["queued", "running", "finalizing"].includes(target.status));
  const initialFingerprint = useMemo(
    () => targets.map((target) => `${target.kind}:${target.id}:${target.status}`).sort().join("|"),
    [targets]
  );

  useEffect(() => {
    if (!hasActiveScans) {
      return;
    }

    const controller = new AbortController();
    let timeoutId: number | null = null;
    let cancelled = false;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timeoutId = window.setTimeout(poll, delayMs);
    };

    const poll = async () => {
      if (document.visibilityState === "hidden") {
        schedule(5000);
        return;
      }

      try {
        const response = await fetch("/api/admin/scans/live-status", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targets }),
          signal: controller.signal
        });
        if (!response.ok) {
          schedule(5000);
          return;
        }
        const result = await response.json() as {
          fingerprint?: string;
          hasActiveScans?: boolean;
        };
        if (result.fingerprint && result.fingerprint !== initialFingerprint) {
          await refreshAdminScanActivity();
          if (!cancelled) router.refresh();
          return;
        }
        if (result.hasActiveScans !== false) {
          schedule(2500);
        }
      } catch {
        if (!controller.signal.aborted) {
          schedule(5000);
        }
      }
    };

    schedule(1200);

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [hasActiveScans, initialFingerprint, router, targets]);

  return <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
    <button className="app-raised-button rounded-full px-3 py-1.5 font-semibold text-slate-700" disabled={isPending} onClick={refresh} type="button">{isPending ? "Refreshing…" : "Refresh chart and table"}</button>
    {hasActiveScans ? <p>Refreshing automatically while queued or running scans are present.</p> : null}
  </div>;
}
