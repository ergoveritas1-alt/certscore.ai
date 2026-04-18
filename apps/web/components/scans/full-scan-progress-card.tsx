"use client";

import {
  SCAN_EVENT_TYPES,
  SCAN_EXECUTION_STAGES,
  type ScannerExecutionSummary
} from "@website-signal-risk-scanner/shared";
import { Badge } from "@website-signal-risk-scanner/ui";
import React, { useEffect, useMemo, useState } from "react";
import { formatMetadataPreview } from "../../lib/scans/activity-feed";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { InfoTip } from "./info-tip";
import { LiveActivityLine } from "./live-activity-line";

type FullScanProgressCardProps = {
  buildPhaseSummaries: BuildPhaseSummary[];
  createdAt: string;
  events: ScanEventRow[];
  executionSummary: ScannerExecutionSummary | null;
  status: string;
};

type ScanEventRow = {
  createdAt: string;
  eventType: string;
  message: string;
  metadataJson: unknown;
};

type BuildPhaseSummary = {
  attempts: number | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  outcome: string;
  phase: string;
  startedAt: string | null;
};

type DashboardRow = {
  attempts: number | null;
  completedAt: string | null;
  durationMs: number | null;
  key: string;
  label: string;
  latestEvent: ScanEventRow | null;
  message: string;
  startedAt: string | null;
  state: "active" | "failed" | "pending" | "success" | "warning";
  statusLabel: string;
  sublines: string[];
};

type EarlyResultItem = {
  label: string;
  value: string;
};

const STAGE_LABELS: Record<string, string> = {
  queue_wait: "Queue wait",
  setup_load: "Setup load",
  baseline_lookup: "Baseline lookup",
  crawl_discovery: "Crawl discovery",
  runtime_snapshot_capture: "Runtime snapshot capture",
  signal_derivation: "Signal derivation",
  persistence_diff_finalization: "Persistence and finalize"
};

