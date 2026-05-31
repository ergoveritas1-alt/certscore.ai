import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScanStatusAutoRefresh, shouldAutoRefreshScanStatus } from "./scan-status-auto-refresh";

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
