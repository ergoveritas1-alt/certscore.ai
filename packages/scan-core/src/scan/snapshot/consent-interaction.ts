import type { BrowserContextOptions, Page } from "playwright";
import type { ConsentInteractionEvidenceStep } from "@website-signal-risk-scanner/shared";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import { createBrowser } from "../browser/create-browser";
import { navigateWithPolicy } from "../browser/navigate-with-policy";
import { persistRuntimeArtifactsPatch } from "../persistence/save-snapshot-bundle";
import { shouldContinueRuntimeWait } from "./browser-stability";
import { classifyConsentButtonRole } from "./consent-ui";
import { getConsentProbeProfiles } from "./consent-profiles";
import { buildScanPlan } from "./scan-planner";
import { analyzeVendorRequestMatch, TRACKER_VENDOR_SIGNATURES } from "./signature-registry";
import { fetchStaticPage } from "./extractors";

export type ConsentInteractionStage = "baseline" | "post_reject" | "post_accept";
export type ConsentBlockerType = "auth_wall" | "external_redirect" | "extra_click_path";

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
  consentBlockerPageTitle: string | null;
  consentBlockerTextSnippet: string | null;
  consentBlockerType: ConsentBlockerType | null;
  consentBlockerUrl: string | null;
  consentEvidencePassCount: number | null;
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
  blockerPageTitle: string | null;
  blockerTextSnippet: string | null;
  blockerType: ConsentBlockerType | null;
  blockerUrl: string | null;
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

function buildAuthWallSnippet(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return null;
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const matchedSentence = sentences.find((sentence) => AUTH_WALL_PATTERNS.test(sentence));
  if (matchedSentence) {
    return matchedSentence.slice(0, 220);
  }

  const match = normalized.match(AUTH_WALL_PATTERNS);
  if (!match || typeof match.index !== "number") {
    return normalized.slice(0, 220);
  }

  const start = Math.max(0, match.index - 60);
  const end = Math.min(normalized.length, match.index + match[0].length + 120);
  return normalized.slice(start, end).trim();
}

function normalizeAuditEntrypoints(primaryUrl: string, fallbackUrls: string[]) {
  return [primaryUrl, ...fallbackUrls]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .filter((value, index, values) => values.indexOf(value) === index);
}

function difference(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

function intersection(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).sort();
}

export const __test = {
  buildAuthWallSnippet,
  buildConsentRuntimeArtifactsPatch,
  difference,
  intersection,
  countMatchingEvidencePasses,
  detectPathBlockers,
  deriveConcreteFrictionEvidence,
  finalizeConsentAudit,
  isAuthWallText(text: string) {
    return AUTH_WALL_PATTERNS.test(text);
  },
  normalizeAuditEntrypoints,
  isNonEssentialToggleLabel(text: string) {
    return NON_ESSENTIAL_CATEGORY_PATTERNS.some((pattern) => pattern.test(text.toLowerCase()));
  },
  isSaveAction(text: string) {
    return SAVE_PATTERNS.some((pattern) => pattern.test(text.toLowerCase()));
  },
  chooseBestAudit,
  chooseBestAvailableAudit,
  performAcceptPath,
  performRejectPath
};

function chooseBestAvailableAudit(
  audits: Array<Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile"> | null>
) {
  const completedAudits = audits.filter(
    (audit): audit is Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile"> => Boolean(audit)
  );

  if (completedAudits.length === 0) {
    return null;
  }

  return chooseBestAudit(completedAudits);
}

function finalizeConsentAudit(input: {
  attemptedProbeProfiles: string[];
  audits: Array<Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">>;
  winningAudit: Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">;
  winningProbeProfile: string | null;
}): ConsentInteractionAudit {
  const evidencePassCount = countMatchingEvidencePasses(input.audits, input.winningAudit);

  return {
    ...input.winningAudit,
    consentEvidencePassCount: evidencePassCount > 0 ? evidencePassCount : null,
    attemptedProbeProfiles: input.attemptedProbeProfiles,
    winningProbeProfile: input.winningProbeProfile
  };
}

