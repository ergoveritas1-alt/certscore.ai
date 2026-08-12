"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readActiveScanSession } from "../../lib/scans/active-scan-session";
import { type PolledScanProgress, ScanStatusAutoRefresh } from "./scan-status-auto-refresh";
import { LocalV2DagScanProgressCard } from "./scan-submit-progress";

const PROGRESS_STAGES = ["prepare", "scan", "review", "report", "complete"] as const;
const PROGRESS_STAGE_DWELL_MS: Record<PolledScanProgress["stage"], number> = {
  prepare: 1_500,
  scan: 1_000,
  review: 2_000,
  report: 2_500,
  complete: 0
};
// Once the authoritative report projection is ready, leave just enough time
// for the bar's 500 ms completion snap to remain visible before navigation.
export const TERMINAL_NAVIGATION_DELAY_MS = 750;
export const TERMINAL_REFRESH_FALLBACK_MS = 20_000;

export function shouldRapidlyCompleteProgress(progress: PolledScanProgress) {
  return progress.reportReady;
}

export function getProgressTransitionStages(
  current: PolledScanProgress["stage"],
  target: PolledScanProgress["stage"]
) {
  const currentIndex = PROGRESS_STAGES.indexOf(current);
  const targetIndex = PROGRESS_STAGES.indexOf(target);
  return targetIndex <= currentIndex ? [] : PROGRESS_STAGES.slice(currentIndex + 1, targetIndex + 1);
}

export function getProgressTransitionSchedule(
  current: PolledScanProgress["stage"],
  target: PolledScanProgress["stage"]
) {
  const stages = getProgressTransitionStages(current, target);
  let delayMs = 0;

  return stages.map((stage, index) => {
    const previousStage = index === 0 ? current : stages[index - 1]!;
    delayMs += PROGRESS_STAGE_DWELL_MS[previousStage];
    return { delayMs, stage };
  });
}

export function getProgressHandoffStage(input: {
  hasSubmissionHandoff: boolean;
  serverStage: PolledScanProgress["stage"];
}) {
  // A fresh scan submission already started in Prepare on the form. When the
  // destination route mounts, the server commonly reports `running` before
  // the browser can restore that submission progress. Preserve the opening
  // phase long enough to render it instead of making the UI appear to start
  // with Prepare already complete. Direct loads and reloads have no handoff
  // value, so they continue to reflect the authoritative server stage.
  return input.hasSubmissionHandoff && input.serverStage === "scan"
    ? "prepare"
    : input.serverStage;
}

export function getProgressHandoffValue(hasSubmissionHandoff: boolean) {
  return hasSubmissionHandoff ? 0 : null;
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
  const [progressHandoff, setProgressHandoff] = useState<{ loaded: boolean; value: number | null }>({
    loaded: false,
    value: null
  });
  const progressRef = useRef(progress);
  const latestProgressRef = useRef(progress);
  const scheduledTargetRef = useRef<PolledScanProgress["stage"] | null>(null);
  const transitionTimersRef = useRef<number[]>([]);
  const terminalRefreshFallbackRef = useRef<number | null>(null);
  const handoffScanIdRef = useRef<string | null>(null);
  useEffect(() => () => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
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
    latestProgressRef.current = nextProgress;
    if (shouldRapidlyCompleteProgress(nextProgress)) {
      transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      transitionTimersRef.current = [];
      scheduledTargetRef.current = null;
      progressRef.current = nextProgress;
      setProgress(nextProgress);
      return;
    }

    const scheduledTarget = scheduledTargetRef.current;
    if (scheduledTarget !== null) {
      const scheduledTargetIndex = PROGRESS_STAGES.indexOf(scheduledTarget);
      const nextTargetIndex = PROGRESS_STAGES.indexOf(nextProgress.stage);
      if (nextTargetIndex <= scheduledTargetIndex) {
        return;
      }
    }

    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimersRef.current = [];
    const transitionSchedule = getProgressTransitionSchedule(progressRef.current.stage, nextProgress.stage);
    scheduledTargetRef.current = transitionSchedule.length > 0 ? nextProgress.stage : null;
    transitionSchedule.forEach(({ delayMs, stage }, index) => {
      const timer = window.setTimeout(() => {
        const latestProgress = latestProgressRef.current;
        const stagedProgress = {
          ...latestProgress,
          reportReady: stage === "complete" && latestProgress.reportReady,
          stage
        };
        progressRef.current = stagedProgress;
        setProgress(stagedProgress);
        if (index === transitionSchedule.length - 1) {
          transitionTimersRef.current = [];
          scheduledTargetRef.current = null;
        }
      }, delayMs);
      transitionTimersRef.current.push(timer);
    });
    if (transitionSchedule.length === 0 && nextProgress.stage === progressRef.current.stage) {
      progressRef.current = nextProgress;
      setProgress(nextProgress);
    }
  }, []);
  useEffect(() => {
    if (handoffScanIdRef.current === scanId) {
      return;
    }
    handoffScanIdRef.current = scanId;

    const activeScanSession = readActiveScanSession();
    const hasSubmissionHandoff = activeScanSession?.scanId === scanId &&
      typeof activeScanSession.progressValue === "number";
    // The destination progress card is a new, full-size timeline. Start it at
    // the beginning of Prepare instead of carrying over the compact form's
    // partially-filled bar, which made Prepare look complete on first paint.
    const handoffValue = getProgressHandoffValue(hasSubmissionHandoff);
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
      latestProgressRef.current = handoffProgress;
      setProgress(handoffProgress);
    }
    setProgressHandoff({ loaded: true, value: handoffValue });

    if (handoffStage !== initialStage) {
      handleProgress({
        reportReady: false,
        stage: initialStage,
        status
      });
    }
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
