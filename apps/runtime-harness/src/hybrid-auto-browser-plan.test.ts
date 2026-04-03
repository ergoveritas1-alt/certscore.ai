import assert from "node:assert/strict";
import test from "node:test";
import { applyHybridAutoRuntimeTiming, buildHybridAutoBrowserPlan, resolveHybridAutoRuntimeTiming } from "./hybrid-auto-browser-plan";

test("buildHybridAutoBrowserPlan matches the canonical local defaults", () => {
  assert.deepEqual(buildHybridAutoBrowserPlan({ mode: "playwright-local" }), {
    profile: "high_block_risk",
    blockStylesheetsInBrowser: false,
    browserNavigationTimeoutMs: 15_000,
    browserPostLoadWaitMs: 10_000,
    browserProfileSweepEnabled: false,
    browserRuntimeCaptureMaxAttempts: 1,
    browserRuntimeStabilityMinWaitMs: 500,
    browserRuntimeStabilityQuietWindowMs: 700,
    consentProfileSweepEnabled: false,
    runPostrunCookiesDiagnostic: true,
    runServiceWorkerCheck: true
  });
});

test("buildHybridAutoBrowserPlan matches the canonical cdp defaults", () => {
  assert.deepEqual(buildHybridAutoBrowserPlan({ mode: "playwright-cdp" }), {
    profile: "high_block_risk",
    blockStylesheetsInBrowser: false,
    browserNavigationTimeoutMs: 20_000,
    browserPostLoadWaitMs: 12_000,
    browserProfileSweepEnabled: false,
    browserRuntimeCaptureMaxAttempts: 1,
    browserRuntimeStabilityMinWaitMs: 500,
    browserRuntimeStabilityQuietWindowMs: 700,
    consentProfileSweepEnabled: false,
    runPostrunCookiesDiagnostic: true,
    runServiceWorkerCheck: true
  });
});

test("resolveHybridAutoRuntimeTiming derives harness timeout from browser-pass plan", () => {
  assert.deepEqual(resolveHybridAutoRuntimeTiming({ mode: "playwright-local" }), {
    observeMs: 10_000,
    plan: buildHybridAutoBrowserPlan({ mode: "playwright-local" }),
    timeoutMs: 30_000
  });

  assert.deepEqual(resolveHybridAutoRuntimeTiming({ mode: "playwright-cdp" }), {
    observeMs: 12_000,
    plan: buildHybridAutoBrowserPlan({ mode: "playwright-cdp" }),
    timeoutMs: 37_000
  });
});

test("applyHybridAutoRuntimeTiming respects explicit overrides while preserving minimum budget", () => {
  assert.deepEqual(
    applyHybridAutoRuntimeTiming({
      chromeRemoteDebuggingUrl: null,
      mode: "playwright-local",
      observeMsOverride: 8_000,
      outputDir: "/tmp/runtime-harness",
      remoteCdpWsEndpoint: null,
      timeoutMsOverride: 9_000,
      userAgent: null
    }),
    {
      chromeRemoteDebuggingUrl: null,
      mode: "playwright-local",
      observeMs: 8_000,
      outputDir: "/tmp/runtime-harness",
      remoteCdpWsEndpoint: null,
      timeoutMs: 13_000,
      userAgent: null
    }
  );
});