function buildConsentRuntimeArtifactsPatch(audit: ConsentInteractionAudit) {
  return {
    consentAcceptClickCount: audit.postAccept.clickCount,
    consentAcceptInteractionSucceeded: audit.postAccept.interactionSucceeded,
    consentAcceptNewTrackerVendorNames: audit.acceptNewTrackerVendorNames,
    consentAuditCompleted: true,
    consentBaselineCookieCount: audit.baseline.cookieCount,
    consentBaselineThirdPartyCookieCount: audit.baseline.thirdPartyCookieCount,
    consentBlockerPageTitle: audit.consentBlockerPageTitle,
    consentBlockerTextSnippet: audit.consentBlockerTextSnippet,
    consentBlockerType: audit.consentBlockerType,
    consentBlockerUrl: audit.consentBlockerUrl,
    consentEvidencePassCount: audit.consentEvidencePassCount,
    consentFrictionDelta: audit.consentFrictionDelta,
    consentOptInClicks: audit.optInClicks,
    consentOptInEvidenceLog: audit.optInEvidenceLog,
    consentOptOutClicks: audit.optOutClicks,
    consentOptOutEvidenceLog: audit.optOutEvidenceLog,
    consentPostAcceptCookieCount: audit.postAccept.cookieCount,
    consentPostAcceptThirdPartyCookieCount: audit.postAccept.thirdPartyCookieCount,
    consentPostAcceptTrackerEvidenceUrls: audit.postAccept.trackerEvidenceUrls,
    consentPostAcceptTrackerVendorNames: audit.postAccept.trackerVendorNames,
    consentPostRejectCookieCount: audit.postReject.cookieCount,
    consentPostRejectThirdPartyCookieCount: audit.postReject.thirdPartyCookieCount,
    consentPostRejectTrackerEvidenceUrls: audit.postReject.trackerEvidenceUrls,
    consentPostRejectTrackerVendorNames: audit.postReject.trackerVendorNames,
    consentRedirectOrAuthRequired: audit.consentRedirectOrAuthRequired,
    consentRejectClickCount: audit.postReject.clickCount,
    consentRejectInteractionSucceeded: audit.postReject.interactionSucceeded,
    consentRejectNewTrackerVendorNames: audit.rejectNewTrackerVendorNames,
    consentRejectPersistedTrackerVendorNames: audit.rejectPersistedTrackerVendorNames,
    consentRejectReducedThirdPartyCookies: audit.postReject.thirdPartyCookieCount < audit.baseline.thirdPartyCookieCount,
    consentRejectReducedTracking: audit.postReject.trackerVendorNames.length < audit.baseline.trackerVendorNames.length
  };
}

async function persistBestEffortConsentAudit(input: {
  attemptedProbeProfiles: string[];
  audits: Array<Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">>;
  domainId?: string;
  organizationId?: string | null;
  scanId?: string;
  winningProbeProfile: string | null;
}) {
  if (!input.scanId || input.audits.length === 0) {
    return;
  }

  const winningAudit = chooseBestAudit(input.audits);
  const finalizedAudit = finalizeConsentAudit({
    attemptedProbeProfiles: input.attemptedProbeProfiles,
    audits: input.audits,
    winningAudit,
    winningProbeProfile: input.winningProbeProfile
  });

  try {
    await persistRuntimeArtifactsPatch({
      domainId: input.domainId ?? null,
      organizationId: input.organizationId ?? null,
      runtimeArtifacts: buildConsentRuntimeArtifactsPatch(finalizedAudit),
      scanId: input.scanId
    });
  } catch (error) {
    console.error("[consent-audit] failed to persist best-effort consent evidence", {
      error: error instanceof Error ? error.message : "Unknown error",
      scanId: input.scanId
    });
  }
}

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

