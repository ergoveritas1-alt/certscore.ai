"use client";

import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { useEffect, useMemo, useState } from "react";
import { buildEventActivityFeed } from "../../lib/scans/activity-feed";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { InfoTip } from "./info-tip";
import { LiveActivityLine, useRotatingActivityLine } from "./live-activity-line";

type FullScanProgressCardProps = {
  createdAt: string;
  events: Array<{
    createdAt: string;
    eventType: string;
    message: string;
    metadataJson: unknown;
  }>;
  status: string;
};

type StageKey = "queued" | "collecting" | "persisting";

const STAGE_RANGES: Record<StageKey, { max: number; min: number }> = {
  queued: { min: 10, max: 28 },
  collecting: { min: 34, max: 76 },
  persisting: { min: 82, max: 96 }
};

const STAGE_DURATIONS_MS: Record<StageKey, number> = {
  queued: 20_000,
  collecting: 120_000,
  persisting: 30_000
};

function getStageKey(eventTypes: string[], status: string): StageKey {
  if (status === "queued") {
    return "queued";
  }

  if (eventTypes.includes(SCAN_EVENT_TYPES.signalsPersisted) || eventTypes.includes(SCAN_EVENT_TYPES.changesComputed)) {
    return "persisting";
  }

  return "collecting";
}

function getStageStartedAt(input: {
  createdAt: string;
  events: Array<{ createdAt: string; eventType: string }>;
  stageKey: StageKey;
}) {
  if (input.stageKey === "queued") {
    return Date.parse(input.createdAt);
  }

  if (input.stageKey === "collecting") {
    const crawlStarted = input.events.find((event) => event.eventType === SCAN_EVENT_TYPES.crawlStarted);
    return Date.parse(crawlStarted?.createdAt ?? input.createdAt);
  }

  const persisted = input.events.find((event) => event.eventType === SCAN_EVENT_TYPES.signalsPersisted);
  const discovery = input.events.find((event) => event.eventType === SCAN_EVENT_TYPES.pageDiscoveryCompleted);
  return Date.parse(persisted?.createdAt ?? discovery?.createdAt ?? input.createdAt);
}

function getInterpolatedProgress(input: {
  createdAt: string;
  events: Array<{ createdAt: string; eventType: string }>;
  nowMs: number;
  status: string;
}) {
  if (input.status === "completed") {
    return 100;
  }

  if (input.status === "failed") {
    return 100;
  }

  const eventTypes = input.events.map((event) => event.eventType);
  const stageKey = getStageKey(eventTypes, input.status);
  const stageRange = STAGE_RANGES[stageKey];
  const stageDurationMs = STAGE_DURATIONS_MS[stageKey];
  const stageStartedAt = getStageStartedAt({
    createdAt: input.createdAt,
    events: input.events,
    stageKey
  });
  const elapsedMs = Math.max(0, input.nowMs - stageStartedAt);
  const normalized = Math.min(1, elapsedMs / stageDurationMs);
  return Math.round(stageRange.min + (stageRange.max - stageRange.min) * normalized);
}

function getStepCardClassName(state: "active" | "complete" | "pending") {
  if (state === "complete") {
    return "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900";
  }

  if (state === "active") {
    return "rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700";
  }

  return "rounded-2xl bg-slate-50 p-4 text-sm text-slate-600";
}

function getStepState(eventTypes: string[], status: string) {
  const step1Complete = status !== "queued";
  const step2Complete =
    eventTypes.includes(SCAN_EVENT_TYPES.pageDiscoveryCompleted) ||
    eventTypes.includes(SCAN_EVENT_TYPES.signalsPersisted) ||
    eventTypes.includes(SCAN_EVENT_TYPES.changesComputed);
  const step3Complete = eventTypes.includes(SCAN_EVENT_TYPES.changesComputed);

  return { step1Complete, step2Complete, step3Complete };
}

