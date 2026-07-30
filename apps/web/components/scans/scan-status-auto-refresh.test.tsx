import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createScanStatusPoller,
  getNavigablePolledScanStatus,
  getPolledScanStatus,
  getPolledReadiness,
  isTerminalScanStatus,
  SCAN_STATUS_POLL_INITIAL_MS,
  ScanStatusAutoRefresh,
  scanStatusPollDelayMs,
  shouldAutoRefreshScanStatus
} from "./scan-status-auto-refresh";

test("shouldAutoRefreshScanStatus keeps polling while completed scans finalize findings", () => {
  assert.equal(shouldAutoRefreshScanStatus({ status: "completed" }), false);
  assert.equal(shouldAutoRefreshScanStatus({ pendingPostCompletionWork: true, status: "completed" }), true);
  assert.equal(shouldAutoRefreshScanStatus({ pendingBrowserExtensionNormalization: true, status: "completed" }), true);
  assert.equal(shouldAutoRefreshScanStatus({ status: "queued" }), true);
  assert.equal(shouldAutoRefreshScanStatus({ status: "running" }), true);
  assert.equal(shouldAutoRefreshScanStatus({ status: "processing" }), true);
});

test("ScanStatusAutoRefresh labels post-completion refresh as finding finalization", () => {
  const html = renderToStaticMarkup(
    createElement(ScanStatusAutoRefresh, {
      pendingPostCompletionWork: true,
      status: "completed"
    })
  );

  assert.match(html, /finalizing findings/);
});

test("ScanStatusAutoRefresh labels browser-extension normalization refresh", () => {
  const html = renderToStaticMarkup(
    createElement(ScanStatusAutoRefresh, {
      pendingBrowserExtensionNormalization: true,
      status: "completed"
    })
  );

  assert.match(html, /normalizing browser evidence/);
});

test("isTerminalScanStatus recognizes scan states that should end in-progress refresh", () => {
  assert.equal(isTerminalScanStatus("completed"), true);
  assert.equal(isTerminalScanStatus("completed_limited"), true);
  assert.equal(isTerminalScanStatus("failed"), true);
  assert.equal(isTerminalScanStatus("canceled"), true);
  assert.equal(isTerminalScanStatus("expired"), true);
  assert.equal(isTerminalScanStatus("rate_limited"), true);

  assert.equal(isTerminalScanStatus("queued"), false);
  assert.equal(isTerminalScanStatus("running"), false);
  assert.equal(isTerminalScanStatus("processing"), false);
  assert.equal(isTerminalScanStatus(null), false);
});

test("getPolledScanStatus accepts current and legacy scan status response shapes", () => {
  assert.equal(getPolledScanStatus({ scan: { status: "completed" } }), "completed");
  assert.equal(getPolledScanStatus({ status: "completed_limited" }), "completed_limited");
  assert.equal(getPolledScanStatus({ scan: { status: 200 }, status: "failed" }), "failed");
  assert.equal(getPolledScanStatus({ scan: null }), null);
  assert.equal(getPolledScanStatus(null), null);
});

test("getPolledReadiness keeps post-completion polling lightweight until report work is ready", () => {
  assert.deepEqual(getPolledReadiness({
    browserExtensionNormalizationReady: true,
    reportReadiness: { status: "ready" }
  }), { browserReady: true, reportReady: true });
  assert.deepEqual(getPolledReadiness({ reportReadiness: { status: "finalizing" } }), {
    browserReady: false,
    reportReady: false
  });
});

test("completed scans remain non-terminal while report projection is finalizing", () => {
  assert.equal(getNavigablePolledScanStatus({
    scan: { status: "completed" },
    reportReadiness: { status: "finalizing" },
  }), "processing");
  assert.equal(getNavigablePolledScanStatus({
    scan: { status: "completed_limited" },
    reportReadiness: { status: "finalizing" },
  }), "processing");
});

