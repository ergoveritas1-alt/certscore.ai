"use client";

import type { PreviewScanStatusResponse } from "@website-signal-risk-scanner/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LiveActivityLine, useRotatingActivityLine } from "../scans/live-activity-line";
import { PreviewScanResolvedState } from "./preview-scan-resolved-state";

type PreviewScanStateProps = {
  initialScan: PreviewScanStatusResponse;
};

function getProgressValue(status: PreviewScanStatusResponse["status"]) {
  if (status === "queued") {
    return 22;
  }

  if (status === "running") {
    return 68;
  }

  return 100;
}

function getStepLabel(status: PreviewScanStatusResponse["status"]) {
  if (status === "queued") {
    return "step[1/3]";
  }

  if (status === "running") {
    return "step[2/3]";
  }

  return "step[3/3]";
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
  const [activityWindow, setActivityWindow] = useState(initialScan.activityFeed);
  const loginHref = useMemo(() => createLoginHref(scan), [scan]);

  useEffect(() => {
    setActivityWindow((current) => {
      const next = [...current];

      for (const line of scan.activityFeed) {
        if (!next.includes(line)) {
          next.push(line);
        }
      }

      return next.slice(-8);
    });
  }, [scan.activityFeed]);

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

  const fallbackLine = `${getStepLabel(scan.status)} event> ${
    scan.activityLine ?? "Scanning the site surface and collecting observable accessibility, privacy, and disclosure signals."
  }`;
  const fallbackDataLine = scan.activityRef ? `ref> ${scan.activityRef}` : "data> evt=preview.pending";
  const normalizedFeed =
    activityWindow.length === 0
      ? [fallbackLine, fallbackDataLine]
      : activityWindow.length === 1
        ? [activityWindow[0] ?? fallbackLine, fallbackDataLine]
        : activityWindow;
  const { activeLine } = useRotatingActivityLine({
    fallbackLines: [fallbackLine, fallbackDataLine],
    lines: normalizedFeed,
    running: scan.status === "queued" || scan.status === "running"
  });

  if (scan.status === "queued" || scan.status === "running") {
    const progressValue = getProgressValue(scan.status);

    return (
      <div className="space-y-8">
        <div className="space-y-4">
          <Badge tone="warning">{scan.status === "queued" ? "Preview scan queued" : "Preview scan running"}</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Scanning {scan.hostname}</h1>
          <p className="max-w-3xl text-lg text-slate-600">
            {scan.statusMessage} The preview uses the same queue and status model as the full scan flow.
          </p>
        </div>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Homepage preview in progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-ember transition-all duration-700"
                style={{ width: `${progressValue}%` }}
              />
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="space-y-1 font-mono text-[13px] text-slate-600">
                <div className="rounded-xl bg-white/60 px-3 py-2">
                  <LiveActivityLine line={activeLine} />
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-medium text-ink">Step 1</p>
                <p>Queue preview scan and normalize the submitted website.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-medium text-ink">Step 2</p>
                <p>Run homepage checks for accessibility, privacy, and disclosure signals.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-medium text-ink">Step 3</p>
                <p>Assemble a lightweight preview with sample findings and summary bullets.</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Results update automatically. This preview highlights observable signals only.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <PreviewScanResolvedState loginHref={loginHref} scan={scan} />;
}
