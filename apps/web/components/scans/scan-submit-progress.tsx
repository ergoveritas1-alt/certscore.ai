"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  getScanProgressRuntime,
  readLearnedScanDuration,
  type ScanProgressRuntime
} from "../../lib/scans/scan-progress-timing";

export type LocalV2ScanProfile = "standard" | "tiny";

export const LOCAL_V2_SCAN_PROFILE_OPTIONS: Array<{
  description: string;
  label: string;
  value: LocalV2ScanProfile;
}> = [
  {
    description: "Core v2 DAG scan with pre-consent runtime and policy-surface coverage.",
    label: "Core",
    value: "standard"
  },
  {
    description: "Minimal local v2 DAG pass for fast scan-flow testing.",
    label: "Tiny",
    value: "tiny"
  }
];

export type ScanProgressEstimate = {
  estimatedDurationMs: number;
  modeLabel: string;
};

export type ScanProgressStage = "prepare" | "scan" | "review" | "report" | "complete";

const MAIN_PROGRESS_COLORS = [
  [249, 115, 22],
  [250, 204, 21],
  [125, 211, 252],
  [34, 197, 94]
] as const;

const SCAN_PROGRESS_PHASE_BREAKPOINTS = [0.34, 0.70, 0.88] as const;
const SCAN_PROGRESS_PRE_ESTIMATE_CEILING = 96;
const SCAN_PROGRESS_WAITING_CEILING = 98.5;
const SCAN_PROGRESS_TICK_MS = 250;
const SCAN_PROGRESS_TRANSITION_MS = 300;
const SCAN_PROGRESS_COMPLETION_TRANSITION_MS = 180;

function getMainProgressColor(progressValue: number) {
  const normalizedValue = Math.min(Math.max(progressValue, 0), 100) / 100;
  const segmentCount = MAIN_PROGRESS_COLORS.length - 1;
  const scaledValue = normalizedValue * segmentCount;
  const segmentIndex = Math.min(Math.floor(scaledValue), segmentCount - 1);
  const segmentProgress = scaledValue - segmentIndex;
  const startColor = MAIN_PROGRESS_COLORS[segmentIndex]!;
  const endColor = MAIN_PROGRESS_COLORS[segmentIndex + 1]!;
  const channels = startColor.map((channel, index) => Math.round(channel + (endColor[index]! - channel) * segmentProgress));

  return `rgb(${channels.join(", ")})`;
}

