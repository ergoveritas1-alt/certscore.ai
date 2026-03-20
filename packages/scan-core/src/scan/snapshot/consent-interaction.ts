import type { BrowserContextOptions, Page } from "playwright";
import type { ConsentInteractionEvidenceStep } from "@website-signal-risk-scanner/shared";
import { createAdminClient } from "@website-signal-risk-scanner/db";
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
  authWallDetected: boolean;
  baseline: ConsentInteractionStageResult;
  acceptNewTrackerVendorNames: string[];
  consentFrictionDelta: number | null;
  consentRedirectOrAuthRequired: boolean | null;
  evidenceLog: string[];
  externalRedirectDetected: boolean;
  finalUrl: string;
  optInEvidenceLog: ConsentInteractionEvidenceStep[];
  optInClicks: number | null;
  optOutEvidenceLog: ConsentInteractionEvidenceStep[];
  optOutClicks: number | null;
  postAccept: ConsentInteractionStageResult;
  postReject: ConsentInteractionStageResult;
  rejectNewTrackerVendorNames: string[];
  rejectPersistedTrackerVendorNames: string[];
  winningProbeProfile: string | null;
};

type ConsentButtonCandidate = {
  index: number;
  role: "accept" | "reject" | "preferences" | "dismiss" | "unknown";
  selectorHint: string | null;
  text: string;
};

type ConsentToggleCandidate = {
  checked: boolean;
  index: number;
  selectorHint: string | null;
  text: string;
};

type ConsentPathExecutionResult = {
  authWallDetected: boolean;
  clicked: boolean;
  clickCount: number | null;
  evidenceLog: ConsentInteractionEvidenceStep[];
  externalRedirectDetected: boolean;
  redirectOrAuthRequired: boolean;
};

type ConsentPathSessionResult = {
  baseline: ConsentInteractionStageResult;
  finalUrl: string;
  postStage: ConsentInteractionStageResult;
  path: ConsentPathExecutionResult;
};

const CONSENT_AUDIT_STAGE_TIMEOUT_MS = 25_000;
const CONSENT_AUDIT_HARD_TIMEOUT_MS = 70_000;
const MAX_ACCEPT_CLICKS = 5;
const MAX_OPT_OUT_CLICKS = 8;
const MAX_TOGGLES = 5;
const MAX_PREFERENCES_DESCENTS = 1;
const SAVE_PATTERNS = [/save/, /confirm/, /apply/, /submit/, /allow selection/, /selection/, /continue/, /done/];
const NON_ESSENTIAL_CATEGORY_PATTERNS = [
  /analytics/,
  /marketing/,
  /advertising/,
  /targeting/,
  /performance/,
  /personalization/,
  /social/,
  /measurement/
];
const AUTH_WALL_PATTERNS =
  /sign in|log in|login|create account|authentication required|member access|continue with account|account required/i;

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
  intersection,
  detectPathBlockers,
  isAuthWallText(text: string) {
    return AUTH_WALL_PATTERNS.test(text);
  },
  isNonEssentialToggleLabel(text: string) {
    return NON_ESSENTIAL_CATEGORY_PATTERNS.some((pattern) => pattern.test(text.toLowerCase()));
  },
  isSaveAction(text: string) {
    return SAVE_PATTERNS.some((pattern) => pattern.test(text.toLowerCase()));
  },
  performAcceptPath,
  performRejectPath
};

