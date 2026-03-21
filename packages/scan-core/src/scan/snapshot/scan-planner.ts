import type { StaticPageResult } from "./types";

export type ScanPlanProfile = "static_light" | "balanced" | "js_heavy" | "commerce" | "high_block_risk";

export type ScanPlan = {
  blockStylesheetsInBrowser: boolean;
  browserNavigationTimeoutMs: number;
  browserPostLoadWaitMs: number;
  expansionTargetCount: number;
  prefetchTargetCount: number;
  profile: ScanPlanProfile;
  staticFetchConcurrency: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildQuickDiscoveryBudget(input: {
  expansionMax: number;
  prefetchMax: number;
  requested: number;
}) {
  const requested = Math.max(1, input.requested);
  const quickScan = requested <= 3;

  return {
    prefetchTargetCount: quickScan ? clamp(requested - 1, 1, input.prefetchMax) : Math.min(requested + 1, input.prefetchMax),
    expansionTargetCount: quickScan ? clamp(requested, 2, input.expansionMax) : Math.min(requested + 2, input.expansionMax)
  };
}

export function buildScanPlan(input: {
  homepage: StaticPageResult;
  requestedPageCount: number;
  robotsCrawlDelayMs: number | null;
}) : ScanPlan {
  const scriptCount = input.homepage.scripts.length;
  const linkCount = input.homepage.links.length;
  const text = `${input.homepage.textContent}\n${input.homepage.html}`.toLowerCase();
  const explicitBlockSignals = /captcha|verify you are human|access denied|cf-chl|cloudflare challenge|press and hold/.test(text);
  const blockedRisk = input.homepage.fetchStatus === "forbidden" || explicitBlockSignals;
  const commerceLikely = /add to cart|checkout|returns|shipping|shop now|payment/i.test(text);
  const jsHeavy = scriptCount >= 25 || /__next|webpack|react|apollo-state|hydration|window\.__/i.test(input.homepage.html);
  const crawlDelayHeavy = (input.robotsCrawlDelayMs ?? 0) >= 4_000;

  let profile: ScanPlanProfile = "balanced";

  if (blockedRisk) {
    profile = "high_block_risk";
  } else if (commerceLikely) {
    profile = "commerce";
  } else if (jsHeavy) {
    profile = "js_heavy";
  } else if (scriptCount <= 8 && linkCount <= 30) {
    profile = "static_light";
  }

  const requested = Math.max(1, input.requestedPageCount);

  switch (profile) {
    case "high_block_risk":
      return {
        profile,
        ...buildQuickDiscoveryBudget({
          requested,
          prefetchMax: 3,
          expansionMax: 5
        }),
        staticFetchConcurrency: 1,
        browserNavigationTimeoutMs: 12_000,
        browserPostLoadWaitMs: 1_000,
        blockStylesheetsInBrowser: true
      };
    case "commerce":
      return {
        profile,
        prefetchTargetCount: Math.min(requested + 1, 4),
        expansionTargetCount: Math.min(requested + 3, 6),
        staticFetchConcurrency: crawlDelayHeavy ? 1 : 2,
        browserNavigationTimeoutMs: 18_000,
        browserPostLoadWaitMs: 2_200,
        blockStylesheetsInBrowser: false
      };
    case "js_heavy":
      return {
        profile,
        prefetchTargetCount: Math.min(requested + 1, 4),
        expansionTargetCount: Math.min(requested + 2, 5),
        staticFetchConcurrency: crawlDelayHeavy ? 1 : 2,
        browserNavigationTimeoutMs: 18_000,
        browserPostLoadWaitMs: 2_000,
        blockStylesheetsInBrowser: false
      };
    case "static_light":
      return {
        profile,
        ...buildQuickDiscoveryBudget({
          requested,
          prefetchMax: 4,
          expansionMax: 5
        }),
        staticFetchConcurrency: crawlDelayHeavy ? 1 : 3,
        browserNavigationTimeoutMs: 14_000,
        browserPostLoadWaitMs: 900,
        blockStylesheetsInBrowser: true
      };
    default:
      return {
        profile: "balanced",
        ...buildQuickDiscoveryBudget({
          requested,
          prefetchMax: 4,
          expansionMax: 5
        }),
        staticFetchConcurrency: crawlDelayHeavy ? 1 : 2,
        browserNavigationTimeoutMs: 16_000,
        browserPostLoadWaitMs: 1_400,
        blockStylesheetsInBrowser: true
      };
  }
}