export function ScanActivityIndicator({ className = "text-white" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center ${className}`}>
      <span className="absolute inset-0 rounded-full border border-current/30 motion-reduce:animate-none" />
      <span className="absolute inset-[2px] animate-spin rounded-full border-2 border-current/25 border-t-current motion-reduce:animate-none" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" />
    </span>
  );
}

export function ScanSubmissionPendingIndicator({
  compact = false,
  onProgressValueChange,
  profileValue = "standard",
  targetLabel = ""
}: {
  compact?: boolean;
  onProgressValueChange?: (value: number) => void;
  profileValue?: string;
  targetLabel?: string;
}) {
  const { nowMs, startedAtMs } = useScanProgressClock(true);

  return (
    <ScanSubmitProgressBar
      active
      compact={compact}
      nowMs={nowMs}
      onProgressValueChange={onProgressValueChange}
      profileValue={profileValue}
      startedAtMs={startedAtMs}
      targetLabel={targetLabel}
    />
  );
}

export function ScanSubmitProgressBar({
  active,
  compact = false,
  dense = false,
  initialProgressValue,
  nowMs,
  onProgressValueChange,
  progressEstimate,
  profileValue = "standard",
  progressStage,
  reportReady = false,
  scanStatus,
  startedAtMs,
  targetLabel = "",
}: {
  active: boolean;
  compact?: boolean;
  dense?: boolean;
  initialProgressValue?: number | null;
  nowMs: number;
  onProgressValueChange?: (value: number) => void;
  progressEstimate?: ScanProgressEstimate;
  profileValue?: string;
  progressStage?: ScanProgressStage;
  reportReady?: boolean;
  scanStatus?: string | null;
  startedAtMs: number | null;
  targetLabel?: string;
}) {
  const [runtime, setRuntime] = useState<ScanProgressRuntime>(() => (
    process.env.NODE_ENV === "development" ? "local" : "hosted"
  ));
  useEffect(() => {
    if (typeof window !== "undefined") {
      setRuntime(getScanProgressRuntime(window.location.hostname));
    }
  }, []);
  const baseEstimate = useMemo(() => (
    estimateScanProgressForOptions({
      profileValue,
      runtime
    })
  ), [profileValue, runtime]);
  const [learnedDurationMs, setLearnedDurationMs] = useState<number | null>(null);
  useEffect(() => {
    if (!targetLabel || typeof window === "undefined") {
      setLearnedDurationMs(null);
      return;
    }
    try {
      setLearnedDurationMs(readLearnedScanDuration({
        profileValue,
        runtime,
        storage: window.localStorage,
        target: targetLabel
      }));
    } catch {
      setLearnedDurationMs(null);
    }
  }, [profileValue, runtime, targetLabel]);
  const estimate = progressEstimate ?? (learnedDurationMs === null
    ? baseEstimate
    : { estimatedDurationMs: learnedDurationMs, modeLabel: `${profileValue} scan` });
  const elapsedMs = startedAtMs !== null ? Math.max(0, nowMs - startedAtMs) : 0;
  const elapsedSeconds = Math.floor(elapsedMs / 1_000);
  const progressPhase = describeScanProgressPhase({
    elapsedMs,
    estimatedDurationMs: estimate.estimatedDurationMs
  });
  const delayed = elapsedMs > estimate.estimatedDurationMs * 1.35;
  const progressDisplay = getScanProgressDisplay({
    delayed,
    phase: progressPhase,
    progressStage,
    reportReady,
    scanStatus
  });
  const calculatedProgressValue = getAdaptiveScanProgressValue({
    elapsedMs,
    estimatedDurationMs: estimate.estimatedDurationMs,
    progressStage,
    reportReady
  });
  const progressFloor = initialProgressValue ?? 0;
  const [displayedProgressValue, setDisplayedProgressValue] = useState(() => (
    Math.max(progressFloor, calculatedProgressValue)
  ));

  useEffect(() => {
    if (!active) return;
    setDisplayedProgressValue((currentValue) => Math.max(currentValue, progressFloor, calculatedProgressValue));
  }, [active, calculatedProgressValue, progressFloor]);

  useEffect(() => {
    onProgressValueChange?.(displayedProgressValue);
  }, [displayedProgressValue, onProgressValueChange]);

  if (!active) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className={compact
        ? "rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
        : dense
          ? "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
          : "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"}
    >
      <div className={compact || dense ? "flex items-center justify-between gap-3 text-xs font-medium text-slate-600" : "flex items-center justify-between gap-3 text-sm font-medium text-slate-700"}>
        <span className="min-w-0 truncate">{progressDisplay.label}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <ScanActivityIndicator className="text-sky-500" />
          <span>{elapsedSeconds}s elapsed</span>
        </span>
      </div>
      {!compact ? <p className={dense ? "mt-0.5 text-[11px] text-slate-500" : "mt-1 text-xs text-slate-500"}>{progressDisplay.detail}</p> : null}
      <div
        aria-label={progressDisplay.ariaLabel}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={displayedProgressValue}
        aria-valuetext={progressDisplay.ariaValueText}
        className={compact || dense ? "mt-2 h-2 overflow-hidden rounded-full bg-slate-200" : "mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"}
        role="progressbar"
      >
        <div
          className="h-full rounded-full transition-[width,background-color]"
          style={{
            backgroundColor: getMainProgressColor(displayedProgressValue),
            transitionDuration: `${reportReady ? SCAN_PROGRESS_COMPLETION_TRANSITION_MS : SCAN_PROGRESS_TRANSITION_MS}ms`,
            transitionTimingFunction: "linear",
            width: `${displayedProgressValue}%`
          }}
        />
      </div>
      <div className={compact || dense ? "mt-2 flex items-center justify-between gap-2" : "mt-3 flex items-center justify-between gap-3"} aria-hidden="true">
        {progressDisplay.steps.map((step) => (
          <span
            key={step.label}
            className={`inline-flex min-w-0 items-center gap-1.5 truncate text-[10px] ${step.current ? "font-semibold text-sky-700" : "text-slate-400"}`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-300 ${step.colorClass}`} />
            {!compact ? step.label : null}
          </span>
        ))}
      </div>
    </div>
  );
}

