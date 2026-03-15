import type { BrowserContextOptions, Page } from "playwright";
import { createBrowser } from "../browser/create-browser";
import { navigateWithPolicy } from "../browser/navigate-with-policy";
import { shouldContinueRuntimeWait } from "./browser-stability";
import { classifyConsentButtonRole } from "./consent-ui";
import { getConsentProbeProfiles } from "./consent-profiles";
import { buildScanPlan } from "./scan-planner";
import { analyzeVendorRequestMatch, TRACKER_VENDOR_SIGNATURES } from "./signature-registry";
import { fetchStaticPage } from "./extractors";

export type ConsentInteractionStage = "baseline" | "post_reject" | "post_accept";

export type ConsentInteractionStageResult = {
  cookieCount: number;
  clickCount: number | null;
  interactionSucceeded: boolean;
  stage: ConsentInteractionStage;
  thirdPartyCookieCount: number;
  trackerEvidenceUrls: string[];
  trackerVendorNames: string[];
};

export type ConsentInteractionAudit = {
  attemptedProbeProfiles: string[];
  baseline: ConsentInteractionStageResult;
  acceptNewTrackerVendorNames: string[];
  finalUrl: string;
  postAccept: ConsentInteractionStageResult;
  postReject: ConsentInteractionStageResult;
  rejectNewTrackerVendorNames: string[];
  rejectPersistedTrackerVendorNames: string[];
  winningProbeProfile: string | null;
};

function difference(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

function intersection(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).sort();
}

export const __test = {
  difference,
  intersection
};

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

async function waitForRuntimeQuiet(page: Page, input: {
  getBannerDetected: () => Promise<boolean>;
  getInflightRequests: () => number;
  getLastNetworkActivityAt: () => number;
  maxWaitMs: number;
}) {
  const startedAt = Date.now();
  const minWaitMs = Math.min(500, input.maxWaitMs);
  const quietWindowMs = input.maxWaitMs >= 1_800 ? 700 : 500;

  while (true) {
    const now = Date.now();
    const elapsedMs = now - startedAt;
    const shouldContinue = shouldContinueRuntimeWait({
      bannerDetected: await input.getBannerDetected(),
      elapsedMs,
      inflightRequests: input.getInflightRequests(),
      lastActivityElapsedMs: now - input.getLastNetworkActivityAt(),
      maxWaitMs: input.maxWaitMs,
      minWaitMs,
      quietWindowMs
    });

    if (!shouldContinue) {
      return;
    }

    await page.waitForTimeout(100);
  }
}

