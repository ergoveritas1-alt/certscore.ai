"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readActiveScanSession } from "../../lib/scans/active-scan-session";
import { getScanProgressRuntime, recordScanDuration } from "../../lib/scans/scan-progress-timing";
import { type PolledScanProgress, ScanStatusAutoRefresh } from "./scan-status-auto-refresh";
import { LocalV2DagScanProgressCard } from "./scan-submit-progress";

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
  createdAt,
  domainHostname,
  pageUrl,
  pendingPostCompletionWork = false,
  profile,
  scanId,
  startedAt,
  status,
}: {
  createdAt: string;
  domainHostname: string | null;
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
    if (nextProgress.reportReady && !progressRef.current.reportReady && typeof window !== "undefined") {
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
    progressRef.current = nextProgress;
    setProgress(nextProgress);
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
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">CertScore.ai scan</p>
        <h1 className="mt-2 flex min-w-0 max-w-full items-baseline gap-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
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