const SCAN_PROGRESS_STEPS = [
  { colorClass: "bg-slate-200", label: "Prepare", value: 18 },
  { colorClass: "bg-slate-200", label: "Scan", value: 52 },
  { colorClass: "bg-slate-200", label: "Review", value: 76 },
  { colorClass: "bg-slate-200", label: "Report", value: 92 }
] as const;

const SCAN_PROGRESS_STAGE_FLOORS: Record<ScanProgressStage, number> = {
  prepare: 0,
  scan: 4,
  review: 78,
  report: 92,
  complete: 96
};

export function getAdaptiveScanProgressValue(input: {
  elapsedMs: number;
  estimatedDurationMs: number;
  progressStage?: ScanProgressStage;
  reportReady: boolean;
}) {
  if (input.reportReady) return 100;

  const elapsedMs = Math.max(0, input.elapsedMs);
  const estimatedDurationMs = Math.max(2_000, input.estimatedDurationMs);
  const ratio = elapsedMs / estimatedDurationMs;
  const timeProgress = ratio <= 1
    ? SCAN_PROGRESS_PRE_ESTIMATE_CEILING * ratio
    : SCAN_PROGRESS_PRE_ESTIMATE_CEILING +
      (SCAN_PROGRESS_WAITING_CEILING - SCAN_PROGRESS_PRE_ESTIMATE_CEILING) * (1 - Math.exp(-(ratio - 1) * 1.5));
  const stageFloor = input.progressStage ? SCAN_PROGRESS_STAGE_FLOORS[input.progressStage] : 0;
  const milestoneRamp = Math.min(1, elapsedMs / 750);
  const value = Math.max(timeProgress, stageFloor * milestoneRamp);

  return Math.round(Math.min(SCAN_PROGRESS_WAITING_CEILING, Math.max(0, value)) * 10) / 10;
}

function getScanProgressDisplay(input: {
  delayed: boolean;
  phase: string;
  progressStage?: ScanProgressStage;
  reportReady: boolean;
  scanStatus?: string | null;
}) {
  const status = input.scanStatus;
  const hasServerProgress = typeof status === "string";
  const estimatedDelay = input.delayed && !hasServerProgress;
  const explicitPhaseIndex = input.progressStage === "prepare"
    ? 0
    : input.progressStage === "scan"
      ? 1
      : input.progressStage === "review"
        ? 2
        : input.progressStage === "report" || input.progressStage === "complete"
          ? 3
          : null;
  const serverPhaseIndex = explicitPhaseIndex ?? (status === "queued"
    ? 0
    : status === "running"
      ? 1
      : status === "processing"
        ? 2
        : input.reportReady
          ? 3
          : null);
  const phaseIndex = serverPhaseIndex ?? (input.phase === "preparing scanner"
    ? 0
    : input.phase === "capturing page evidence"
      ? 1
      : input.phase === "checking policies"
        ? 2
        : 3);
  const isComplete = input.reportReady;
  const label = isComplete
    ? "Completing scan…"
    : estimatedDelay
      ? "Still working through the scan"
      : hasServerProgress
        ? ["Queued for scan", "Scanning website", "Reviewing scan signals", "Preparing your report"][phaseIndex]
        : ["Getting things ready", "Capturing page evidence", "Checking policies and trackers", "Building your report"][phaseIndex];
  const detail = isComplete
    ? "Opening your report…"
    : estimatedDelay
      ? "Progress will continue while the remaining evidence is processed."
      : hasServerProgress
        ? ["Waiting for a scanner to start.", "Capturing page evidence and website signals.", "Processing the retained scan evidence.", "Preparing the report for review."][phaseIndex]
        : `Step ${phaseIndex + 1} of ${SCAN_PROGRESS_STEPS.length}`;
  const currentStep = isComplete ? SCAN_PROGRESS_STEPS.length - 1 : phaseIndex;

  return {
    ariaLabel: isComplete
      ? "Scan complete, opening report"
      : estimatedDelay
        ? "Scan is taking longer than usual"
        : `Scan progress: step ${currentStep + 1} of ${SCAN_PROGRESS_STEPS.length}`,
    ariaValueText: `${detail}`,
    detail,
    label,
    steps: SCAN_PROGRESS_STEPS.map((step, index) => ({
      complete: index <= currentStep,
      current: index === currentStep,
      colorClass: index < currentStep ? "bg-sky-400" : index === currentStep ? "bg-sky-500" : step.colorClass,
      label: step.label
    })),
    currentStep,
  };
}

