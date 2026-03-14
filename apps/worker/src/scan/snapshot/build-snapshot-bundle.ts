import type { Page } from "playwright";
import { projectSnapshotSignals, type ScanAccessibilityRuleCount, type ScanSnapshot, type ScanTrackerVendor } from "@website-signal-risk-scanner/shared";
import { createBrowser } from "../browser/create-browser";
import { navigateWithPolicy } from "../browser/navigate-with-policy";
import { mapAxeImpactToSeverity } from "../page-audit/map-axe-severity";
import { runAxe } from "../page-audit/run-axe";
import { enrichPolicyPages } from "../policy-enrichment";
import {
  createRobotsPolicy,
  getRobotsFetchStatus,
  isUrlAllowedByRobots,
  recordDomainBackoff,
  type RobotsPolicy,
  waitForDomainRequestSlot
} from "../robots/policy";
import {
  buildAccessibilitySummary,
  buildPageMetadata,
  consentSignatureHash,
  deriveAdvertisingClassification,
  deriveAiInfrastructureSignals,
  deriveContactSignals,
  deriveExpandedCommercialSignals,
  deriveFormSignals,
  deriveGovernanceSignals,
  deriveJurisdictionAndIndustry,
  derivePolicySignals,
  deriveTechSignals,
  detectAccessibilityWidgetFromPages,
  detectCmpVendorFromPage,
  detectNamedVendor,
  detectTrackerVendorsFromStaticPage,
  discoverCandidatePages,
  fetchStaticPage,
  fetchTextPage,
  getRegisteredDomain,
  homepageStructuredHash,
  inferSiteSizeHint,
  policyPagesFromFetchedPages,
  policyPresenceHash,
  summarizeTrackers
} from "./extractors";
import { fetchDnsSignals, fetchDomainRegistration, fetchTlsMetadata } from "./network-enrichment";
import { shouldContinueRuntimeWait } from "./browser-stability";
import {
  getCachedDnsSignals,
  getCachedDomainRegistration,
  getCachedTlsMetadata,
  getCoverageTargetTypes,
  hasCoverageForTargetTypes,
  prioritizeUncoveredTargets
} from "./scan-optimization";
import { buildScanPlan, type ScanPlan } from "./scan-planner";
import {
  ACCESSIBILITY_WIDGET_SIGNATURES,
  CMP_VENDOR_SIGNATURES,
  TRACKER_VENDOR_SIGNATURES,
  type VendorSignature
} from "./signature-registry";
import {
  deriveInfrastructureChangeSignals,
  derivePolicyBehaviorConflictDetected,
  deriveSecurityHeadersScore,
  deriveTrackingBeforeConsentDetected,
  scoreSnapshot
} from "./score-snapshot";
import type { PreviousSnapshotContext, SnapshotBundle, StaticPageResult } from "./types";
import { stableHash } from "./hash";

type BuildSnapshotBundleInput = {
  crawlSource: ScanSnapshot["crawlSource"];
  domain: string;
  domainId: string;
  organizationId: string | null;
  previous?: PreviousSnapshotContext | null;
  requestedPageCount: number;
  scanId: string;
};

type BrowserPassResult = {
  acceptAllPresent: boolean;
  consentBannerLayoutType: ScanSnapshot["consentBannerLayoutType"];
  consentBannerPosition: ScanSnapshot["consentBannerPosition"];
  consentPersistenceMechanismDetected: boolean | null;
  cookieCategoryCount: number | null;
  cookieCountTotal: number | null;
  cmpVendorConfidence: number | null;
  cmpVendorName: string | null;
  consentModeDetected: boolean;
  cookieBannerPresent: boolean;
  cookiePolicyLinkedFromBanner: boolean;
  defaultTrackingState: ScanSnapshot["defaultTrackingState"];
  darkPatternAcceptEmphasis: boolean;
  darkPatternRejectHidden: boolean;
  darkPatternRejectButtonMissing: boolean;
  darkPatternAcceptButtonProminence: boolean;
  darkPatternForcedConsentWall: boolean;
  darkPatternAcceptOnlyBanner: boolean;
  darkPatternDismissWithoutReject: boolean;
  darkPatternCountdownTimerPresent: boolean;
  darkPatternFakeScarcityLanguage: boolean;
  firstPartyCookieSetBeforeConsent: boolean | null;
  granularPreferencesPresent: boolean;
  mixedContentDetected: boolean;
  precheckedConsentBoxes: boolean;
  preconsentTrackingDetected: boolean;
  rejectAllPresent: boolean;
  serviceWorkerDetected: boolean | null;
  thirdPartyCookieCount: number | null;
  thirdPartyCookieSetBeforeConsent: boolean | null;
  trackingBeforeConsentDetected: boolean | null;
  timedOut: boolean;
  trackerVendors: ScanTrackerVendor[];
  widgetVendor: string | null;
  ruleCounts: ScanAccessibilityRuleCount[];
  discoveredLinks: Array<{ href: string; text: string }>;
  domNodeCount: number | null;
  domStructureHash: string | null;
  initialCookieCount: number | null;
  initialCookieDomains: string[];
  initialCookieNames: string[];
  scriptSrcDomains: string[];
  scriptTagCount: number;
  thirdPartyRequestCount: number;
  thirdPartyRequestDomains: string[];
};

type FetchedRobotsState = {
  policy: RobotsPolicy | null;
  robotsAllowed: boolean;
  robotsCrawlDelayMs: number | null;
  robotsDirectiveCount: number | null;
  robotsFetchHttpStatus: number | null;
  robotsFetchStatus: ScanSnapshot["robotsFetchStatus"];
  robotsGroupCount: number | null;
  robotsHasAllowRules: boolean | null;
  robotsHasDisallowRules: boolean | null;
  robotsTxtFetchedAt: string;
  robotsTxtHash: string | null;
  robotsTxtUrl: string;
  robotsRulesLoaded: boolean | null;
};

type ConsentButtonMeta = {
  prominenceScore: number;
  text: string;
};

export function inferConsentDarkPatternFlags(input: {
  acceptButtons: ConsentButtonMeta[];
  bannerHeightRatio: number;
  bodyOverflowHidden: boolean;
  bodyText: string;
  dismissButtons: ConsentButtonMeta[];
  isFixedBanner: boolean;
  layoutType: ScanSnapshot["consentBannerLayoutType"];
  preferencesButtons: ConsentButtonMeta[];
  rejectButtons: ConsentButtonMeta[];
  visibleBanner: boolean;
}) {
  const maxAcceptProminence = input.acceptButtons.reduce((max, button) => Math.max(max, button.prominenceScore), 0);
  const maxRejectProminence = input.rejectButtons.reduce((max, button) => Math.max(max, button.prominenceScore), 0);

  return {
    darkPatternRejectButtonMissing: input.visibleBanner && input.acceptButtons.length > 0 && input.rejectButtons.length === 0,
    darkPatternAcceptButtonProminence:
      input.visibleBanner &&
      input.acceptButtons.length > 0 &&
      input.rejectButtons.length > 0 &&
      maxAcceptProminence > maxRejectProminence * 1.2,
    // Prominence is inferred from deterministic DOM heuristics: element area, filled styling, and primary-vs-secondary class hints.
    darkPatternForcedConsentWall:
      input.visibleBanner &&
      input.acceptButtons.length > 0 &&
      Boolean(
        (input.layoutType === "full_screen" || input.layoutType === "modal") &&
          (input.bodyOverflowHidden || (input.isFixedBanner && input.bannerHeightRatio > 0.45))
      ),
    darkPatternAcceptOnlyBanner:
      input.visibleBanner && input.acceptButtons.length > 0 && input.rejectButtons.length === 0 && input.preferencesButtons.length === 0,
    darkPatternDismissWithoutReject: input.visibleBanner && input.dismissButtons.length > 0 && input.rejectButtons.length === 0,
    darkPatternCountdownTimerPresent: /(countdown|timer|offer ends in|\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})/.test(input.bodyText),
    darkPatternFakeScarcityLanguage: /(limited time|only \d+ left|ends soon|offer expires|sale ends)/.test(input.bodyText)
  };
}

function priorityForPage(pageType: StaticPageResult["pageType"]) {
  switch (pageType) {
    case "homepage":
      return 1000;
    case "privacy_policy":
      return 990;
    case "terms_of_service":
      return 980;
    case "cookie_policy":
      return 970;
    case "accessibility_statement":
      return 960;
    case "contact":
      return 950;
    case "checkout":
      return 940;
    case "product":
    case "pricing":
      return 920;
    case "signup":
    case "login":
      return 910;
    default:
      return 800;
  }
}

function selectTargets(
  candidates: Array<{
    pageType: StaticPageResult["pageType"];
    priority: number;
    url: string;
  }>,
  requestedCount: number
) {
  const selected: typeof candidates = [];
  const seenUrls = new Set<string>();
  const seenTypes = new Set<string>();

  for (const candidate of candidates) {
    if (seenUrls.has(candidate.url)) {
      continue;
    }

    if (candidate.pageType !== "other" && candidate.pageType !== "homepage" && !seenTypes.has(candidate.pageType)) {
      selected.push(candidate);
      seenUrls.add(candidate.url);
      seenTypes.add(candidate.pageType);
    }

    if (selected.length >= requestedCount) {
      return selected;
    }
  }

  for (const candidate of candidates) {
    if (seenUrls.has(candidate.url)) {
      continue;
    }

    selected.push(candidate);
    seenUrls.add(candidate.url);

    if (selected.length >= requestedCount) {
      return selected;
    }
  }

  return selected;
}

function sameHostname(leftUrl: string, rightUrl: string) {
  try {
    return new URL(leftUrl).hostname === new URL(rightUrl).hostname;
  } catch {
    return false;
  }
}

async function fetchRobotsState(input: { domainId: string; scanId: string; startUrl: string }) : Promise<FetchedRobotsState> {
  const robotsUrl = new URL("/robots.txt", input.startUrl).toString();
  const fetchedAt = new Date().toISOString();

  try {
    const robots = await fetchTextPage(robotsUrl, 5, {
      bypassRobots: true
    });
    const policy = createRobotsPolicy({
      body: robots.body,
      fetchedAt,
      status: robots.status,
      url: robotsUrl
    });
    const homepageAllowed = policy.allows(input.startUrl);

    return {
      policy,
      robotsAllowed: homepageAllowed,
      robotsCrawlDelayMs: policy.crawlDelayMs(),
      robotsDirectiveCount: policy.directiveCount,
      robotsFetchHttpStatus: robots.status,
      robotsFetchStatus: getRobotsFetchStatus(robots.status),
      robotsGroupCount: policy.groupCount,
      robotsHasAllowRules: policy.hasAllowRules,
      robotsHasDisallowRules: policy.hasDisallowRules,
      robotsTxtFetchedAt: fetchedAt,
      robotsTxtHash: stableHash(robots.body),
      robotsTxtUrl: robotsUrl,
      robotsRulesLoaded: policy.rulesLoaded
    } as const;
  } catch {
    return {
      robotsAllowed: true,
      policy: null,
      robotsCrawlDelayMs: null,
      robotsDirectiveCount: null,
      robotsFetchHttpStatus: null,
      robotsFetchStatus: "error",
      robotsGroupCount: null,
      robotsHasAllowRules: null,
      robotsHasDisallowRules: null,
      robotsTxtFetchedAt: fetchedAt,
      robotsTxtHash: null,
      robotsTxtUrl: robotsUrl,
      robotsRulesLoaded: null
    } as const;
  }
}