test("completed scans become navigable when report projection or its grace fallback is ready", () => {
  assert.equal(getNavigablePolledScanStatus({
    scan: { status: "completed" },
    reportReadiness: { status: "ready" },
  }), "completed");
});

test("failed and canceled scans bypass report readiness", () => {
  for (const status of ["failed", "canceled", "cancelled", "expired", "rate_limited"]) {
    assert.equal(getNavigablePolledScanStatus({
      scan: { status },
      reportReadiness: { status: "finalizing" },
    }), status);
  }
});

test("ScanStatusAutoRefresh uses lightweight recursive polling without router refresh or intervals", () => {
  const source = require("node:fs").readFileSync("apps/web/components/scans/scan-status-auto-refresh.tsx", "utf8") as string;

  assert.doesNotMatch(source, /router\.refresh/);
  assert.doesNotMatch(source, /setInterval/);
  assert.doesNotMatch(source, /HARD_RELOAD_AFTER_MS/);
  assert.match(source, /includeFindings=0/);
  assert.match(source, /window\.location\.reload\(\)/);
});

test("poll delay starts at two seconds and applies bounded backoff with jitter", () => {
  assert.equal(scanStatusPollDelayMs(0, 0), SCAN_STATUS_POLL_INITIAL_MS);
  assert.equal(scanStatusPollDelayMs(1, 0), 4_000);
  assert.equal(scanStatusPollDelayMs(10, 1), 10_250);
});

test("scan status poller allows only one request in flight", async () => {
  const scheduled: Array<() => void> = [];
  const pending: { resolve?: (status: string) => void } = {};
  let fetchCount = 0;
  const poller = createScanStatusPoller({
    fetchStatus: () => {
      fetchCount += 1;
      return new Promise((resolve) => { pending.resolve = resolve; });
    },
    isOnline: () => true,
    isVisible: () => true,
    onTerminal: () => assert.fail("should not terminate"),
    random: () => 0,
    schedule: (callback) => {
      scheduled.push(callback);
      return callback as unknown as ReturnType<typeof setTimeout>;
    },
    cancelTimer: () => {},
  });

  poller.start();
  assert.equal(scheduled.length, 1);
  scheduled.shift()?.();
  await Promise.resolve();
  assert.equal(fetchCount, 1);
  assert.equal(poller.getState().inFlight, true);
  assert.equal(scheduled.length, 0, "recursive polling must not queue the next request while one is active");
  pending.resolve?.("running");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(poller.getState().inFlight, false);
  assert.equal(scheduled.length, 1);
  poller.stop();
});

test("scan status poller suspends while hidden or offline", async () => {
  const scheduled: Array<() => void> = [];
  let fetchCount = 0;
  let visible = false;
  const poller = createScanStatusPoller({
    fetchStatus: async () => { fetchCount += 1; return "running"; },
    isOnline: () => true,
    isVisible: () => visible,
    onTerminal: () => assert.fail("should not terminate"),
    schedule: (callback) => {
      scheduled.push(callback);
      return callback as unknown as ReturnType<typeof setTimeout>;
    },
    cancelTimer: () => {},
  });

  poller.start();
  scheduled.shift()?.();
  await Promise.resolve();
  assert.equal(fetchCount, 0);
  assert.equal(scheduled.length, 1);
  visible = true;
  scheduled.shift()?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCount, 1);
  poller.stop();
});

test("terminal status causes exactly one navigation callback", async () => {
  const scheduled: Array<() => void> = [];
  let terminalCount = 0;
  const poller = createScanStatusPoller({
    fetchStatus: async () => "completed",
    isOnline: () => true,
    isVisible: () => true,
    onTerminal: () => { terminalCount += 1; },
    schedule: (callback) => {
      scheduled.push(callback);
      return callback as unknown as ReturnType<typeof setTimeout>;
    },
    cancelTimer: () => {},
  });

  poller.start();
  scheduled.shift()?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(terminalCount, 1);
  assert.equal(poller.getState().terminal, true);
  assert.equal(scheduled.length, 0);
  poller.start();
  assert.equal(terminalCount, 1);
});
