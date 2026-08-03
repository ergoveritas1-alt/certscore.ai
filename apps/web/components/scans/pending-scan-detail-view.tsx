"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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

export function PendingScanDetailView({
  createdAt,
  domainHostname,
  pendingPostCompletionWork = false,
  profile,
  scanId,
  startedAt,
  status,
}: {
  createdAt: string;
  domainHostname: string | null;
  pendingPostCompletionWork?: boolean;
  profile: string;
  scanId: string;
  startedAt: string | null;
  status: string;
}) {
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
  useEffect(() => () => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);
  useEffect(() => {
    const activeScanSession = readActiveScanSession();
    setProgressHandoff({
      loaded: true,
      value: activeScanSession?.scanId === scanId && typeof activeScanSession.progressValue === "number"
        ? activeScanSession.progressValue
        : null
    });
  }, [scanId]);
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

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">CertScore.ai scan</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Scan: {domainHostname?.trim() || "website"}
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
