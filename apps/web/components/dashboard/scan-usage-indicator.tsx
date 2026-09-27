"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatScanUsageResetDate } from "../../lib/dashboard/scan-usage-reset";

type ScanUsage = {
  monthlyLimit: number | null;
  monthlyPeriodEnd: string;
  monthlyScansUsed: number;
};

function isScanUsage(value: unknown): value is ScanUsage {
  if (!value || typeof value !== "object") return false;
  const usage = value as Partial<ScanUsage>;
  return (
    (usage.monthlyLimit === null || (typeof usage.monthlyLimit === "number" && Number.isFinite(usage.monthlyLimit) && usage.monthlyLimit >= 0)) &&
    typeof usage.monthlyScansUsed === "number" && Number.isFinite(usage.monthlyScansUsed) && usage.monthlyScansUsed >= 0 &&
    typeof usage.monthlyPeriodEnd === "string"
  );
}

export function ScanUsageIndicator() {
  const pathname = usePathname();
  const [usage, setUsage] = useState<ScanUsage | null>(null);
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    let controller: AbortController | null = null;

    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      lastRefreshAt.current = Date.now();
      try {
        const response = await fetch("/api/dashboard/scan-usage", { cache: "no-store", signal });
        if (!response.ok) throw new Error("Scan usage unavailable");
        const result: unknown = await response.json();
        if (!signal.aborted) setUsage(isScanUsage(result) ? result : null);
      } catch {
        if (!signal.aborted) setUsage(null);
      }
    };

    const refreshOnFocus = () => {
      if (Date.now() - lastRefreshAt.current >= 60_000) void refresh();
    };

    void refresh();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [pathname]);

  if (!usage) return null;

  const { monthlyLimit, monthlyPeriodEnd, monthlyScansUsed } = usage;
  const remaining = monthlyLimit === null ? null : Math.max(0, monthlyLimit - monthlyScansUsed);
  const remainingPercent = monthlyLimit === null || monthlyLimit === 0
    ? 0
    : Math.min(100, Math.round((Math.max(0, monthlyLimit - monthlyScansUsed) / monthlyLimit) * 100));
  const resetDate = formatScanUsageResetDate(monthlyPeriodEnd, "short");
  const description = remaining === null
    ? "Unlimited scans"
    : `${remaining} of ${monthlyLimit} scans left this month (${remainingPercent}% remaining). Resets ${resetDate} UTC.`;
  const fillColor = remainingPercent <= 20 ? "bg-amber-400" : "bg-sky-400";

  return (
    <Link
      aria-label={description}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 hover:text-white"
      href="/app/settings"
      title={description}
    >
      <span className="hidden text-slate-400 lg:inline">Scans</span>
      {remaining !== null ? (
        <span
          aria-label="Monthly scans remaining"
          aria-valuemax={monthlyLimit ?? undefined}
          aria-valuemin={0}
          aria-valuenow={remaining}
          aria-valuetext={`${remainingPercent}% remaining`}
          className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-700 sm:block"
          role="progressbar"
        >
          <span className={`block h-full rounded-full ${fillColor}`} style={{ width: `${remainingPercent}%` }} />
        </span>
      ) : null}
      <span className="whitespace-nowrap font-semibold tabular-nums">{remaining === null ? "Unlimited" : `${remaining} left`}</span>
    </Link>
  );
}