export function useScanProgressClock(active: boolean) {
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      setStartedAtMs(null);
      return;
    }

    setStartedAtMs((current) => current ?? Date.now());
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, SCAN_PROGRESS_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [active]);

  return {
    nowMs,
    startedAtMs
  };
}

export function LocalV2DagScanProgressCard({
  createdAt,
  initialProgressValue,
  profileValue = "standard",
  progressStage,
  reportReady = false,
  revealProgress = true,
  scanStatus,
  startedAt,
  startedAtMs: explicitStartedAtMs,
  targetLabel = "",
}: {
  createdAt?: string | null;
  initialProgressValue?: number | null;
  profileValue?: string;
  progressStage?: ScanProgressStage;
  reportReady?: boolean;
  revealProgress?: boolean;
  scanStatus?: string | null;
  startedAt?: string | null;
  startedAtMs?: number | null;
  targetLabel?: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const startedAtMs = useMemo(() => {
    if (explicitStartedAtMs !== null && explicitStartedAtMs !== undefined && Number.isFinite(explicitStartedAtMs)) {
      return explicitStartedAtMs;
    }
    const parsedStartedAt = startedAt ? Date.parse(startedAt) : Number.NaN;
    if (Number.isFinite(parsedStartedAt)) {
      return parsedStartedAt;
    }
    const parsedCreatedAt = createdAt ? Date.parse(createdAt) : Number.NaN;
    return Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : nowMs;
  }, [createdAt, explicitStartedAtMs, nowMs, startedAt]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, SCAN_PROGRESS_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const badgeLabel = progressStage === "review"
    ? "Reviewing..."
    : progressStage === "report" || progressStage === "complete"
      ? "Preparing report..."
      : progressStage === "prepare"
        ? "Preparing..."
        : "Scanning...";

  return (
    <section
      aria-live="polite"
      className={`rounded-2xl border border-sky-200 bg-white p-3 shadow-[0_14px_44px_-30px_rgba(14,165,233,0.4)] transition-opacity duration-300 ${revealProgress ? "opacity-100" : "opacity-0"}`}
      data-density="compact"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Scan in progress</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800">
          {badgeLabel}
        </span>
      </div>
      <ScanSubmitProgressBar
        active
        dense
        initialProgressValue={initialProgressValue}
        nowMs={nowMs}
        profileValue={profileValue}
        progressStage={progressStage}
        reportReady={reportReady}
        scanStatus={scanStatus}
        startedAtMs={startedAtMs}
        targetLabel={targetLabel}
      />
    </section>
  );
}

export function normalizeLocalV2ScanProfile(value: unknown): LocalV2ScanProfile {
  return value === "tiny" ? "tiny" : "standard";
}

export function describeScanProgressPhase(input: {
  elapsedMs: number;
  estimatedDurationMs: number;
}) {
  const ratio = Math.max(0, input.elapsedMs) / Math.max(6_000, input.estimatedDurationMs);
  if (ratio < SCAN_PROGRESS_PHASE_BREAKPOINTS[0]) {
    return "preparing scanner";
  }
  if (ratio < SCAN_PROGRESS_PHASE_BREAKPOINTS[1]) {
    return "capturing page evidence";
  }
  if (ratio < SCAN_PROGRESS_PHASE_BREAKPOINTS[2]) {
    return "checking policies";
  }
  return "processing retained evidence";
}

export function estimateScanProgressForOptions(input: {
  consentDag?: boolean;
  profileValue: string;
  runtime?: ScanProgressRuntime;
}): ScanProgressEstimate {
  const profileValue = input.profileValue;
  const runtime = input.runtime ?? (process.env.NODE_ENV === "development" ? "local" : "hosted");
  const profileEstimateMs = runtime === "local"
    ? profileValue === "tiny"
      ? 8_000
      : profileValue === "standard"
        ? 13_500
        : profileValue === "policy"
          ? 18_000
          : profileValue === "consent"
            ? 20_000
            : 22_000
    : profileValue === "tiny"
      ? 12_000
      : profileValue === "standard"
        ? 24_000
        : profileValue === "policy"
          ? 30_000
          : profileValue === "consent"
            ? 34_000
            : 36_000;
  const estimatedDurationMs = profileEstimateMs;
  const modeLabel = `${profileValue} scan`;
  return { estimatedDurationMs, modeLabel };
}