function dedupeTrackers(trackers: ScanTrackerVendor[]) {
  const seen = new Map<string, ScanTrackerVendor>();

  for (const tracker of trackers) {
    const key = [
      tracker.vendorName,
      tracker.vendorCategory,
      tracker.scriptHost ?? "",
      tracker.beforeConsent ? "before" : "after"
    ].join(":");

    const existing = seen.get(key);

    if (!existing || existing.confidence < tracker.confidence) {
      seen.set(key, tracker);
    }
  }

  return [...seen.values()].sort((left, right) => left.vendorName.localeCompare(right.vendorName));
}

function dedupeRuleCounts(ruleCounts: ScanAccessibilityRuleCount[]) {
  const byKey = new Map<string, ScanAccessibilityRuleCount>();

  for (const rule of ruleCounts) {
    const key = rule.ruleCode;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, rule);
      continue;
    }

    byKey.set(key, {
      ...existing,
      instanceCount: existing.instanceCount + rule.instanceCount
    });
  }

  return [...byKey.values()].sort((left, right) => left.ruleCode.localeCompare(right.ruleCode));
}

function matchesRequestSignature(url: string, signature: VendorSignature) {
  try {
    const requestUrl = new URL(url);
    const hostMatch =
      signature.hostnamePatterns?.some(
        (pattern) => requestUrl.hostname === pattern || requestUrl.hostname.endsWith(`.${pattern}`)
      ) ?? false;

    if (!hostMatch) {
      return false;
    }

    if (!signature.pathFragments?.length) {
      return true;
    }

    const fullPath = `${requestUrl.pathname}${requestUrl.search}`.toLowerCase();
    return signature.pathFragments.some((fragment) => fullPath.includes(fragment.toLowerCase()));
  } catch {
    return false;
  }
}

function browserScriptsToMatches(scriptUrls: string[]) {
  return scriptUrls.map((url) => {
    try {
      return {
        src: url,
        host: new URL(url).hostname,
        contentSample: null
      };
    } catch {
      return {
        src: url,
        host: null,
        contentSample: null
      };
    }
  });
}

function parseRetryAfterMs(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = Number.parseFloat(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, timestamp - Date.now());
}

async function evaluateConsentState(page: Page) {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']"));
    const bodyText = document.body?.innerText?.replace(/\s+/g, " ").toLowerCase() ?? "";
    const buttonMeta = candidates
      .map((element) => {
        const text = (element.textContent ?? element.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim().toLowerCase();
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const classText = `${element.className ?? ""} ${element.getAttribute("data-testid") ?? ""} ${element.id ?? ""}`.toLowerCase();
        const isVisible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0";

        if (!text || !isVisible) {
          return null;
        }

        const filledButton = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
        const primaryClass = /(primary|accept|allow|agree|confirm|solid|filled)/.test(classText);
        const secondaryClass = /(secondary|ghost|outline|link|subtle|reject|decline|deny)/.test(classText);
        const fontWeight = Number.parseInt(style.fontWeight, 10);

        return {
          prominenceScore:
            rect.width * rect.height +
            (filledButton ? 5000 : 0) +
            (primaryClass ? 3000 : 0) -
            (secondaryClass ? 1500 : 0) +
            (Number.isFinite(fontWeight) ? fontWeight : 0),
          text
        };
      })
      .filter((entry): entry is { prominenceScore: number; text: string } => Boolean(entry));
    const acceptButtons = buttonMeta.filter((button) => /accept|allow all|agree/.test(button.text));
    const rejectButtons = buttonMeta.filter((button) => /reject|decline|deny/.test(button.text));
    const preferencesButtons = buttonMeta.filter((button) => /preferences|settings|manage|customize/.test(button.text));
    const dismissButtons = buttonMeta.filter((button) => /close|dismiss|not now|continue without accepting/.test(button.text));
    const acceptTexts = acceptButtons.map((button) => button.text);
    const rejectTexts = rejectButtons.map((button) => button.text);
    const preferencesTexts = preferencesButtons.map((button) => button.text);
    const cookiePolicyLinks = Array.from(document.querySelectorAll("a[href]")).some((element) =>
      /cookie/i.test((element as HTMLAnchorElement).href) || /cookie/i.test((element.textContent ?? "").toLowerCase())
    );
    const visibleBanner = /cookie|consent|privacy choices|your privacy/.test(bodyText);
    const precheckedBoxes = Array.from(document.querySelectorAll("input[type='checkbox']")).some((element) => {
      const input = element as HTMLInputElement;

      if (!input.checked) {
        return false;
      }

      const contextualText = `${input.name ?? ""} ${input.id ?? ""} ${input.getAttribute("aria-label") ?? ""} ${input.closest("label,fieldset,form,div")?.textContent ?? ""}`.toLowerCase();
      return /consent|marketing|newsletter|email updates|sms|advertising|promotional|privacy/.test(contextualText);
    });
    const bannerElement =
      document.querySelector("[id*='cookie'],[class*='cookie'],[id*='consent'],[class*='consent'],[aria-label*='privacy' i]") ??
      document.querySelector("dialog,[role='dialog'],aside,footer,header");
    const bannerRect = bannerElement?.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 0;
    const viewportWidth = window.innerWidth || 0;
    const style = bannerElement ? window.getComputedStyle(bannerElement) : null;
    const categoryTexts = Array.from(document.querySelectorAll("button, label, [role='tab'], [role='checkbox']"))
      .map((element) => (element.textContent ?? "").trim().toLowerCase())
      .filter((text) => /necessary|analytics|marketing|advertising|preferences|functional|performance|statistics/.test(text));
    const storedConsentSignal =
      Object.keys(window.localStorage).some((key) => /consent|cookie|privacy/i.test(key)) ||
      Object.keys(window.sessionStorage).some((key) => /consent|cookie|privacy/i.test(key)) ||
      document.cookie.split(";").some((item) => /consent|cookie|privacy/i.test(item));
    const trackingEnabledByDefault =
      /analytics_storage.{0,10}granted|ad_storage.{0,10}granted|marketing.{0,10}enabled/.test(bodyText) ||
      document.cookie.split(";").some((item) => /_ga=|_fbp=|_gid=/.test(item));
    const bodyOverflowHidden = window.getComputedStyle(document.body).overflow === "hidden";
    let layoutType: "modal" | "bottom_bar" | "top_bar" | "sidebar" | "full_screen" | "inline" | "unknown" = "unknown";
    let position: "top" | "bottom" | "modal" | "sidebar" | "inline" | "other" | "unknown" = "unknown";

    if (bannerRect && style) {
      const isDialog = bannerElement?.matches("dialog,[role='dialog']");
      const coversScreen = bannerRect.width >= viewportWidth * 0.8 && bannerRect.height >= viewportHeight * 0.8;
      const nearBottom = bannerRect.bottom >= viewportHeight * 0.9;
      const nearTop = bannerRect.top <= viewportHeight * 0.1;
      const sideAnchored = bannerRect.left <= viewportWidth * 0.1 || bannerRect.right >= viewportWidth * 0.9;

      if (coversScreen) {
        layoutType = "full_screen";
        position = "modal";
      } else if (isDialog || style.position === "fixed" || style.position === "sticky") {
        if (sideAnchored && bannerRect.height > viewportHeight * 0.4) {
          layoutType = "sidebar";
          position = "sidebar";
        } else if (nearBottom && bannerRect.width >= viewportWidth * 0.5) {
          layoutType = "bottom_bar";
          position = "bottom";
        } else if (nearTop && bannerRect.width >= viewportWidth * 0.5) {
          layoutType = "top_bar";
          position = "top";
        } else {
          layoutType = "modal";
          position = "modal";
        }
      } else {
        layoutType = "inline";
        position = "inline";
      }
    }

    const darkPatternFlags = {
      darkPatternRejectButtonMissing: visibleBanner && acceptButtons.length > 0 && rejectButtons.length === 0,
      darkPatternAcceptButtonProminence:
        visibleBanner &&
        acceptButtons.length > 0 &&
        rejectButtons.length > 0 &&
        acceptButtons.reduce((max, button) => Math.max(max, button.prominenceScore), 0) >
          rejectButtons.reduce((max, button) => Math.max(max, button.prominenceScore), 0) * 1.2,
      darkPatternForcedConsentWall:
        visibleBanner &&
        acceptButtons.length > 0 &&
        Boolean(
          (layoutType === "full_screen" || layoutType === "modal") &&
            (bodyOverflowHidden || (style?.position === "fixed" && (bannerRect?.height ?? 0) > viewportHeight * 0.45))
        ),
      darkPatternAcceptOnlyBanner: visibleBanner && acceptButtons.length > 0 && rejectButtons.length === 0 && preferencesButtons.length === 0,
      darkPatternDismissWithoutReject: visibleBanner && dismissButtons.length > 0 && rejectButtons.length === 0,
      darkPatternCountdownTimerPresent: /(countdown|timer|offer ends in|\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})/.test(bodyText),
      darkPatternFakeScarcityLanguage: /(limited time|only \d+ left|ends soon|offer expires|sale ends)/.test(bodyText)
    };

    return {
      cookieBannerPresent: visibleBanner,
      acceptAllPresent: acceptTexts.length > 0,
      rejectAllPresent: rejectTexts.length > 0,
      granularPreferencesPresent: preferencesTexts.length > 0,
      cookiePolicyLinkedFromBanner: cookiePolicyLinks,
      darkPatternAcceptEmphasis: acceptTexts.length > 0 && rejectTexts.length === 0,
      darkPatternRejectHidden: visibleBanner && rejectTexts.length === 0,
      precheckedConsentBoxes: precheckedBoxes,
      ...darkPatternFlags,
      consentModeDetected: /consent mode|ad_storage|analytics_storage/.test(bodyText),
      consentBannerLayoutType: layoutType,
      consentBannerPosition: position,
      cookieCategoryCount: new Set(categoryTexts).size || null,
      consentPersistenceMechanismDetected: storedConsentSignal,
      defaultTrackingState: trackingEnabledByDefault ? ("tracking_enabled" as const) : visibleBanner ? ("tracking_disabled" as const) : ("unknown" as const)
    };
  });
}

