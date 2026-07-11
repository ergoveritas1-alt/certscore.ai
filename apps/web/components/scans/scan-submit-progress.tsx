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

export function ScanSubmitProgressBar({
  active,
  compact = false,
  nowMs,
  progressEstimate,
  profileValue = "standard",
  startedAtMs,
}: {
  active: boolean;
  compact?: boolean;
  nowMs: number;
  progressEstimate?: ScanProgressEstimate;
  profileValue?: string;
  startedAtMs: number | null;
}) {
  const derivedEstimate = useMemo(() => (
    estimateScanProgressForOptions({
      profileValue
    })
  ), [profileValue]);
  const estimate = progressEstimate ?? derivedEstimate;
  const elapsedSeconds = startedAtMs ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000)) : 0;
  const progressPhase = describeScanProgressPhase({
    elapsedMs: elapsedSeconds * 1_000,
    estimatedDurationMs: estimate.estimatedDurationMs
  });
  const delayed = elapsedSeconds * 1_000 > estimate.estimatedDurationMs * 2;

  if (!active) {
    return null;
  }

  return (
    <div className={compact ? "rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm" : "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"}>
      <div className={compact ? "flex items-center justify-between gap-3 text-xs font-medium text-slate-600" : "flex items-center justify-between gap-3 text-sm font-medium text-slate-700"}>
        <span className="min-w-0 truncate">{delayed ? "taking longer than usual" : progressPhase}</span>
        <span className="shrink-0">{elapsedSeconds}s elapsed</span>
      </div>
      <div
        aria-label={delayed ? "Scan is taking longer than usual" : "Scan is in progress"}
        className={compact ? "mt-2 h-2 overflow-hidden rounded-full bg-slate-200" : "mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"}
        role="progressbar"
      >
        <div
          className="h-full w-1/3 animate-pulse rounded-full bg-sky-500"
        />
      </div>
    </div>
  );
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
  startedAt,
}: {
  createdAt?: string | null;
  profileValue?: string;
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
          <ScanWorkingGlyph />
          Scanning...
        </span>
      </div>
      <ScanSubmitProgressBar
        active
        nowMs={nowMs}
        profileValue={profileValue}
        startedAtMs={startedAtMs}
      />
    </section>
  );
}

function ScanWorkingGlyph() {
  return (
    <span aria-hidden="true" className="relative h-4 w-4 shrink-0">
      <span className="absolute inset-0 rounded-full border border-sky-300/70" />
      <span className="absolute inset-[2px] animate-spin rounded-full border-2 border-sky-200 border-t-sky-700" />
      <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-sky-700" />
    </span>
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
  if (ratio < 0.18) {
    return "preparing scanner";
  }
  if (ratio < 0.55) {
    return "capturing page evidence";
  }
  if (ratio < 0.76) {
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