async function clickConsentRole(page: Page, role: "reject" | "accept") {
  const candidates = await page
    .locator("button, a, [role='button'], input[type='button'], input[type='submit']")
    .evaluateAll((elements) =>
      elements.map((element, index) => ({
        index,
        text: (element.textContent ?? element.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim()
      }))
    )
    .catch(() => []);

  for (const candidate of candidates) {
    if (classifyConsentButtonRole(candidate.text) !== role) {
      continue;
    }

    const locator = page.locator("button, a, [role='button'], input[type='button'], input[type='submit']").nth(candidate.index);
    try {
      await locator.click({ timeout: 2_500 });
      return { clicked: true, clickCount: 1 };
    } catch {
      continue;
    }
  }

  return { clicked: false, clickCount: null };
}

async function captureStage(input: {
  context: Awaited<ReturnType<typeof createBrowser>>["context"];
  domain: string;
  requestUrls: Set<string>;
  stage: ConsentInteractionStage;
}) : Promise<ConsentInteractionStageResult> {
  const cookies = await input.context.cookies().catch(() => []);
  const matchedTrackerEvidence = TRACKER_VENDOR_SIGNATURES.flatMap((signature) => {
    const matchedUrls = [...input.requestUrls]
      .map((url) => ({ url, match: analyzeVendorRequestMatch(url, signature, input.domain) }))
      .filter((entry) => entry.match);

    if (matchedUrls.length === 0) {
      return [];
    }

    return [
      {
        urls: matchedUrls.map((entry) => entry.url),
        vendorName: signature.name
      }
    ];
  });
  const trackerVendorNames = matchedTrackerEvidence.map((entry) => entry.vendorName).sort();
  const trackerEvidenceUrls = [...new Set(matchedTrackerEvidence.flatMap((entry) => entry.urls))].sort().slice(0, 10);

  return {
    stage: input.stage,
    clickCount: input.stage === "baseline" ? null : null,
    interactionSucceeded: input.stage === "baseline" ? true : input.requestUrls.size > 0 || cookies.length > 0,
    cookieCount: cookies.length,
    thirdPartyCookieCount: cookies.filter((cookie) => !(cookie.domain === input.domain || cookie.domain.endsWith(`.${input.domain}`))).length,
    trackerEvidenceUrls,
    trackerVendorNames
  };
}

async function runSingleConsentInteractionAudit(input: {
  contextOptions?: BrowserContextOptions;
  domain: string;
}): Promise<Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">> {
  const startUrl =
    input.domain.startsWith("http://") || input.domain.startsWith("https://") ? input.domain : `https://${input.domain}`;
  const homepage = await fetchStaticPage({
    pageType: "homepage",
    url: startUrl
  });
  const plan = buildScanPlan({
    homepage,
    requestedPageCount: 1,
    robotsCrawlDelayMs: null
  });
  const browserHandle = await createBrowser({
    contextOptions: input.contextOptions
  });
  const page = await browserHandle.context.newPage();
  const finalUrl = homepage.finalUrl ?? startUrl;
  const domainHost = new URL(finalUrl).hostname;
  let inflightRequests = 0;
  let lastNetworkActivityAt = Date.now();
  const requestUrls = new Set<string>();

  page.on("request", (request) => {
    inflightRequests += 1;
    lastNetworkActivityAt = Date.now();
    requestUrls.add(request.url());
  });
  const markSettled = () => {
    inflightRequests = Math.max(0, inflightRequests - 1);
    lastNetworkActivityAt = Date.now();
  };
  page.on("requestfinished", markSettled);
  page.on("requestfailed", markSettled);

  await navigateWithPolicy({
    page,
    robotsPolicy: null,
    url: finalUrl
  });

  await waitForRuntimeQuiet(page, {
    getBannerDetected: () => detectConsentSurface(page),
    getInflightRequests: () => inflightRequests,
    getLastNetworkActivityAt: () => lastNetworkActivityAt,
    maxWaitMs: plan.browserPostLoadWaitMs
  });

  const baseline = await captureStage({
    context: browserHandle.context,
    domain: domainHost,
    requestUrls: new Set(requestUrls),
    stage: "baseline"
  });

  requestUrls.clear();
  const rejectClick = await clickConsentRole(page, "reject");
  if (rejectClick.clicked) {
    await waitForRuntimeQuiet(page, {
      getBannerDetected: () => detectConsentSurface(page),
      getInflightRequests: () => inflightRequests,
      getLastNetworkActivityAt: () => lastNetworkActivityAt,
      maxWaitMs: 2_500
    });
  }
  const postReject = await captureStage({
    context: browserHandle.context,
    domain: domainHost,
    requestUrls,
    stage: "post_reject"
  });
  postReject.interactionSucceeded = rejectClick.clicked;
  postReject.clickCount = rejectClick.clickCount;

  requestUrls.clear();
  const acceptClick = await clickConsentRole(page, "accept");
  if (acceptClick.clicked) {
    await waitForRuntimeQuiet(page, {
      getBannerDetected: () => detectConsentSurface(page),
      getInflightRequests: () => inflightRequests,
      getLastNetworkActivityAt: () => lastNetworkActivityAt,
      maxWaitMs: 2_500
    });
  }
  const postAccept = await captureStage({
    context: browserHandle.context,
    domain: domainHost,
    requestUrls,
    stage: "post_accept"
  });
  postAccept.interactionSucceeded = acceptClick.clicked;
  postAccept.clickCount = acceptClick.clickCount;

  await page.close().catch(() => undefined);
  await browserHandle.context.close().catch(() => undefined);
  await browserHandle.browser.close().catch(() => undefined);

  return {
    acceptNewTrackerVendorNames: difference(postAccept.trackerVendorNames, baseline.trackerVendorNames),
    finalUrl,
    baseline,
    postReject,
    postAccept,
    rejectNewTrackerVendorNames: difference(postReject.trackerVendorNames, baseline.trackerVendorNames),
    rejectPersistedTrackerVendorNames: intersection(postReject.trackerVendorNames, baseline.trackerVendorNames)
  };
}

export async function runConsentInteractionAudit(
  domain: string,
  input?: {
    profileSweep?: boolean;
  }
): Promise<ConsentInteractionAudit> {
  const profiles = input?.profileSweep === false ? [{ name: "desktop_default", contextOptions: {} }] : getConsentProbeProfiles();
  const attemptedProbeProfiles: string[] = [];
  let winningProbeProfile = profiles[0]?.name ?? null;
  let winningAudit = await runSingleConsentInteractionAudit({
    domain,
    contextOptions: profiles[0]?.contextOptions
  });
  if (profiles[0]) {
    attemptedProbeProfiles.push(profiles[0].name);
  }

  const winnerScore = (audit: Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">) =>
    (audit.postReject.interactionSucceeded ? 4 : 0) +
    (audit.postAccept.interactionSucceeded ? 2 : 0) +
    (audit.postReject.clickCount ? 1 : 0) +
    audit.postReject.trackerVendorNames.length;

  if (
    input?.profileSweep !== false &&
    !winningAudit.postReject.interactionSucceeded &&
    !winningAudit.postAccept.interactionSucceeded
  ) {
    let bestScore = winnerScore(winningAudit);

    for (const profile of profiles.slice(1)) {
      attemptedProbeProfiles.push(profile.name);
      const candidateAudit = await runSingleConsentInteractionAudit({
        domain,
        contextOptions: profile.contextOptions
      });
      const candidateScore = winnerScore(candidateAudit);
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        winningAudit = candidateAudit;
        winningProbeProfile = profile.name;
      }

      if (candidateAudit.postReject.interactionSucceeded || candidateAudit.postAccept.interactionSucceeded) {
        break;
      }
    }
  }

  return {
    ...winningAudit,
    attemptedProbeProfiles,
    winningProbeProfile
  };
}
