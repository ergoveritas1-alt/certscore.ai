"use client";

import type { ApiV2PreConsentRuntimePreview } from "@certscore/api-contracts";
import React, { useEffect, useRef } from "react";

export type PolledScanProgress = {
  preConsentPreview: ApiV2PreConsentRuntimePreview | null;
  reportReady: boolean;
  stage: "prepare" | "scan" | "review" | "report" | "complete";
  status: string | null;
};

type ScanStatusAutoRefreshProps = {
  onTerminalNavigation?: () => void;
  onProgress?: (progress: PolledScanProgress) => void;
  pendingBrowserExtensionNormalization?: boolean;
  pendingPostCompletionWork?: boolean;
  reloadOnTerminal?: boolean;
  scanId?: string;
  silent?: boolean;
  status: string;
  terminalNavigationDelayMs?: number;
};

export const SCAN_STATUS_POLL_INITIAL_MS = 1_000;
export const SCAN_STATUS_POLL_MAX_MS = 10_000;
export const SCAN_STATUS_POLL_JITTER_MS = 250;
export const SCAN_TERMINAL_NAVIGATION_GUARD_MS = 5 * 60_000;

type PollTimer = ReturnType<typeof setTimeout>;

export function shouldAutoRefreshScanStatus(input: ScanStatusAutoRefreshProps) {
  return (
    input.status === "queued" ||
    input.status === "running" ||
    input.status === "processing" ||
    input.pendingBrowserExtensionNormalization === true ||
    input.pendingPostCompletionWork === true
  );
}

export function isTerminalScanStatus(status: string | null | undefined) {
  return (
    status === "completed" ||
    status === "completed_limited" ||
    status === "failed" ||
    status === "canceled" ||
    status === "cancelled" ||
    status === "expired" ||
    status === "rate_limited"
  );
}

export function getPolledScanStatus(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const scan = record.scan && typeof record.scan === "object" && !Array.isArray(record.scan)
    ? record.scan as Record<string, unknown>
    : null;
  return typeof scan?.status === "string"
    ? scan.status
    : typeof record.status === "string"
      ? record.status
      : null;
}

export function getPolledReadiness(payload: unknown) {
  if (!payload || typeof payload !== "object") return { browserReady: false, reportGeneration: null, reportReady: false };
  const record = payload as Record<string, unknown>;
  const reportReadiness = record.reportReadiness && typeof record.reportReadiness === "object"
    ? record.reportReadiness as Record<string, unknown>
    : null;
  return {
    browserReady: record.browserExtensionNormalizationReady === true,
    reportGeneration: typeof reportReadiness?.generation === "string" ? reportReadiness.generation : null,
    reportReady: reportReadiness?.status === "ready",
  };
}

export function getPolledScanProgress(payload: unknown): PolledScanProgress {
  const status = getPolledScanStatus(payload);
  const readiness = getPolledReadiness(payload);
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const progress = record?.progress && typeof record.progress === "object" && !Array.isArray(record.progress)
    ? record.progress as Record<string, unknown>
    : null;
  const retainedStage = progress?.stage;
  const stage = retainedStage === "prepare" || retainedStage === "scan" || retainedStage === "review" ||
    retainedStage === "report" || retainedStage === "complete"
    ? retainedStage
    : readiness.reportReady
      ? "complete"
      : status === "completed" || status === "completed_limited" || status === "processing"
        ? "review"
        : status === "running"
          ? "scan"
          : "prepare";

  const preview = record?.preConsentPreview && typeof record.preConsentPreview === "object" && !Array.isArray(record.preConsentPreview)
    ? record.preConsentPreview as Record<string, unknown>
    : null;
  const preConsentPreview = preview?.type === "certscore_pre_consent_preview" &&
    preview.resultStage === "preliminary" && preview.final === false && preview.sourceLane === "runtime_evidence"
    ? preview as ApiV2PreConsentRuntimePreview
    : null;

  return { preConsentPreview, reportReady: readiness.reportReady, stage, status };
}

