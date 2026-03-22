import { KEY_PAGE_DISCOVERY_BUDGETS } from "./key-page-discovery";
import type { StaticPageResult } from "./types";

export type ScanPlanProfile = "static_light" | "balanced" | "js_heavy" | "commerce" | "high_block_risk";
export type ConsentAcceptPathStrategy = "reject_then_accept" | "reject_then_accept_on_escalation";

export type ScanPlan = {
  additionalDiscoveryMaxAdditionalFetchAttempts: number;
  additionalDiscoveryMaxFetchAttemptsPerType: number;
  additionalDiscoveryMaxSecondHopLegalHubFetchesPerMissingType: number;
  blockStylesheetsInBrowser: boolean;
  browserNavigationTimeoutMs: number;
  browserPostLoadWaitMs: number;
  browserProfileSweepEnabled: boolean;
  browserRuntimeCaptureMaxAttempts: number;
  browserRuntimeStabilityMinWaitMs: number;
  browserRuntimeStabilityQuietWindowMs: number;
  consentAcceptPathStrategy: ConsentAcceptPathStrategy;
  consentProfileSweepEnabled: boolean;
  expansionTargetCount: number;
  prefetchTargetCount: number;
  profile: ScanPlanProfile;
  runPostrunCookiesDiagnostic: boolean;
  runServiceWorkerCheck: boolean;
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

function buildAdditionalDiscoveryBudget(input: { deepScan: boolean; quickScan: boolean }) {
  if (input.quickScan) {
    return {
      additionalDiscoveryMaxAdditionalFetchAttempts: 3,
      additionalDiscoveryMaxFetchAttemptsPerType: 1,
      additionalDiscoveryMaxSecondHopLegalHubFetchesPerMissingType: 0
    };
  }

  if (input.deepScan) {
    return {
      additionalDiscoveryMaxAdditionalFetchAttempts: KEY_PAGE_DISCOVERY_BUDGETS.maxAdditionalFetchAttempts,
      additionalDiscoveryMaxFetchAttemptsPerType: KEY_PAGE_DISCOVERY_BUDGETS.maxFetchAttemptsPerType,
      additionalDiscoveryMaxSecondHopLegalHubFetchesPerMissingType:
        KEY_PAGE_DISCOVERY_BUDGETS.maxSecondHopLegalHubFetchesPerMissingType
    };
  }

  return {
    additionalDiscoveryMaxAdditionalFetchAttempts: 5,
    additionalDiscoveryMaxFetchAttemptsPerType: 2,
    additionalDiscoveryMaxSecondHopLegalHubFetchesPerMissingType: 0
  };
}

function buildStabilityPolicy(input: { browserPostLoadWaitMs: number; deepScan: boolean }) {
  if (input.deepScan) {
    return {
      browserRuntimeStabilityMinWaitMs: Math.min(500, input.browserPostLoadWaitMs),
      browserRuntimeStabilityQuietWindowMs: input.browserPostLoadWaitMs >= 1_800 ? 700 : 500
    };
  }

  return {
    browserRuntimeStabilityMinWaitMs: Math.min(300, input.browserPostLoadWaitMs),
    browserRuntimeStabilityQuietWindowMs: input.browserPostLoadWaitMs >= 1_500 ? 450 : 300
  };
}

function buildPerformancePolicy(input: { deepScan: boolean }) {
  if (input.deepScan) {
    return {
      browserProfileSweepEnabled: true,
      browserRuntimeCaptureMaxAttempts: 2,
      consentAcceptPathStrategy: "reject_then_accept" as const,
      consentProfileSweepEnabled: true,
      runPostrunCookiesDiagnostic: true,
      runServiceWorkerCheck: true
    };
  }

  return {
    browserProfileSweepEnabled: false,
    browserRuntimeCaptureMaxAttempts: 1,
    consentAcceptPathStrategy: "reject_then_accept_on_escalation" as const,
    consentProfileSweepEnabled: false,
    runPostrunCookiesDiagnostic: false,
    runServiceWorkerCheck: false
  };
}

function reduceStandardDiscoveryBreadth(input: { deepScan: boolean; requested: number; value: number; minimum: number }) {
  if (input.deepScan) {
    return input.value;
  }

  return clamp(Math.min(input.requested, input.value) - 1, input.minimum, input.value);
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
  const quickScan = requested <= 3;
  const deepScan = requested > 10;

  switch (profile) {
    case "high_block_risk": {
      const highBlockRiskBudget = buildQuickDiscoveryBudget({
        requested,
        prefetchMax: 3,
        expansionMax: 5
      });
      return {
        profile,
        prefetchTargetCount: reduceStandardDiscoveryBreadth({
          deepScan,
          minimum: 1,
          requested,
          value: highBlockRiskBudget.prefetchTargetCount
        }),
        expansionTargetCount: reduceStandardDiscoveryBreadth({
          deepScan,
          minimum: 2,
          requested,
          value: highBlockRiskBudget.expansionTargetCount
        }),
        ...buildAdditionalDiscoveryBudget({
          deepScan,
          quickScan
        }),
        ...buildPerformancePolicy({
          deepScan
        }),
        staticFetchConcurrency: 1,
        browserNavigationTimeoutMs: 12_000,
        browserPostLoadWaitMs: 1_000,
        ...buildStabilityPolicy({
          browserPostLoadWaitMs: 1_000,
          deepScan
        }),
        blockStylesheetsInBrowser: true
      };
    }
    case "commerce":
      return {
        profile,
        prefetchTargetCount: reduceStandardDiscoveryBreadth({
          deepScan,
          minimum: 2,
          requested,
          value: Math.min(requested + 1, 4)
        }),
        expansionTargetCount: reduceStandardDiscoveryBreadth({
          deepScan,
          minimum: 3,
          requested,
          value: Math.min(requested + 3, 6)
        }),
        ...buildAdditionalDiscoveryBudget({
          deepScan,
          quickScan
        }),
        ...buildPerformancePolicy({
          deepScan
        }),
        staticFetchConcurrency: crawlDelayHeavy ? 1 : 2,
        browserNavigationTimeoutMs: 18_000,
        browserPostLoadWaitMs: 2_200,
        ...buildStabilityPolicy({
          browserPostLoadWaitMs: 2_200,
          deepScan
        }),
        blockStylesheetsInBrowser: false
      };
    case "js_heavy":
      return {
        profile,
        prefetchTargetCount: reduceStandardDiscoveryBreadth({
          deepScan,
          minimum: 2,
          requested,
          value: Math.min(requested + 1, 4)
        }),
        expansionTargetCount: reduceStandardDiscoveryBreadth({
          deepScan,
          minimum: 3,
          requested,
          value: Math.min(requested + 2, 5)
        }),
        ...buildAdditionalDiscoveryBudget({
          deepScan,
          quickScan
        }),
        ...buildPerformancePolicy({
          deepScan
        }),
        staticFetchConcurrency: crawlDelayHeavy ? 1 : 2,
        browserNavigationTimeoutMs: 18_000,
        browserPostLoadWaitMs: 2_000,
        ...buildStabilityPolicy({
          browserPostLoadWaitMs: 2_000,
          deepScan
        }),
        blockStylesheetsInBrowser: false
      };
    case "static_light": {
      const staticLightBudget = buildQuickDiscoveryBudget({
        requested,
        prefetchMax: 4,
        expansionMax: 5
      });
      return {
        profile,
        prefetchTargetCount: reduceStandardDiscoveryBreadth({
          deepScan,
          minimum: 1,
          requested,
          value: staticLightBudget.prefetchTargetCount
        }),
        expansionTargetCount: reduceStandardDiscoveryBreadth({
          deepScan,
          minimum: 2,
          requested,
          value: staticLightBudget.expansionTargetCount
        }),
        ...buildAdditionalDiscoveryBudget({
          deepScan,
          quickScan
        }),
        ...buildPerformancePolicy({
          deepScan
        }),
        staticFetchConcurrency: crawlDelayHeavy ? 1 : 3,
        browserNavigationTimeoutMs: 14_000,
        browserPostLoadWaitMs: 900,
        ...buildStabilityPolicy({
          browserPostLoadWaitMs: 900,
          deepScan
        }),
        blockStylesheetsInBrowser: true
      };
    }
    default: {
      const balancedBudget = buildQuickDiscoveryBudget({
        requested,
        prefetchMax: 4,
        expansionMax: 5
      });
      return {
        profile: "balanced",
        prefetchTargetCount: reduceStandardDiscoveryBreadth({
          deepScan,
          minimum: 1,
          requested,
          value: balancedBudget.prefetchTargetCount
        }),
        expansionTargetCount: reduceStandardDiscoveryBreadth({
          deepScan,
          minimum: 2,
          requested,
          value: balancedBudget.expansionTargetCount
        }),
        ...buildAdditionalDiscoveryBudget({
          deepScan,
          quickScan
        }),
        ...buildPerformancePolicy({
          deepScan
        }),
        staticFetchConcurrency: crawlDelayHeavy ? 1 : 2,
        browserNavigationTimeoutMs: 16_000,
        browserPostLoadWaitMs: deepScan ? 1_400 : 1_100,
        ...buildStabilityPolicy({
          browserPostLoadWaitMs: deepScan ? 1_400 : 1_100,
          deepScan
        }),
        blockStylesheetsInBrowser: true
      };
    }
  }
}

export function shouldSweepBrowserProfiles(plan: ScanPlan) {
  return plan.browserProfileSweepEnabled;
}

export function shouldSweepConsentAuditProfiles(input: {
  acceptAllPresent: boolean;
  baselineRightsFrictionScore: number;
  cookieBannerPresent: boolean;
  plan: ScanPlan;
  rejectAllPresent: boolean;
}) {
  return (
    input.plan.consentProfileSweepEnabled ||
    input.baselineRightsFrictionScore >= 75 ||
    (input.cookieBannerPresent && !input.rejectAllPresent && !input.acceptAllPresent)
  );
}

export function shouldRunConsentAcceptPath(input: {
  baselineRightsFrictionScore?: number | null;
  baselineTrackerVendorCount: number;
  plan: ScanPlan;
  rejectClickCount: number | null;
  rejectInteractionSucceeded: boolean;
  rejectRedirectOrAuthRequired: boolean;
  rejectTrackerVendorCount: number;
}) {
  if (input.plan.consentAcceptPathStrategy === "reject_then_accept") {
    return true;
  }

  const highBaselineFriction = (input.baselineRightsFrictionScore ?? 0) >= 75;
  const rejectPathWeak =
    !input.rejectInteractionSucceeded || input.rejectRedirectOrAuthRequired || input.rejectClickCount === null;
  const rejectPathDidNotReduceTracking = input.rejectTrackerVendorCount >= input.baselineTrackerVendorCount;

  return highBaselineFriction || rejectPathWeak || rejectPathDidNotReduceTracking;
}

export function shouldRunPostrunCookiesDiagnostic(input: {
  cookieBannerPresent: boolean;
  plan: ScanPlan;
  trackerVendorCount: number;
}) {
  return input.plan.runPostrunCookiesDiagnostic || input.cookieBannerPresent || input.trackerVendorCount > 0;
}

export function shouldRunServiceWorkerDiagnostic(input: {
  cookieBannerPresent: boolean;
  plan: ScanPlan;
  trackerVendorCount: number;
}) {
  return input.plan.runServiceWorkerCheck || input.cookieBannerPresent || input.trackerVendorCount > 0;
}

export function shouldRunGpcVerification(input: {
  cookieBannerPresent: boolean;
  plan: ScanPlan;
  thirdPartyCookieCount: number | null;
  trackerVendorCount: number;
}) {
  return (
    input.plan.runPostrunCookiesDiagnostic ||
    input.cookieBannerPresent ||
    input.trackerVendorCount > 0 ||
    (input.thirdPartyCookieCount ?? 0) > 0
  );
}