async function detectConsentSurface(page: Page) {
  return page
    .evaluate(() => {
      const banner = document.querySelector(
        "[id*='cookie'],[class*='cookie'],[id*='consent'],[class*='consent'],[aria-label*='privacy' i],dialog,[role='dialog']"
      );

      if (banner) {
        return true;
      }

      const bodyText = document.body?.innerText?.replace(/\s+/g, " ").toLowerCase() ?? "";
      return /cookie|consent|privacy choices|your privacy/.test(bodyText);
    })
    .catch(() => false);
}

async function waitForBrowserRuntimeStability(input: {
  getInflightRequests: () => number;
  getLastNetworkActivityAt: () => number;
  maxWaitMs: number;
  page: Page;
}) {
  const startedAt = Date.now();
  const minWaitMs = Math.min(500, input.maxWaitMs);
  const quietWindowMs = input.maxWaitMs >= 1_800 ? 700 : 500;
  const pollIntervalMs = 100;

  while (true) {
    const now = Date.now();
    const elapsedMs = now - startedAt;
    const bannerDetected = await detectConsentSurface(input.page);
    const shouldContinue = shouldContinueRuntimeWait({
      bannerDetected,
      elapsedMs,
      inflightRequests: input.getInflightRequests(),
      lastActivityElapsedMs: now - input.getLastNetworkActivityAt(),
      maxWaitMs: input.maxWaitMs,
      minWaitMs,
      quietWindowMs
    });

    if (!shouldContinue) {
      return elapsedMs;
    }

    await input.page.waitForTimeout(pollIntervalMs);
  }
}

async function runBrowserPass(input: {
  plan: ScanPlan;
  domain: string;
  homepageUrl: string;
  organizationId: string | null;
  robotsPolicy?: RobotsPolicy | null;
  scanId: string;
}): Promise<BrowserPassResult> {
  const browserHandle = await createBrowser();
  const page = await browserHandle.context.newPage();
  const requestUrls = new Set<string>();
  let mixedContentDetected = false;
  let timedOut = false;
  let inflightRequests = 0;
  let firstPartyCookieSetBeforeConsent = false;
  let thirdPartyCookieSetBeforeConsent = false;
  let browserSessionUsable = true;
  let cookiesBeforeConsent: Array<{ domain: string; name: string }> = [];
  let lastNetworkActivityAt = Date.now();

  await page.route("**/*", async (route) => {
    const resourceType = route.request().resourceType();
    const requestUrl = route.request().url();

    if (
      ["image", "media", "font"].includes(resourceType) ||
      (resourceType === "stylesheet" && input.plan.blockStylesheetsInBrowser)
    ) {
      await route.abort("blockedbyclient");
      return;
    }

    if (!/^https?:\/\//i.test(requestUrl)) {
      await route.continue();
      return;
    }

    if (!isUrlAllowedByRobots(requestUrl, input.robotsPolicy)) {
      await route.abort("blockedbyclient");
      return;
    }

    await waitForDomainRequestSlot(requestUrl, {
      minDelayMs: input.robotsPolicy?.crawlDelayMs()
    });
    await route.continue();
  });

  page.on("request", (request) => {
    const requestUrl = request.url();
    inflightRequests += 1;
    lastNetworkActivityAt = Date.now();
    requestUrls.add(requestUrl);

    if (input.homepageUrl.startsWith("https://") && requestUrl.startsWith("http://")) {
      mixedContentDetected = true;
    }
  });

  const markRequestCompleted = () => {
    inflightRequests = Math.max(0, inflightRequests - 1);
    lastNetworkActivityAt = Date.now();
  };

  page.on("requestfinished", markRequestCompleted);
  page.on("requestfailed", markRequestCompleted);

  page.on("response", (response) => {
    if (response.status() !== 429) {
      return;
    }

    recordDomainBackoff(response.url(), {
      retryAfterMs: parseRetryAfterMs(response.headers()["retry-after"] ?? null)
    });
  });

  try {
    page.setDefaultNavigationTimeout(input.plan.browserNavigationTimeoutMs);
    page.setDefaultTimeout(input.plan.browserNavigationTimeoutMs);
    const navigation = await navigateWithPolicy({
      page,
      robotsPolicy: input.robotsPolicy,
      url: input.homepageUrl
    });

    if (navigation.blockedByPolicy) {
      timedOut = false;
      return {
        acceptAllPresent: false,
        consentBannerLayoutType: "unknown",
        consentBannerPosition: "unknown",
        consentPersistenceMechanismDetected: null,
        cookieCategoryCount: null,
        cookieCountTotal: null,
        cmpVendorConfidence: null,
        cmpVendorName: null,
        consentModeDetected: false,
        cookieBannerPresent: false,
        cookiePolicyLinkedFromBanner: false,
        defaultTrackingState: "unknown",
        darkPatternAcceptEmphasis: false,
        darkPatternRejectHidden: false,
        darkPatternRejectButtonMissing: false,
        darkPatternAcceptButtonProminence: false,
        darkPatternForcedConsentWall: false,
        darkPatternAcceptOnlyBanner: false,
        darkPatternDismissWithoutReject: false,
        darkPatternCountdownTimerPresent: false,
        darkPatternFakeScarcityLanguage: false,
        firstPartyCookieSetBeforeConsent: null,
        granularPreferencesPresent: false,
        mixedContentDetected: false,
        precheckedConsentBoxes: false,
        preconsentTrackingDetected: false,
        rejectAllPresent: false,
        serviceWorkerDetected: null,
        thirdPartyCookieCount: null,
        thirdPartyCookieSetBeforeConsent: null,
        trackingBeforeConsentDetected: null,
        timedOut: false,
        trackerVendors: [],
        widgetVendor: null,
        ruleCounts: [],
        discoveredLinks: [],
        domNodeCount: null,
        domStructureHash: null,
        initialCookieCount: null,
        initialCookieDomains: [],
        initialCookieNames: [],
        scriptSrcDomains: [],
        scriptTagCount: 0,
        thirdPartyRequestCount: 0,
        thirdPartyRequestDomains: []
      };
    }

    await waitForBrowserRuntimeStability({
      getInflightRequests: () => inflightRequests,
      getLastNetworkActivityAt: () => lastNetworkActivityAt,
      maxWaitMs: input.plan.browserPostLoadWaitMs,
      page
    });
    cookiesBeforeConsent = await browserHandle.context.cookies().catch(() => []);
    firstPartyCookieSetBeforeConsent = cookiesBeforeConsent.some((cookie) => cookie.domain === input.domain || cookie.domain.endsWith(`.${input.domain}`));
    thirdPartyCookieSetBeforeConsent = cookiesBeforeConsent.some(
      (cookie) => !(cookie.domain === input.domain || cookie.domain.endsWith(`.${input.domain}`))
    );
  } catch {
    timedOut = true;
  }

  const content = await page.content().catch(() => "");
  const discoveredLinks = await page
    .$$eval("a[href]", (elements) =>
      elements
        .map((element) => ({
          href: (element as HTMLAnchorElement).href,
          text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200)
        }))
        .filter((link) => Boolean(link.href))
    )
    .catch(() => []);
  const domSummary = await page
    .evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("*"));

      return {
        domNodeCount: nodes.length,
        domSignature: nodes.slice(0, 250).map((node) => {
          const element = node as Element;
          return {
            tag: element.tagName.toLowerCase(),
            childCount: element.childElementCount,
            role: element.getAttribute("role"),
            idHint: element.id ? element.id.slice(0, 40) : null
          };
        })
      };
    })
    .catch(() => null);
  const scriptUrls = await page.$$eval("script[src]", (elements) =>
    elements.map((element) => (element as HTMLScriptElement).src).filter(Boolean)
  );
  const consentState = await evaluateConsentState(page).catch(() => ({
    cookieBannerPresent: false,
    acceptAllPresent: false,
    rejectAllPresent: false,
    granularPreferencesPresent: false,
    cookiePolicyLinkedFromBanner: false,
    darkPatternAcceptEmphasis: false,
    darkPatternRejectHidden: false,
    darkPatternRejectButtonMissing: false,
    darkPatternAcceptButtonProminence: false,
    darkPatternForcedConsentWall: false,
    darkPatternAcceptOnlyBanner: false,
    darkPatternDismissWithoutReject: false,
    darkPatternCountdownTimerPresent: false,
    darkPatternFakeScarcityLanguage: false,
    precheckedConsentBoxes: false,
    consentModeDetected: false,
    consentBannerLayoutType: "unknown" as const,
    consentBannerPosition: "unknown" as const,
    cookieCategoryCount: null,
    consentPersistenceMechanismDetected: null,
    defaultTrackingState: "unknown" as const
  }));
  const browserScripts = browserScriptsToMatches(scriptUrls);
  const cmpVendor = detectNamedVendor(content, browserScripts, CMP_VENDOR_SIGNATURES);
  const widgetVendor = detectNamedVendor(content, browserScripts, ACCESSIBILITY_WIDGET_SIGNATURES);
  const trackerVendors = dedupeTrackers(
    TRACKER_VENDOR_SIGNATURES.filter((signature) => [...requestUrls].some((url) => matchesRequestSignature(url, signature))).map(
      (signature) => {
        const matchingUrl = [...requestUrls].find((url) => matchesRequestSignature(url, signature)) ?? null;
        const scriptHost = matchingUrl ? new URL(matchingUrl).hostname : null;
        return {
          scanId: input.scanId,
          vendorName: signature.name,
          vendorCategory: signature.category,
          detectionSource: "request",
          confidence: signature.confidence,
          firstPartyOrThirdParty:
            scriptHost === input.domain || (scriptHost ? scriptHost.endsWith(`.${input.domain}`) : false) ? "first_party" : "third_party",
          beforeConsent: true,
          scriptHost,
          matchedSignatureId: signature.id
        } satisfies ScanTrackerVendor;
      }
    )
  );

  const axeResults = timedOut ? null : await runAxe(page).catch(() => null);
  const browserCookies = await browserHandle.context.cookies().catch(() => {
    browserSessionUsable = false;
    return [];
  });
  const serviceWorkerDetected = await page
    .evaluate(() => ("serviceWorker" in navigator ? navigator.serviceWorker.getRegistrations().then((registrations) => registrations.length > 0) : false))
    .catch(() => null);
  const ruleCounts = dedupeRuleCounts(
    (axeResults?.violations ?? []).map((violation) => ({
      scanId: input.scanId,
      ruleCode: violation.id,
      ruleGroup: violation.id.split("-")[0] ?? violation.id,
      severity: mapAxeImpactToSeverity(violation.impact),
      instanceCount: violation.nodes.length
    }))
  );

  await page.close().catch(() => undefined);
  await browserHandle.context.close().catch(() => undefined);
  await browserHandle.browser.close().catch(() => undefined);

  return {
    ...consentState,
    cmpVendorName: cmpVendor?.name ?? null,
    cmpVendorConfidence: cmpVendor?.confidence ?? null,
    cookieCountTotal: browserSessionUsable ? browserCookies.length : null,
    thirdPartyCookieCount: browserSessionUsable
      ? browserCookies.filter((cookie) => !(cookie.domain === input.domain || cookie.domain.endsWith(`.${input.domain}`))).length
      : null,
    firstPartyCookieSetBeforeConsent: browserSessionUsable ? firstPartyCookieSetBeforeConsent : null,
    thirdPartyCookieSetBeforeConsent: browserSessionUsable ? thirdPartyCookieSetBeforeConsent : null,
    trackingBeforeConsentDetected: deriveTrackingBeforeConsentDetected({
      browserSessionUsable,
      firstPartyCookieSetBeforeConsent,
      thirdPartyCookieSetBeforeConsent,
      trackerCount: trackerVendors.length
    }),
    serviceWorkerDetected,
    mixedContentDetected,
    preconsentTrackingDetected: trackerVendors.length > 0,
    timedOut,
    trackerVendors,
    widgetVendor: widgetVendor?.name ?? null,
    ruleCounts,
    discoveredLinks,
    domNodeCount: domSummary?.domNodeCount ?? null,
    domStructureHash: domSummary ? stableHash(domSummary.domSignature) : null,
    initialCookieCount: browserSessionUsable ? cookiesBeforeConsent.length : null,
    initialCookieDomains: browserSessionUsable
      ? [...new Set(cookiesBeforeConsent.map((cookie) => cookie.domain).filter((domain): domain is string => Boolean(domain))).values()].sort()
      : [],
    initialCookieNames: browserSessionUsable
      ? [...new Set(cookiesBeforeConsent.map((cookie) => cookie.name).filter((name): name is string => Boolean(name))).values()].sort()
      : [],
    scriptSrcDomains: [...new Set(scriptUrls.map((url) => {
      try {
        return new URL(url).hostname;
      } catch {
        return null;
      }
    }).filter((hostname): hostname is string => Boolean(hostname))).values()].sort(),
    scriptTagCount: scriptUrls.length,
    thirdPartyRequestCount: [...requestUrls].filter((requestUrl) => {
      try {
        const hostname = new URL(requestUrl).hostname;
        return !(hostname === input.domain || hostname.endsWith(`.${input.domain}`));
      } catch {
        return false;
      }
    }).length,
    thirdPartyRequestDomains: [...new Set(
      [...requestUrls]
        .map((requestUrl) => {
          try {
            return new URL(requestUrl).hostname;
          } catch {
            return null;
          }
        })
        .filter((hostname): hostname is string => Boolean(hostname))
        .filter((hostname) => !(hostname === input.domain || hostname.endsWith(`.${input.domain}`)))
    ).values()].sort()
  };
}