export function getNavigablePolledScanStatus(
  payload: unknown,
  input: { pendingBrowserExtensionNormalization?: boolean } = {},
) {
  const status = getPolledScanStatus(payload);
  if (!status) return null;

  const readiness = getPolledReadiness(payload);
  if (
    input.pendingBrowserExtensionNormalization === true &&
    !readiness.browserReady &&
    (status === "completed" || status === "completed_limited")
  ) {
    return "processing";
  }

  // A completed scanner run is not yet a viewable report. The lightweight
  // status endpoint remains read-only and reports terminal readiness only
  // after the worker-owned canonical projection has been persisted.
  if (
    (status === "completed" || status === "completed_limited") &&
    !readiness.reportReady
  ) {
    return "processing";
  }

  return status;
}

export function scanStatusPollDelayMs(failureCount: number, randomValue = Math.random()) {
  const backoff = Math.min(
    SCAN_STATUS_POLL_MAX_MS,
    SCAN_STATUS_POLL_INITIAL_MS * (2 ** Math.max(0, failureCount)),
  );
  return backoff + Math.floor(Math.max(0, Math.min(1, randomValue)) * SCAN_STATUS_POLL_JITTER_MS);
}

export function createScanStatusPoller(input: {
  cancelTimer?: (timer: PollTimer) => void;
  fetchStatus: (signal: AbortSignal) => Promise<string | null>;
  isOnline: () => boolean;
  isVisible: () => boolean;
  onTerminal: (status: string) => void;
  random?: () => number;
  schedule?: (callback: () => void, delayMs: number) => PollTimer;
}) {
  const schedule = input.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelTimer = input.cancelTimer ?? ((timer) => clearTimeout(timer));
  const random = input.random ?? Math.random;
  let abortController: AbortController | null = null;
  let failureCount = 0;
  let inFlight = false;
  let started = false;
  let stopped = false;
  let terminal = false;
  let timer: PollTimer | null = null;
  let pollCount = 0;
  let duplicatePollsPrevented = 0;

  const queue = (delayMs: number) => {
    if (stopped || terminal) return;
    if (timer !== null) cancelTimer(timer);
    timer = schedule(() => {
      timer = null;
      void poll();
    }, delayMs);
  };

  const handleVisibilityChange = () => {
    if (input.isVisible() && input.isOnline()) {
      queue(0);
    }
  };

  const handleOnline = () => {
    if (input.isVisible()) {
      queue(0);
    }
  };

  const poll = async () => {
    if (stopped || terminal) return;
    if (inFlight) {
      duplicatePollsPrevented += 1;
      return;
    }
    if (!input.isVisible() || !input.isOnline()) {
      queue(SCAN_STATUS_POLL_INITIAL_MS);
      return;
    }

    inFlight = true;
    pollCount += 1;
    abortController = new AbortController();
    try {
      const status = await input.fetchStatus(abortController.signal);
      if (stopped) return;
      if (isTerminalScanStatus(status)) {
        terminal = true;
        input.onTerminal(status);
        return;
      }
      failureCount = status === null ? Math.min(failureCount + 1, 3) : 0;
    } catch (error) {
      if (!stopped && !(error instanceof DOMException && error.name === "AbortError")) {
        failureCount = Math.min(failureCount + 1, 3);
      }
    } finally {
      inFlight = false;
      abortController = null;
      if (!stopped && !terminal) queue(scanStatusPollDelayMs(failureCount, random()));
    }
  };

  return {
    getState: () => ({ duplicatePollsPrevented, failureCount, inFlight, pollCount, stopped, terminal }),
    start() {
      if (started || stopped) return;
      started = true;
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.addEventListener("online", handleOnline);
      }
      queue(SCAN_STATUS_POLL_INITIAL_MS);
    },
    stop() {
      stopped = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
      if (timer !== null) cancelTimer(timer);
      timer = null;
      abortController?.abort();
    },
  };
}

const activeScanPollers = new Map<string, {
  poller: ReturnType<typeof createScanStatusPoller>;
  references: number;
}>();
const terminalNavigations = new Set<string>();