const STAGE_EVENT_MATCHERS: Record<string, (eventType: string) => boolean> = {
  queue_wait: (eventType) =>
    eventType === SCAN_EVENT_TYPES.fullQueued || eventType === SCAN_EVENT_TYPES.validationRunQueued,
  setup_load: (eventType) =>
    eventType === SCAN_EVENT_TYPES.fullStarted || eventType === SCAN_EVENT_TYPES.fullRunning,
  baseline_lookup: (eventType) => eventType.startsWith("regression."),
  crawl_discovery: (eventType) =>
    eventType.startsWith("crawl.") || eventType === SCAN_EVENT_TYPES.accessLimitationsDetected,
  runtime_snapshot_capture: (eventType) =>
    eventType.startsWith("runtime.") ||
    eventType.startsWith("privacy.") ||
    eventType.startsWith("legal.") ||
    eventType.startsWith("accessibility.") ||
    eventType.startsWith("tracker."),
  signal_derivation: (eventType) =>
    eventType === SCAN_EVENT_TYPES.legalAuditCompleted ||
    eventType === SCAN_EVENT_TYPES.privacyAuditCompleted ||
    eventType === SCAN_EVENT_TYPES.accessibilityAuditCompleted ||
    eventType === SCAN_EVENT_TYPES.ftcSignalAuditCompleted ||
    eventType === SCAN_EVENT_TYPES.policyDetectionCompleted ||
    eventType === SCAN_EVENT_TYPES.policyContentCheckCompleted,
  persistence_diff_finalization: (eventType) =>
    eventType === SCAN_EVENT_TYPES.signalsPersisted ||
    eventType === SCAN_EVENT_TYPES.changesComputed ||
    eventType === SCAN_EVENT_TYPES.fullCompleted ||
    eventType === SCAN_EVENT_TYPES.fullFailed
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatDurationMs(value: number | null | undefined, nowMs?: number, startedAt?: string | null) {
  let durationMs = value;

  if ((durationMs === null || durationMs === undefined) && nowMs && startedAt) {
    const startedMs = Date.parse(startedAt);
    if (Number.isFinite(startedMs)) {
      durationMs = Math.max(0, nowMs - startedMs);
    }
  }

  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
    return "—";
  }

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)} ms`;
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1_000).toFixed(1)} s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function formatAttemptLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value <= 1) {
    return "1 attempt";
  }

  return `${value} attempts`;
}

function getStatusDotClassName(state: DashboardRow["state"]) {
  switch (state) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "failed":
      return "bg-rose-500";
    case "active":
      return "bg-sky-500";
    default:
      return "bg-slate-300";
  }
}

function getBadgeTone(state: DashboardRow["state"]): "neutral" | "success" | "warning" {
  switch (state) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    default:
      return "neutral";
  }
}

function getProgressBarClassName(input: {
  executionSummary: ScannerExecutionSummary | null;
  status: string;
}) {
  if (input.status === "failed") {
    return "bg-rose-500";
  }

  if (input.status === "completed") {
    return "bg-emerald-500";
  }

  const completedStages = new Set(input.executionSummary?.stages.map((stage) => stage.stage) ?? []);

  if (completedStages.has("persistence_diff_finalization")) {
    return "bg-emerald-500";
  }

  if (completedStages.has("signal_derivation")) {
    return "bg-indigo-500";
  }

  if (completedStages.has("runtime_snapshot_capture")) {
    return "bg-sky-500";
  }

  if (completedStages.has("crawl_discovery")) {
    return "bg-cyan-500";
  }

  return "bg-amber-500";
}

function getLatestEventForStage(events: ScanEventRow[], stageKey: string) {
  const matches = STAGE_EVENT_MATCHERS[stageKey];
  if (!matches) {
    return null;
  }

  const matchingEvents = events.filter((event) => matches(event.eventType));
  return matchingEvents.at(-1) ?? null;
}

function buildLatestActivityLine(input: {
  createdAt: string;
  events: ScanEventRow[];
  executionSummary: ScannerExecutionSummary | null;
  status: string;
}) {
  const completedStageCount = input.executionSummary?.stages.length ?? 0;
  const totalStageCount = SCAN_EXECUTION_STAGES.length + 1;
  const latestEvent =
    input.status === "queued" ? getLatestEventForStage(input.events, "queue_wait") : input.events.at(-1);

  if (input.events.length === 0) {
    return input.status === "queued"
      ? `Queued for worker pickup · 0/${totalStageCount} milestones complete.`
      : `Waiting for first worker update · ${completedStageCount}/${totalStageCount} milestones complete.`;
  }

  if (!latestEvent) {
    return input.status === "queued"
      ? `Queued for worker pickup · 0/${totalStageCount} milestones complete.`
      : `Waiting for first worker update · ${completedStageCount}/${totalStageCount} milestones complete.`;
  }

  const metadata = formatMetadataPreview(latestEvent.metadataJson).join(" · ");
  const prefix =
    input.status === "queued"
      ? `Queued · ${completedStageCount}/${totalStageCount} milestones complete`
      : input.status === "completed"
        ? "Scan complete"
        : input.status === "failed"
          ? "Scan failed"
          : `Live scan · ${completedStageCount}/${totalStageCount} milestones complete`;
  return metadata.length > 0
    ? `${prefix} · ${latestEvent.message} · ${metadata}`
    : `${prefix} · ${latestEvent.message}`;
}

function getProgressValue(input: {
  buildPhaseSummaries: BuildPhaseSummary[];
  executionSummary: ScannerExecutionSummary | null;
  status: string;
}) {
  const milestoneStops = [8, 18, 30, 48, 72, 88, 97];

  if (input.status === "completed") {
    return 100;
  }

  if (input.status === "failed") {
    const completedCount = input.executionSummary?.stages.length ?? 0;
    return milestoneStops[Math.min(completedCount, milestoneStops.length - 1)] ?? 12;
  }

  if (input.status === "queued") {
    return 8;
  }

  const completedCount = input.executionSummary?.stages.length ?? 0;
  const pendingStageIndex = getPendingStageIndex(input.executionSummary);
  const base = milestoneStops[Math.min(completedCount, milestoneStops.length - 1)] ?? 12;

  if (pendingStageIndex <= 0) {
    return base;
  }

  const activeStageKey = SCAN_EXECUTION_STAGES[pendingStageIndex] ?? null;
  const nextStop = milestoneStops[Math.min(pendingStageIndex + 1, milestoneStops.length - 1)] ?? 96;

  if (activeStageKey === "runtime_snapshot_capture") {
    const runtimeCompleted = input.buildPhaseSummaries.filter((phase) => phase.completedAt).length;
    const runtimeTotal = Math.max(input.buildPhaseSummaries.length, 4);
    const ratio = Math.min(1, runtimeCompleted / runtimeTotal);
    return Math.round(base + (nextStop - base) * ratio);
  }

  return Math.round(base + (nextStop - base) * 0.35);
}

function getPendingStageIndex(executionSummary: ScannerExecutionSummary | null) {
  const completedStages = new Set(executionSummary?.stages.map((stage) => stage.stage) ?? []);
  return SCAN_EXECUTION_STAGES.findIndex((stage) => !completedStages.has(stage));
}

function buildRuntimeSublines(phases: BuildPhaseSummary[]) {
  return phases
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left.startedAt ?? left.completedAt ?? "");
      const rightTime = Date.parse(right.startedAt ?? right.completedAt ?? "");
      return leftTime - rightTime;
    })
    .map((phase) => {
      const duration = formatDurationMs(phase.durationMs);
      const attempts = formatAttemptLabel(phase.attempts);
      const suffix = [duration !== "—" ? duration : null, attempts].filter(Boolean).join(" · ");
      const error = phase.error ? ` · ${phase.error}` : "";
      return `${formatStageLabel(phase.phase)}: ${phase.outcome}${suffix ? ` · ${suffix}` : ""}${error}`;
    });
}

function formatStageLabel(value: string) {
  return STAGE_LABELS[value] ??
    value
      .split("_")
      .filter(Boolean)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(" ");
}

function getRecordValue(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  return (record as Record<string, unknown>)[key];
}

function getStringValue(record: unknown, ...keys: string[]) {
  for (const key of keys) {
    const value = getRecordValue(record, key);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getNumberValue(record: unknown, ...keys: string[]) {
  for (const key of keys) {
    const value = getRecordValue(record, key);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getBooleanValue(record: unknown, ...keys: string[]) {
  for (const key of keys) {
    const value = getRecordValue(record, key);
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function titleCaseWords(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function buildEarlyResultItems(input: {
  events: ScanEventRow[];
  executionSummary: ScannerExecutionSummary | null;
}) {
  const stageMetadata = new Map(
    (input.executionSummary?.stages ?? [])
      .filter((stage) => stage.metadata && typeof stage.metadata === "object" && !Array.isArray(stage.metadata))
      .map((stage) => [stage.stage, stage.metadata as Record<string, unknown>])
  );
  const crawlMetadata = stageMetadata.get("crawl_discovery") ?? null;
  const baselineMetadata = stageMetadata.get("baseline_lookup") ?? null;
  const runtimeMetadata = stageMetadata.get("runtime_snapshot_capture") ?? null;
  const latestEventMetadata =
    [...input.events]
      .reverse()
      .map((event) => event.metadataJson)
      .find((value) => value && typeof value === "object" && !Array.isArray(value)) ?? null;

  const sourceRecords = [runtimeMetadata, crawlMetadata, baselineMetadata, latestEventMetadata];
  const items: EarlyResultItem[] = [];
  const push = (label: string, value: string | null) => {
    if (!value || items.some((item) => item.label === label)) {
      return;
    }
    items.push({ label, value });
  };

  const baselineHost = getStringValue(baselineMetadata, "resolvedHostname", "hostname", "canonicalHost");
  if (baselineHost) {
    push("Host", baselineHost);
  }

  const baselineTlsIssuer = getStringValue(baselineMetadata, "tlsIssuer", "certificateIssuer");
  if (baselineTlsIssuer) {
    push("TLS issuer", baselineTlsIssuer);
  }

  for (const record of sourceRecords) {
    push("Tier", getStringValue(record, "tier"));
    const homepageStatus = getNumberValue(record, "homepageFetchHttpStatus", "httpStatus", "statusCode");
    if (homepageStatus !== null) {
      push("Homepage", `HTTP ${homepageStatus}`);
    }
    push("Final URL", getStringValue(record, "finalUrl", "url"));
    push("Server", getStringValue(record, "serverHeader", "server"));
    push("Block vendor", getStringValue(record, "blockVendorGuess"));
    const accessPosture = getStringValue(record, "accessPostureClass");
    if (accessPosture) {
      push("Access posture", titleCaseWords(accessPosture));
    }
    const verifiedSurfaces = getNumberValue(record, "verifiedPublicSurfacesCount");
    if (verifiedSurfaces !== null) {
      push("Verified surfaces", String(verifiedSurfaces));
    }
    const cmpVendor = getStringValue(record, "cmpVendorName");
    if (cmpVendor) {
      push("CMP", cmpVendor);
    }
    const bannerVisible = getBooleanValue(record, "cookieBannerPresent", "consentSurfaceObserved");
    if (bannerVisible === true) {
      push("Consent surface", "Observed");
    }
    const thirdPartyRequests = getNumberValue(record, "thirdPartyRequestCount");
    if (thirdPartyRequests !== null) {
      push("3P requests", String(thirdPartyRequests));
    }
    const initialCookies = getNumberValue(record, "initialCookieCount", "cookieCountTotal");
    if (initialCookies !== null) {
      push("Initial cookies", String(initialCookies));
    }
    const blocked = getBooleanValue(record, "blockedFlag");
    if (blocked === true) {
      push("Front door", "Blocked");
    }
    const challenge = getBooleanValue(record, "challengeSuspected");
    if (challenge === true) {
      push("Challenge", "Suspected");
    }
  }

  return items.slice(0, 12);
}

function getQueueRow(input: {
  createdAt: string;
  events: ScanEventRow[];
  executionSummary: ScannerExecutionSummary | null;
  status: string;
}) {
  const latestEvent = getLatestEventForStage(input.events, "queue_wait");
  const setupStage = input.executionSummary?.stages.find((stage) => stage.stage === "setup_load") ?? null;
  const isDone = Boolean(setupStage) || input.status !== "queued";

  return {
    attempts: null,
    completedAt: isDone ? setupStage?.startedAt ?? latestEvent?.createdAt ?? input.createdAt : null,
    durationMs:
      isDone && setupStage?.startedAt
        ? Math.max(0, Date.parse(setupStage.startedAt) - Date.parse(input.createdAt))
        : null,
    key: "queue_wait",
    label: formatStageLabel("queue_wait"),
    latestEvent,
    message:
      latestEvent?.message ??
      (input.status === "queued" ? "Scan is queued and waiting for worker pickup." : "Worker picked up the scan."),
    startedAt: input.createdAt,
    state: isDone ? "success" : "active",
    statusLabel: isDone ? "Picked up" : "Waiting",
    sublines: latestEvent ? formatMetadataPreview(latestEvent.metadataJson) : []
  } satisfies DashboardRow;
}

function getStageRows(input: {
  buildPhaseSummaries: BuildPhaseSummary[];
  events: ScanEventRow[];
  executionSummary: ScannerExecutionSummary | null;
  status: string;
}) {
  const pendingStageIndex = getPendingStageIndex(input.executionSummary);
  const completedStageMap = new Map(input.executionSummary?.stages.map((stage) => [stage.stage, stage]) ?? []);

  return SCAN_EXECUTION_STAGES.map((stageKey, index) => {
    const completedStage = completedStageMap.get(stageKey) ?? null;
    const latestEvent = getLatestEventForStage(input.events, stageKey);
    const isActive =
      completedStage === null &&
      input.status === "running" &&
      pendingStageIndex !== -1 &&
      pendingStageIndex === index;
    const isFailed = completedStage?.outcome === "failed" || (input.status === "failed" && pendingStageIndex === index);
    const isWarning = completedStage?.outcome === "degraded";
    const state: DashboardRow["state"] = completedStage
      ? completedStage.outcome === "success"
        ? "success"
        : completedStage.outcome === "degraded"
          ? "warning"
          : "failed"
      : isActive
        ? "active"
        : isFailed
          ? "failed"
          : "pending";

    const sublines = [
      ...(latestEvent ? formatMetadataPreview(latestEvent.metadataJson) : []),
      ...(stageKey === "runtime_snapshot_capture" ? buildRuntimeSublines(input.buildPhaseSummaries) : [])
    ].slice(0, 6);

    const attempts = completedStage?.attempts ?? null;
    const message =
      completedStage?.message ??
      latestEvent?.message ??
      (isActive ? "Stage is running and refreshing with live worker events." : "Stage has not started yet.");

    return {
      attempts,
      completedAt: completedStage?.completedAt ?? null,
      durationMs: completedStage?.durationMs ?? null,
      key: stageKey,
      label: formatStageLabel(stageKey),
      latestEvent,
      message,
      startedAt: completedStage?.startedAt ?? (isActive ? latestEvent?.createdAt ?? null : null),
      state,
      statusLabel: completedStage
        ? completedStage.outcome === "success"
          ? "Completed"
          : completedStage.outcome === "degraded"
            ? "Completed with issues"
            : "Failed"
        : isActive
          ? "Running"
          : "Pending",
      sublines: [
        ...(attempts && attempts > 1 ? [`Recovered after ${attempts - 1} retr${attempts - 1 === 1 ? "y" : "ies"}.`] : []),
        ...(completedStage?.errorCategory ? [`Error category: ${completedStage.errorCategory}`] : []),
        ...sublines
      ].slice(0, 6)
    } satisfies DashboardRow;
  }).map((row) => ({
    ...row,
    durationMs: row.durationMs,
    message: row.message || (row.state === "pending" ? "Stage has not started yet." : "No stage update recorded."),
    sublines: row.sublines
  }));
}

function getCardTitle(status: string) {
  if (status === "queued") {
    return "Full scan queued";
  }

  if (status === "completed") {
    return "Full scan complete";
  }

  if (status === "failed") {
    return "Full scan failed";
  }

  return "Full scan in progress";
}

export function FullScanProgressCard({
  buildPhaseSummaries,
  createdAt,
  events,
  executionSummary,
  status
}: FullScanProgressCardProps) {
  const initialNowMs = Date.parse(events.at(-1)?.createdAt ?? createdAt);
  const [nowMs, setNowMs] = useState(initialNowMs);

  useEffect(() => {
    if (status !== "queued" && status !== "running") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [status]);

  const latestActivityLine = useMemo(
    () =>
      buildLatestActivityLine({
        createdAt,
        events,
        executionSummary,
        status
      }),
    [createdAt, events, executionSummary, status]
  );
  const earlyResultItems = useMemo(
    () =>
      buildEarlyResultItems({
        events,
        executionSummary
      }),
    [events, executionSummary]
  );
  const progressValue = useMemo(
    () =>
      getProgressValue({
        buildPhaseSummaries,
        executionSummary,
        status
      }),
    [buildPhaseSummaries, executionSummary, status]
  );
  const progressBarClassName = useMemo(
    () =>
      getProgressBarClassName({
        executionSummary,
        status
      }),
    [executionSummary, status]
  );
  const dashboardRows = useMemo(
    () => [
      getQueueRow({
        createdAt,
        events,
        executionSummary,
        status
      }),
      ...getStageRows({
        buildPhaseSummaries,
        events,
        executionSummary,
        status
      })
    ],
    [buildPhaseSummaries, createdAt, events, executionSummary, status]
  );
  const activeRow = dashboardRows.find((row) => row.state === "active") ?? null;
  const completedRows = dashboardRows.filter((row) => row.state === "success" || row.state === "warning");
  const recentRows = [...dashboardRows]
    .filter((row) => row.latestEvent || row.state === "active" || row.state === "failed")
    .slice(-4)
    .reverse();

  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>{getCardTitle(status)}</span>
          <InfoTip text="Stage-driven live dashboard backed by the execution summary, with raw worker events preserved below for debugging." />
        </span>
      }
      defaultOpen
      className="min-w-0"
      contentClassName="min-w-0 space-y-4"
    >
      <div className="h-5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-500 ${progressBarClassName}`}
          style={{ width: `${progressValue}%` }}
        />
      </div>

      <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="min-w-0 max-w-full overflow-hidden rounded-xl bg-white/60 px-3 py-2 font-mono text-[13px] text-slate-600">
          <LiveActivityLine line={latestActivityLine} />
        </div>
      </div>

      {earlyResultItems.length > 0 ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-sky-950">
            <span>Early results</span>
            <InfoTip text="Signals already retained from passive baseline, front-door probing, or the current running stage. These can appear before the final snapshot is persisted." />
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {earlyResultItems.map((item) => (
              <div key={`${item.label}:${item.value}`} className="rounded-xl border border-sky-100 bg-white/80 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">{item.label}</p>
                <p className="mt-1 text-sm text-slate-800 break-all">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${getStatusDotClassName(activeRow?.state ?? "pending")}`} />
            <p className="text-sm font-semibold text-slate-950">
              {activeRow ? `Current milestone: ${activeRow.label}` : "Current milestone"}
            </p>
          </div>
          <div className="space-y-2.5">
            <p className="text-sm text-slate-700">{activeRow?.message ?? "Waiting for the next milestone update."}</p>
            <p className="text-xs text-slate-500">
              {activeRow
                ? `${activeRow.statusLabel} · ${formatDurationMs(
                    activeRow.durationMs,
                    activeRow.state === "active" ? nowMs : undefined,
                    activeRow.startedAt
                  )}`
                : `${completedRows.length}/${dashboardRows.length} milestones completed`}
            </p>
            {activeRow?.latestEvent ? (
              <p className="font-mono text-[12px] text-slate-500">evt={activeRow.latestEvent.eventType}</p>
            ) : null}
            {(activeRow?.sublines ?? []).slice(0, 4).map((line) => (
              <p key={`active-${line}`} className="text-xs text-slate-500">
                {line}
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-950">Recent milestone updates</p>
            <Badge tone="neutral">{completedRows.length}/{dashboardRows.length} complete</Badge>
          </div>
          <div className="space-y-3">
            {recentRows.map((row) => (
              <div key={row.key} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-2.5 w-2.5 rounded-full ${getStatusDotClassName(row.state)}`} />
                      <p className="truncate text-sm font-medium text-slate-900">{row.label}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{row.message}</p>
                  </div>
                  <Badge tone={getBadgeTone(row.state)}>{row.statusLabel}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{formatDurationMs(row.durationMs, row.state === "active" ? nowMs : undefined, row.startedAt)}</span>
                  {row.startedAt ? <span>started {formatDateTime(row.startedAt)}</span> : null}
                  {row.completedAt && row.state !== "active" ? <span>ended {formatDateTime(row.completedAt)}</span> : null}
                </div>
                {row.latestEvent ? (
                  <p className="mt-2 font-mono text-[12px] text-slate-500">evt={row.latestEvent.eventType}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">Progress updates automatically while the scan is queued or running.</p>
    </CollapsibleSectionCard>
  );
}