async function fetchTargetsWithConcurrency(input: {
  coverageTargetTypes?: Set<StaticPageResult["pageType"]>;
  homepageUrl: string;
  concurrency: number;
  fetchedPagesByUrl: Map<string, StaticPageResult>;
  robotsPolicy?: RobotsPolicy | null;
  targets: Array<{
    pageType: StaticPageResult["pageType"];
    priority: number;
    url: string;
  }>;
}) {
  const queue = input.targets.filter((target) => !input.fetchedPagesByUrl.has(target.url));
  const concurrency = Math.max(1, input.concurrency);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < queue.length) {
      if (
        input.coverageTargetTypes &&
        hasCoverageForTargetTypes([...input.fetchedPagesByUrl.values()], input.coverageTargetTypes)
      ) {
        return;
      }

      const target = queue[nextIndex];
      nextIndex += 1;

      if (!target) {
        return;
      }

      const page = await fetchStaticPage({
        pageType: target.pageType,
        robotsPolicy: sameHostname(target.url, input.homepageUrl) ? input.robotsPolicy : null,
        url: target.url
      }).catch(() => null);

      if (!page) {
        continue;
      }

      input.fetchedPagesByUrl.set(page.pageUrl, page);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker()));
}

function estimateSeverityCounts(snapshot: ScanSnapshot) {
  let high = 0;
  let medium = 0;
  let low = 0;

  if (!snapshot.privacyPolicyPresent) {
    high += 1;
  }

  if (snapshot.preconsentTrackingDetected) {
    high += 1;
  }

  if (snapshot.cookieBannerPresent && !snapshot.rejectAllPresent) {
    medium += 1;
  }

  if (!snapshot.termsOfServicePresent) {
    medium += 1;
  }

  if (snapshot.wcagErrorCountTotal > 0) {
    medium += Math.min(5, Math.ceil(snapshot.wcagErrorCountTotal / 5));
  }

  if (snapshot.accessibilityWidgetPresent) {
    low += 1;
  }

  if (snapshot.securityTxtPresent) {
    low += 1;
  }

  return {
    highSeverityCount: high,
    mediumSeverityCount: medium,
    lowSeverityCount: low
  };
}