async function persistConsentAuditDiagnostic(input: {
  scanId?: string;
  domainId?: string;
  organizationId?: string | null;
  stage: string;
  status: "start" | "ok" | "timeout" | "error";
  metadata?: Record<string, unknown>;
}) {
  console.info("[consent-audit]", {
    metadata: {
      stage: input.stage,
      status: input.status,
      ...(input.metadata ?? {})
    },
    scanId: input.scanId ?? null
  });

  if (!input.scanId) {
    return;
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("scan_events").insert({
      scan_id: input.scanId,
      domain_id: input.domainId ?? null,
      organization_id: input.organizationId ?? null,
      event_type: "runtime.consent_audit_diagnostic",
      message: `Consent audit ${input.stage} ${input.status}.`,
      metadata_json: {
        stage: input.stage,
        status: input.status,
        ...(input.metadata ?? {})
      }
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("[consent-audit] failed to persist diagnostic", {
      error: error instanceof Error ? error.message : "Unknown error",
      scanId: input.scanId
    });
  }
}

async function withConsentTimeout<T>(
  timeoutMs: number,
  label: string,
  callback: () => Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      callback(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
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

async function collectButtonCandidates(page: Page): Promise<ConsentButtonCandidate[]> {
  return page
    .locator("button, a, [role='button'], input[type='button'], input[type='submit']")
    .evaluateAll((elements) =>
      elements
        .map((element, index) => {
          const htmlElement = element as HTMLElement;
          const tag = element.tagName.toLowerCase();
          const id = element.getAttribute("id");
          const ariaLabel = element.getAttribute("aria-label");
          const classes = [...element.classList].slice(0, 2);
          const selectorHint = id
            ? `${tag}#${id}`
            : ariaLabel
              ? `${tag}[aria-label="${ariaLabel}"]`
              : classes.length > 0
                ? `${tag}.${classes.join(".")}`
                : htmlElement.getAttribute("name")
                  ? `${tag}[name="${htmlElement.getAttribute("name")}"]`
                  : tag;
          const text = (
            element.textContent ??
            htmlElement.getAttribute("aria-label") ??
            htmlElement.getAttribute("value") ??
            ""
          )
            .replace(/\s+/g, " ")
            .trim();
          const style = window.getComputedStyle(htmlElement);
          const visible =
            text.length > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            htmlElement.getBoundingClientRect().width > 0 &&
            htmlElement.getBoundingClientRect().height > 0;

          return {
            index,
            selectorHint,
            text,
            visible
          };
        })
        .filter((candidate) => candidate.visible)
    )
    .then((candidates) =>
      candidates.map((candidate) => ({
        index: candidate.index,
        role: classifyConsentButtonRole(candidate.text),
        selectorHint: candidate.selectorHint,
        text: candidate.text
      }))
    )
    .catch(() => []);
}

async function collectToggleCandidates(page: Page): Promise<ConsentToggleCandidate[]> {
  return page
    .locator("input[type='checkbox'], [role='switch'], [aria-checked]")
    .evaluateAll((elements) =>
      elements
        .map((element, index) => {
          const htmlElement = element as HTMLElement;
          const inputElement = element as HTMLInputElement;
          const tag = element.tagName.toLowerCase();
          const id = element.getAttribute("id");
          const ariaLabel = element.getAttribute("aria-label");
          const classes = [...element.classList].slice(0, 2);
          const selectorHint = id
            ? `${tag}#${id}`
            : ariaLabel
              ? `${tag}[aria-label="${ariaLabel}"]`
              : classes.length > 0
                ? `${tag}.${classes.join(".")}`
                : htmlElement.getAttribute("name")
                  ? `${tag}[name="${htmlElement.getAttribute("name")}"]`
                  : tag;
          const style = window.getComputedStyle(htmlElement);
          const visible =
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            htmlElement.getBoundingClientRect().width > 0 &&
            htmlElement.getBoundingClientRect().height > 0;

          const checked =
            element.getAttribute("aria-checked") === "true" ||
            inputElement.checked === true ||
            htmlElement.getAttribute("aria-pressed") === "true";
          const labelText =
            htmlElement.closest("label")?.textContent ??
            htmlElement.getAttribute("aria-label") ??
            htmlElement.parentElement?.textContent ??
            "";

          return {
            checked,
            index,
            selectorHint,
            text: labelText.replace(/\s+/g, " ").trim(),
            visible
          };
        })
        .filter((candidate) => candidate.visible && candidate.text.length > 0)
    )
    .catch(() => []);
}

async function detectPathBlockers(page: Page, startHost: string) {
  const currentUrl = page.url();
  let externalRedirectDetected = false;

  try {
    const currentHost = new URL(currentUrl).hostname;
    externalRedirectDetected = Boolean(startHost) && currentHost !== startHost;
  } catch {
    externalRedirectDetected = false;
  }

  const authWallDetected = await page
    .evaluate(() => {
      const bodyText = document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "";
      const passwordInputVisible = [...document.querySelectorAll("input[type='password']")].some((element) => {
        const htmlElement = element as HTMLElement;
        const style = window.getComputedStyle(htmlElement);
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          htmlElement.getBoundingClientRect().width > 0 &&
          htmlElement.getBoundingClientRect().height > 0
        );
      });

      return passwordInputVisible || AUTH_WALL_PATTERNS.test(bodyText);
    })
    .catch(() => false);

  return {
    authWallDetected,
    externalRedirectDetected,
    redirectOrAuthRequired: authWallDetected || externalRedirectDetected
  };
}

function pushEvidenceStep(
  evidenceLog: ConsentInteractionEvidenceStep[],
  input: {
    action: ConsentInteractionEvidenceStep["action"];
    selectorHint: string | null;
    text: string;
    urlAfterClick: string | null;
  }
) {
  evidenceLog.push({
    action: input.action,
    selectorHint: input.selectorHint,
    stepIndex: evidenceLog.length + 1,
    text: input.text,
    urlAfterClick: input.urlAfterClick
  });
}

async function clickButtonCandidate(page: Page, candidate: ConsentButtonCandidate) {
  const locator = page.locator("button, a, [role='button'], input[type='button'], input[type='submit']").nth(candidate.index);
  await locator.click({ timeout: 2_500 });
}

async function clickToggleCandidate(page: Page, candidate: ConsentToggleCandidate) {
  const locator = page.locator("input[type='checkbox'], [role='switch'], [aria-checked]").nth(candidate.index);
  await locator.click({ timeout: 2_500 });
}

async function performAcceptPath(
  page: Page,
  startHost: string,
  waitForSettle: (maxWaitMs: number) => Promise<void>
): Promise<ConsentPathExecutionResult> {
  const evidenceLog: ConsentInteractionEvidenceStep[] = [];
  let authWallDetected = false;
  let externalRedirectDetected = false;
  let redirectOrAuthRequired = false;

  for (const candidate of await collectButtonCandidates(page)) {
    if (candidate.role !== "accept") {
      continue;
    }

    try {
      await clickButtonCandidate(page, candidate);
      await waitForSettle(2_000);
      pushEvidenceStep(evidenceLog, {
        action: "accept",
        selectorHint: candidate.selectorHint,
        text: candidate.text,
        urlAfterClick: page.url()
      });
      const blockers = await detectPathBlockers(page, startHost);
      authWallDetected = blockers.authWallDetected;
      externalRedirectDetected = blockers.externalRedirectDetected;
      redirectOrAuthRequired = blockers.redirectOrAuthRequired;
      return {
        authWallDetected,
        clicked: true,
        clickCount: evidenceLog.length,
        evidenceLog,
        externalRedirectDetected,
        redirectOrAuthRequired
      };
    } catch {
      continue;
    }
  }

  return {
    authWallDetected,
    clicked: false,
    clickCount: null,
    evidenceLog,
    externalRedirectDetected,
    redirectOrAuthRequired
  };
}

async function performRejectPath(
  page: Page,
  startHost: string,
  waitForSettle: (maxWaitMs: number) => Promise<void>
): Promise<ConsentPathExecutionResult> {
  const evidenceLog: ConsentInteractionEvidenceStep[] = [];
  let authWallDetected = false;
  let externalRedirectDetected = false;
  let redirectOrAuthRequired = false;
  let preferencesDescents = 0;

  const clickDirectReject = async () => {
    for (const candidate of await collectButtonCandidates(page)) {
      if (candidate.role !== "reject") {
        continue;
      }

      try {
        await clickButtonCandidate(page, candidate);
        await waitForSettle(2_000);
        pushEvidenceStep(evidenceLog, {
          action: "reject",
          selectorHint: candidate.selectorHint,
          text: candidate.text,
          urlAfterClick: page.url()
        });
        const blockers = await detectPathBlockers(page, startHost);
        authWallDetected ||= blockers.authWallDetected;
        externalRedirectDetected ||= blockers.externalRedirectDetected;
        redirectOrAuthRequired ||= blockers.redirectOrAuthRequired;
        return true;
      } catch {
        continue;
      }
    }

    return false;
  };

  if (await clickDirectReject()) {
    return {
      authWallDetected,
      clicked: true,
      clickCount: evidenceLog.length,
      evidenceLog,
      externalRedirectDetected,
      redirectOrAuthRequired
    };
  }

  while (preferencesDescents < MAX_PREFERENCES_DESCENTS && evidenceLog.length < MAX_OPT_OUT_CLICKS) {
    const preferencesCandidate = (await collectButtonCandidates(page)).find((candidate) => candidate.role === "preferences");
    if (!preferencesCandidate) {
      break;
    }

    try {
      await clickButtonCandidate(page, preferencesCandidate);
      await waitForSettle(2_000);
      pushEvidenceStep(evidenceLog, {
        action: "preferences",
        selectorHint: preferencesCandidate.selectorHint,
        text: preferencesCandidate.text,
        urlAfterClick: page.url()
      });
      const blockers = await detectPathBlockers(page, startHost);
      authWallDetected ||= blockers.authWallDetected;
      externalRedirectDetected ||= blockers.externalRedirectDetected;
      redirectOrAuthRequired ||= blockers.redirectOrAuthRequired;
      preferencesDescents += 1;
    } catch {
      break;
    }

    if (await clickDirectReject()) {
      return {
        authWallDetected,
        clicked: true,
        clickCount: evidenceLog.length,
        evidenceLog,
        externalRedirectDetected,
        redirectOrAuthRequired
      };
    }

    const toggles = (await collectToggleCandidates(page)).filter(
      (candidate) => candidate.checked && NON_ESSENTIAL_CATEGORY_PATTERNS.some((pattern) => pattern.test(candidate.text.toLowerCase()))
    );
    for (const toggle of toggles.slice(0, MAX_TOGGLES)) {
      if (evidenceLog.length >= MAX_OPT_OUT_CLICKS) {
        break;
      }

      try {
        await clickToggleCandidate(page, toggle);
        await waitForSettle(800);
        pushEvidenceStep(evidenceLog, {
          action: "toggle",
          selectorHint: toggle.selectorHint,
          text: toggle.text,
          urlAfterClick: page.url()
        });
        const blockers = await detectPathBlockers(page, startHost);
        authWallDetected ||= blockers.authWallDetected;
        externalRedirectDetected ||= blockers.externalRedirectDetected;
        redirectOrAuthRequired ||= blockers.redirectOrAuthRequired;
      } catch {
        continue;
      }
    }

    const saveCandidate = (await collectButtonCandidates(page)).find(
      (candidate) =>
        candidate.role === "reject" ||
        SAVE_PATTERNS.some((pattern) => pattern.test(candidate.text.toLowerCase()))
    );
    if (!saveCandidate) {
      break;
    }

    try {
      await clickButtonCandidate(page, saveCandidate);
      await waitForSettle(2_000);
      pushEvidenceStep(evidenceLog, {
        action: saveCandidate.role === "reject" ? "reject" : "save",
        selectorHint: saveCandidate.selectorHint,
        text: saveCandidate.text,
        urlAfterClick: page.url()
      });
      const blockers = await detectPathBlockers(page, startHost);
      authWallDetected ||= blockers.authWallDetected;
      externalRedirectDetected ||= blockers.externalRedirectDetected;
      redirectOrAuthRequired ||= blockers.redirectOrAuthRequired;
      return {
        authWallDetected,
        clicked: true,
        clickCount: evidenceLog.length,
        evidenceLog,
        externalRedirectDetected,
        redirectOrAuthRequired
      };
    } catch {
      break;
    }
  }

  return {
    authWallDetected,
    clicked: evidenceLog.some((step) => step.action !== "preferences"),
    clickCount: evidenceLog.length > 0 ? evidenceLog.length : null,
    evidenceLog,
    externalRedirectDetected,
    redirectOrAuthRequired
  };
}

async function captureStage(input: {
  context: Awaited<ReturnType<typeof createBrowser>>["context"];
  domain: string;
  requestUrls: Set<string>;
  stage: ConsentInteractionStage;
}): Promise<ConsentInteractionStageResult> {
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
    clickCount: null,
    interactionSucceeded: input.stage === "baseline" ? true : input.requestUrls.size > 0 || cookies.length > 0,
    cookieCount: cookies.length,
    thirdPartyCookieCount: cookies.filter((cookie) => !(cookie.domain === input.domain || cookie.domain.endsWith(`.${input.domain}`))).length,
    trackerEvidenceUrls,
    trackerVendorNames
  };
}

async function runConsentPathSession(input: {
  contextOptions?: BrowserContextOptions;
  domain: string;
  domainId?: string;
  organizationId?: string | null;
  path: "accept" | "reject";
  planWaitMs: number;
  profileName?: string;
  scanId?: string;
  startUrl: string;
}): Promise<ConsentPathSessionResult> {
  const browserHandle = await createBrowser({
    contextOptions: input.contextOptions
  });
  const page = await browserHandle.context.newPage();
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

  const waitForSettle = (maxWaitMs: number) =>
    waitForRuntimeQuiet(page, {
      getBannerDetected: () => detectConsentSurface(page),
      getInflightRequests: () => inflightRequests,
      getLastNetworkActivityAt: () => lastNetworkActivityAt,
      maxWaitMs
    });

  await navigateWithPolicy({
    page,
    robotsPolicy: null,
    url: input.startUrl
  });

  await waitForSettle(input.planWaitMs);

  const currentUrl = page.url() || input.startUrl;
  const domainHost = new URL(currentUrl).hostname;
  const baseline = await captureStage({
    context: browserHandle.context,
    domain: domainHost,
    requestUrls: new Set(requestUrls),
    stage: "baseline"
  });

  requestUrls.clear();
  const pathResult =
    input.path === "reject"
      ? await performRejectPath(page, domainHost, waitForSettle)
      : await performAcceptPath(page, domainHost, waitForSettle);

  const postStage = await captureStage({
    context: browserHandle.context,
    domain: domainHost,
    requestUrls: new Set(requestUrls),
    stage: input.path === "reject" ? "post_reject" : "post_accept"
  });
  postStage.interactionSucceeded = pathResult.clicked;
  postStage.clickCount = pathResult.clickCount;

  const finalUrl = page.url() || currentUrl;

  await page.close().catch(() => undefined);
  await browserHandle.context.close().catch(() => undefined);
  await browserHandle.browser.close().catch(() => undefined);

  return {
    baseline,
    finalUrl,
    path: pathResult,
    postStage
  };
}

async function runSingleConsentInteractionAudit(input: {
  contextOptions?: BrowserContextOptions;
  domain: string;
  domainId?: string;
  organizationId?: string | null;
  profileName?: string;
  scanId?: string;
}): Promise<Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">> {
  const startedAt = Date.now();
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
  const finalUrl = homepage.finalUrl ?? startUrl;

  const runStage = async <T>(stage: string, callback: () => Promise<T>, timeoutMs = CONSENT_AUDIT_STAGE_TIMEOUT_MS) => {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > CONSENT_AUDIT_HARD_TIMEOUT_MS) {
      await persistConsentAuditDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId ?? null,
        stage,
        status: "timeout",
        metadata: {
          elapsedMs,
          profileName: input.profileName ?? null
        }
      });
      throw new Error(`Consent audit hard timeout exceeded after ${elapsedMs}ms during ${stage}.`);
    }

    await persistConsentAuditDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId ?? null,
      stage,
      status: "start",
      metadata: {
        elapsedMs,
        profileName: input.profileName ?? null
      }
    });

    try {
      const result = await withConsentTimeout(timeoutMs, `Consent audit ${stage}`, callback);
      await persistConsentAuditDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId ?? null,
        stage,
        status: "ok",
        metadata: {
          elapsedMs: Date.now() - startedAt,
          profileName: input.profileName ?? null
        }
      });
      return result;
    } catch (error) {
      await persistConsentAuditDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId ?? null,
        stage,
        status: /timed out/i.test(error instanceof Error ? error.message : "") ? "timeout" : "error",
        metadata: {
          elapsedMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : "Unknown error",
          profileName: input.profileName ?? null
        }
      });
      throw error;
    }
  };

  const rejectSession = await runStage("reject_path_session", () =>
    runConsentPathSession({
      contextOptions: input.contextOptions,
      domain: input.domain,
      domainId: input.domainId,
      organizationId: input.organizationId ?? null,
      path: "reject",
      planWaitMs: plan.browserPostLoadWaitMs,
      profileName: input.profileName,
      scanId: input.scanId,
      startUrl: finalUrl
    })
  );

  const acceptSession = await runStage("accept_path_session", () =>
    runConsentPathSession({
      contextOptions: input.contextOptions,
      domain: input.domain,
      domainId: input.domainId,
      organizationId: input.organizationId ?? null,
      path: "accept",
      planWaitMs: plan.browserPostLoadWaitMs,
      profileName: input.profileName,
      scanId: input.scanId,
      startUrl: finalUrl
    })
  );

  return {
    authWallDetected: rejectSession.path.authWallDetected,
    acceptNewTrackerVendorNames: difference(acceptSession.postStage.trackerVendorNames, acceptSession.baseline.trackerVendorNames),
    baseline: rejectSession.baseline,
    consentFrictionDelta:
      rejectSession.path.clickCount !== null && acceptSession.path.clickCount !== null
        ? rejectSession.path.clickCount - acceptSession.path.clickCount
        : null,
    consentRedirectOrAuthRequired: rejectSession.path.redirectOrAuthRequired ? true : false,
    evidenceLog: [
      ...acceptSession.path.evidenceLog.map((step) => `opt-in step ${step.stepIndex}: ${step.text}`),
      ...rejectSession.path.evidenceLog.map((step) => `opt-out step ${step.stepIndex}: ${step.text}`)
    ],
    externalRedirectDetected: rejectSession.path.externalRedirectDetected,
    finalUrl: acceptSession.finalUrl || rejectSession.finalUrl,
    optInClicks: acceptSession.path.clickCount,
    optInEvidenceLog: acceptSession.path.evidenceLog.slice(0, MAX_ACCEPT_CLICKS),
    optOutClicks: rejectSession.path.clickCount,
    optOutEvidenceLog: rejectSession.path.evidenceLog.slice(0, MAX_OPT_OUT_CLICKS),
    postAccept: acceptSession.postStage,
    postReject: rejectSession.postStage,
    rejectNewTrackerVendorNames: difference(rejectSession.postStage.trackerVendorNames, rejectSession.baseline.trackerVendorNames),
    rejectPersistedTrackerVendorNames: intersection(rejectSession.postStage.trackerVendorNames, rejectSession.baseline.trackerVendorNames)
  };
}

