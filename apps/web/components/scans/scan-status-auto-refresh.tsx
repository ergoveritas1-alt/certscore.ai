"use client";

import React, { useEffect } from "react";

type ScanStatusAutoRefreshProps = {
  pendingBrowserExtensionNormalization?: boolean;
  pendingPostCompletionWork?: boolean;
  reloadOnTerminal?: boolean;
  scanId?: string;
  silent?: boolean;
  status: string;
};

export const SCAN_STATUS_POLL_INITIAL_MS = 2_000;
export const SCAN_STATUS_POLL_MAX_MS = 10_000;
export const SCAN_STATUS_POLL_JITTER_MS = 250;

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
  if (!payload || typeof payload !== "object") return { browserReady: false, reportReady: false };
  const record = payload as Record<string, unknown>;
  const reportReadiness = record.reportReadiness && typeof record.reportReadiness === "object"
    ? record.reportReadiness as Record<string, unknown>
    : null;
  return {
    browserReady: record.browserExtensionNormalizationReady === true,
    reportReady: reportReadiness?.status === "ready",
  };
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
  // status endpoint applies the bounded projection grace period and reports
  // `ready` after either projection completion or that fallback has elapsed.
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

function recordTerminalDetection(scanId: string, state: ReturnType<ReturnType<typeof createScanStatusPoller>["getState"]>) {
  try {
    window.sessionStorage.setItem(`certscore.scanTerminalDetectedAt.${scanId}`, String(Date.now()));
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
  pendingBrowserExtensionNormalization = false,
  pendingPostCompletionWork = false,
  reloadOnTerminal = true,
  scanId,
  silent = false,
  status,
}: ScanStatusAutoRefreshProps) {
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

    const poller = createScanStatusPoller({
      fetchStatus: async (signal) => {
        const response = await fetch(`/api/scan-status/${encodeURIComponent(scanId)}?includeFindings=0`, {
          cache: "no-store",
          signal,
        });
        if (!response.ok) return null;
        const payload = await response.json() as unknown;
        return getNavigablePolledScanStatus(payload, {
          pendingBrowserExtensionNormalization,
        });
      },
      isOnline: () => navigator.onLine,
      isVisible: () => document.visibilityState === "visible",
      onTerminal: () => {
        if (!reloadOnTerminal) return;
        if (terminalNavigations.has(scanId)) return;
        terminalNavigations.add(scanId);
        recordTerminalDetection(scanId, poller.getState());
        window.location.reload();
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
  }, [pendingBrowserExtensionNormalization, pendingPostCompletionWork, reloadOnTerminal, scanId, shouldRefresh, status]);

  if (!shouldRefresh || silent) return null;
  const statusLabel = pendingBrowserExtensionNormalization
    ? "normalizing browser evidence"
    : pendingPostCompletionWork
      ? "finalizing findings"
      : status;
  return <p className="text-sm text-slate-500">Checking status while this scan is {statusLabel}.</p>;
}
