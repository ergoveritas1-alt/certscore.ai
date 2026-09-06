"use client";

import type { ApiV2PreConsentRuntimePreview } from "@certscore/api-contracts";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readActiveScanSession } from "../../lib/scans/active-scan-session";
import { getScanProgressRuntime, recordScanDuration } from "../../lib/scans/scan-progress-timing";
import { type PolledScanProgress, ScanStatusAutoRefresh } from "./scan-status-auto-refresh";
import { LocalV2DagScanProgressCard } from "./scan-submit-progress";
import { PreConsentRuntimePreviewCard } from "./pre-consent-runtime-preview-card";

export const TERMINAL_NAVIGATION_DELAY_MS = 0;
export const TERMINAL_REFRESH_FALLBACK_MS = 20_000;

export function shouldRapidlyCompleteProgress(progress: PolledScanProgress) {
  return progress.reportReady;
}

export function getProgressHandoffStage(input: {
  hasSubmissionHandoff: boolean;
  serverStage: PolledScanProgress["stage"];
}) {
  return input.serverStage;
}

export function getProgressHandoffValue(input: { hasSubmissionHandoff: boolean; progressValue?: number }) {
  return input.hasSubmissionHandoff && typeof input.progressValue === "number" ? input.progressValue : null;
}

export function PendingScanDetailView({
  fullSite,
  createdAt,
  domainHostname,
  initialPreConsentPreview = null,
  pageUrl,
  pendingPostCompletionWork = false,
  profile,
  scanId,
  startedAt,
  status,
}: {
  fullSite?: import("@website-signal-risk-scanner/shared").CrawlOptions;
  createdAt: string;
  domainHostname: string | null;
  initialPreConsentPreview?: ApiV2PreConsentRuntimePreview | null;
  pageUrl?: string | null;
  pendingPostCompletionWork?: boolean;
  profile: string;
  scanId: string;
  startedAt: string | null;
  status: string;
}) {
  const router = useRouter();
  const initialStage: PolledScanProgress["stage"] = pendingPostCompletionWork
    ? "review"
    : status === "queued" ? "prepare" : status === "running" ? "scan" : "review";
  const [progress, setProgress] = useState<PolledScanProgress>({
    preConsentPreview: initialPreConsentPreview,
    reportReady: false,
    stage: initialStage,
    status
  });
  const [progressHandoff, setProgressHandoff] = useState<{ loaded: boolean; startedAtMs: number | null; value: number | null }>({
    loaded: false,
    startedAtMs: null,
    value: null
  });
  const progressRef = useRef(progress);
  const terminalRefreshFallbackRef = useRef<number | null>(null);
  const handoffScanIdRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (terminalRefreshFallbackRef.current !== null) {
      window.clearTimeout(terminalRefreshFallbackRef.current);
    }
  }, []);
  const handleTerminalNavigation = useCallback(() => {
    // Preserve the completed progress view while Next.js fetches the report
    // tree. A hard reload immediately swaps it for the app-wide skeleton and
    // makes report rendering feel like a second opaque wait.
    router.refresh();
    terminalRefreshFallbackRef.current = window.setTimeout(() => {
      window.location.reload();
    }, TERMINAL_REFRESH_FALLBACK_MS);
  }, [router]);
  const handleProgress = useCallback((nextProgress: PolledScanProgress) => {
    const retainedProgress = {
      ...nextProgress,
      preConsentPreview: nextProgress.preConsentPreview ?? progressRef.current.preConsentPreview,
    };
    if (retainedProgress.reportReady && !progressRef.current.reportReady && typeof window !== "undefined") {
      const activeScanSession = readActiveScanSession();
      if (activeScanSession?.scanId === scanId) {
        try {
          recordScanDuration({
            durationMs: Date.now() - activeScanSession.startedAtMs,
            profileValue: profile,
            runtime: getScanProgressRuntime(window.location.hostname),
            storage: window.localStorage,
            target: domainHostname ?? activeScanSession.domain
          });
        } catch {
          // Learning progress timing is best effort and must not affect navigation.
        }
      }
    }
    progressRef.current = retainedProgress;
    setProgress(retainedProgress);
  }, [domainHostname, profile, scanId]);
  useEffect(() => {
    if (handoffScanIdRef.current === scanId) {
      return;
    }
    handoffScanIdRef.current = scanId;

    const activeScanSession = readActiveScanSession();
    const hasSubmissionHandoff = activeScanSession?.scanId === scanId &&
      typeof activeScanSession.progressValue === "number";
    const handoffValue = getProgressHandoffValue({
      hasSubmissionHandoff,
      progressValue: activeScanSession?.progressValue
    });
    const handoffStage = getProgressHandoffStage({
      hasSubmissionHandoff,
      serverStage: initialStage
    });

    if (handoffStage !== progressRef.current.stage) {
      const handoffProgress = {
        ...progressRef.current,
        stage: handoffStage
      };
      progressRef.current = handoffProgress;
      setProgress(handoffProgress);
    }
    setProgressHandoff({
      loaded: true,
      startedAtMs: hasSubmissionHandoff ? activeScanSession?.startedAtMs ?? null : null,
      value: handoffValue
    });
  }, [handleProgress, initialStage, scanId, status]);

  return (
    <div className="space-y-4" data-density="compact">
      {fullSite ? <header className="rounded-xl border border-sky-200 bg-sky-50 p-5"><h2 className="text-2xl font-semibold">Scan · {status}</h2><p className="mt-2 text-sm">Full homepage audit plus resource inventories from additional public pages. Additional pages were opened independently without a consent action.</p><p className="mt-3 text-sm">Max pages: {fullSite.maxPages} (includes homepage) · Requested concurrency: {fullSite.concurrency} · Wait between page starts: {fullSite.waitSeconds}s</p><p className="mt-2 text-xs">Fresh visit, no consent action. Homepage audit in progress; resource crawl awaits retained homepage evidence.</p></header> : null}
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">CertScore.ai scan</p>
        <h1 className="mt-1 flex min-w-0 max-w-full items-baseline gap-2 text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-3xl">
          <span className="shrink-0">Scan:</span>
          <span className="min-w-0 truncate" title={pageUrl?.trim() || domainHostname?.trim() || "website"}>
            {pageUrl?.trim() || domainHostname?.trim() || "website"}
          </span>
        </h1>
      </div>
      <LocalV2DagScanProgressCard
        createdAt={createdAt}
        initialProgressValue={progressHandoff.value}
        profileValue={profile}
        progressStage={progress.stage}
        reportReady={progress.reportReady}
        revealProgress={progressHandoff.loaded}
        scanStatus={progress.status ?? status}
        startedAt={startedAt}
        startedAtMs={progressHandoff.startedAtMs}
        targetLabel={domainHostname ?? pageUrl ?? ""}
      />
      {progress.preConsentPreview ? (
        <PreConsentRuntimePreviewCard preview={progress.preConsentPreview} startedAt={startedAt} />
      ) : null}
      <ScanStatusAutoRefresh
        onTerminalNavigation={handleTerminalNavigation}
        onProgress={handleProgress}
        pendingPostCompletionWork={pendingPostCompletionWork}
        scanId={scanId}
        silent
        status={status}
        terminalNavigationDelayMs={TERMINAL_NAVIGATION_DELAY_MS}
      />
    </div>
  );
}