function getStepLabel(status: string, eventTypes: string[]) {
  if (status === "queued") {
    return "step[1/3]";
  }

  if (eventTypes.includes(SCAN_EVENT_TYPES.changesComputed) || eventTypes.includes(SCAN_EVENT_TYPES.signalsPersisted)) {
    return "step[3/3]";
  }

  return "step[2/3]";
}

function buildActivityFeed(input: {
  createdAt: string;
  events: Array<{
    createdAt: string;
    eventType: string;
    message: string;
    metadataJson: unknown;
  }>;
  status: string;
}) {
  if (input.events.length === 0) {
    return input.status === "queued"
      ? ["step[1/3] event> Scan queued and awaiting scanner pickup.", "data> evt=full_scan.queued"]
      : ["step[2/3] event> Full scan activity feed is initializing.", "data> evt=full_scan.pending"];
  }

  const eventTypes = input.events.map((event) => event.eventType);
  const stepLabel = getStepLabel(input.status, eventTypes);
  return buildEventActivityFeed({
    events: input.events,
    fallbackLines:
      input.status === "queued"
        ? ["step[1/3] event> Scan queued and awaiting scanner pickup.", "data> evt=full_scan.queued"]
        : ["step[2/3] event> Full scan activity feed is initializing.", "data> evt=full_scan.pending"],
    latestLabel: stepLabel
  });
}

export function FullScanProgressCard({ createdAt, events, status }: FullScanProgressCardProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "queued" && status !== "running") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 600);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [status]);

  const eventTypes = useMemo(() => events.map((event) => event.eventType), [events]);
  const activityFeed = useMemo(() => buildActivityFeed({ createdAt, events, status }), [createdAt, events, status]);
  const progressValue = getInterpolatedProgress({
    createdAt,
    events,
    nowMs,
    status
  });
  const stepState = getStepState(eventTypes, status);
  const fallbackLine =
    status === "queued"
      ? "step[1/3] event> Scan queued and awaiting scanner pickup."
      : "step[2/3] event> Full scan activity feed is initializing.";
  const fallbackDataLine = status === "queued" ? "data> evt=full_scan.queued" : "data> evt=full_scan.pending";
  const fallbackWaitingLine = `log evt=${events.at(-1)?.eventType ?? "full_scan.pending"} · waiting for next scan event...`;
  const { activeLine } = useRotatingActivityLine({
    fallbackLines: [fallbackLine, fallbackDataLine],
    lines: activityFeed.length === 1 ? [activityFeed[0] ?? fallbackLine, fallbackWaitingLine] : activityFeed,
    running: status === "queued" || status === "running"
  });

  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>Full scan in progress</span>
          <InfoTip text="Live progress for the active scan, including stage status and the rolling event feed emitted while the worker runs." />
        </span>
      }
      defaultOpen
      className="min-w-0"
      contentClassName="min-w-0 space-y-4"
    >
        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-amber-500 transition-[width] duration-500 ease-out"
            style={{ width: `${progressValue}%` }}
          />
        </div>
        <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0 max-w-full overflow-hidden rounded-xl bg-white/60 px-3 py-2 font-mono text-[13px] text-slate-600">
            <LiveActivityLine line={activeLine} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className={getStepCardClassName(stepState.step1Complete ? "complete" : status === "queued" ? "active" : "pending")}>
            <p className="font-medium text-ink">Step 1</p>
            <p>Queue the scan, normalize the target website, and start the worker run.</p>
          </div>
          <div className={getStepCardClassName(stepState.step2Complete ? "complete" : status === "running" ? "active" : "pending")}>
            <p className="font-medium text-ink">Step 2</p>
            <p>Crawl target pages, collect structured signals, and capture runtime evidence.</p>
          </div>
          <div
            className={getStepCardClassName(
              stepState.step3Complete ? "complete" : status === "running" && stepState.step2Complete ? "active" : "pending"
            )}
          >
            <p className="font-medium text-ink">Step 3</p>
            <p>Persist the snapshot, compute changes, and finalize the scan record.</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">Progress updates automatically while this scan is queued or running.</p>
    </CollapsibleSectionCard>
  );
}