export async function buildSnapshotBundle(input: BuildSnapshotBundleInput): Promise<SnapshotBundle> {
  const isPreviewScan = input.crawlSource === "preview";
  const startUrl = input.domain.startsWith("http://") || input.domain.startsWith("https://") ? input.domain : `https://${input.domain}`;
  const robotsState = await fetchRobotsState({
    startUrl,
    scanId: input.scanId,
    domainId: input.domainId
  });

  let homepage = await fetchStaticPage({
    pageType: "homepage",
    robotsPolicy: robotsState.policy,
    url: startUrl
  }).catch(
    () =>
      ({
        blockedByPolicy: false,
        pageUrl: startUrl,
        pageType: "homepage",
        fetchStatus: "error",
        finalUrl: startUrl,
        headers: {},
        html: "",
        language: null,
        links: [],
        redirected: false,
        scripts: [],
        statusCode: null,
        textContent: "",
        title: null,
        forms: []
      }) satisfies StaticPageResult
  );

  const homepageUrl = homepage.finalUrl ?? startUrl;
  const scanPlan = buildScanPlan({
    homepage,
    requestedPageCount: input.requestedPageCount,
    robotsCrawlDelayMs: robotsState.policy?.crawlDelayMs() ?? null
  });
  const prefetchTargetCount = isPreviewScan ? 1 : scanPlan.prefetchTargetCount;
  const expansionTargetCount = isPreviewScan ? 0 : scanPlan.expansionTargetCount;
  const staticFetchConcurrency = isPreviewScan ? 1 : scanPlan.staticFetchConcurrency;
  const preBrowserCandidates = discoverCandidatePages(homepageUrl, homepage.links)
    .filter((target) => isUrlAllowedByRobots(target.url, robotsState.policy))
    .sort((left, right) => right.priority - left.priority)
    .sort((left, right) => priorityForPage(right.pageType) - priorityForPage(left.pageType));

  const prefetchedTargets = selectTargets(preBrowserCandidates, prefetchTargetCount);
  const prefetchedPagesByUrl = new Map<string, StaticPageResult>();
  await fetchTargetsWithConcurrency({
    coverageTargetTypes: getCoverageTargetTypes(prefetchedTargets, prefetchTargetCount),
    homepageUrl,
    concurrency: staticFetchConcurrency,
    fetchedPagesByUrl: prefetchedPagesByUrl,
    robotsPolicy: robotsState.policy,
    targets: prefetchedTargets
  });
  const prefetchedPages: StaticPageResult[] = [...prefetchedPagesByUrl.values()];

  if (!prefetchedPages.some((page) => page.pageUrl === homepage.pageUrl)) {
    prefetchedPages.unshift(homepage);
  } else {
    homepage = prefetchedPages.find((page) => page.pageType === "homepage") ?? homepage;
  }

  const browserPass = await runBrowserPass({
    domain: new URL(homepageUrl).hostname,
    homepageUrl,
    organizationId: input.organizationId,
    plan: scanPlan,
    robotsPolicy: robotsState.policy,
    scanId: input.scanId
  }).catch(
    () =>
      ({
        acceptAllPresent: false,
        consentBannerLayoutType: "unknown",
        consentBannerPosition: "unknown",
        consentPersistenceMechanismDetected: null,
        cookieCategoryCount: null,
        cookieCountTotal: null,
        cmpVendorConfidence: null,
        cmpVendorName: null,
        consentModeDetected: false,
        cookieBannerPresent: false,
        cookiePolicyLinkedFromBanner: false,
        defaultTrackingState: "unknown",
        darkPatternAcceptEmphasis: false,
        darkPatternRejectHidden: false,
        darkPatternRejectButtonMissing: false,
        darkPatternAcceptButtonProminence: false,
        darkPatternForcedConsentWall: false,
        darkPatternAcceptOnlyBanner: false,
        darkPatternDismissWithoutReject: false,
        darkPatternCountdownTimerPresent: false,
        darkPatternFakeScarcityLanguage: false,
        firstPartyCookieSetBeforeConsent: null,
        granularPreferencesPresent: false,
        mixedContentDetected: false,
        precheckedConsentBoxes: false,
        preconsentTrackingDetected: false,
        rejectAllPresent: false,
        serviceWorkerDetected: null,
        thirdPartyCookieCount: null,
        thirdPartyCookieSetBeforeConsent: null,
        trackingBeforeConsentDetected: null,
        timedOut: true,
        trackerVendors: [],
        widgetVendor: null,
        ruleCounts: [],
        discoveredLinks: [],
        domNodeCount: null,
        domStructureHash: null,
        initialCookieCount: null,
        initialCookieDomains: [],
        initialCookieNames: [],
        scriptSrcDomains: [],
        scriptTagCount: 0,
        thirdPartyRequestCount: 0,
        thirdPartyRequestDomains: []
      }) satisfies BrowserPassResult
  );

  const candidates = discoverCandidatePages(homepageUrl, [...homepage.links, ...browserPass.discoveredLinks])
    .filter((target) => isUrlAllowedByRobots(target.url, robotsState.policy))
    .sort((left, right) => right.priority - left.priority)
    .sort((left, right) => priorityForPage(right.pageType) - priorityForPage(left.pageType));

  const fetchedPagesByUrl = new Map(prefetchedPages.map((page) => [page.pageUrl, page]));
  const prioritizedCandidates = prioritizeUncoveredTargets({
    candidates,
    fetchedPages: [...fetchedPagesByUrl.values()]
  });
  const expansionTargets = selectTargets(prioritizedCandidates, expansionTargetCount);
  const expansionCoverageTargetTypes = getCoverageTargetTypes(candidates, expansionTargetCount);

  if (expansionTargetCount > 0 && !hasCoverageForTargetTypes([...fetchedPagesByUrl.values()], expansionCoverageTargetTypes)) {
    await fetchTargetsWithConcurrency({
      coverageTargetTypes: expansionCoverageTargetTypes,
      homepageUrl,
      concurrency: staticFetchConcurrency,
      fetchedPagesByUrl,
      robotsPolicy: robotsState.policy,
      targets: expansionTargets
    });
  }

  const fetchedPages = [...fetchedPagesByUrl.values()];
  const successfulPages = fetchedPages.filter((page) => page.fetchStatus === "ok" || page.fetchStatus === "redirected");
  const browserDiscoveredPageTypes = new Set(
    discoverCandidatePages(homepageUrl, browserPass.discoveredLinks)
      .map((candidate) => candidate.pageType)
      .filter((pageType) => pageType !== "homepage" && pageType !== "other")
  );
  const policyPages = policyPagesFromFetchedPages(successfulPages);
  const contactSignals = deriveContactSignals(successfulPages);
  const jurisdictionSignals = deriveJurisdictionAndIndustry(successfulPages, new URL(homepageUrl).hostname);
  const formSignals = deriveFormSignals(successfulPages);
  const techSignals = deriveTechSignals(successfulPages);
  const governanceSignals = deriveGovernanceSignals(successfulPages);
  const policySignals = derivePolicySignals(policyPages);
  const staticTrackers = dedupeTrackers(
    successfulPages.flatMap((page) =>
      detectTrackerVendorsFromStaticPage({
        pageHostname: new URL(page.pageUrl).hostname,
        pageText: `${page.textContent}\n${page.html}`,
        scanId: input.scanId,
        scripts: page.scripts
      })
    )
  );

  const allTrackers = dedupeTrackers([...staticTrackers, ...browserPass.trackerVendors]);
  const advertisingSignals = deriveAdvertisingClassification(allTrackers);
  const aiSignals = deriveAiInfrastructureSignals({
    pages: successfulPages,
    chatSupportVendor: techSignals.chatSupportVendor
  });
  const commercialSignals = deriveExpandedCommercialSignals(successfulPages);
  const trackerSummary = summarizeTrackers(allTrackers);
  const policyEnrichmentBundle = await enrichPolicyPages({
    scanId: input.scanId,
    organizationId: input.organizationId,
    domainId: input.domainId,
    pages: policyPages,
    advertisingTrackerCount: trackerSummary.advertisingTrackerCount,
    sessionReplayTrackerCount: trackerSummary.sessionReplayTrackerCount,
    euExposureLikely: jurisdictionSignals.euExposureLikely,
    californiaExposureLikely: jurisdictionSignals.californiaExposureLikely,
    archiveSource: null,
    forceLlm: !isPreviewScan
  });
  const accessibilitySummary = buildAccessibilitySummary(browserPass.ruleCounts);
  const accessibilityWidget = detectAccessibilityWidgetFromPages(successfulPages);
  const cmpVendor = browserPass.cmpVendorName ? { name: browserPass.cmpVendorName, confidence: browserPass.cmpVendorConfidence } : detectCmpVendorFromPage(homepage);
  const securityTxt = isPreviewScan
    ? null
    : await fetchTextPage(new URL("/.well-known/security.txt", homepageUrl).toString(), 5, {
        robotsPolicy: robotsState.policy
      }).catch(() => null);
  const homepageHeaders: Record<string, string> = homepage.headers;
  const runtimeArtifacts = {
    scanId: input.scanId,
    thirdPartyRequestDomains: browserPass.thirdPartyRequestDomains,
    thirdPartyRequestCount: browserPass.thirdPartyRequestCount,
    initialCookieNames: browserPass.initialCookieNames,
    initialCookieDomains: browserPass.initialCookieDomains,
    initialCookieCount: browserPass.initialCookieCount ?? 0,
    scriptSrcDomains: browserPass.scriptSrcDomains,
    scriptTagCount: browserPass.scriptTagCount,
    responseHeaders: homepageHeaders,
    domStructureHash: browserPass.domStructureHash,
    domNodeCount: browserPass.domNodeCount
  };
  const hostname = new URL(homepageUrl).hostname;
  const registeredDomain = getRegisteredDomain(hostname);
  const cachedDnsSignals = getCachedDnsSignals(input.previous?.snapshot ?? null);
  const cachedTlsMetadata = getCachedTlsMetadata(input.previous?.snapshot ?? null);
  const cachedDomainRegistration = getCachedDomainRegistration(input.previous?.snapshot ?? null);
  const [dnsSignals, tlsMetadata, domainRegistration] = isPreviewScan
    ? await Promise.all([
        Promise.resolve({
          dnssecEnabled: false,
          spfRecordPresent: false,
          dmarcRecordPresent: false,
          dkimRecordDetected: false
        }),
        Promise.resolve({
          tlsVersionMinSupported: null,
          certificateAuthority: null,
          certificateValidDaysRemaining: null,
          certificateAutoRenewLikely: null
        }),
        Promise.resolve({
          domainRegistrationYear: null,
          domainPrivacyProtectionEnabled: null
        })
      ])
    : await Promise.all([
        cachedDnsSignals ? Promise.resolve(cachedDnsSignals) : fetchDnsSignals(registeredDomain),
        cachedTlsMetadata ? Promise.resolve(cachedTlsMetadata) : fetchTlsMetadata(hostname),
        cachedDomainRegistration ? Promise.resolve(cachedDomainRegistration) : fetchDomainRegistration(registeredDomain)
      ]);
  const allText = successfulPages.map((page) => page.textContent).join("\n");
  const privacyPolicyPresent =
    policyPages.some((page) => page.pageType === "privacy_policy") || browserDiscoveredPageTypes.has("privacy_policy");
  const termsOfServicePresent =
    policyPages.some((page) => page.pageType === "terms_of_service") || browserDiscoveredPageTypes.has("terms_of_service");
  const cookiePolicyPresent =
    policyPages.some((page) => page.pageType === "cookie_policy") || browserDiscoveredPageTypes.has("cookie_policy");
  const accessibilityStatementPresent =
    policyPages.some((page) => page.pageType === "accessibility_statement") ||
    browserDiscoveredPageTypes.has("accessibility_statement");
  const refundPolicyPresent =
    policyPages.some((page) => page.pageType === "refund_policy") || browserDiscoveredPageTypes.has("refund_policy");
  const shippingPolicyPresent =
    policyPages.some((page) => page.pageType === "shipping_policy") || browserDiscoveredPageTypes.has("shipping_policy");
  const subscriptionTermsPresent =
    policyPages.some((page) => page.pageType === "subscription_terms") || browserDiscoveredPageTypes.has("subscription_terms");
  const affiliateDisclosurePresent =
    policyPages.some((page) => page.pageType === "affiliate_disclosure") ||
    browserDiscoveredPageTypes.has("affiliate_disclosure");
  const advertisingDisclosurePresent =
    policyPages.some((page) => page.pageType === "advertising_disclosure") ||
    browserDiscoveredPageTypes.has("advertising_disclosure");
  const contactPagePresent =
    successfulPages.some((page) => page.pageType === "contact") || browserDiscoveredPageTypes.has("contact");
  const snapshotBase: Omit<
    ScanSnapshot,
    | "accessibilityScore"
    | "accessibilityScoreAutomated"
    | "certscoreOverall"
    | "childrenPrivacyRiskScore"
    | "consumerProtectionScore"
    | "consentScore"
    | "dataCollectionRiskScore"
    | "disclosureSignalCount"
    | "highSeverityCount"
    | "lowSeverityCount"
    | "mediumSeverityCount"
    | "pagesRequested"
    | "pagesScanned"
    | "piiCollectionRiskScore"
    | "privacyScore"
    | "privacySignalCount"
    | "regulatoryExposureScore"
    | "totalSignals"
    | "trackerRiskScore"
    | "trackerVendorCount"
    | "transparencyScore"
    | "accessibilitySignalCount"
  > = {
    scanId: input.scanId,
    scannerSchemaVersion: 1,
    detectionEngineVersion: "heuristic-v1",
    organizationId: input.organizationId,
    domainId: input.domainId,
    policyEnrichmentId: null,
    domain: hostname,
    registeredDomain,
    scanTimestamp: new Date().toISOString(),
    crawlSource: input.crawlSource,
    crawlTier: input.requestedPageCount <= 3 ? "quick" : input.requestedPageCount > 10 ? "deep" : "standard",
    robotsAllowed: robotsState.robotsAllowed,
    robotsFetchStatus: robotsState.robotsFetchStatus,
    robotsFetchHttpStatus: robotsState.robotsFetchHttpStatus,
    robotsTxtHash: robotsState.robotsTxtHash,
    robotsCrawlDelayMs: robotsState.robotsCrawlDelayMs,
    robotsRulesLoaded: robotsState.robotsRulesLoaded,
    robotsGroupCount: robotsState.robotsGroupCount,
    robotsDirectiveCount: robotsState.robotsDirectiveCount,
    robotsHasAllowRules: robotsState.robotsHasAllowRules,
    robotsHasDisallowRules: robotsState.robotsHasDisallowRules,
    robotsTxtFetchedAt: robotsState.robotsTxtFetchedAt,
    robotsTxtUrl: robotsState.robotsTxtUrl,
    authWallDetected:
      homepage.statusCode === 401 ||
      homepage.statusCode === 403 ||
      /sign in to continue|login required|members only/i.test(homepage.textContent),
    homepageFetchStatus: homepage.fetchStatus,
    homepageFetchHttpStatus: homepage.statusCode,
    finalUrl: homepage.finalUrl,
    finalUrlScheme: homepage.finalUrl ? (homepage.finalUrl.startsWith("https://") ? "https" : "http") : null,
    redirectCount: homepage.redirected ? Math.max(homepage.redirectCount ?? 1, 1) : 0,
    renderModeUsed: browserPass.timedOut ? "http_only" : "http_then_browser",
    scanConfidence:
      successfulPages.length === 0 ? "low" : browserPass.timedOut || successfulPages.length < Math.max(1, input.requestedPageCount / 2) ? "medium" : "high",
    partialScan: successfulPages.length < Math.max(1, input.requestedPageCount),
    timeoutFlag: browserPass.timedOut,
    blockedFlag: homepage.fetchStatus === "blocked" || /access denied|blocked|forbidden/i.test(homepage.textContent),
    captchaFlag: /captcha|verify you are human/i.test(homepage.textContent),
    siteLanguagePrimary: homepage.language,
    countryInferred: jurisdictionSignals.countryInferred,
    regionStateInferred: jurisdictionSignals.regionStateInferred,
    jurisdictionGuess: jurisdictionSignals.jurisdictionGuess,
    euExposureLikely: jurisdictionSignals.euExposureLikely,
    californiaExposureLikely: jurisdictionSignals.californiaExposureLikely,
    childrenAudienceLikely: jurisdictionSignals.childrenAudienceLikely,
    kidDirectedContentDetected: jurisdictionSignals.kidDirectedContentDetected,
    healthcareSiteLikely: jurisdictionSignals.healthcareSiteLikely,
    financialServicesSiteLikely: jurisdictionSignals.financialServicesSiteLikely,
    ecommerceSiteLikely: jurisdictionSignals.ecommerceSiteLikely,
    saasSiteLikely: jurisdictionSignals.saasSiteLikely,
    educationSiteLikely: jurisdictionSignals.educationSiteLikely,
    multilingualSite: jurisdictionSignals.multilingualSite,
    mobileAppLinksDetected: jurisdictionSignals.mobileAppLinksDetected,
    privacyPolicyPresent,
    termsOfServicePresent,
    cookiePolicyPresent,
    accessibilityStatementPresent,
    refundPolicyPresent,
    shippingPolicyPresent,
    subscriptionTermsPresent,
    affiliateDisclosurePresent,
    advertisingDisclosurePresent,
    contactPagePresent,
    privacyContactMethodPresent: policySignals.privacyContactMethodPresent,
    doNotSellLinkPresent: policySignals.doNotSellLinkPresent,
    dsarRequestMechanismPresent: policySignals.dsarRequestMechanismPresent,
    subprocessorListPresent: policySignals.subprocessorListPresent,
    legalEntityNameDetected: contactSignals.legalEntityNameDetected,
    physicalBusinessAddressPresent: contactSignals.physicalBusinessAddressPresent,
    emailContactPublicPresent: contactSignals.emailContactPublicPresent,
    phoneNumberPublicPresent: contactSignals.phoneNumberPublicPresent,
    privacyEmailSpecificPresent: policySignals.privacyEmailSpecificPresent,
    dpoReferencePresent: policySignals.dpoReferencePresent,
    dpoEmailDetected: policySignals.dpoEmailDetected,
    entityJurisdictionDetected: policySignals.entityJurisdictionDetected,
    supervisoryAuthorityReferencePresent: policySignals.supervisoryAuthorityReferencePresent,
    privacyPolicyHash: policySignals.privacyPolicyHash,
    termsPolicyHash: policySignals.termsPolicyHash,
    cookiePolicyHash: policySignals.cookiePolicyHash,
    legalPagesPresenceHash: "",
    privacyPolicyLastUpdatedFound: policySignals.privacyPolicyLastUpdatedFound,
    privacyPolicyLastUpdatedDate: policySignals.privacyPolicyLastUpdatedDate,
    privacyPolicyWordCount: policySignals.privacyPolicyWordCount,
    privacyPolicyComplexityScore: policySignals.privacyPolicyComplexityScore,
    privacyLanguageReadabilityScore: policySignals.privacyLanguageReadabilityScore,
    policyChangeFrequencyScore: null,
    policyUpdateLagDays:
      policySignals.privacyPolicyLastUpdatedDate
        ? Math.max(0, Math.floor((Date.now() - Date.parse(policySignals.privacyPolicyLastUpdatedDate)) / (1000 * 60 * 60 * 24)))
        : null,
    mentionsGdpr: policySignals.mentionsGdpr,
    mentionsCcpaOrCpra: policySignals.mentionsCcpaOrCpra,
    mentionsCoppa: policySignals.mentionsCoppa,
    mentionsUnder13: policySignals.mentionsUnder13,
    mentionsUnder16: policySignals.mentionsUnder16,
    mentionsSensitiveData: policySignals.mentionsSensitiveData,
    mentionsBiometricData: policySignals.mentionsBiometricData,
    mentionsHealthData: policySignals.mentionsHealthData,
    mentionsFinancialData: policySignals.mentionsFinancialData,
    mentionsLocationData: policySignals.mentionsLocationData,
    mentionsDataRetention: policySignals.mentionsDataRetention,
    dataRetentionSpecificPeriodDetected: policySignals.dataRetentionSpecificPeriodDetected,
    mentionsDataSaleOrSharing: policySignals.mentionsDataSaleOrSharing,
    mentionsCrossBorderTransfer: policySignals.mentionsCrossBorderTransfer,
    crossBorderTransferMechanismDetected: policySignals.crossBorderTransferMechanismDetected,
    mentionsSubprocessorsOrVendors: policySignals.mentionsSubprocessorsOrVendors,
    mentionsAutomatedDecisioning: policySignals.mentionsAutomatedDecisioning,
    mentionsAiUsage: policySignals.mentionsAiUsage,
    doubleOptInReferencePresent: policySignals.doubleOptInReferencePresent,
    thirdPartyDisclosureSpecificity: policySignals.thirdPartyDisclosureSpecificity as ScanSnapshot["thirdPartyDisclosureSpecificity"],
    cookieBannerPresent: browserPass.cookieBannerPresent,
    consentMechanismType: browserPass.cookieBannerPresent
      ? cmpVendor?.name
        ? "cmp"
        : browserPass.granularPreferencesPresent
          ? "modal"
          : "banner"
      : "none",
    cmpVendorName: cmpVendor?.name ?? null,
    cmpVendorConfidence: cmpVendor?.confidence ?? null,
    rejectAllPresent: browserPass.rejectAllPresent,
    acceptAllPresent: browserPass.acceptAllPresent,
    granularPreferencesPresent: browserPass.granularPreferencesPresent,
    preconsentTrackingDetected: browserPass.preconsentTrackingDetected,
    cookiePolicyLinkedFromBanner: browserPass.cookiePolicyLinkedFromBanner,
    consentModeDetected: browserPass.consentModeDetected,
    darkPatternAcceptEmphasis: browserPass.darkPatternAcceptEmphasis,
    darkPatternRejectHidden: browserPass.darkPatternRejectHidden,
    darkPatternRejectButtonMissing: browserPass.darkPatternRejectButtonMissing,
    darkPatternAcceptButtonProminence: browserPass.darkPatternAcceptButtonProminence,
    precheckedConsentBoxes: browserPass.precheckedConsentBoxes,
    darkPatternForcedConsentWall: browserPass.darkPatternForcedConsentWall,
    darkPatternAcceptOnlyBanner: browserPass.darkPatternAcceptOnlyBanner,
    darkPatternDismissWithoutReject: browserPass.darkPatternDismissWithoutReject,
    darkPatternCountdownTimerPresent: browserPass.darkPatternCountdownTimerPresent,
    darkPatternFakeScarcityLanguage: browserPass.darkPatternFakeScarcityLanguage,
    consentSignatureHash: "",
    consentPersistenceMechanismDetected: browserPass.consentPersistenceMechanismDetected,
    consentBannerLayoutType: browserPass.consentBannerLayoutType,
    consentBannerPosition: browserPass.consentBannerPosition,
    defaultTrackingState: browserPass.defaultTrackingState,
    cookieCategoryCount: browserPass.cookieCategoryCount,
    consentMaturityScore: null,
    trackerCountTotal: trackerSummary.trackerCountTotal,
    analyticsTrackerCount: trackerSummary.analyticsTrackerCount,
    advertisingTrackerCount: trackerSummary.advertisingTrackerCount,
    socialTrackerCount: trackerSummary.socialTrackerCount,
    sessionReplayTrackerCount: trackerSummary.sessionReplayTrackerCount,
    tagManagerPresent: trackerSummary.tagManagerPresent,
    firstPartyAnalyticsOnly: trackerSummary.firstPartyAnalyticsOnly,
    adtechStackComplexityScore: trackerSummary.adtechStackComplexityScore,
    fingerprintingOrIdentityVendorDetected: trackerSummary.fingerprintingOrIdentityVendorDetected,
    trackerVendorSetHash: trackerSummary.trackerVendorSetHash,
    trackerCategorySetHash: trackerSummary.trackerCategorySetHash,
    trackerVendorConcentrationScore: trackerSummary.trackerVendorConcentrationScore,
    trackerDiversityScore: trackerSummary.trackerDiversityScore,
    thirdPartyScriptDomainCount: techSignals.thirdPartyScriptDomainCount,
    thirdPartyScriptRiskScore: null,
    thirdPartyDataFlowRiskScore: null,
    trackerRegulatoryRiskScore: null,
    trackerAdoptionChangeDetected: null,
    cookieCountTotal: browserPass.cookieCountTotal,
    thirdPartyCookieCount: browserPass.thirdPartyCookieCount,
    firstPartyCookieSetBeforeConsent: browserPass.firstPartyCookieSetBeforeConsent,
    thirdPartyCookieSetBeforeConsent: browserPass.thirdPartyCookieSetBeforeConsent,
    trackingBeforeConsentDetected: browserPass.trackingBeforeConsentDetected,
    formCountTotal: formSignals.formCountTotal,
    contactFormPresent: formSignals.contactFormPresent,
    newsletterSignupPresent: formSignals.newsletterSignupPresent,
    accountSignupPresent: formSignals.accountSignupPresent,
    loginPagePresent: formSignals.loginPagePresent,
    passwordResetPresent: formSignals.passwordResetPresent,
    checkoutOrPaymentFormPresent: formSignals.checkoutOrPaymentFormPresent,
    fileUploadFieldPresent: formSignals.fileUploadFieldPresent,
    emailInputPresent: formSignals.emailInputPresent,
    phoneInputPresent: formSignals.phoneInputPresent,
    addressInputPresent: formSignals.addressInputPresent,
    paymentCardInputPresent: formSignals.paymentCardInputPresent,
    dateOfBirthInputPresent: formSignals.dateOfBirthInputPresent,
    formCollectsSsn: formSignals.formCollectsSsn,
    formCollectsGovernmentId: formSignals.formCollectsGovernmentId,
    formCollectsHealthInformation: formSignals.formCollectsHealthInformation,
    formCollectsFinancialInformation: formSignals.formCollectsFinancialInformation,
    formCollectsBirthdate: formSignals.formCollectsBirthdate,
    formCollectsGeolocation: formSignals.formCollectsGeolocation,
    ageGatePresent: formSignals.ageGatePresent,
    ageVerificationMechanismType: formSignals.ageVerificationMechanismType,
    parentalConsentReferencePresent: formSignals.parentalConsentReferencePresent,
    sensitiveDataFormHintsPresent: formSignals.sensitiveDataFormHintsPresent,
    formsSignatureHash: formSignals.formsSignatureHash,
    formDataSensitivityScore: null,
    dataMinimizationScore: null,
    highSensitivityDataCollectionDetected: formSignals.highSensitivityDataCollectionDetected,
    privacyRequestFormPresent: policySignals.privacyRequestFormPresent || contactSignals.privacyRequestFormPresent,
    dataAccessRequestPresent: policySignals.dataAccessRequestPresent,
    dataDeletionRequestPresent: policySignals.dataDeletionRequestPresent,
    privacyContactChannelType: formSignals.privacyContactChannelType as ScanSnapshot["privacyContactChannelType"],
    consentWithdrawalMechanismPresent: formSignals.consentWithdrawalMechanismPresent,
    userRightsFrictionScore: null,
    wcagErrorCountTotal: accessibilitySummary.wcagErrorCountTotal,
    wcagWarningCountTotal: accessibilitySummary.wcagWarningCountTotal,
    wcagContrastFailuresCount: accessibilitySummary.wcagContrastFailuresCount,
    wcagMissingAltCount: accessibilitySummary.wcagMissingAltCount,
    wcagFormLabelErrorCount: accessibilitySummary.wcagFormLabelErrorCount,
    wcagAriaErrorCount: accessibilitySummary.wcagAriaErrorCount,
    wcagHeadingStructureErrorCount: accessibilitySummary.wcagHeadingStructureErrorCount,
    wcagLinkNameErrorCount: accessibilitySummary.wcagLinkNameErrorCount,
    wcagKeyboardNavigationIssueCount: accessibilitySummary.wcagKeyboardNavigationIssueCount,
    wcagFocusIndicatorIssueCount: accessibilitySummary.wcagFocusIndicatorIssueCount,
    wcagLandmarkIssueCount: accessibilitySummary.wcagLandmarkIssueCount,
    accessibilityWidgetPresent: Boolean(browserPass.widgetVendor ?? accessibilityWidget?.name ?? techSignals.accessibilityWidgetVendor),
    accessibilityWidgetVendor: browserPass.widgetVendor ?? accessibilityWidget?.name ?? techSignals.accessibilityWidgetVendor,
    vpatOrAccessibilityConformanceDocPresent: /vpat|accessibility conformance report/i.test(allText),
    accessibilityContactMethodPresent: contactSignals.accessibilityContactMethodPresent,
    accessibilitySignatureHash: accessibilitySummary.accessibilitySignatureHash,
    subscriptionOfferDetected: commercialSignals.subscriptionTermsPresent,
    autoRenewDisclosurePresent: commercialSignals.autoRenewDisclosurePresent,
    autoRenewalDisclosurePresent: commercialSignals.autoRenewDisclosurePresent,
    subscriptionCancellationPolicyPresent: commercialSignals.subscriptionCancellationPolicyPresent,
    cancellationPolicyPresent: commercialSignals.subscriptionCancellationPolicyPresent,
    unsubscribeMechanismPresent: /unsubscribe|manage preferences|opt out/i.test(allText),
    freeTrialDetected: commercialSignals.freeTrialDetected,
    refundOrReturnWindowDetected: /\b\d{1,3}\s*(day|days)\b.{0,20}(refund|return)/i.test(allText),
    shippingTermsDetected: /shipping policy|delivery times|shipping rates/i.test(allText),
    disputeResolutionOrArbitrationPresent: /arbitration|dispute resolution/i.test(allText),
    testimonialOrReviewDisclosurePresent: /results may vary|sponsored|paid testimonial/i.test(allText),
    adNetworkGoogleAds: advertisingSignals.adNetworkGoogleAds,
    adNetworkMetaAds: advertisingSignals.adNetworkMetaAds,
    retargetingPixelDetected: advertisingSignals.retargetingPixelDetected,
    sessionReplayToolDetected: advertisingSignals.sessionReplayToolDetected,
    aiChatbotPresent: aiSignals.aiChatbotPresent,
    aiChatbotVendor: aiSignals.aiChatbotVendor,
    aiAssistantWidgetDetected: aiSignals.aiAssistantWidgetDetected,
    aiDisclosureTextPresent: aiSignals.aiDisclosureTextPresent,
    aiTermsOrPolicyAiReference: aiSignals.aiTermsOrPolicyAiReference,
    aiHelpCenterAiReference: aiSignals.aiHelpCenterAiReference,
    aiSearchOrAnswerExperienceDetected: aiSignals.aiSearchOrAnswerExperienceDetected,
    aiHiringAutomationSignalDetected: aiSignals.aiHiringAutomationSignalDetected,
    securityTxtPresent: Boolean(securityTxt?.status && securityTxt.status >= 200 && securityTxt.status < 300),
    vulnerabilityDisclosurePagePresent: governanceSignals.vulnerabilityDisclosurePagePresent,
    trustCenterPresent: governanceSignals.trustCenterPresent,
    incidentStatusPagePresent: governanceSignals.incidentStatusPagePresent,
    responsibleDisclosurePresent: /responsible disclosure|security contact/i.test(`${securityTxt?.body ?? ""}\n${allText}`),
    bugBountyProgramPresent: /bug bounty|hackerone|bugcrowd/i.test(`${securityTxt?.body ?? ""}\n${allText}`),
    hstsEnabled: "strict-transport-security" in homepage.headers ? Boolean(homepage.headers["strict-transport-security"]) : false,
    httpsEnforced: (homepage.finalUrl ?? homepage.pageUrl).startsWith("https://"),
    mixedContentDetected: browserPass.mixedContentDetected,
    lawEnforcementRequestPolicyPresent: policySignals.lawEnforcementRequestPolicyPresent,
    transparencyReportPresent: policySignals.transparencyReportPresent,
    cspHeaderPresent: "content-security-policy" in homepageHeaders,
    xFrameOptionsPresent: "x-frame-options" in homepageHeaders,
    referrerPolicyPresent: "referrer-policy" in homepageHeaders,
    permissionsPolicyPresent: "permissions-policy" in homepageHeaders,
    cspReportEndpointPresent:
      typeof homepageHeaders["content-security-policy"] === "string" &&
      /report-uri|report-to/i.test(homepageHeaders["content-security-policy"]),
    securityHeadersScore: null,
    tlsVersionMinSupported: tlsMetadata.tlsVersionMinSupported,
    certificateAuthority: tlsMetadata.certificateAuthority,
    certificateValidDaysRemaining: tlsMetadata.certificateValidDaysRemaining,
    certificateAutoRenewLikely: tlsMetadata.certificateAutoRenewLikely,
    dnssecEnabled: dnsSignals.dnssecEnabled,
    spfRecordPresent: dnsSignals.spfRecordPresent,
    dmarcRecordPresent: dnsSignals.dmarcRecordPresent,
    dkimRecordDetected: dnsSignals.dkimRecordDetected,
    cmsPlatform: techSignals.cmsPlatform,
    ecommercePlatform: techSignals.ecommercePlatform,
    frontendFramework: techSignals.frontendFramework,
    hostingOrCdnProvider: techSignals.hostingOrCdnProvider,
    cdnProvider: techSignals.cdnProvider,
    edgeSecurityProvider: techSignals.edgeSecurityProvider,
    tagManagerVendor: allTrackers.find((tracker) => tracker.vendorCategory === "tag_manager")?.vendorName ?? null,
    paymentProcessorHints: techSignals.paymentProcessorHints,
    chatSupportVendor: techSignals.chatSupportVendor,
    serviceWorkerDetected: browserPass.serviceWorkerDetected ?? techSignals.serviceWorkerDetected,
    publicApiEndpointDetected: techSignals.publicApiEndpointDetected,
    siteSizeHint: inferSiteSizeHint(successfulPages.length),
    homepageStructuredHash: homepageStructuredHash(homepage),
    digitalMaturityScore: null,
    domainRegistrationYear: domainRegistration.domainRegistrationYear,
    domainAgeYears:
      domainRegistration.domainRegistrationYear === null ? null : Math.max(0, new Date().getUTCFullYear() - domainRegistration.domainRegistrationYear),
    domainPrivacyProtectionEnabled: domainRegistration.domainPrivacyProtectionEnabled,
    trafficTierEstimate: null,
    requestDomainSetChanged: null,
    scriptDomainSetChanged: null,
    securityHeaderPostureChanged: null,
    infrastructureChangeDetected: null,
    policyBehaviorConflictDetected: null,
    sessionReplayWithoutDisclosureDetected: null,
    accessibilityClaimVsRealityGapDetected: null,
    complianceTrendScore: null,
    wcagLevelClaimed: null,
    accessibilityRemediationLikely: null,
    accessibilityClaimAccuracyScore: null,
    accessibilityClaimMismatchDetected: null,
    accessibilityLitigationRiskScore: null,
    adaDemandLetterProbability: null,
    legalCoverageScore: null,
    complianceMaturityTier: null
  };

  const partiallyBuiltSnapshot: ScanSnapshot = {
    ...snapshotBase,
    ...policyEnrichmentBundle.snapshotOverrides,
    domainId: input.domainId,
    pagesRequested: input.requestedPageCount,
    pagesScanned: successfulPages.length,
    totalSignals: 0,
    accessibilitySignalCount: 0,
    privacySignalCount: 0,
    disclosureSignalCount: 0,
    highSeverityCount: 0,
    mediumSeverityCount: 0,
    lowSeverityCount: 0,
    trackerVendorCount: trackerSummary.trackerCountTotal,
    certscoreOverall: 0,
    privacyScore: 0,
    consentScore: 0,
    trackerRiskScore: 0,
    accessibilityScore: 0,
    dataCollectionRiskScore: 0,
    consumerProtectionScore: 0,
    childrenPrivacyRiskScore: 0,
    regulatoryExposureScore: 0,
    piiCollectionRiskScore: 0,
    accessibilityScoreAutomated: 0,
    transparencyScore: 0
  };

  partiallyBuiltSnapshot.legalPagesPresenceHash = policyPresenceHash(partiallyBuiltSnapshot);
  partiallyBuiltSnapshot.consentSignatureHash = consentSignatureHash({
    acceptAllPresent: partiallyBuiltSnapshot.acceptAllPresent,
    cmpVendorName: partiallyBuiltSnapshot.cmpVendorName,
    cookieBannerPresent: partiallyBuiltSnapshot.cookieBannerPresent,
    cookiePolicyLinkedFromBanner: partiallyBuiltSnapshot.cookiePolicyLinkedFromBanner,
    granularPreferencesPresent: partiallyBuiltSnapshot.granularPreferencesPresent,
    rejectAllPresent: partiallyBuiltSnapshot.rejectAllPresent
  });
  partiallyBuiltSnapshot.formDataSensitivityScore = Math.max(
    partiallyBuiltSnapshot.paymentCardInputPresent ? 35 : 0,
    partiallyBuiltSnapshot.dateOfBirthInputPresent ? 20 : 0,
    partiallyBuiltSnapshot.highSensitivityDataCollectionDetected ? 45 : 0,
    partiallyBuiltSnapshot.addressInputPresent ? 12 : 0,
    partiallyBuiltSnapshot.phoneInputPresent ? 10 : 0,
    partiallyBuiltSnapshot.emailInputPresent ? 8 : 0
  );
  partiallyBuiltSnapshot.dataMinimizationScore = Math.max(
    0,
    100 -
      partiallyBuiltSnapshot.formCountTotal * 8 -
      (partiallyBuiltSnapshot.emailInputPresent ? 8 : 0) -
      (partiallyBuiltSnapshot.phoneInputPresent ? 10 : 0) -
      (partiallyBuiltSnapshot.addressInputPresent ? 12 : 0) -
      (partiallyBuiltSnapshot.paymentCardInputPresent ? 18 : 0) -
      (partiallyBuiltSnapshot.highSensitivityDataCollectionDetected ? 20 : 0)
  );
  partiallyBuiltSnapshot.userRightsFrictionScore =
    (partiallyBuiltSnapshot.privacyContactChannelType === "none" ? 45 : 0) +
    (partiallyBuiltSnapshot.privacyRequestFormPresent ? 0 : 10) +
    (partiallyBuiltSnapshot.dataAccessRequestPresent ? 0 : 15) +
    (partiallyBuiltSnapshot.dataDeletionRequestPresent ? 0 : 15) +
    (partiallyBuiltSnapshot.consentWithdrawalMechanismPresent ? 0 : 15);
  partiallyBuiltSnapshot.consentMaturityScore = Math.max(
    0,
    Math.min(
      100,
      (partiallyBuiltSnapshot.cookieBannerPresent ? 25 : 0) +
        (partiallyBuiltSnapshot.rejectAllPresent ? 20 : 0) +
        (partiallyBuiltSnapshot.granularPreferencesPresent ? 20 : 0) +
        (partiallyBuiltSnapshot.cookieCategoryCount ? Math.min(20, partiallyBuiltSnapshot.cookieCategoryCount * 4) : 0) +
        (partiallyBuiltSnapshot.consentPersistenceMechanismDetected ? 15 : 0) -
        (partiallyBuiltSnapshot.darkPatternAcceptEmphasis ? 10 : 0) -
        (partiallyBuiltSnapshot.darkPatternRejectHidden ? 10 : 0)
    )
  );
  partiallyBuiltSnapshot.thirdPartyScriptRiskScore = Math.min(
    100,
    (partiallyBuiltSnapshot.thirdPartyScriptDomainCount ?? 0) * 7 + partiallyBuiltSnapshot.sessionReplayTrackerCount * 8
  );
  partiallyBuiltSnapshot.thirdPartyDataFlowRiskScore = Math.min(
    100,
    partiallyBuiltSnapshot.advertisingTrackerCount * 12 +
      partiallyBuiltSnapshot.sessionReplayTrackerCount * 14 +
      (partiallyBuiltSnapshot.thirdPartyCookieCount ?? 0) * 6
  );
  partiallyBuiltSnapshot.trackerRegulatoryRiskScore = Math.min(
    100,
    partiallyBuiltSnapshot.trackerRiskScore +
      (partiallyBuiltSnapshot.preconsentTrackingDetected ? 15 : 0) +
      (partiallyBuiltSnapshot.sessionReplayTrackerCount > 0 ? 10 : 0)
  );
  partiallyBuiltSnapshot.securityHeadersScore = deriveSecurityHeadersScore(partiallyBuiltSnapshot);
  partiallyBuiltSnapshot.wcagLevelClaimed =
    /wcag\s*2\.[12]\s*aaa/i.test(allText)
      ? "AAA"
      : /wcag\s*2\.[12]\s*aa/i.test(allText)
        ? "AA"
        : /wcag\s*2\.[12]\s*a/i.test(allText)
          ? "A"
          : "unknown";
  partiallyBuiltSnapshot.accessibilityRemediationLikely =
    partiallyBuiltSnapshot.accessibilityStatementPresent ||
    partiallyBuiltSnapshot.accessibilityWidgetPresent ||
    partiallyBuiltSnapshot.vpatOrAccessibilityConformanceDocPresent;
  partiallyBuiltSnapshot.accessibilityClaimMismatchDetected =
    partiallyBuiltSnapshot.wcagLevelClaimed !== "unknown" && partiallyBuiltSnapshot.wcagErrorCountTotal > 10;
  partiallyBuiltSnapshot.accessibilityClaimAccuracyScore = Math.max(
    0,
    100 - partiallyBuiltSnapshot.wcagErrorCountTotal * 3 - (partiallyBuiltSnapshot.accessibilityClaimMismatchDetected ? 25 : 0)
  );
  partiallyBuiltSnapshot.accessibilityLitigationRiskScore = Math.min(
    100,
    partiallyBuiltSnapshot.wcagErrorCountTotal * 2 +
      partiallyBuiltSnapshot.wcagMissingAltCount * 3 +
      partiallyBuiltSnapshot.wcagFormLabelErrorCount * 4 +
      (partiallyBuiltSnapshot.accessibilityStatementPresent ? -10 : 10)
  );
  partiallyBuiltSnapshot.adaDemandLetterProbability = Math.max(0, Math.min(100, partiallyBuiltSnapshot.accessibilityLitigationRiskScore));
  partiallyBuiltSnapshot.digitalMaturityScore = Math.max(
    0,
    Math.min(
      100,
      (partiallyBuiltSnapshot.cmsPlatform ? 12 : 0) +
        (partiallyBuiltSnapshot.frontendFramework ? 16 : 0) +
        ((partiallyBuiltSnapshot.paymentProcessorHints.length > 0 ? 1 : 0) * 12) +
        (partiallyBuiltSnapshot.serviceWorkerDetected ? 12 : 0) +
        ((partiallyBuiltSnapshot.trackerCountTotal > 0 ? 1 : 0) * 10) +
        (partiallyBuiltSnapshot.cookieBannerPresent ? 8 : 0) +
        ((partiallyBuiltSnapshot.formCountTotal > 0 ? 1 : 0) * 10) +
        ((partiallyBuiltSnapshot.publicApiEndpointDetected ? 1 : 0) * 10)
    )
  );
  partiallyBuiltSnapshot.trafficTierEstimate =
    partiallyBuiltSnapshot.digitalMaturityScore >= 70 || partiallyBuiltSnapshot.siteSizeHint === "large"
      ? "high"
      : partiallyBuiltSnapshot.digitalMaturityScore >= 45 || partiallyBuiltSnapshot.siteSizeHint === "medium"
        ? "medium"
        : "low";
  partiallyBuiltSnapshot.policyBehaviorConflictDetected = derivePolicyBehaviorConflictDetected(partiallyBuiltSnapshot);
  partiallyBuiltSnapshot.sessionReplayWithoutDisclosureDetected =
    partiallyBuiltSnapshot.sessionReplayTrackerCount > 0 && partiallyBuiltSnapshot.thirdPartyDisclosureSpecificity !== "named_vendors";
  partiallyBuiltSnapshot.accessibilityClaimVsRealityGapDetected = partiallyBuiltSnapshot.accessibilityClaimMismatchDetected;
  partiallyBuiltSnapshot.trackerAdoptionChangeDetected = input.previous
    ? (() => {
        const currentSet = new Set(allTrackers.map((tracker) => tracker.vendorName));
        const previousSet = new Set(input.previous.trackers.map((tracker) => tracker.vendorName));

        if (currentSet.size === 0 && previousSet.size === 0) {
          return false;
        }

        return (
          [...currentSet].some((value) => !previousSet.has(value)) ||
          [...previousSet].some((value) => !currentSet.has(value))
        );
      })()
    : null;
  const infrastructureChangeSignals = deriveInfrastructureChangeSignals({
    currentRequestDomains: runtimeArtifacts.thirdPartyRequestDomains,
    currentScriptDomains: runtimeArtifacts.scriptSrcDomains,
    currentResponseHeaders: homepageHeaders,
    previousRequestDomains: input.previous?.runtimeArtifacts?.thirdPartyRequestDomains ?? null,
    previousScriptDomains: input.previous?.runtimeArtifacts?.scriptSrcDomains ?? null,
    previousResponseHeaders: input.previous?.runtimeArtifacts?.responseHeaders ?? null
  });
  partiallyBuiltSnapshot.requestDomainSetChanged = infrastructureChangeSignals.requestDomainSetChanged;
  partiallyBuiltSnapshot.scriptDomainSetChanged = infrastructureChangeSignals.scriptDomainSetChanged;
  partiallyBuiltSnapshot.securityHeaderPostureChanged = infrastructureChangeSignals.securityHeaderPostureChanged;
  partiallyBuiltSnapshot.infrastructureChangeDetected = infrastructureChangeSignals.infrastructureChangeDetected;
  partiallyBuiltSnapshot.legalCoverageScore = [
    partiallyBuiltSnapshot.privacyPolicyPresent,
    partiallyBuiltSnapshot.termsOfServicePresent,
    partiallyBuiltSnapshot.cookiePolicyPresent,
    partiallyBuiltSnapshot.contactPagePresent,
    partiallyBuiltSnapshot.refundPolicyPresent,
    partiallyBuiltSnapshot.shippingPolicyPresent,
    partiallyBuiltSnapshot.subscriptionTermsPresent
  ].filter(Boolean).length * 14;
  partiallyBuiltSnapshot.complianceMaturityTier =
    (partiallyBuiltSnapshot.digitalMaturityScore ?? 0) >= 75 && partiallyBuiltSnapshot.legalCoverageScore >= 70
      ? "enterprise"
      : (partiallyBuiltSnapshot.digitalMaturityScore ?? 0) >= 55
        ? "mature"
        : (partiallyBuiltSnapshot.digitalMaturityScore ?? 0) >= 35
          ? "structured"
          : "basic";

  const scores = scoreSnapshot(partiallyBuiltSnapshot);
  const snapshotWithScores: ScanSnapshot = {
    ...partiallyBuiltSnapshot,
    ...scores
  };
  snapshotWithScores.trackerRegulatoryRiskScore = Math.min(
    100,
    snapshotWithScores.trackerRiskScore +
      (snapshotWithScores.preconsentTrackingDetected ? 15 : 0) +
      (snapshotWithScores.sessionReplayTrackerCount > 0 ? 10 : 0)
  );
  const compatibilitySignals = projectSnapshotSignals(snapshotWithScores, allTrackers);
  const byCategory = compatibilitySignals.reduce<Record<string, number>>((accumulator, signal) => {
    accumulator[signal.category] = (accumulator[signal.category] ?? 0) + 1;
    return accumulator;
  }, {});
  const severityCounts = estimateSeverityCounts(snapshotWithScores);
  const finalSnapshot: ScanSnapshot = {
    ...snapshotWithScores,
    totalSignals: compatibilitySignals.length,
    accessibilitySignalCount: byCategory.accessibility ?? 0,
    privacySignalCount: byCategory.privacy ?? 0,
    disclosureSignalCount: byCategory.disclosure ?? 0,
    highSeverityCount: severityCounts.highSeverityCount,
    mediumSeverityCount: severityCounts.mediumSeverityCount,
    lowSeverityCount: severityCounts.lowSeverityCount,
    trackerVendorCount: allTrackers.length
  };

  return {
    runtimeArtifacts,
    snapshot: finalSnapshot,
    scanPlan,
    policyEnrichments: policyEnrichmentBundle.enrichments,
    policyEvidence: policyEnrichmentBundle.evidences,
    policyReviewQueueItems: policyEnrichmentBundle.reviewQueueItems,
    trackerVendors: allTrackers,
    accessibilityRuleCounts: browserPass.ruleCounts,
    pages: fetchedPages.map((page) => buildPageMetadata(input.scanId, page)),
    compatibilitySignals
  };
}
