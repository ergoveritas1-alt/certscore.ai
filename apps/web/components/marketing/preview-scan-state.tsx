"use client";

import type { PreviewScanStatusResponse } from "@website-signal-risk-scanner/shared";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FullScanProgressCard } from "../scans/full-scan-progress-card";
import { ScanPageHeader } from "../scans/scan-page-header";
import { ScanStatusAutoRefresh } from "../scans/scan-status-auto-refresh";
import { PreviewScanResolvedState } from "./preview-scan-resolved-state";

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

function createLoginHref(scan: PreviewScanStatusResponse) {
  const params = new URLSearchParams({
    domain: scan.hostname,
    next: "/app",
    previewScanId: scan.scanId
  });

  return `/login?${params.toString()}`;
}

export function PreviewScanState({ initialScan }: PreviewScanStateProps) {
  const [scan, setScan] = useState(initialScan);
  const loginHref = useMemo(() => createLoginHref(scan), [scan]);

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
        setScan(payload);
      } catch {
        // Ignore transient polling failures and let the next refresh retry.
      }
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [scan]);

  if (scan.status === "queued" || scan.status === "running") {
    return (
      <div className="space-y-8">
        <ScanPageHeader
          autoRefresh={<ScanStatusAutoRefresh status={scan.status} />}
          createdAtLabel={`Created ${formatDateTime(scan.createdAt)}`}
          status={scan.status}
          title={`Scan: ${scan.hostname}`}
        />
        <p className="max-w-3xl text-sm text-slate-600">
          {scan.statusMessage} This homepage scan now uses the same live progress card as the signed-in scan experience.
        </p>
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

  return <PreviewScanResolvedState loginHref={loginHref} scan={scan} />;
}