async function detectPathBlockers(
  page: Page,
  startHost: string
): Promise<{
  authWallDetected: boolean;
  blockerPageTitle: string | null;
  blockerTextSnippet: string | null;
  blockerType: ConsentBlockerType | null;
  blockerUrl: string | null;
  externalRedirectDetected: boolean;
  redirectOrAuthRequired: boolean;
}> {
  const currentUrl = page.url();
  let externalRedirectDetected = false;

  try {
    const currentHost = new URL(currentUrl).hostname;
    externalRedirectDetected = Boolean(startHost) && currentHost !== startHost;
  } catch {
    externalRedirectDetected = false;
  }

  const pageSignals = await page
    .evaluate((authWallPatternSource) => {
      const authWallPattern = new RegExp(authWallPatternSource, "i");
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

      return {
        authWallDetected: passwordInputVisible || authWallPattern.test(bodyText),
        bodyText,
        title: document.title?.trim() ?? ""
      };
    }, AUTH_WALL_PATTERNS.source)
    .catch(() => ({
      authWallDetected: false,
      bodyText: "",
      title: ""
    }));

  const authWallDetected = pageSignals.authWallDetected;
  const blockerType: ConsentBlockerType | null = authWallDetected ? "auth_wall" : externalRedirectDetected ? "external_redirect" : null;

  return {
    authWallDetected,
    blockerPageTitle: pageSignals.title.length > 0 ? pageSignals.title : null,
    blockerTextSnippet: authWallDetected ? buildAuthWallSnippet(pageSignals.bodyText) : null,
    blockerType,
    blockerUrl: blockerType ? currentUrl : null,
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
  let blockerPageTitle: string | null = null;
  let blockerTextSnippet: string | null = null;
  let blockerType: ConsentBlockerType | null = null;
  let blockerUrl: string | null = null;
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
      blockerPageTitle = blockers.blockerPageTitle;
      blockerTextSnippet = blockers.blockerTextSnippet;
      blockerType = blockers.blockerType;
      blockerUrl = blockers.blockerUrl;
      externalRedirectDetected = blockers.externalRedirectDetected;
      redirectOrAuthRequired = blockers.redirectOrAuthRequired;
      return {
        authWallDetected,
        blockerPageTitle,
        blockerTextSnippet,
        blockerType,
        blockerUrl,
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
    blockerPageTitle,
    blockerTextSnippet,
    blockerType,
    blockerUrl,
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
  let blockerPageTitle: string | null = null;
  let blockerTextSnippet: string | null = null;
  let blockerType: ConsentBlockerType | null = null;
  let blockerUrl: string | null = null;
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
        blockerPageTitle ||= blockers.blockerPageTitle;
        blockerTextSnippet ||= blockers.blockerTextSnippet;
        blockerType ||= blockers.blockerType;
        blockerUrl ||= blockers.blockerUrl;
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
      blockerPageTitle,
      blockerTextSnippet,
      blockerType,
      blockerUrl,
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
      blockerPageTitle ||= blockers.blockerPageTitle;
      blockerTextSnippet ||= blockers.blockerTextSnippet;
      blockerType ||= blockers.blockerType;
      blockerUrl ||= blockers.blockerUrl;
      externalRedirectDetected ||= blockers.externalRedirectDetected;
      redirectOrAuthRequired ||= blockers.redirectOrAuthRequired;
      preferencesDescents += 1;
    } catch {
      break;
    }

    if (await clickDirectReject()) {
      return {
        authWallDetected,
        blockerPageTitle,
        blockerTextSnippet,
        blockerType,
        blockerUrl,
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
        blockerPageTitle ||= blockers.blockerPageTitle;
        blockerTextSnippet ||= blockers.blockerTextSnippet;
        blockerType ||= blockers.blockerType;
        blockerUrl ||= blockers.blockerUrl;
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
      blockerPageTitle ||= blockers.blockerPageTitle;
      blockerTextSnippet ||= blockers.blockerTextSnippet;
      blockerType ||= blockers.blockerType;
      blockerUrl ||= blockers.blockerUrl;
      externalRedirectDetected ||= blockers.externalRedirectDetected;
      redirectOrAuthRequired ||= blockers.redirectOrAuthRequired;
      return {
        authWallDetected,
        blockerPageTitle,
        blockerTextSnippet,
        blockerType,
        blockerUrl,
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
    blockerPageTitle,
    blockerTextSnippet,
    blockerType,
    blockerUrl,
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
  startUrl?: string;
}): Promise<Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">> {
  const startedAt = Date.now();
  const startUrl =
    input.startUrl ??
    (input.domain.startsWith("http://") || input.domain.startsWith("https://") ? input.domain : `https://${input.domain}`);
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
    consentBlockerPageTitle: rejectSession.path.blockerPageTitle,
    consentBlockerTextSnippet: rejectSession.path.blockerTextSnippet,
    consentBlockerType: rejectSession.path.redirectOrAuthRequired
      ? rejectSession.path.blockerType
      : rejectSession.path.clickCount !== null &&
          acceptSession.path.clickCount !== null &&
          rejectSession.path.clickCount > acceptSession.path.clickCount
        ? "extra_click_path"
        : null,
    consentBlockerUrl: rejectSession.path.redirectOrAuthRequired
      ? rejectSession.path.blockerUrl
      : rejectSession.path.clickCount !== null &&
          acceptSession.path.clickCount !== null &&
          rejectSession.path.clickCount > acceptSession.path.clickCount
        ? rejectSession.finalUrl
        : null,
    consentEvidencePassCount: null,
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

function deriveConcreteFrictionEvidence(audit: Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">) {
  return (
    audit.consentRedirectOrAuthRequired === true ||
    (typeof audit.consentFrictionDelta === "number" &&
      audit.consentFrictionDelta > 0 &&
      typeof audit.optInClicks === "number" &&
      typeof audit.optOutClicks === "number")
  );
}

function buildBlockerSignature(audit: Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">) {
  if (audit.consentBlockerType === "auth_wall" || audit.consentBlockerType === "external_redirect") {
    return `${audit.consentBlockerType}:${audit.consentBlockerUrl ?? audit.finalUrl}`;
  }

  if (
    audit.consentBlockerType === "extra_click_path" &&
    typeof audit.optInClicks === "number" &&
    typeof audit.optOutClicks === "number"
  ) {
    return `${audit.consentBlockerType}:${audit.optInClicks}:${audit.optOutClicks}`;
  }

  return null;
}

function countMatchingEvidencePasses(
  audits: Array<Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">>,
  selected: Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">
) {
  const selectedSignature = buildBlockerSignature(selected);
  if (!selectedSignature) {
    return deriveConcreteFrictionEvidence(selected) ? 1 : 0;
  }

  return audits.filter((audit) => buildBlockerSignature(audit) === selectedSignature).length;
}

function chooseBestAudit(audits: Array<Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">>) {
  if (audits.length === 0) {
    throw new Error("chooseBestAudit requires at least one audit.");
  }

  return [...audits].sort((left, right) => {
    const leftStrength = left.consentRedirectOrAuthRequired ? 3 : left.consentBlockerType === "extra_click_path" ? 2 : 0;
    const rightStrength = right.consentRedirectOrAuthRequired ? 3 : right.consentBlockerType === "extra_click_path" ? 2 : 0;
    if (rightStrength !== leftStrength) {
      return rightStrength - leftStrength;
    }

    const leftDelta = typeof left.consentFrictionDelta === "number" ? left.consentFrictionDelta : -1;
    const rightDelta = typeof right.consentFrictionDelta === "number" ? right.consentFrictionDelta : -1;
    if (rightDelta !== leftDelta) {
      return rightDelta - leftDelta;
    }

    const leftInteractions = Number(left.postReject.interactionSucceeded) + Number(left.postAccept.interactionSucceeded);
    const rightInteractions = Number(right.postReject.interactionSucceeded) + Number(right.postAccept.interactionSucceeded);
    return rightInteractions - leftInteractions;
  })[0]!;
}

export async function runConsentInteractionAudit(
  domain: string,
  input?: {
    baselineRightsFrictionScore?: number | null;
    domainId?: string;
    fallbackStartUrls?: string[];
    organizationId?: string | null;
    profileSweep?: boolean;
    scanId?: string;
  }
): Promise<ConsentInteractionAudit> {
  const primaryStartUrl = domain.startsWith("http://") || domain.startsWith("https://") ? domain : `https://${domain}`;
  const entrypoints = normalizeAuditEntrypoints(primaryStartUrl, input?.fallbackStartUrls ?? []);
  const initialEntrypoint = entrypoints[0];
  if (!initialEntrypoint) {
    throw new Error("Consent interaction audit did not have a valid entrypoint.");
  }
  const profiles = input?.profileSweep === false ? [{ name: "desktop_default", contextOptions: {} }] : getConsentProbeProfiles();
  const attemptedProbeProfiles: string[] = [];
  let winningProbeProfile = profiles[0]?.name ?? null;
  const completedAudits: Array<Omit<ConsentInteractionAudit, "attemptedProbeProfiles" | "winningProbeProfile">> = [];
  try {
    const runProfileAudit = async (profile: (typeof profiles)[number], startUrl: string) => {
      attemptedProbeProfiles.push(profile.name);
      const candidateAudit = await runSingleConsentInteractionAudit({
        domain,
        contextOptions: profile.contextOptions,
        domainId: input?.domainId,
        organizationId: input?.organizationId ?? null,
        profileName: profile.name,
        scanId: input?.scanId,
        startUrl
      }).catch(() => null);

      if (candidateAudit) {
        completedAudits.push(candidateAudit);
        await persistBestEffortConsentAudit({
          attemptedProbeProfiles,
          audits: completedAudits,
          domainId: input?.domainId,
          organizationId: input?.organizationId ?? null,
          scanId: input?.scanId,
          winningProbeProfile
        });
      }

      return candidateAudit;
    };

    let winningAudit = profiles[0] ? await runProfileAudit(profiles[0], initialEntrypoint) : null;
    if (!winningAudit) {
      for (const profile of profiles.slice(1)) {
        const candidateAudit = await runProfileAudit(profile, initialEntrypoint);
        if (candidateAudit) {
          winningAudit = candidateAudit;
          winningProbeProfile = profile.name;
          break;
        }
      }
    }

    if (!winningAudit) {
      throw new Error("Consent interaction audit did not produce any completed profile runs.");
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
        if (attemptedProbeProfiles.includes(profile.name)) {
          continue;
        }

        const candidateAudit = await runProfileAudit(profile, initialEntrypoint);
        if (!candidateAudit) {
          continue;
        }
        const candidateScore = winnerScore(candidateAudit);
        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          winningAudit = candidateAudit;
          winningProbeProfile = profile.name;
          await persistBestEffortConsentAudit({
            attemptedProbeProfiles,
            audits: completedAudits,
            domainId: input?.domainId,
            organizationId: input?.organizationId ?? null,
            scanId: input?.scanId,
            winningProbeProfile
          });
        }

        if (candidateAudit.postReject.interactionSucceeded || candidateAudit.postAccept.interactionSucceeded) {
          break;
        }
      }
    }

    const highBaselineFriction = (input?.baselineRightsFrictionScore ?? 0) >= 75;
    const initialEvidencePassCount = countMatchingEvidencePasses(completedAudits, winningAudit);
    const shouldCompleteEvidence = highBaselineFriction && !deriveConcreteFrictionEvidence(winningAudit);
    const shouldConfirmBlocker =
      highBaselineFriction && deriveConcreteFrictionEvidence(winningAudit) && initialEvidencePassCount < 2;
    const followupEntrypoints =
      shouldCompleteEvidence || shouldConfirmBlocker
        ? entrypoints.slice(1).length > 0
          ? entrypoints.slice(1)
          : [entrypoints[0]]
        : [];

    for (const startUrl of followupEntrypoints) {
      const candidateAudit = await runSingleConsentInteractionAudit({
        domain,
        contextOptions: profiles[0]?.contextOptions,
        domainId: input?.domainId,
        organizationId: input?.organizationId ?? null,
        profileName: profiles[0]?.name,
        scanId: input?.scanId,
        startUrl
      }).catch(() => null);

      if (!candidateAudit) {
        continue;
      }

      completedAudits.push(candidateAudit);
      winningAudit = chooseBestAudit(completedAudits);
      await persistBestEffortConsentAudit({
        attemptedProbeProfiles,
        audits: completedAudits,
        domainId: input?.domainId,
        organizationId: input?.organizationId ?? null,
        scanId: input?.scanId,
        winningProbeProfile
      });
      if (deriveConcreteFrictionEvidence(winningAudit) && countMatchingEvidencePasses(completedAudits, winningAudit) >= 2) {
        break;
      }
      if (deriveConcreteFrictionEvidence(winningAudit) && shouldCompleteEvidence) {
        break;
      }
    }

    return finalizeConsentAudit({
      attemptedProbeProfiles,
      audits: completedAudits,
      winningAudit,
      winningProbeProfile
    });
  } catch (error) {
    const fallbackAudit = chooseBestAvailableAudit(completedAudits);
    if (fallbackAudit) {
      return finalizeConsentAudit({
        attemptedProbeProfiles,
        audits: completedAudits,
        winningAudit: fallbackAudit,
        winningProbeProfile
      });
    }

    throw error;
  }
}
export type ConsentSymmetryEvidence = {
  authWallDetected: boolean;
  clickDelta: number | null;
  evidenceLog: string[];
  externalRedirectDetected: boolean;
  optInClicks: number | null;
  optOutClicks: number | null;
};
