import type { RuntimeMode, RuntimeOptions } from "./core/types";

export type HybridAutoBrowserMode = Extract<RuntimeMode, "playwright-local" | "playwright-cdp">;

export type HybridAutoBrowserPlan = {
  blockStylesheetsInBrowser: boolean;
  browserNavigationTimeoutMs: number;
  browserPostLoadWaitMs: number;
  browserProfileSweepEnabled: boolean;
  browserRuntimeCaptureMaxAttempts: number;
  browserRuntimeStabilityMinWaitMs: number;
  browserRuntimeStabilityQuietWindowMs: number;
  consentProfileSweepEnabled: boolean;
  profile: "high_block_risk";
  runPostrunCookiesDiagnostic: boolean;
  runServiceWorkerCheck: boolean;
};

export function buildHybridAutoBrowserPlan(input: { mode: HybridAutoBrowserMode }): HybridAutoBrowserPlan {
  const observeWindowMs = input.mode === "playwright-cdp" ? 12_000 : 10_000;
  const navigationTimeoutMs = input.mode === "playwright-cdp" ? 20_000 : 15_000;

  return {
    profile: "high_block_risk",
    blockStylesheetsInBrowser: false,
    browserNavigationTimeoutMs: navigationTimeoutMs,
    browserPostLoadWaitMs: observeWindowMs,
    browserProfileSweepEnabled: false,
    browserRuntimeCaptureMaxAttempts: 1,
    browserRuntimeStabilityMinWaitMs: Math.min(500, observeWindowMs),
    browserRuntimeStabilityQuietWindowMs: 700,
    consentProfileSweepEnabled: false,
    runPostrunCookiesDiagnostic: true,
    runServiceWorkerCheck: true
  };
}

export function resolveHybridAutoRuntimeTiming(input: {
  mode: HybridAutoBrowserMode;
  observeMsOverride?: number | null;
  timeoutMsOverride?: number | null;
}) {
  const plan = buildHybridAutoBrowserPlan({ mode: input.mode });
  const observeMs = input.observeMsOverride ?? plan.browserPostLoadWaitMs;
  const timeoutMs = Math.max(
    input.timeoutMsOverride ?? plan.browserNavigationTimeoutMs + plan.browserPostLoadWaitMs + 5_000,
    observeMs + 5_000
  );

  return {
    observeMs,
    plan,
    timeoutMs
  };
}

export function applyHybridAutoRuntimeTiming(
  input: Omit<RuntimeOptions, "mode" | "observeMs" | "timeoutMs"> & {
    mode: HybridAutoBrowserMode;
    observeMsOverride?: number | null;
    timeoutMsOverride?: number | null;
  }
): RuntimeOptions {
  const timing = resolveHybridAutoRuntimeTiming({
    mode: input.mode,
    observeMsOverride: input.observeMsOverride,
    timeoutMsOverride: input.timeoutMsOverride
  });

  return {
    chromeRemoteDebuggingUrl: input.chromeRemoteDebuggingUrl,
    mode: input.mode,
    observeMs: timing.observeMs,
    outputDir: input.outputDir,
    remoteCdpWsEndpoint: input.remoteCdpWsEndpoint,
    timeoutMs: timing.timeoutMs,
    userAgent: input.userAgent
  };
}