export function claimTerminalNavigation(input: {
  generation?: string | null;
  getItem: (key: string) => string | null;
  nowMs?: number;
  scanId: string;
  setItem: (key: string, value: string) => void;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const key = `certscore.scanTerminalDetectedAt.${input.scanId}.${input.generation ?? "terminal"}`;
  const previousValue = input.getItem(key);
  const previousMs = previousValue === null ? Number.NaN : Number(previousValue);
  if (Number.isFinite(previousMs) && nowMs >= previousMs && nowMs - previousMs < SCAN_TERMINAL_NAVIGATION_GUARD_MS) {
    return false;
  }
  input.setItem(key, String(nowMs));
  return true;
}

function recordTerminalDetection(scanId: string, state: ReturnType<ReturnType<typeof createScanStatusPoller>["getState"]>) {
  try {
    const body = JSON.stringify({
      duplicatePollsPrevented: state.duplicatePollsPrevented,
      event: "terminal_detected",
      pollCount: state.pollCount,
      scanId,
    });
    navigator.sendBeacon?.("/api/scan-progress-events", new Blob([body], { type: "application/json" }));
  } catch {
    // Telemetry must never block terminal navigation.
  }
}

export function ScanStatusAutoRefresh({
  onTerminalNavigation,
  onProgress,
  pendingBrowserExtensionNormalization = false,
  pendingPostCompletionWork = false,
  reloadOnTerminal = true,
  scanId,
  silent = false,
  status,
  terminalNavigationDelayMs = 0,
}: ScanStatusAutoRefreshProps) {
  const onTerminalNavigationRef = useRef(onTerminalNavigation);
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onTerminalNavigationRef.current = onTerminalNavigation;
  }, [onTerminalNavigation]);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);
  const shouldRefresh = shouldAutoRefreshScanStatus({
    pendingBrowserExtensionNormalization,
    pendingPostCompletionWork,
    status,
  });

  useEffect(() => {
    const completedButFinalizing =
      (status === "completed" || status === "completed_limited") &&
      (pendingPostCompletionWork || pendingBrowserExtensionNormalization);
    if (!shouldRefresh || !scanId || (isTerminalScanStatus(status) && !completedButFinalizing)) return;

    const existing = activeScanPollers.get(scanId);
    if (existing) {
      existing.references += 1;
      return () => {
        existing.references -= 1;
        if (existing.references === 0 && activeScanPollers.get(scanId) === existing) {
          activeScanPollers.delete(scanId);
          existing.poller.stop();
        }
      };
    }

    let terminalReportGeneration: string | null = null;
    const poller = createScanStatusPoller({
      // The generation is captured from the same authoritative status response
      // that allows terminal navigation.
      fetchStatus: async (signal) => {
        const response = await fetch(`/api/scan-status/${encodeURIComponent(scanId)}?includeFindings=0`, {
          cache: "no-store",
          signal,
        });
        if (!response.ok) return null;
        const payload = await response.json() as unknown;
        onProgressRef.current?.(getPolledScanProgress(payload));
        terminalReportGeneration = getPolledReadiness(payload).reportGeneration;
        return getNavigablePolledScanStatus(payload, {
          pendingBrowserExtensionNormalization,
        });
      },
      isOnline: () => navigator.onLine,
      isVisible: () => document.visibilityState === "visible",
      onTerminal: () => {
        if (!reloadOnTerminal) return;
        if (terminalNavigations.has(scanId)) return;
        if (!claimTerminalNavigation({
          generation: terminalReportGeneration,
          getItem: (key) => window.sessionStorage.getItem(key),
          scanId,
          setItem: (key, value) => window.sessionStorage.setItem(key, value)
        })) return;
        terminalNavigations.add(scanId);
        recordTerminalDetection(scanId, poller.getState());
        const navigate = () => {
          const terminalNavigation = onTerminalNavigationRef.current;
          if (terminalNavigation) {
            terminalNavigation();
            return;
          }
          window.location.reload();
        };
        if (terminalNavigationDelayMs > 0) {
          window.setTimeout(navigate, terminalNavigationDelayMs);
        } else {
          navigate();
        }
      },
    });
    const entry = { poller, references: 1 };
    activeScanPollers.set(scanId, entry);
    poller.start();

    return () => {
      entry.references -= 1;
      if (entry.references === 0 && activeScanPollers.get(scanId) === entry) {
        activeScanPollers.delete(scanId);
        poller.stop();
      }
    };
  }, [pendingBrowserExtensionNormalization, pendingPostCompletionWork, reloadOnTerminal, scanId, shouldRefresh, status, terminalNavigationDelayMs]);

  if (!shouldRefresh || silent) return null;
  const statusLabel = pendingBrowserExtensionNormalization
    ? "normalizing browser evidence"
    : pendingPostCompletionWork
      ? "finalizing findings"
      : status;
  return <p className="text-sm text-slate-500">Checking status while this scan is {statusLabel}.</p>;
}
