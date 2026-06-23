import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getPolledScanStatus,
  isTerminalScanStatus,
  ScanStatusAutoRefresh,
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

test("ScanStatusAutoRefresh keeps the hard reload fallback wired for stale active scan renders", () => {
  const source = require("node:fs").readFileSync("apps/web/components/scans/scan-status-auto-refresh.tsx", "utf8") as string;

  assert.match(source, /HARD_RELOAD_AFTER_MS = 60_000/);
  assert.match(source, /window\.setTimeout/);
  assert.match(source, /window\.location\.reload\(\)/);
});

test("ScanStatusAutoRefresh does not defer active scan refresh after user interaction", () => {
  const source = require("node:fs").readFileSync("apps/web/components/scans/scan-status-auto-refresh.tsx", "utf8") as string;

  assert.doesNotMatch(source, /AUTO_REFRESH_INTERACTION_GRACE_MS/);
  assert.doesNotMatch(source, /pointerdown/);
  assert.match(source, /router\.refresh\(\);\n    \}, 1000\)/);
});

test("ScanStatusAutoRefresh hard reloads immediately once status polling sees a terminal result", () => {
  const source = require("node:fs").readFileSync("apps/web/components/scans/scan-status-auto-refresh.tsx", "utf8") as string;
  const terminalCheckIndex = source.indexOf("isTerminalScanStatus(nextStatus)");
  const reloadIndex = source.indexOf("window.location.reload()", terminalCheckIndex);

  assert.ok(terminalCheckIndex >= 0, "expected terminal status branch");
  assert.ok(reloadIndex > terminalCheckIndex, "expected terminal branch to hard reload the stale scan page");
});
