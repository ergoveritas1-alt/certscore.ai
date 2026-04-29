"use client";

import {
  SCAN_EVENT_TYPES,
  SCAN_EXECUTION_STAGES,
  type ScannerExecutionSummary
} from "@website-signal-risk-scanner/shared";
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
  scanId?: string | null;
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

type CompactProgressSummary = {
  currentLine: string;
  latestLine: string;
  activityLine: string;
  nextLine: string | null;
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

const progressDisplayCache = new Map<string, number>();
const PROGRESS_STORAGE_PREFIX = "certscore:scan-progress:";

function readStoredProgressValue(cacheKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.sessionStorage.getItem(`${PROGRESS_STORAGE_PREFIX}${cacheKey}`);
  if (!storedValue) {
    return null;
  }

  const parsedValue = Number.parseFloat(storedValue);
  return Number.isFinite(parsedValue) ? Math.min(Math.max(parsedValue, 0), 100) : null;
}

function writeStoredProgressValue(cacheKey: string, value: number) {
  progressDisplayCache.set(cacheKey, value);

  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(`${PROGRESS_STORAGE_PREFIX}${cacheKey}`, String(Math.min(Math.max(value, 0), 100)));
}

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

function getProgressBarClassName(input: {
  executionSummary: ScannerExecutionSummary | null;
  progressValue: number;
  status: string;
}) {
  if (input.status === "failed") {
    return "bg-gradient-to-r from-rose-500 to-rose-400";
  }

  if (input.status === "completed") {
    return "bg-gradient-to-r from-emerald-500 to-teal-400";
  }

  const completedStages = new Set(input.executionSummary?.stages.map((stage) => stage.stage) ?? []);

  if (completedStages.has("persistence_diff_finalization")) {
    return "bg-gradient-to-r from-teal-500 to-emerald-400";
  }

  if (completedStages.has("signal_derivation")) {
    return "bg-gradient-to-r from-blue-500 to-indigo-500";
  }

  if (completedStages.has("runtime_snapshot_capture")) {
    return "bg-gradient-to-r from-cyan-500 to-blue-500";
  }

  if (completedStages.has("crawl_discovery")) {
    return "bg-gradient-to-r from-sky-500 to-cyan-400";
  }

  if (input.progressValue >= 82) {
    return "bg-gradient-to-r from-blue-500 to-indigo-500";
  }

  if (input.progressValue >= 62) {
    return "bg-gradient-to-r from-cyan-500 to-blue-500";
  }

  if (input.progressValue >= 44) {
    return "bg-gradient-to-r from-sky-500 to-cyan-400";
  }

  if (input.progressValue >= 28) {
    return "bg-gradient-to-r from-amber-400 to-sky-500";
  }

  return "bg-gradient-to-r from-amber-500 to-amber-400";
}

function getProgressGlowClassName(status: string) {
  if (status === "failed") {
    return "shadow-[0_0_18px_rgba(244,63,94,0.32)]";
  }

  if (status === "completed") {
    return "shadow-[0_0_18px_rgba(16,185,129,0.28)]";
  }

  return "shadow-[0_0_18px_rgba(14,165,233,0.28)]";
}

function getLatestEventForStage(events: ScanEventRow[], stageKey: string) {
  const matches = STAGE_EVENT_MATCHERS[stageKey];
  if (!matches) {
    return null;
  }

  const matchingEvents = events.filter((event) => matches(event.eventType));
  return matchingEvents.at(-1) ?? null;
}

function getFirstEventForStage(events: ScanEventRow[], stageKey: string) {
  const matches = STAGE_EVENT_MATCHERS[stageKey];
  if (!matches) {
    return null;
  }

  return events.find((event) => matches(event.eventType)) ?? null;
}

function getEventTimeMs(event: ScanEventRow | null) {
  if (!event) {
    return null;
  }

  const timestamp = Date.parse(event.createdAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildQueueSublines(input: {
  createdAt: string;
  events: ScanEventRow[];
  isDone: boolean;
  latestEvent: ScanEventRow | null;
  queueWaitMs: number | null;
  status: string;
}) {
  const metadataLines = input.latestEvent ? formatMetadataPreview(input.latestEvent.metadataJson) : [];
  const fullStarted = input.events.find((event) => event.eventType === SCAN_EVENT_TYPES.fullStarted) ?? null;
  const pickupAtMs = getEventTimeMs(fullStarted);
  const queuedAtMs = getEventTimeMs(input.latestEvent) ?? Date.parse(input.createdAt);
  const derivedPickupWaitMs =
    pickupAtMs !== null && Number.isFinite(queuedAtMs) ? Math.max(0, pickupAtMs - queuedAtMs) : input.queueWaitMs;
  const pickupLine =
    input.isDone && derivedPickupWaitMs !== null
      ? `Worker pickup latency: ${formatDurationMs(derivedPickupWaitMs)}.`
      : input.status === "queued"
        ? "Waiting for worker pickup."
        : null;

  return [...(pickupLine ? [pickupLine] : []), ...metadataLines].slice(0, 6);
}

function buildLatestActivityLine(input: {
  createdAt: string;
  events: ScanEventRow[];
  executionSummary: ScannerExecutionSummary | null;
  status: string;
}) {
  const latestEvent =
    input.status === "queued" ? getLatestEventForStage(input.events, "queue_wait") : input.events.at(-1);
  const fullQueued = getLatestEventForStage(input.events, "queue_wait");
  const fullStarted = input.events.find((event) => event.eventType === SCAN_EVENT_TYPES.fullStarted) ?? null;
  const queuedAtMs = getEventTimeMs(fullQueued) ?? Date.parse(input.createdAt);
  const pickupAtMs = getEventTimeMs(fullStarted);
  const queueWaitLabel =
    pickupAtMs !== null && Number.isFinite(queuedAtMs)
      ? `pickup ${formatDurationMs(Math.max(0, pickupAtMs - queuedAtMs))}`
      : input.status === "queued"
        ? `waiting ${formatDurationMs(null, Date.now(), fullQueued?.createdAt ?? input.createdAt)}`
        : null;

  if (input.events.length === 0) {
    return input.status === "queued"
      ? "Queued for worker pickup."
      : "Waiting for first worker update.";
  }

  if (!latestEvent) {
    return input.status === "queued"
      ? "Queued for worker pickup."
      : "Waiting for first worker update.";
  }

  const visibleEventCount =
    input.status === "queued"
      ? input.events.filter((event) => STAGE_EVENT_MATCHERS.queue_wait?.(event.eventType) ?? false).length
      : input.events.length;
  const metadata = formatMetadataPreview(latestEvent.metadataJson).join(" · ");
  const prefix =
    input.status === "queued"
      ? `Queued · ${visibleEventCount} update${visibleEventCount === 1 ? "" : "s"}`
      : input.status === "completed"
        ? "Scan complete"
        : input.status === "failed"
          ? "Scan failed"
          : `Live scan · ${visibleEventCount} update${visibleEventCount === 1 ? "" : "s"}`;
  return [prefix, latestEvent.message, queueWaitLabel, metadata].filter(Boolean).join(" · ");
}

export function getProgressValue(input: {
  buildPhaseSummaries: BuildPhaseSummary[];
  createdAt?: string;
  executionSummary: ScannerExecutionSummary | null;
  events: ScanEventRow[];
  nowMs?: number;
  status: string;
}) {
  const milestoneStops = [8, 29, 43, 57, 71, 86, 99];

  if (input.status === "completed") {
    return 100;
  }

  if (input.status === "failed") {
    const completedCount = input.executionSummary?.stages.length ?? 0;
    return milestoneStops[Math.min(completedCount, milestoneStops.length - 1)] ?? 12;
  }

  if (input.status === "queued") {
    return getElapsedQueuedProgressValue({
      createdAt: input.createdAt,
      events: input.events,
      nowMs: input.nowMs
    });
  }

  const completedCount = input.executionSummary?.stages.length ?? 0;
  const pendingStageIndex = getPendingStageIndex(input.executionSummary);
  const inferredStageIndex = getInferredActiveStageIndex(input.events);
  const effectivePendingStageIndex = Math.max(pendingStageIndex, inferredStageIndex);
  const baseIndex = Math.min(Math.max(completedCount, inferredStageIndex), milestoneStops.length - 1);
  const base = milestoneStops[baseIndex] ?? 12;

  if (effectivePendingStageIndex < 0) {
    return base;
  }

  const activeStageKey = SCAN_EXECUTION_STAGES[effectivePendingStageIndex] ?? null;
  const nextStop = milestoneStops[Math.min(effectivePendingStageIndex + 1, milestoneStops.length - 1)] ?? 96;

  if (activeStageKey === "runtime_snapshot_capture") {
    const runtimeCompleted = input.buildPhaseSummaries.filter((phase) => phase.completedAt).length;
    const runtimeTotal = Math.max(input.buildPhaseSummaries.length, 4);
    const stageEventCount = activeStageKey ? input.events.filter((event) => STAGE_EVENT_MATCHERS[activeStageKey]?.(event.eventType)).length : 0;
    const eventRatio = Math.min(0.35, stageEventCount / 10);
    const ratio = Math.min(0.92, runtimeCompleted / runtimeTotal + eventRatio);
    const eventProgressValue = Math.round(base + (nextStop - base) * ratio);
    const elapsedProgressValue = getElapsedActiveStageProgressValue({
      activeStageIndex: effectivePendingStageIndex,
      activeStageKey,
      base,
      completedStages: input.executionSummary?.stages ?? [],
      events: input.events,
      nextStop,
      nowMs: input.nowMs
    });

    return Math.max(eventProgressValue, elapsedProgressValue ?? eventProgressValue);
  }

  const stageEventCount = activeStageKey ? input.events.filter((event) => STAGE_EVENT_MATCHERS[activeStageKey]?.(event.eventType)).length : 0;
  const eventRatio = Math.min(0.65, Math.max(0.25, stageEventCount / 6));
  const eventProgressValue = Math.round(base + (nextStop - base) * eventRatio);
  const elapsedProgressValue = getElapsedActiveStageProgressValue({
    activeStageIndex: effectivePendingStageIndex,
    activeStageKey,
    base,
    completedStages: input.executionSummary?.stages ?? [],
    events: input.events,
    nextStop,
    nowMs: input.nowMs
  });

  return Math.max(eventProgressValue, elapsedProgressValue ?? eventProgressValue);
}

function getElapsedQueuedProgressValue(input: {
  createdAt?: string;
  events: ScanEventRow[];
  nowMs?: number;
}) {
  const queuedEvent = getLatestEventForStage(input.events, "queue_wait");
  const startedAtMs = getEventTimeMs(queuedEvent) ?? (input.createdAt ? Date.parse(input.createdAt) : null);

  if (input.nowMs === undefined || startedAtMs === null || !Number.isFinite(startedAtMs) || input.nowMs <= startedAtMs) {
    return 8;
  }

  const linearRatio = Math.min(1, (input.nowMs - startedAtMs) / 180_000);
  const ratio = Math.sqrt(linearRatio);
  return Math.round((8 + (20 - 8) * ratio) * 10) / 10;
}

function getElapsedActiveStageProgressValue(input: {
  activeStageIndex: number;
  activeStageKey: string | null;
  base: number;
  completedStages: ScannerExecutionSummary["stages"];
  events: ScanEventRow[];
  nextStop: number;
  nowMs?: number;
}) {
  if (
    input.nowMs === undefined ||
    input.activeStageKey === null
  ) {
    return null;
  }

  const previousStageKey = SCAN_EXECUTION_STAGES[input.activeStageIndex - 1] ?? null;
  const previousStage = previousStageKey
    ? input.completedStages.find((stage) => stage.stage === previousStageKey) ?? null
    : null;
  const firstActiveStageEvent = getFirstEventForStage(input.events, input.activeStageKey);
  const startedAtMs =
    (previousStage?.completedAt ? Date.parse(previousStage.completedAt) : null) ??
    getEventTimeMs(firstActiveStageEvent);

  if (startedAtMs === null || !Number.isFinite(startedAtMs) || input.nowMs <= startedAtMs) {
    return null;
  }

  const timingConfig = getActiveStageTimingConfig(input.activeStageKey, input.nextStop);
  const linearRatio = Math.min(1, (input.nowMs - startedAtMs) / timingConfig.durationMs);
  const ratio = Math.sqrt(linearRatio);

  return Math.min(timingConfig.cap, Math.round((input.base + (timingConfig.cap - input.base) * ratio) * 10) / 10);
}

function getActiveStageTimingConfig(activeStageKey: string, nextStop: number) {
  switch (activeStageKey) {
    case "setup_load":
      return { cap: nextStop - 0.5, durationMs: 90_000 };
    case "baseline_lookup":
      return { cap: nextStop - 0.5, durationMs: 120_000 };
    case "crawl_discovery":
      return { cap: nextStop - 0.5, durationMs: 180_000 };
    case "runtime_snapshot_capture":
      return { cap: 92, durationMs: 60_000 };
    case "signal_derivation":
      return { cap: 97, durationMs: 90_000 };
    case "persistence_diff_finalization":
      return { cap: 99, durationMs: 240_000 };
    default:
      return { cap: nextStop - 0.5, durationMs: 120_000 };
  }
}

function getPendingStageIndex(executionSummary: ScannerExecutionSummary | null) {
  const completedStages = new Set(executionSummary?.stages.map((stage) => stage.stage) ?? []);
  return SCAN_EXECUTION_STAGES.findIndex((stage) => !completedStages.has(stage));
}

function getInferredActiveStageIndex(events: ScanEventRow[]) {
  let inferredIndex = -1;

  for (const event of events) {
    for (const [index, stageKey] of SCAN_EXECUTION_STAGES.entries()) {
      if (STAGE_EVENT_MATCHERS[stageKey]?.(event.eventType)) {
        inferredIndex = Math.max(inferredIndex, index);
      }
    }
  }

  return inferredIndex;
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

function buildCompactProgressSummary(input: {
  activeRow: DashboardRow | null;
  buildPhaseSummaries: BuildPhaseSummary[];
  dashboardRows: DashboardRow[];
  events: ScanEventRow[];
  latestActivityLine: string;
  nowMs: number;
  progressValue: number;
}) {
  const activeDuration = input.activeRow
    ? formatDurationMs(
        input.activeRow.durationMs,
        input.activeRow.state === "active" ? input.nowMs : undefined,
        input.activeRow.startedAt
      )
    : null;
  const currentLine = input.activeRow
    ? `Current: ${input.activeRow.label} · ${input.activeRow.statusLabel}${activeDuration ? ` · ${activeDuration}` : ""} · ${input.progressValue}%`
    : `Current: Waiting for next worker update · ${input.progressValue}%`;
  const latestLine = `Latest: ${input.latestActivityLine}`;
  const runtimePhaseCount = input.buildPhaseSummaries.length;
  const runtimePhaseCompletedCount = input.buildPhaseSummaries.filter((phase) => phase.completedAt).length;
  const activeRowKey = input.activeRow?.key ?? null;
  const activeEventCount = input.activeRow
    ? input.events.filter((event) => (activeRowKey ? STAGE_EVENT_MATCHERS[activeRowKey]?.(event.eventType) : false)).length
    : input.events.length;
  const activityLine = [
    `Activity: ${input.events.length} worker update${input.events.length === 1 ? "" : "s"}`,
    runtimePhaseCount > 0
      ? `${runtimePhaseCompletedCount}/${runtimePhaseCount} runtime phase${runtimePhaseCount === 1 ? "" : "s"} closed`
      : null,
    input.activeRow && activeEventCount > 0
      ? `${activeEventCount} current-stage signal${activeEventCount === 1 ? "" : "s"}`
      : null
  ].filter(Boolean).join(" · ");
  const activeRowIndex = input.activeRow ? input.dashboardRows.findIndex((row) => row.key === input.activeRow?.key) : -1;
  const nextRow =
    input.dashboardRows.find((row, index) => row.state === "pending" && index > activeRowIndex) ??
    input.dashboardRows.find((row) => row.state === "pending") ??
    null;
  const nextLine = nextRow ? `Next: ${nextRow.label}` : null;

  return {
    activityLine,
    currentLine,
    latestLine,
    nextLine
  } satisfies CompactProgressSummary;
}

function getQueueRow(input: {
  createdAt: string;
  events: ScanEventRow[];
  executionSummary: ScannerExecutionSummary | null;
  status: string;
}) {
  const latestEvent = getLatestEventForStage(input.events, "queue_wait");
  const setupStage = input.executionSummary?.stages.find((stage) => stage.stage === "setup_load") ?? null;
  const fullStarted = input.events.find((event) => event.eventType === SCAN_EVENT_TYPES.fullStarted);
  const isDone = Boolean(setupStage) || input.status !== "queued";
  const queueWaitMs =
    isDone && setupStage?.startedAt
      ? Math.max(0, Date.parse(setupStage.startedAt) - Date.parse(input.createdAt))
      : fullStarted && latestEvent
        ? Math.max(0, Date.parse(fullStarted.createdAt) - Date.parse(latestEvent.createdAt))
        : null;

  return {
    attempts: null,
    completedAt: isDone ? setupStage?.startedAt ?? fullStarted?.createdAt ?? latestEvent?.createdAt ?? input.createdAt : null,
    durationMs: queueWaitMs,
    key: "queue_wait",
    label: formatStageLabel("queue_wait"),
    latestEvent,
    message:
      latestEvent?.message ??
      (input.status === "queued" ? "Scan is queued and waiting for worker pickup." : "Worker picked up the scan."),
    startedAt: input.createdAt,
    state: isDone ? "success" : "active",
    statusLabel: isDone ? "Picked up" : "Waiting",
    sublines: buildQueueSublines({
      createdAt: input.createdAt,
      events: input.events,
      isDone,
      latestEvent,
      queueWaitMs,
      status: input.status
    })
  } satisfies DashboardRow;
}

function getStageRows(input: {
  buildPhaseSummaries: BuildPhaseSummary[];
  events: ScanEventRow[];
  executionSummary: ScannerExecutionSummary | null;
  status: string;
}) {
  const pendingStageIndex = getPendingStageIndex(input.executionSummary);
  const effectivePendingStageIndex = Math.max(pendingStageIndex, getInferredActiveStageIndex(input.events));
  const completedStageMap = new Map(input.executionSummary?.stages.map((stage) => [stage.stage, stage]) ?? []);

  return SCAN_EXECUTION_STAGES.map((stageKey, index) => {
    const completedStage = completedStageMap.get(stageKey) ?? null;
    const latestEvent = getLatestEventForStage(input.events, stageKey);
    const isActive =
      completedStage === null &&
      input.status === "running" &&
      effectivePendingStageIndex !== -1 &&
      effectivePendingStageIndex === index;
    const isFailed = completedStage?.outcome === "failed" || (input.status === "failed" && effectivePendingStageIndex === index);
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
      startedAt: completedStage?.startedAt ?? (isActive ? getFirstEventForStage(input.events, stageKey)?.createdAt ?? null : null),
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

function getProgressDisplayCacheKey(input: {
  createdAt: string;
  scanId?: string | null;
}) {
  if (input.scanId) {
    return input.scanId;
  }

  return input.createdAt;
}

function getInitialDisplayedProgressValue(input: {
  progressValue: number;
  status: string;
}) {
  if (input.status === "queued") {
    return Math.min(input.progressValue, 1);
  }

  if (input.status === "running") {
    return Math.min(input.progressValue, 1);
  }

  return input.progressValue;
}

export function getNextDisplayedProgressValue(input: {
  currentValue: number;
  targetValue: number;
}) {
  if (input.targetValue <= input.currentValue) {
    return input.currentValue;
  }

  const delta = input.targetValue - input.currentValue;
  if (Math.abs(delta) <= 1) {
    return input.targetValue;
  }

  const step = Math.abs(delta) > 32 ? 0.75 : 0.5;
  return input.currentValue + step;
}

export function FullScanProgressCard({
  buildPhaseSummaries,
  createdAt,
  events,
  executionSummary,
  scanId,
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
        createdAt,
        executionSummary,
        events,
        nowMs,
        status
      }),
    [buildPhaseSummaries, events, executionSummary, nowMs, status]
  );
  const progressDisplayCacheKey = useMemo(
    () =>
      getProgressDisplayCacheKey({
        createdAt,
        scanId
      }),
    [createdAt, scanId]
  );
  const [displayedProgressValue, setDisplayedProgressValue] = useState(() =>
    getInitialDisplayedProgressValue({
      progressValue,
      status
    })
  );

  useEffect(() => {
    if (status !== "queued" && status !== "running") {
      return;
    }

    const cachedValue = progressDisplayCache.get(progressDisplayCacheKey);
    const storedValue = readStoredProgressValue(progressDisplayCacheKey);
    if (typeof cachedValue !== "number" && typeof storedValue !== "number") {
      return;
    }

    setDisplayedProgressValue((currentValue) => Math.max(currentValue, cachedValue ?? 0, storedValue ?? 0));
  }, [progressDisplayCacheKey, status]);

  useEffect(() => {
    if (status === "completed" || status === "failed") {
      setDisplayedProgressValue((currentValue) => {
        const nextValue = status === "completed" ? 100 : Math.max(currentValue, progressValue);
        writeStoredProgressValue(progressDisplayCacheKey, nextValue);
        return nextValue;
      });
      return;
    }

    const intervalId = window.setInterval(() => {
      setDisplayedProgressValue((currentValue) => {
        const cachedValue = progressDisplayCache.get(progressDisplayCacheKey);
        const storedValue = readStoredProgressValue(progressDisplayCacheKey);
        const monotonicCurrent =
          typeof cachedValue === "number" || typeof storedValue === "number"
            ? Math.max(currentValue, cachedValue ?? 0, storedValue ?? 0)
            : currentValue;
        const nextValue = getNextDisplayedProgressValue({
          currentValue: monotonicCurrent,
          targetValue: progressValue
        });
        writeStoredProgressValue(progressDisplayCacheKey, nextValue);
        return nextValue;
      });
    }, 300);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [progressDisplayCacheKey, progressValue, status]);

  const progressBarClassName = useMemo(
    () =>
      getProgressBarClassName({
        executionSummary,
        progressValue: displayedProgressValue,
        status
      }),
    [displayedProgressValue, executionSummary, status]
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
  const compactSummary = useMemo(
    () =>
      buildCompactProgressSummary({
        activeRow,
        buildPhaseSummaries,
        dashboardRows,
        events,
        latestActivityLine,
        nowMs,
        progressValue: displayedProgressValue
      }),
    [activeRow, buildPhaseSummaries, dashboardRows, displayedProgressValue, events, latestActivityLine, nowMs]
  );

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
      contentClassName="min-w-0 space-y-3"
    >
      <div className="relative h-7 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
        <div
          className={`h-full rounded-full transition-[width,background-color,box-shadow] duration-700 ${progressBarClassName} ${getProgressGlowClassName(status)}`}
          style={{ width: `${displayedProgressValue}%` }}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-1.5">
          {dashboardRows.map((row) => (
            <span
              key={`marker-${row.key}`}
              className={`h-3 w-3 rounded-full border-2 border-white ${getStatusDotClassName(row.state)} shadow-sm`}
              title={`${row.label}: ${row.statusLabel}`}
            />
          ))}
        </div>
      </div>

      <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="min-w-0 rounded-lg bg-white/70 px-2.5 py-2 font-mono text-[12px] text-slate-600">
          <LiveActivityLine
            line={latestActivityLine}
            status={status === "queued" || status === "running" || status === "completed" || status === "failed" ? status : "running"}
          />
        </div>
        <div className="mt-2 grid gap-1 text-xs text-slate-600 lg:grid-cols-2">
          <p className="truncate">
            {compactSummary.currentLine}
            {compactSummary.nextLine ? ` · ${compactSummary.nextLine}` : ""}
          </p>
          <p className="truncate">
            {compactSummary.latestLine} · {compactSummary.activityLine}
          </p>
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

    </CollapsibleSectionCard>
  );
}
