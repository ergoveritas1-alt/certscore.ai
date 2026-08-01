"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { type PolledScanProgress, ScanStatusAutoRefresh } from "./scan-status-auto-refresh";
import { LocalV2DagScanProgressCard } from "./scan-submit-progress";

const PROGRESS_STAGES = ["prepare", "scan", "review", "report", "complete"] as const;
const PROGRESS_STAGE_CATCH_UP_MS = 700;
const TERMINAL_NAVIGATION_DELAY_MS = 2_500;

export function getProgressTransitionStages(
  current: PolledScanProgress["stage"],
  target: PolledScanProgress["stage"]
) {
  const currentIndex = PROGRESS_STAGES.indexOf(current);
  const targetIndex = PROGRESS_STAGES.indexOf(target);
  return targetIndex <= currentIndex ? [] : PROGRESS_STAGES.slice(currentIndex + 1, targetIndex + 1);
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
  const progressRef = useRef(progress);
  const transitionTimersRef = useRef<number[]>([]);
  useEffect(() => () => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);
  const handleProgress = useCallback((nextProgress: PolledScanProgress) => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimersRef.current = [];
    const transitionStages = getProgressTransitionStages(progressRef.current.stage, nextProgress.stage);
    transitionStages.forEach((stage, index) => {
      const timer = window.setTimeout(() => {
        const stagedProgress = {
          ...nextProgress,
          reportReady: stage === "complete" && nextProgress.reportReady,
          stage
        };
        progressRef.current = stagedProgress;
        setProgress(stagedProgress);
      }, index * PROGRESS_STAGE_CATCH_UP_MS);
      transitionTimersRef.current.push(timer);
    });
    if (transitionStages.length === 0 && nextProgress.stage === progressRef.current.stage) {
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
        profileValue={profile}
        progressStage={progress.stage}
        reportReady={progress.reportReady}
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
