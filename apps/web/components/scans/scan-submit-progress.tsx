"use client";

import React, { useEffect, useMemo, useState } from "react";

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

const MAIN_PROGRESS_COLORS = [
  [249, 115, 22],
  [250, 204, 21],
  [125, 211, 252],
  [34, 197, 94]
] as const;

const SCAN_PROGRESS_PHASE_BREAKPOINTS = [0.30, 0.68, 0.84] as const;

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

export function ScanSubmissionPendingIndicator({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-live="polite"
      className={compact
        ? "rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
        : "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"}
      role="status"
    >
      <div className={compact
        ? "flex items-center gap-2 text-xs font-medium text-slate-600"
        : "flex items-center gap-2 text-sm font-medium text-slate-700"}
      >
        <ScanActivityIndicator className="text-sky-500" />
        <span>Starting scan…</span>
      </div>
      {!compact ? (
        <p className="mt-1 text-xs text-slate-500">
          Creating the scan request and waiting for its current status.
        </p>
      ) : null}
      <div aria-hidden="true" className={compact ? "mt-2 h-2 overflow-hidden rounded-full bg-slate-200" : "mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"}>
        <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-400 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function ScanSubmitProgressBar({
  active,
  compact = false,
  nowMs,
  progressEstimate,
  profileValue = "standard",
  reportReady = false,
  scanStatus,
  startedAtMs,
}: {
  active: boolean;
  compact?: boolean;
  nowMs: number;
  progressEstimate?: ScanProgressEstimate;
  profileValue?: string;
  reportReady?: boolean;
  scanStatus?: string | null;
  startedAtMs: number | null;
}) {
  const derivedEstimate = useMemo(() => (
    estimateScanProgressForOptions({
      profileValue
    })
  ), [profileValue]);
  const estimate = progressEstimate ?? derivedEstimate;
  const elapsedSeconds = startedAtMs !== null ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000)) : 0;
  const progressPhase = describeScanProgressPhase({
    elapsedMs: elapsedSeconds * 1_000,
    estimatedDurationMs: estimate.estimatedDurationMs
  });
  const delayed = elapsedSeconds * 1_000 > estimate.estimatedDurationMs * 2;
  const progressDisplay = getScanProgressDisplay({
    delayed,
    phase: progressPhase,
    reportReady,
    scanStatus
  });
  const [displayedProgressValue, setDisplayedProgressValue] = useState(0);
  const displayedProgressValueRef = React.useRef(0);
  const displayedStepRef = React.useRef(0);
  const wasActiveRef = React.useRef(false);

  useEffect(() => {
    if (!active) {
      wasActiveRef.current = false;
      return;
    }

    const isNewScan = !wasActiveRef.current;
    wasActiveRef.current = true;
    if (isNewScan) {
      displayedStepRef.current = progressDisplay.currentStep;
      const currentStepStart = getScanProgressStepStart(progressDisplay.currentStep);
      displayedProgressValueRef.current = currentStepStart;
      setDisplayedProgressValue(currentStepStart);
    }

    if (!isNewScan && progressDisplay.currentStep > displayedStepRef.current) {
      displayedStepRef.current = progressDisplay.currentStep;
      const nextStepStart = getScanProgressStepStart(progressDisplay.currentStep);
      displayedProgressValueRef.current = Math.max(displayedProgressValueRef.current, nextStepStart);
      setDisplayedProgressValue(displayedProgressValueRef.current);
    }

    const targetValue = getScanProgressStepEnd(Math.max(displayedStepRef.current, progressDisplay.currentStep));
    let timer: number | undefined;
    const advanceTowardTarget = () => {
      const currentValue = displayedProgressValueRef.current;
      const remainingDistance = targetValue - currentValue;
      if (remainingDistance <= 0.5) {
        displayedProgressValueRef.current = targetValue;
        setDisplayedProgressValue(targetValue);
        return;
      }

      const nextValue = currentValue + remainingDistance / 2;
      displayedProgressValueRef.current = nextValue;
      setDisplayedProgressValue(nextValue);
      timer = window.setTimeout(advanceTowardTarget, 2_000);
    };

    timer = window.setTimeout(advanceTowardTarget, 2_000);

    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [active, progressDisplay.currentStep]);

  if (!active) {
    return null;
  }

  return (
    <div aria-live="polite" className={compact ? "rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm" : "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"}>
      <div className={compact ? "flex items-center justify-between gap-3 text-xs font-medium text-slate-600" : "flex items-center justify-between gap-3 text-sm font-medium text-slate-700"}>
        <span className="min-w-0 truncate">{progressDisplay.label}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <ScanActivityIndicator className="text-sky-500" />
          <span>{elapsedSeconds}s elapsed</span>
        </span>
      </div>
      {!compact ? <p className="mt-1 text-xs text-slate-500">{progressDisplay.detail}</p> : null}
      <div
        aria-label={progressDisplay.ariaLabel}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={displayedProgressValue}
        aria-valuetext={progressDisplay.ariaValueText}
        className={compact ? "mt-2 h-2 overflow-hidden rounded-full bg-slate-200" : "mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"}
        role="progressbar"
      >
        <div
          className="h-full rounded-full transition-[width,background-color] duration-[2000ms] ease-out"
          style={{
            backgroundColor: getMainProgressColor(displayedProgressValue),
            width: `${displayedProgressValue}%`
          }}
        />
      </div>
      <div className={compact ? "mt-2 grid grid-cols-4 gap-1" : "mt-3 grid grid-cols-4 gap-1.5"} aria-hidden="true">
        {progressDisplay.steps.map((step) => (
          <div key={step.label} className="space-y-1">
            <div className={`h-1 rounded-full transition-colors duration-500 ${step.colorClass}`} />
            {!compact ? <span className={`block truncate text-[10px] ${step.current ? "font-semibold text-sky-700" : "text-slate-400"}`}>{step.label}</span> : null}
          </div>
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

const SCAN_PROGRESS_STEP_BOUNDARIES = [0, 25, 50, 75, 100] as const;

function getScanProgressStepStart(stepIndex: number) {
  return SCAN_PROGRESS_STEP_BOUNDARIES[Math.min(Math.max(stepIndex, 0), SCAN_PROGRESS_STEPS.length)] ?? 0;
}

function getScanProgressStepEnd(stepIndex: number) {
  return getScanProgressStepStart(stepIndex + 1);
}

function getScanProgressDisplay(input: {
  delayed: boolean;
  phase: string;
  reportReady: boolean;
  scanStatus?: string | null;
}) {
  const status = input.scanStatus;
  const hasServerProgress = typeof status === "string";
  const estimatedDelay = input.delayed && !hasServerProgress;
  const serverPhaseIndex = status === "queued"
    ? 0
    : status === "running"
      ? 1
      : status === "processing"
        ? 2
        : input.reportReady
          ? 3
          : null;
  const phaseIndex = serverPhaseIndex ?? (input.phase === "preparing scanner"
    ? 0
    : input.phase === "capturing page evidence"
      ? 1
      : input.phase === "checking policies"
        ? 2
        : 3);
  const isComplete = input.reportReady;
  const value = isComplete ? 100 : estimatedDelay ? 92 : SCAN_PROGRESS_STEPS[phaseIndex].value;
  const label = isComplete
    ? "Completing scan…"
    : estimatedDelay
      ? "Taking longer than usual"
      : hasServerProgress
        ? ["Queued for scan", "Scanning website", "Reviewing scan signals", "Preparing your report"][phaseIndex]
        : ["Getting things ready", "Capturing page evidence", "Checking policies and trackers", "Building your report"][phaseIndex];
  const detail = isComplete
    ? "Opening your report…"
    : estimatedDelay
      ? "The scan is still working through the site."
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
      colorClass: step.colorClass,
      label: step.label
    })),
    currentStep,
    value
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
    }, 1_000);

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
  profileValue = "standard",
  scanStatus,
  startedAt,
}: {
  createdAt?: string | null;
  profileValue?: string;
  scanStatus?: string | null;
  startedAt?: string | null;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const startedAtMs = useMemo(() => {
    const parsedStartedAt = startedAt ? Date.parse(startedAt) : Number.NaN;
    if (Number.isFinite(parsedStartedAt)) {
      return parsedStartedAt;
    }
    const parsedCreatedAt = createdAt ? Date.parse(createdAt) : Number.NaN;
    return Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : nowMs;
  }, [createdAt, nowMs, startedAt]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <section aria-live="polite" className="rounded-3xl border border-sky-200 bg-white p-5 shadow-[0_18px_60px_-32px_rgba(14,165,233,0.45)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Scan in progress</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
          Scanning...
        </span>
      </div>
      <ScanSubmitProgressBar
        active
        nowMs={nowMs}
        profileValue={profileValue}
        scanStatus={scanStatus}
        startedAtMs={startedAtMs}
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
}): ScanProgressEstimate {
  const profileValue = input.profileValue;
  const profileEstimateMs = profileValue === "tiny"
    ? 16_000
    : profileValue === "standard"
      ? 36_000
      : profileValue === "policy"
        ? 36_000
        : profileValue === "consent"
          ? 42_000
          : 45_000;
  const estimatedDurationMs = profileEstimateMs;
  const modeLabel = `${profileValue} scan`;
  return { estimatedDurationMs, modeLabel };
}