export async function runConsentInteractionAudit(
  domain: string,
  input?: {
    domainId?: string;
    organizationId?: string | null;
    profileSweep?: boolean;
    scanId?: string;
  }
): Promise<ConsentInteractionAudit> {
  const profiles = input?.profileSweep === false ? [{ name: "desktop_default", contextOptions: {} }] : getConsentProbeProfiles();
  const attemptedProbeProfiles: string[] = [];
  let winningProbeProfile = profiles[0]?.name ?? null;
  let winningAudit = await runSingleConsentInteractionAudit({
    domain,
    contextOptions: profiles[0]?.contextOptions,
    domainId: input?.domainId,
    organizationId: input?.organizationId ?? null,
    profileName: profiles[0]?.name,
    scanId: input?.scanId
  });
  if (profiles[0]) {
    attemptedProbeProfiles.push(profiles[0].name);
  }

  const winnerScore = (audit: Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">) =>
    (audit.postReject.interactionSucceeded ? 4 : 0) +
    (audit.postAccept.interactionSucceeded ? 2 : 0) +
    (audit.optOutClicks ? 1 : 0) +
    ((audit.consentFrictionDelta ?? 0) > 0 ? 2 : 0) +
    (audit.consentRedirectOrAuthRequired ? 2 : 0) +
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
        contextOptions: profile.contextOptions,
        domainId: input?.domainId,
        organizationId: input?.organizationId ?? null,
        profileName: profile.name,
        scanId: input?.scanId
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
export type ConsentSymmetryEvidence = {
  authWallDetected: boolean;
  clickDelta: number | null;
  evidenceLog: string[];
  externalRedirectDetected: boolean;
  optInClicks: number | null;
  optOutClicks: number | null;
};
