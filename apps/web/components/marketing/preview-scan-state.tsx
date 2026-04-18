"use client";

import type { PreviewScanStatusResponse } from "@website-signal-risk-scanner/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FullScanProgressCard } from "../scans/full-scan-progress-card";
import { ScanPageHeader } from "../scans/scan-page-header";
import { ScanStatusAutoRefresh } from "../scans/scan-status-auto-refresh";

type PreviewScanStateProps = {
  initialScan: PreviewScanStatusResponse;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

export function PreviewScanState({ initialScan }: PreviewScanStateProps) {
  const router = useRouter();
  const [scan, setScan] = useState(initialScan);

  useEffect(() => {
    if (scan.status !== "queued" && scan.status !== "running") {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/preview-scan/${scan.scanId}`, {
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as PreviewScanStatusResponse;
        if (payload.status !== "queued" && payload.status !== "running") {
          setScan(payload);
          router.refresh();
          return;
        }
        setScan(payload);
      } catch {
        // Ignore transient polling failures and let the next refresh retry.
      }
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [router, scan]);

  if (scan.status === "queued" || scan.status === "running") {
    return (
      <div className="space-y-8">
        <ScanPageHeader
          autoRefresh={<ScanStatusAutoRefresh status={scan.status} />}
          createdAtLabel={`Created ${formatDateTime(scan.createdAt)}`}
          status={scan.status}
          title={`Scan: ${scan.hostname}`}
        />
        <p className="max-w-3xl text-sm text-slate-600">{scan.statusMessage}</p>
        <FullScanProgressCard
          buildPhaseSummaries={scan.buildPhaseSummaries}
          createdAt={scan.createdAt}
          events={scan.events}
          executionSummary={scan.executionSummary}
          status={scan.status}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScanPageHeader
        createdAtLabel={`Created ${formatDateTime(scan.createdAt)}`}
        status={scan.status}
        title={`Scan: ${scan.hostname}`}
      />
      <p className="text-sm text-slate-600">{scan.statusMessage}</p>
    </div>
  );
}
