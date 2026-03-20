import type { Page, Request } from "playwright";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  getPrimaryCategoryLabel,
  mapSignalKeyToTaxonomy,
  projectSnapshotSignals,
  SCAN_EVENT_TYPES,
  type ScanAccessibilityRuleExample,
  type ScanAccessibilityRuleCount,
  type ScanSnapshot,
  type SensitivePayloadViolation,
  type ScanTrackerVendor,
  type SnapshotSignalItem
} from "@website-signal-risk-scanner/shared";
import { evaluateBehaviorDisclosure } from "../behavior-disclosure/evaluate";
import { createBrowser } from "../browser/create-browser";
import { navigateWithPolicy } from "../browser/navigate-with-policy";
import { summarizeKeyPageCoverage } from "../page-audit/key-page-coverage";
import { mapAxeImpactToSeverity } from "../page-audit/map-axe-severity";
import { normalizeAxeResults } from "../page-audit/normalize-axe-results";
import { runAxe } from "../page-audit/run-axe";
import { enrichPolicyPages } from "../policy-enrichment";
import { derivePolicyLlmTriggerReasons } from "../policy-enrichment/semantic-triggers";
import {
  createRobotsPolicy,
  getRobotsFetchStatus,
  isUrlAllowedByRobots,
  recordDomainBackoff,
  type RobotsPolicy,
  waitForDomainRequestSlot
} from "../robots/policy";
import {
  assessPolicyPageContentQuality,
  buildAccessibilitySummary,
  buildStaticPageResult,
  buildPageMetadata,
  collectStaticTrackerDiagnostics,
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
import {
  buildKeyPageDiscoveryState,
  buildKeyPageDiscoverySummary,
  KEY_PAGE_DISCOVERY_BUDGETS,
  mergeKeyPageDiscoveryStates,
  toKeyPageFetchTargets,
  type KeyPageFetchAttempt
} from "./key-page-discovery";
import { shouldContinueRuntimeWait } from "./browser-stability";
import {
  getCachedDnsSignals,
  getCachedDomainRegistration,
  getCachedTlsMetadata,
  getCoverageTargetTypes,
  hasCoverageForTargetTypes,
  prioritizeUncoveredTargets
} from "./scan-optimization";
import { classifyConsentButtonRole } from "./consent-ui";
import { runConsentInteractionAudit } from "./consent-interaction";
import { getConsentProbeProfiles } from "./consent-profiles";
import { buildScanPlan, type ScanPlan } from "./scan-planner";
import {
  ACCESSIBILITY_WIDGET_SIGNATURES,
  analyzeVendorRequestMatch,
  CMP_VENDOR_SIGNATURES,
  TRACKER_VENDOR_SIGNATURES
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

export type ConsentProbeResult = {
  acceptAllPresent: boolean;
  consentAcceptButtonCount: number | null;
  consentBannerLayoutType: ScanSnapshot["consentBannerLayoutType"];
  consentBannerPosition: ScanSnapshot["consentBannerPosition"];
  consentInteractionModel: ScanSnapshot["consentInteractionModel"];
  consentMechanismType: ScanSnapshot["consentMechanismType"];
  consentPersistenceMechanismDetected: boolean | null;
  consentPreferencesButtonCount: number | null;
  consentRejectButtonCount: number | null;
  consentScore: number;
  cookieBannerPresent: boolean;
  cookieCategoryCount: number | null;
  cookiePolicyLinkedFromBanner: boolean;
  cmpVendorConfidence: number | null;
  cmpVendorName: string | null;
  darkPatternAcceptButtonProminence: boolean;
  darkPatternAcceptEmphasis: boolean;
  darkPatternAcceptOnlyBanner: boolean;
  darkPatternDismissWithoutReject: boolean;
  darkPatternForcedConsentWall: boolean;
  darkPatternRejectButtonMissing: boolean;
  darkPatternRejectHidden: boolean;
  defaultTrackingState: ScanSnapshot["defaultTrackingState"];
  finalUrl: string | null;
  granularPreferencesPresent: boolean;
  preconsentTrackingDetected: boolean;
  rejectAllPresent: boolean;
  scanConfidence: ScanSnapshot["scanConfidence"];
  attemptedProbeProfiles: string[];
  trackerCountTotal: number;
  winningProbeProfile: string | null;
};

type BrowserPassResult = {
  ruleExamples: ScanAccessibilityRuleExample[];
  acceptAllPresent: boolean;
  consentAcceptButtonCount: number | null;
  consentBannerLayoutType: ScanSnapshot["consentBannerLayoutType"];
  consentBannerPosition: ScanSnapshot["consentBannerPosition"];
  consentInteractionModel: ScanSnapshot["consentInteractionModel"];
  consentPreferencesButtonCount: number | null;
  consentPersistenceMechanismDetected: boolean | null;
  consentRejectButtonCount: number | null;
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
  preconsentEvidenceUrls: string[];
  sensitivePayloadViolations: SensitivePayloadViolation[];
  scriptSrcDomains: string[];
  scriptTagCount: number;
  thirdPartyRequestCount: number;
  thirdPartyRequestDomains: string[];
  trackerDiagnostics: Array<{
    collectionEndpointType: string;
    detectionSource: string;
    matchedSignatureId: string | null;
    sampleText?: string;
    sampleType?: string;
    sampleUrls: string[];
    scriptHost?: string | null;
    vendorCategory: string;
    vendorName: string;
  }>;
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
  robotsTxtBody: string | null;
  robotsTxtUrl: string;
  robotsRulesLoaded: boolean | null;
  sitemapUrls: string[];
};

const KEY_PAGE_TYPES = [
  "privacy_policy",
  "terms_of_service",
  "cookie_policy",
  "accessibility_statement",
  "contact"
] as const satisfies Array<
  Extract<StaticPageResult["pageType"], "privacy_policy" | "terms_of_service" | "cookie_policy" | "accessibility_statement" | "contact">
>;

const BROWSER_PASS_HARD_TIMEOUT_MS = 45_000;
const BROWSER_PASS_STEP_TIMEOUT_MS = 10_000;
const BROWSER_PASS_AXE_TIMEOUT_MS = 15_000;
const BROWSER_PASS_PROFILE_SWEEP_TIMEOUT_MS = 70_000;
const STATIC_FETCH_TARGET_TIMEOUT_MS = 30_000;
const SECURITY_TXT_FETCH_TIMEOUT_MS = 20_000;
const POLICY_TRACKING_DISCLOSURE_PATTERN =
  /\bcookies?\b|\btracking (?:technologies|tools|pixels?)\b|\banalytics\b|\badvertising\b|\bpixels?\b|\bsession replay\b|\breplay your session\b/i;

export function derivePolicyTermsConflictDetected(input: {
  policyPages: StaticPageResult[];
  policyEnrichments: Array<{ pageType: string | null; policyClaimNoTracking: boolean | null }>;
}) {
  const strongNoTrackingClaimPresent = input.policyEnrichments.some((enrichment) => enrichment.policyClaimNoTracking === true);

  if (!strongNoTrackingClaimPresent) {
    return false;
  }

  return input.policyPages.some((page) => POLICY_TRACKING_DISCLOSURE_PATTERN.test(`${page.title ?? ""} ${page.textContent}`));
}

function toTaxonomySignal(input: Omit<SnapshotSignalItem, "primaryCategory" | "primaryCategoryLabel" | "subcategory" | "regulatoryTags">): SnapshotSignalItem {
  const taxonomy = mapSignalKeyToTaxonomy({
    category: input.category,
    key: input.key,
    label: input.label
  });

  return {
    ...input,
    primaryCategory: taxonomy.primaryCategory,
    primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
    subcategory: taxonomy.subcategory ?? null,
    regulatoryTags: taxonomy.regulatoryTags ?? []
  };
}

function normalizeCookieName(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase();
}

const COOKIE_PROVIDER_HINTS: Array<{
  category?: string;
  prefixes: string[];
  provider: string;
}> = [
  { prefixes: ["_ga", "_gid", "_gat", "_gac_", "_gcl_"], provider: "Google Analytics", category: "analytics" },
  { prefixes: ["ide", "test_cookie"], provider: "DoubleClick", category: "advertising" },
  { prefixes: ["_fbp", "fr"], provider: "Meta", category: "advertising" },
  { prefixes: ["ajs_"], provider: "Segment", category: "analytics" },
  { prefixes: ["_hj"], provider: "Hotjar", category: "analytics" }
];

function inferCookieProvider(cookieName: string) {
  const normalized = normalizeCookieName(cookieName);
  if (!normalized) {
    return null;
  }

  return COOKIE_PROVIDER_HINTS.find((hint) => hint.prefixes.some((prefix) => normalized.startsWith(prefix.toLowerCase()))) ?? null;
}

function matchCookieDisclosure(input: {
  cookieName: string;
  disclosures: Array<Record<string, unknown>>;
}) {
  const runtimeName = normalizeCookieName(input.cookieName);
  if (!runtimeName) {
    return null;
  }

  for (const disclosure of input.disclosures) {
    const disclosedName = normalizeCookieName(
      typeof disclosure.cookieName === "string"
        ? disclosure.cookieName
        : typeof disclosure.cookie_name === "string"
          ? disclosure.cookie_name
          : null
    );

    if (disclosedName && (runtimeName === disclosedName || runtimeName.startsWith(disclosedName) || disclosedName.startsWith(runtimeName))) {
      return disclosure;
    }
  }

  const inferred = inferCookieProvider(runtimeName);
  if (!inferred) {
    return null;
  }

  for (const disclosure of input.disclosures) {
    const provider = typeof disclosure.provider === "string" ? disclosure.provider.toLowerCase() : "";
    const purpose = typeof disclosure.purpose === "string" ? disclosure.purpose.toLowerCase() : "";

    if (provider.includes(inferred.provider.toLowerCase()) || (inferred.category && purpose.includes(inferred.category))) {
      return disclosure;
    }
  }

  return null;
}

function hasSparsePolicyExtraction(input: {
  confidence: number | null;
  coverageRatio?: number | null;
  flags: string[];
  mentions: Array<{ confidence: number; topic: string }>;
  snippetCount?: number | null;
  structurallyWeak?: boolean | null;
  summaryShort: string | null;
}) {
  if (input.structurallyWeak === true) {
    return true;
  }

  if (input.confidence !== null && input.confidence < 0.6) {
    return true;
  }

  if (input.coverageRatio !== null && input.coverageRatio !== undefined && input.coverageRatio < 0.5) {
    return true;
  }

  if (input.flags.includes("llm_provider_error") || input.flags.includes("low_confidence")) {
    return true;
  }

  if (input.snippetCount !== null && input.snippetCount !== undefined && input.snippetCount === 0) {
    return true;
  }

  if (input.mentions.length === 0) {
    return true;
  }

  return typeof input.summaryShort !== "string" || input.summaryShort.trim().length === 0;
}

async function persistPolicyResolutionDiagnostic(input: {
  scanId: string;
  domainId: string;
  organizationId: string | null;
  message: string;
  metadata: Record<string, unknown>;
}) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("scan_events").insert({
      scan_id: input.scanId,
      domain_id: input.domainId,
      organization_id: input.organizationId,
      event_type: "legal.policy_resolution_diagnostic",
      message: input.message,
      metadata_json: input.metadata
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("[policy-resolution] failed to persist diagnostic", {
      error: error instanceof Error ? error.message : "Unknown error",
      scanId: input.scanId
    });
  }
}

async function persistPolicyLlmDiagnostic(input: {
  scanId: string;
  domainId: string;
  organizationId: string | null;
  message: string;
  metadata: Record<string, unknown>;
}) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("scan_events").insert({
      scan_id: input.scanId,
      domain_id: input.domainId,
      organization_id: input.organizationId,
      event_type: SCAN_EVENT_TYPES.policyLlmChunkDiagnostic,
      message: input.message,
      metadata_json: input.metadata
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("[policy-llm] failed to persist chunk diagnostic", {
      error: error instanceof Error ? error.message : "Unknown error",
      scanId: input.scanId
    });
  }
}

async function persistTrackerVendorDiagnostic(input: {
  scanId: string;
  domainId: string;
  organizationId: string | null;
  message: string;
  metadata: Record<string, unknown>;
}) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("scan_events").insert({
      scan_id: input.scanId,
      domain_id: input.domainId,
      organization_id: input.organizationId,
      event_type: SCAN_EVENT_TYPES.trackerVendorDiagnostic,
      message: input.message,
      metadata_json: input.metadata
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("[tracker-diagnostic] failed to persist vendor diagnostic", {
      error: error instanceof Error ? error.message : "Unknown error",
      scanId: input.scanId
    });
  }
}

async function persistBrowserPassDiagnostic(input: {
  scanId: string;
  domainId: string;
  organizationId: string | null;
  homepageUrl: string;
  stage: string;
  status: "start" | "ok" | "timeout" | "error";
  metadata?: Record<string, unknown>;
}) {
  const payload = {
    homepageUrl: input.homepageUrl,
    stage: input.stage,
    status: input.status,
    ...(input.metadata ?? {})
  } satisfies Record<string, unknown>;

  console.info("[browser-pass]", {
    metadata: payload,
    scanId: input.scanId
  });

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("scan_events").insert({
      scan_id: input.scanId,
      domain_id: input.domainId,
      organization_id: input.organizationId,
      event_type: "runtime.browser_pass_diagnostic",
      message: `Browser pass ${input.stage} ${input.status}.`,
      metadata_json: payload
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("[browser-pass] failed to persist diagnostic", {
      error: error instanceof Error ? error.message : "Unknown error",
      scanId: input.scanId,
      stage: input.stage
    });
  }
}

async function persistBuildPhaseDiagnostic(input: {
  scanId: string;
  domainId: string;
  organizationId: string | null;
  phase: string;
  status: "start" | "ok" | "error";
  metadata?: Record<string, unknown>;
}) {
  console.info("[build-phase]", {
    metadata: {
      phase: input.phase,
      status: input.status,
      ...(input.metadata ?? {})
    },
    scanId: input.scanId
  });

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("scan_events").insert({
      scan_id: input.scanId,
      domain_id: input.domainId,
      organization_id: input.organizationId,
      event_type: "runtime.build_phase_diagnostic",
      message: `Build phase ${input.phase} ${input.status}.`,
      metadata_json: {
        phase: input.phase,
        status: input.status,
        ...(input.metadata ?? {})
      }
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("[build-phase] failed to persist diagnostic", {
      error: error instanceof Error ? error.message : "Unknown error",
      phase: input.phase,
      scanId: input.scanId
    });
  }
}

async function withStepTimeout<T>(
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

type ResolvedPolicyCandidate = {
  finalUrl: string;
  headers: Record<string, string>;
  html: string;
  source: "rendered_page" | "iframe" | "network_html" | "network_json";
  statusCode: number | null;
  textContent: string;
};

function normalizeResolvedText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function countResolvedWords(text: string) {
  return text.match(/\b[\w'-]+\b/g)?.length ?? 0;
}

function stripHtmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPolicyLikeUrl(url: string) {
  return /(privacy|policy|notice|cookie|terms|legal|gdpr|ccpa)/i.test(url);
}

function hasPolicyLikeText(text: string) {
  return /\bprivacy\b|\bpersonal information\b|\bdata subject\b|\bcollect\b|\bretain\b|\bcookies?\b|\bterms\b|\bconsumer privacy\b/i.test(text);
}

function extractPolicyTextFromJson(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const strings: string[] = [];

    const visit = (value: unknown, depth: number) => {
      if (depth > 6 || strings.length >= 200) {
        return;
      }

      if (typeof value === "string") {
        const normalized = normalizeResolvedText(value);
        if (normalized.length >= 40 && hasPolicyLikeText(normalized)) {
          strings.push(normalized);
        }
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }

      if (value && typeof value === "object") {
        Object.values(value).forEach((item) => visit(item, depth + 1));
      }
    };

    visit(parsed, 0);
    return normalizeResolvedText(strings.join(" "));
  } catch {
    return "";
  }
}

function scoreResolvedPolicyCandidate(candidate: ResolvedPolicyCandidate) {
  const wordCount = countResolvedWords(candidate.textContent);
  const textLength = candidate.textContent.length;
  const policyTermBonus = hasPolicyLikeText(candidate.textContent) ? 120 : 0;
  const urlBonus = hasPolicyLikeUrl(candidate.finalUrl) ? 80 : 0;
  const sourceBonus =
    candidate.source === "iframe" ? 50 : candidate.source === "network_html" ? 35 : candidate.source === "network_json" ? 25 : 0;

  return textLength + wordCount * 4 + policyTermBonus + urlBonus + sourceBonus;
}

function toResolvedPolicyPage(input: {
  candidate: ResolvedPolicyCandidate;
  originalPage: StaticPageResult;
}): StaticPageResult {
  return buildStaticPageResult({
    blockedByPolicy: false,
    finalUrl: input.candidate.finalUrl,
    headers: input.candidate.headers,
    html: input.candidate.html,
    pageType: input.originalPage.pageType,
    pageUrl: input.originalPage.pageUrl,
    redirectCount: input.candidate.finalUrl !== input.originalPage.pageUrl ? 1 : input.originalPage.redirectCount,
    statusCode: input.candidate.statusCode ?? input.originalPage.statusCode,
    textContentOverride: input.candidate.textContent,
    timedOut: false
  });
}

async function renderThinPolicyPage(input: {
  domainId: string;
  organizationId: string | null;
  page: StaticPageResult;
  plan: ScanPlan;
  robotsPolicy?: RobotsPolicy | null;
  scanId: string;
}): Promise<StaticPageResult | null> {
  const browserHandle = await createBrowser();
  const browserPage = await browserHandle.context.newPage();
  const networkCandidatePromises: Array<Promise<ResolvedPolicyCandidate | null>> = [];
  const observedPolicyResponseUrls = new Set<string>();
  const observedFrameUrls = new Set<string>();

  try {
    browserPage.on("response", (response) => {
      const status = response.status();
      if (status < 200 || status >= 300) {
        return;
      }

      const request = response.request();
      const resourceType = request.resourceType();
      const responseUrl = response.url();
      const headers = response.headers();
      const contentType = (headers["content-type"] ?? "").toLowerCase();
      const contentLength = Number.parseInt(headers["content-length"] ?? "", 10);

      if (!["document", "fetch", "xhr", "iframe"].includes(resourceType)) {
        return;
      }

      if (Number.isFinite(contentLength) && contentLength > 500_000) {
        return;
      }

      if (!hasPolicyLikeUrl(responseUrl) && !contentType.includes("json") && !contentType.includes("html") && !contentType.startsWith("text/")) {
        return;
      }

      if (hasPolicyLikeUrl(responseUrl)) {
        observedPolicyResponseUrls.add(responseUrl);
      }

      networkCandidatePromises.push(
        response
          .text()
          .then((body) => {
            if (!body) {
              return null;
            }

            const textContent = contentType.includes("json")
              ? extractPolicyTextFromJson(body)
              : normalizeResolvedText(stripHtmlToText(body));

            if (countResolvedWords(textContent) < 80 || !hasPolicyLikeText(textContent)) {
              return null;
            }

            return {
              finalUrl: responseUrl,
              headers,
              html: contentType.includes("json") ? `<pre>${body}</pre>` : body,
              source: contentType.includes("json") ? "network_json" : "network_html",
              statusCode: status,
              textContent
            } satisfies ResolvedPolicyCandidate;
          })
          .catch(() => null)
      );
    });

    browserPage.setDefaultNavigationTimeout(input.plan.browserNavigationTimeoutMs);
    browserPage.setDefaultTimeout(input.plan.browserNavigationTimeoutMs);
    const navigation = await navigateWithPolicy({
      page: browserPage,
      robotsPolicy: input.robotsPolicy,
      url: input.page.pageUrl
    });

    if (navigation.blockedByPolicy) {
      return null;
    }

    await browserPage.waitForTimeout(input.plan.browserPostLoadWaitMs);
    const html = await browserPage.content().catch(() => "");
    const textContent = normalizeResolvedText(
      await browserPage
        .evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").trim() ?? document.documentElement?.innerText?.replace(/\s+/g, " ").trim() ?? "")
        .catch(() => "")
    );
    const finalUrl = browserPage.url() || input.page.finalUrl || input.page.pageUrl;
    const headers =
      (await navigation.response?.allHeaders().catch(() => null)) ??
      navigation.response?.headers() ??
      input.page.headers;
    const renderedCandidate: ResolvedPolicyCandidate = {
      finalUrl,
      headers,
      html,
      source: "rendered_page",
      statusCode: navigation.response?.status() ?? input.page.statusCode,
      textContent
    };
    const rendered = toResolvedPolicyPage({
      candidate: renderedCandidate,
      originalPage: input.page
    });
    const frameCandidates = await Promise.all(
      browserPage.frames().slice(1).map(async (frame): Promise<ResolvedPolicyCandidate | null> => {
        const frameUrl = frame.url();
        if (!frameUrl) {
          return null;
        }

        observedFrameUrls.add(frameUrl);

        const frameHtml = await frame.content().catch(() => "");
        const frameText = normalizeResolvedText(
          await frame
            .evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").trim() ?? document.documentElement?.innerText?.replace(/\s+/g, " ").trim() ?? "")
            .catch(() => "")
        );

        if (countResolvedWords(frameText) < 80 || (!hasPolicyLikeText(frameText) && !hasPolicyLikeUrl(frameUrl))) {
          return null;
        }

        return {
          finalUrl: frameUrl,
          headers: {},
          html: frameHtml,
          source: "iframe",
          statusCode: 200,
          textContent: frameText
        };
      })
    );
    const networkCandidates = (await Promise.all(networkCandidatePromises)).filter(
      (candidate): candidate is ResolvedPolicyCandidate => Boolean(candidate)
    );
    const existingQuality = assessPolicyPageContentQuality(input.page);
    const iframeCandidates = frameCandidates.filter((candidate): candidate is ResolvedPolicyCandidate => Boolean(candidate));
    const candidates = [renderedCandidate, ...iframeCandidates, ...networkCandidates];
    const bestCandidate = candidates
      .map((candidate) => ({
        candidate,
        score: scoreResolvedPolicyCandidate(candidate)
      }))
      .sort((left, right) => right.score - left.score)[0]?.candidate;

    if (!bestCandidate) {
      const diagnostic = {
        bestCandidate: null,
        existingWordCount: existingQuality.wordCount,
        iframeUrls: [...observedFrameUrls].slice(0, 5),
        networkUrls: [...observedPolicyResponseUrls].slice(0, 10),
        pageUrl: input.page.pageUrl
      };
      console.info("[policy-resolution] unresolved thin legal page", diagnostic);
      await persistPolicyResolutionDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        message: "Thin legal page unresolved after rendered, iframe, and network candidate inspection.",
        metadata: diagnostic
      });
      return null;
    }

    const bestResolvedPage = toResolvedPolicyPage({
      candidate: bestCandidate,
      originalPage: input.page
    });
    const renderedQuality = assessPolicyPageContentQuality(bestResolvedPage);

    if (
      bestResolvedPage.textContent.trim().length <= input.page.textContent.trim().length &&
      renderedQuality.wordCount <= existingQuality.wordCount
    ) {
      const diagnostic = {
        bestCandidateSource: bestCandidate.source,
        bestCandidateUrl: bestCandidate.finalUrl,
        bestWordCount: renderedQuality.wordCount,
        existingWordCount: existingQuality.wordCount,
        iframeUrls: [...observedFrameUrls].slice(0, 5),
        networkUrls: [...observedPolicyResponseUrls].slice(0, 10),
        pageUrl: input.page.pageUrl
      };
      console.info("[policy-resolution] thin legal page not improved", diagnostic);
      await persistPolicyResolutionDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        message: "Thin legal page produced candidate sources but none improved fetched policy content.",
        metadata: diagnostic
      });
      return null;
    }

    const diagnostic = {
      bestCandidateSource: bestCandidate.source,
      bestCandidateUrl: bestCandidate.finalUrl,
      bestWordCount: renderedQuality.wordCount,
      existingWordCount: existingQuality.wordCount,
      iframeUrls: [...observedFrameUrls].slice(0, 5),
      networkUrls: [...observedPolicyResponseUrls].slice(0, 10),
      pageUrl: input.page.pageUrl
    };
    console.info("[policy-resolution] thin legal page resolved", diagnostic);
    await persistPolicyResolutionDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      message: "Thin legal page resolved to a richer rendered, iframe, or network candidate.",
      metadata: diagnostic
    });

    return bestResolvedPage;
  } finally {
    await browserPage.close().catch(() => undefined);
    await browserHandle.context.close().catch(() => undefined);
    await browserHandle.browser.close().catch(() => undefined);
  }
}

async function upgradeThinPolicyPages(input: {
  domainId: string;
  fetchedPagesByUrl: Map<string, StaticPageResult>;
  organizationId: string | null;
  plan: ScanPlan;
  robotsPolicy?: RobotsPolicy | null;
  scanId: string;
}) {
  const candidates = [...input.fetchedPagesByUrl.values()].filter((page) => {
    if (!(page.fetchStatus === "ok" || page.fetchStatus === "redirected")) {
      return false;
    }

    return assessPolicyPageContentQuality(page).insufficientContent;
  });

  for (const candidate of candidates) {
    try {
      const rendered = await renderThinPolicyPage({
        domainId: input.domainId,
        organizationId: input.organizationId,
        page: candidate,
        plan: input.plan,
        robotsPolicy: input.robotsPolicy,
        scanId: input.scanId
      });

      if (rendered) {
        input.fetchedPagesByUrl.set(candidate.pageUrl, rendered);
      }
    } catch (error) {
      console.error("[policy-resolution] thin legal page resolver failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        pageUrl: candidate.pageUrl
      });
      await persistPolicyResolutionDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        message: "Thin legal page resolver threw before candidate selection completed.",
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error",
          pageUrl: candidate.pageUrl
        }
      });
      continue;
    }
  }
}

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

function mergeCandidateTargets(
  candidates: Array<{
    pageType: StaticPageResult["pageType"];
    priority: number;
    url: string;
  }>,
  discoveryCandidates: Array<{
    candidateScore: number;
    candidateUrl: string;
    pageType: StaticPageResult["pageType"];
  }>
) {
  const merged = new Map<string, { pageType: StaticPageResult["pageType"]; priority: number; url: string }>();

  for (const candidate of candidates) {
    merged.set(candidate.url, candidate);
  }

  for (const candidate of discoveryCandidates) {
    const existing = merged.get(candidate.candidateUrl);
    const next = {
      pageType: candidate.pageType,
      priority: priorityForPage(candidate.pageType) + candidate.candidateScore,
      url: candidate.candidateUrl
    } satisfies { pageType: StaticPageResult["pageType"]; priority: number; url: string };

    if (!existing || next.priority > existing.priority) {
      merged.set(candidate.candidateUrl, next);
    }
  }

  return [...merged.values()];
}

function getMissingKeyPageTypes(pages: StaticPageResult[]) {
  const covered = new Set(
    pages
      .filter((page) => page.fetchStatus === "ok" || page.fetchStatus === "redirected")
      .map((page) => page.pageType)
  );

  return KEY_PAGE_TYPES.filter((pageType) => !covered.has(pageType));
}

function formatKeyPageTypeLabel(pageType: (typeof KEY_PAGE_TYPES)[number]) {
  switch (pageType) {
    case "privacy_policy":
      return "Privacy policy";
    case "terms_of_service":
      return "Terms of service";
    case "cookie_policy":
      return "Cookie policy";
    case "accessibility_statement":
      return "Accessibility statement";
    case "contact":
      return "Contact page";
  }
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
    const sitemapUrls = [...new Set(
      [...robots.body.matchAll(/^\s*sitemap\s*:\s*(\S+)\s*$/gim)]
        .map((match) => match[1]?.trim() ?? "")
        .filter((value) => value.length > 0)
    )];
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
      robotsTxtBody: robots.body,
      robotsTxtFetchedAt: fetchedAt,
      robotsTxtHash: stableHash(robots.body),
      robotsTxtUrl: robotsUrl,
      robotsRulesLoaded: policy.rulesLoaded,
      sitemapUrls
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
      robotsTxtBody: null,
      robotsTxtFetchedAt: fetchedAt,
      robotsTxtHash: null,
      robotsTxtUrl: robotsUrl,
      robotsRulesLoaded: null,
      sitemapUrls: []
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

function buildAccessibilityRuleExamples(input: {
  pageUrl: string;
  violations: Awaited<ReturnType<typeof normalizeAxeResults>>;
  scanId: string;
}) {
  return input.violations.map(
    (violation) =>
      ({
        scanId: input.scanId,
        pageUrl: input.pageUrl,
        ruleCode: violation.ruleId,
        ruleGroup: violation.ruleId.split("-")[0] ?? violation.ruleId,
        severity: mapAxeImpactToSeverity(violation.impact),
        impact: violation.impact,
        help: violation.help,
        helpUrl: violation.helpUrl,
        description: violation.description,
        nodeCount: violation.nodeCount,
        representativeSelectors: violation.representativeSelectors
      }) satisfies ScanAccessibilityRuleExample
  );
}

function isFirstPartyHost(host: string | null, pageDomain: string) {
  return host === pageDomain || (host ? host.endsWith(`.${pageDomain}`) : false);
}

const EMAIL_PAYLOAD_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PAYLOAD_REGEX = /(?<!\w)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\w)/g;
const TEXT_CONTENT_TYPE_PATTERNS = [/json/i, /x-www-form-urlencoded/i, /text\//i, /javascript|ecmascript/i];
const BINARY_CONTENT_TYPE_PATTERNS = [/multipart\/form-data/i, /octet-stream/i, /^image\//i, /^audio\//i, /^video\//i, /protobuf/i, /pdf/i];

function safelyParseUrl(input: string) {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function looksLikeTextPayload(value: string) {
  if (!value.trim()) {
    return false;
  }

  let nonPrintableCount = 0;
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint === 9 || codePoint === 10 || codePoint === 13) {
      continue;
    }
    if (codePoint < 32 || codePoint === 127) {
      nonPrintableCount += 1;
    }
  }

  return nonPrintableCount / Math.max(value.length, 1) < 0.05;
}

function extractJsonStringValues(input: unknown, output: string[]) {
  if (typeof input === "string") {
    output.push(input);
    return;
  }

  if (Array.isArray(input)) {
    for (const entry of input) {
      extractJsonStringValues(entry, output);
    }
    return;
  }

  if (input && typeof input === "object") {
    for (const value of Object.values(input)) {
      extractJsonStringValues(value, output);
    }
  }
}

export function extractSensitivePayloadTexts(input: {
  requestUrl: string;
  postData: string | null;
  headers?: Record<string, string>;
}) {
  const payloadTexts: string[] = [];

  const parsedUrl = safelyParseUrl(input.requestUrl);
  if (parsedUrl) {
    const queryEntries = [...parsedUrl.searchParams.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .filter((entry) => entry.trim().length > 0);
    if (queryEntries.length > 0) {
      payloadTexts.push(queryEntries.join("&"));
    }
  }

  const postData = typeof input.postData === "string" ? input.postData.trim() : "";
  if (!postData) {
    return payloadTexts;
  }

  const contentTypeHeader = Object.entries(input.headers ?? {}).find(([key]) => key.toLowerCase() === "content-type");
  const contentType = contentTypeHeader?.[1] ?? "";
  if (BINARY_CONTENT_TYPE_PATTERNS.some((pattern) => pattern.test(contentType))) {
    return payloadTexts;
  }

  if (!looksLikeTextPayload(postData)) {
    return payloadTexts;
  }

  const lowered = contentType.toLowerCase();
  if (TEXT_CONTENT_TYPE_PATTERNS.some((pattern) => pattern.test(lowered)) || /^[{\[]/.test(postData)) {
    if (/json/i.test(lowered) || /^[{\[]/.test(postData)) {
      try {
        const parsed = JSON.parse(postData) as unknown;
        const strings: string[] = [];
        extractJsonStringValues(parsed, strings);
        payloadTexts.push(...strings);
        return payloadTexts;
      } catch {
        // Fall through to other textual parsing paths.
      }
    }

    if (/x-www-form-urlencoded/i.test(lowered) || /^[^=\s]+=[^=]+(?:&[^=\s]+=[^=]*)*$/.test(postData)) {
      const params = new URLSearchParams(postData);
      const entries = [...params.entries()].map(([key, value]) => `${key}=${value}`);
      if (entries.length > 0) {
        payloadTexts.push(entries.join("&"));
        return payloadTexts;
      }
    }
  }

  payloadTexts.push(postData);
  return payloadTexts;
}

function redactEmail(value: string) {
  const [localPart = "", domainPart = ""] = value.split("@");
  const visibleLocal = localPart.slice(0, Math.min(localPart.length, 2));
  return `${visibleLocal}${"*".repeat(Math.max(localPart.length - visibleLocal.length, 3))}@${domainPart}`;
}

function redactPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const tail = digits.slice(-4);
  return `***-***-${tail || "****"}`;
}

function buildRedactedSnippet(payload: string, match: string, detectedType: SensitivePayloadViolation["detectedType"]) {
  const redactedMatch = detectedType === "email_detected" ? redactEmail(match) : redactPhone(match);
  const matchIndex = payload.indexOf(match);
  if (matchIndex < 0) {
    return redactedMatch;
  }

  const snippetStart = Math.max(0, matchIndex - 24);
  const snippetEnd = Math.min(payload.length, matchIndex + match.length + 24);
  const snippet = payload.slice(snippetStart, snippetEnd);
  return snippet.replace(match, redactedMatch);
}

export function detectSensitivePayloadViolations(input: {
  pageDomain: string;
  requestMethod: string;
  requestUrl: string;
  postData: string | null;
  headers?: Record<string, string>;
  timestamp?: string;
}) {
  const parsedUrl = safelyParseUrl(input.requestUrl);
  if (!parsedUrl || isFirstPartyHost(parsedUrl.hostname, input.pageDomain)) {
    return [] as SensitivePayloadViolation[];
  }

  const timestamp = input.timestamp ?? new Date().toISOString();
  const payloadTexts = extractSensitivePayloadTexts({
    requestUrl: input.requestUrl,
    postData: input.postData,
    headers: input.headers
  });

  const violations: SensitivePayloadViolation[] = [];
  const seen = new Set<string>();
  for (const payloadText of payloadTexts) {
    EMAIL_PAYLOAD_REGEX.lastIndex = 0;
    for (const match of payloadText.matchAll(EMAIL_PAYLOAD_REGEX)) {
      const value = match[0];
      if (!value) {
        continue;
      }
      const dedupeKey = `email:${input.requestUrl}:${value}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      violations.push({
        detectedType: "email_detected",
        matchSnippet: buildRedactedSnippet(payloadText, value, "email_detected").slice(0, 160),
        requestMethod: input.requestMethod,
        requestUrl: input.requestUrl,
        timestamp,
        vendorHost: parsedUrl.hostname
      });
    }

    PHONE_PAYLOAD_REGEX.lastIndex = 0;
    for (const match of payloadText.matchAll(PHONE_PAYLOAD_REGEX)) {
      const value = match[0];
      const digits = value?.replace(/\D/g, "") ?? "";
      if (!value || (digits.length !== 10 && digits.length !== 11)) {
        continue;
      }
      const dedupeKey = `phone:${input.requestUrl}:${digits}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      violations.push({
        detectedType: "phone_detected",
        matchSnippet: buildRedactedSnippet(payloadText, value, "phone_detected").slice(0, 160),
        requestMethod: input.requestMethod,
        requestUrl: input.requestUrl,
        timestamp,
        vendorHost: parsedUrl.hostname
      });
    }
  }

  return violations;
}

const PRECONSENT_STATE0_RESOURCE_TYPES = new Set(["xhr", "fetch", "script", "image"]);

export function shouldCapturePreconsentState0Request(input: {
  pageDomain: string;
  requestUrl: string;
  resourceType: string;
}) {
  if (!PRECONSENT_STATE0_RESOURCE_TYPES.has(input.resourceType)) {
    return false;
  }

  try {
    const hostname = new URL(input.requestUrl).hostname;
    return !isFirstPartyHost(hostname, input.pageDomain);
  } catch {
    return false;
  }
}

export function summarizePreconsentBaselineEvidence(input: {
  browserPassPreconsentEvidenceUrls: string[];
  browserPassTrackerVendorNames: string[];
  consentAuditBaselineEvidenceUrls?: string[] | null;
  consentAuditBaselineTrackerVendorNames?: string[] | null;
}) {
  const trackerEvidenceUrls = [
    ...new Set([
      ...(input.consentAuditBaselineEvidenceUrls ?? []),
      ...input.browserPassPreconsentEvidenceUrls
    ])
  ];
  const trackerVendorNames = [
    ...new Set([
      ...(input.consentAuditBaselineTrackerVendorNames ?? []),
      ...input.browserPassTrackerVendorNames
    ])
  ];

  return {
    trackerEvidenceUrls,
    trackerVendorNames,
    violationCount: Math.max(trackerEvidenceUrls.length, trackerVendorNames.length)
  };
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

function buildStaticTrackerDiagnostics(pages: StaticPageResult[]) {
  return pages.flatMap((page) =>
    collectStaticTrackerDiagnostics({
      pageHostname: new URL(page.pageUrl).hostname,
      pageText: `${page.textContent}\n${page.html}`,
      scripts: page.scripts
    })
  );
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
    const acceptButtons = buttonMeta.filter((button) => classifyConsentButtonRole(button.text) === "accept");
    const rejectButtons = buttonMeta.filter((button) => classifyConsentButtonRole(button.text) === "reject");
    const preferencesButtons = buttonMeta.filter((button) => classifyConsentButtonRole(button.text) === "preferences");
    const dismissButtons = buttonMeta.filter((button) => classifyConsentButtonRole(button.text) === "dismiss");
    const acceptTexts = acceptButtons.map((button) => button.text);
    const rejectTexts = rejectButtons.map((button) => button.text);
    const preferencesTexts = preferencesButtons.map((button) => button.text);
    let consentInteractionModel:
      | "none"
      | "accept_only"
      | "accept_reject"
      | "accept_preferences"
      | "accept_reject_preferences"
      | "preferences_only"
      | "dismiss_only"
      | "other" = "other";
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

    if (!visibleBanner) {
      consentInteractionModel = "none";
    } else if (acceptButtons.length > 0 && rejectButtons.length > 0 && preferencesButtons.length > 0) {
      consentInteractionModel = "accept_reject_preferences";
    } else if (acceptButtons.length > 0 && rejectButtons.length > 0) {
      consentInteractionModel = "accept_reject";
    } else if (acceptButtons.length > 0 && preferencesButtons.length > 0) {
      consentInteractionModel = "accept_preferences";
    } else if (acceptButtons.length > 0) {
      consentInteractionModel = "accept_only";
    } else if (preferencesButtons.length > 0) {
      consentInteractionModel = "preferences_only";
    } else if (dismissButtons.length > 0) {
      consentInteractionModel = "dismiss_only";
    }

    return {
      cookieBannerPresent: visibleBanner,
      acceptAllPresent: acceptTexts.length > 0,
      consentAcceptButtonCount: acceptTexts.length,
      consentInteractionModel,
      consentPreferencesButtonCount: preferencesTexts.length,
      consentRejectButtonCount: rejectTexts.length,
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
  browserContextOptions?: import("playwright").BrowserContextOptions;
  plan: ScanPlan;
  domain: string;
  domainId: string;
  homepageUrl: string;
  organizationId: string | null;
  robotsPolicy?: RobotsPolicy | null;
  scanId: string;
}): Promise<BrowserPassResult> {
  const startedAt = Date.now();
  const browserHandle = await createBrowser({
    contextOptions: input.browserContextOptions
  });
  const page = await browserHandle.context.newPage();
  const requestUrls = new Set<string>();
  const preconsentRequestUrls = new Set<string>();
  const sensitivePayloadViolationMap = new Map<string, SensitivePayloadViolation>();
  let mixedContentDetected = false;
  let timedOut = false;
  let inflightRequests = 0;
  let firstPartyCookieSetBeforeConsent = false;
  let thirdPartyCookieSetBeforeConsent = false;
  let browserSessionUsable = true;
  let cookiesBeforeConsent: Array<{ domain: string; name: string }> = [];
  let lastNetworkActivityAt = Date.now();

  const ensureWithinHardTimeout = async (stage: string) => {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs <= BROWSER_PASS_HARD_TIMEOUT_MS) {
      return;
    }

    await persistBrowserPassDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      homepageUrl: input.homepageUrl,
      stage,
      status: "timeout",
      metadata: {
        elapsedMs,
        inflightRequests,
        lastActivityElapsedMs: Date.now() - lastNetworkActivityAt
      }
    });

    throw new Error(`Browser pass hard timeout exceeded after ${elapsedMs}ms during ${stage}.`);
  };

  const runInstrumentedStep = async <T>(
    stage: string,
    callback: () => Promise<T>,
    timeoutMs = BROWSER_PASS_STEP_TIMEOUT_MS
  ) => {
    await ensureWithinHardTimeout(`${stage}:before`);
    await persistBrowserPassDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      homepageUrl: input.homepageUrl,
      stage,
      status: "start",
      metadata: {
        elapsedMs: Date.now() - startedAt,
        inflightRequests
      }
    });

    try {
      const result = await withStepTimeout(timeoutMs, `Browser pass ${stage}`, callback);
      await persistBrowserPassDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        homepageUrl: input.homepageUrl,
        stage,
        status: "ok",
        metadata: {
          elapsedMs: Date.now() - startedAt,
          inflightRequests
        }
      });
      await ensureWithinHardTimeout(`${stage}:after`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown browser pass error";
      const status = /timed out/i.test(message) ? "timeout" : "error";
      await persistBrowserPassDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        homepageUrl: input.homepageUrl,
        stage,
        status,
        metadata: {
          elapsedMs: Date.now() - startedAt,
          error: message,
          inflightRequests,
          lastActivityElapsedMs: Date.now() - lastNetworkActivityAt
        }
      });
      throw error;
    }
  };

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

  const trackRequest = (request: Request) => {
    const requestUrl = request.url();
    inflightRequests += 1;
    lastNetworkActivityAt = Date.now();
    requestUrls.add(requestUrl);

    if (input.homepageUrl.startsWith("https://") && requestUrl.startsWith("http://")) {
      mixedContentDetected = true;
    }

    const violations = detectSensitivePayloadViolations({
      pageDomain: input.domain,
      requestMethod: request.method(),
      requestUrl,
      postData: request.postData(),
      headers: request.headers(),
      timestamp: new Date().toISOString()
    });
    for (const violation of violations) {
      const key = `${violation.detectedType}:${violation.requestUrl}:${violation.matchSnippet}`;
      if (!sensitivePayloadViolationMap.has(key)) {
        sensitivePayloadViolationMap.set(key, violation);
      }
    }
  };

  const capturePreconsentState0Request = (request: Request) => {
    const requestUrl = request.url();
    if (
      shouldCapturePreconsentState0Request({
        pageDomain: input.domain,
        requestUrl,
        resourceType: request.resourceType()
      })
    ) {
      preconsentRequestUrls.add(requestUrl);
    }
  };

  page.on("request", trackRequest);
  page.on("request", capturePreconsentState0Request);

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
    const navigation = await runInstrumentedStep(
      "homepage_navigation",
      () =>
        navigateWithPolicy({
          page,
          robotsPolicy: input.robotsPolicy,
          url: input.homepageUrl
        }),
      Math.max(BROWSER_PASS_STEP_TIMEOUT_MS, input.plan.browserNavigationTimeoutMs + 2_000)
    );

    if (navigation.blockedByPolicy) {
      timedOut = false;
      return {
        acceptAllPresent: false,
        consentAcceptButtonCount: null,
        consentBannerLayoutType: "unknown",
        consentBannerPosition: "unknown",
        consentInteractionModel: null,
        consentPreferencesButtonCount: null,
        consentPersistenceMechanismDetected: null,
        consentRejectButtonCount: null,
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
        ruleExamples: [],
        discoveredLinks: [],
        domNodeCount: null,
        domStructureHash: null,
        initialCookieCount: null,
        initialCookieDomains: [],
        initialCookieNames: [],
        preconsentEvidenceUrls: [],
        sensitivePayloadViolations: [],
        scriptSrcDomains: [],
        scriptTagCount: 0,
        thirdPartyRequestCount: 0,
        thirdPartyRequestDomains: [],
        trackerDiagnostics: []
      };
    }

    await runInstrumentedStep(
      "runtime_stability_wait",
      () =>
        waitForBrowserRuntimeStability({
          getInflightRequests: () => inflightRequests,
          getLastNetworkActivityAt: () => lastNetworkActivityAt,
          maxWaitMs: input.plan.browserPostLoadWaitMs,
          page
        }),
      Math.max(BROWSER_PASS_STEP_TIMEOUT_MS, input.plan.browserPostLoadWaitMs + 2_000)
    );
    page.off("request", capturePreconsentState0Request);
    cookiesBeforeConsent = await runInstrumentedStep("preconsent_cookies", () =>
      browserHandle.context.cookies().catch(() => [])
    );
    firstPartyCookieSetBeforeConsent = cookiesBeforeConsent.some((cookie) => cookie.domain === input.domain || cookie.domain.endsWith(`.${input.domain}`));
    thirdPartyCookieSetBeforeConsent = cookiesBeforeConsent.some(
      (cookie) => !(cookie.domain === input.domain || cookie.domain.endsWith(`.${input.domain}`))
    );
  } catch {
    timedOut = true;
  }

  const content = await runInstrumentedStep("page_content", () => page.content().catch(() => ""));
  const discoveredLinks = await runInstrumentedStep("discover_links", () =>
    page
      .$$eval("a[href]", (elements) =>
        elements
          .map((element) => ({
            href: (element as HTMLAnchorElement).href,
            text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200)
          }))
          .filter((link) => Boolean(link.href))
      )
      .catch(() => [])
  );
  const domSummary = await runInstrumentedStep("dom_summary", () =>
    page
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
      .catch(() => null)
  );
  const scriptUrls = await runInstrumentedStep("script_urls", () =>
    page.$$eval("script[src]", (elements) => elements.map((element) => (element as HTMLScriptElement).src).filter(Boolean))
  );
  const consentState = await runInstrumentedStep("consent_state", () => evaluateConsentState(page).catch(() => ({
    cookieBannerPresent: false,
    acceptAllPresent: false,
    consentAcceptButtonCount: null,
    consentInteractionModel: null,
    consentPreferencesButtonCount: null,
    consentRejectButtonCount: null,
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
  })));
  const browserScripts = browserScriptsToMatches(scriptUrls);
  const cmpVendor = detectNamedVendor(content, browserScripts, CMP_VENDOR_SIGNATURES);
  const widgetVendor = detectNamedVendor(content, browserScripts, ACCESSIBILITY_WIDGET_SIGNATURES);
  const preconsentEvidenceUrls = [...preconsentRequestUrls];
  const sensitivePayloadViolations = [...sensitivePayloadViolationMap.values()];
  const preconsentTrackerMatchingUrls = [...new Set([...preconsentEvidenceUrls, ...scriptUrls])];
  const trackerDiagnostics = TRACKER_VENDOR_SIGNATURES.flatMap((signature) => {
    const matchedUrls = preconsentTrackerMatchingUrls
      .map((url) => ({ url, match: analyzeVendorRequestMatch(url, signature, input.domain) }))
      .filter((entry) => entry.match);

    if (matchedUrls.length === 0) {
      return [];
    }

    return [
      {
        collectionEndpointType: matchedUrls[0]!.match!.collectionEndpointType,
        detectionSource: "request",
        matchedSignatureId: signature.id,
        sampleUrls: matchedUrls.map((entry) => entry.url).slice(0, 3),
        vendorCategory: signature.category,
        vendorName: signature.name
      }
    ];
  });
  const trackerVendors = dedupeTrackers(
    TRACKER_VENDOR_SIGNATURES.flatMap((signature) => {
      const matchedRequest = preconsentTrackerMatchingUrls
        .map((url) => ({ url, match: analyzeVendorRequestMatch(url, signature, input.domain) }))
        .find((entry) => entry.match);
      if (!matchedRequest?.match) {
        return [];
      }

      const scriptHost = matchedRequest.match.requestHost;
      return [
        {
          scanId: input.scanId,
          vendorName: signature.name,
          vendorCategory: signature.category,
          detectionSource: "request",
          confidence: signature.confidence,
          firstPartyOrThirdParty: isFirstPartyHost(scriptHost, input.domain) ? "first_party" : "third_party",
          collectionEndpointType: matchedRequest.match.collectionEndpointType,
          beforeConsent: true,
          scriptHost,
          matchedSignatureId: signature.id
        } satisfies ScanTrackerVendor
      ];
    })
  );

  const axeResults = timedOut
    ? null
    : await runInstrumentedStep("axe_audit", () => runAxe(page).catch(() => null), BROWSER_PASS_AXE_TIMEOUT_MS);
  const normalizedViolations = axeResults ? normalizeAxeResults(axeResults) : [];
  const browserCookies = await runInstrumentedStep("postrun_cookies", () =>
    browserHandle.context.cookies().catch(() => {
      browserSessionUsable = false;
      return [];
    })
  );
  const serviceWorkerDetected = await runInstrumentedStep("service_worker_check", () =>
    page
      .evaluate(() => ("serviceWorker" in navigator ? navigator.serviceWorker.getRegistrations().then((registrations) => registrations.length > 0) : false))
      .catch(() => null)
  );
  const ruleCounts = dedupeRuleCounts(
    normalizedViolations.map((violation) => ({
      scanId: input.scanId,
      ruleCode: violation.ruleId,
      ruleGroup: violation.ruleId.split("-")[0] ?? violation.ruleId,
      severity: mapAxeImpactToSeverity(violation.impact),
      instanceCount: violation.nodeCount
    }))
  );
  const ruleExamples = buildAccessibilityRuleExamples({
    pageUrl: page.url(),
    scanId: input.scanId,
    violations: normalizedViolations
  });

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
      trackerCount: Math.max(trackerVendors.length, preconsentEvidenceUrls.length)
    }),
    serviceWorkerDetected,
    mixedContentDetected,
    preconsentTrackingDetected: preconsentEvidenceUrls.length > 0 || trackerVendors.length > 0,
    timedOut,
    trackerVendors,
    widgetVendor: widgetVendor?.name ?? null,
    ruleCounts,
    ruleExamples,
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
    preconsentEvidenceUrls,
    sensitivePayloadViolations,
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
    ).values()].sort(),
    trackerDiagnostics
  };
}

async function runBestBrowserPass(input: {
  domain: string;
  domainId: string;
  homepageUrl: string;
  organizationId: string | null;
  plan: ScanPlan;
  robotsPolicy?: RobotsPolicy | null;
  scanId: string;
  profileSweep?: boolean;
}) {
  const startedAt = Date.now();
  const ensureWithinSweepTimeout = async (phase: string) => {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs <= BROWSER_PASS_PROFILE_SWEEP_TIMEOUT_MS) {
      return;
    }

    await persistBuildPhaseDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      phase,
      status: "error",
      metadata: {
        elapsedMs,
        timeoutMs: BROWSER_PASS_PROFILE_SWEEP_TIMEOUT_MS
      }
    });

    throw new Error(`Browser pass profile sweep exceeded ${BROWSER_PASS_PROFILE_SWEEP_TIMEOUT_MS}ms during ${phase}.`);
  };

  const shouldSweepProfiles = input.profileSweep ?? true;
  const probeProfiles = shouldSweepProfiles ? getConsentProbeProfiles() : [{ name: "desktop_default", contextOptions: {} }];
  await persistBuildPhaseDiagnostic({
    scanId: input.scanId,
    domainId: input.domainId,
    organizationId: input.organizationId,
    phase: "browser_pass_profile_sweep",
    status: "start",
    metadata: {
      profileCount: probeProfiles.length,
      shouldSweepProfiles
    }
  });
  await ensureWithinSweepTimeout("browser_pass_profile_sweep:initial");
  let browserPass = await runBrowserPass({
    domain: input.domain,
    domainId: input.domainId,
    homepageUrl: input.homepageUrl,
    organizationId: input.organizationId,
    plan: input.plan,
    robotsPolicy: input.robotsPolicy,
    scanId: input.scanId,
    browserContextOptions: probeProfiles[0]?.contextOptions
  });
  await persistBuildPhaseDiagnostic({
    scanId: input.scanId,
    domainId: input.domainId,
    organizationId: input.organizationId,
    phase: "browser_pass_profile_result",
    status: "ok",
    metadata: {
      elapsedMs: Date.now() - startedAt,
      profileName: probeProfiles[0]?.name ?? "desktop_default",
      cookieBannerPresent: browserPass.cookieBannerPresent,
      cmpVendorName: browserPass.cmpVendorName,
      cookieCountTotal: browserPass.cookieCountTotal,
      trackerVendorCount: browserPass.trackerVendors.length
    }
  });

  if (!browserPass.cookieBannerPresent && shouldSweepProfiles) {
    const shouldRetryForVisibility =
      browserPass.cookieBannerPresent ||
      Boolean(browserPass.cmpVendorName) ||
      browserPass.trackerVendors.length > 0;
    await persistBuildPhaseDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      phase: "browser_pass_retry_decision",
      status: "ok",
      metadata: {
        elapsedMs: Date.now() - startedAt,
        shouldRetryForVisibility: Boolean(shouldRetryForVisibility),
        cookieBannerPresent: browserPass.cookieBannerPresent,
        cmpVendorName: browserPass.cmpVendorName,
        cookieCountTotal: browserPass.cookieCountTotal,
        trackerVendorCount: browserPass.trackerVendors.length
      }
    });

    if (shouldRetryForVisibility) {
      for (const profile of probeProfiles.slice(1)) {
        await ensureWithinSweepTimeout(`browser_pass_profile:${profile.name}:before`);
        await persistBuildPhaseDiagnostic({
          scanId: input.scanId,
          domainId: input.domainId,
          organizationId: input.organizationId,
          phase: "browser_pass_profile_attempt",
          status: "start",
          metadata: {
            elapsedMs: Date.now() - startedAt,
            profileName: profile.name
          }
        });
        const candidatePass = await runBrowserPass({
          domain: input.domain,
          domainId: input.domainId,
          homepageUrl: input.homepageUrl,
          organizationId: input.organizationId,
          plan: input.plan,
          robotsPolicy: input.robotsPolicy,
          scanId: input.scanId,
          browserContextOptions: profile.contextOptions
        });
        await persistBuildPhaseDiagnostic({
          scanId: input.scanId,
          domainId: input.domainId,
          organizationId: input.organizationId,
          phase: "browser_pass_profile_attempt",
          status: "ok",
          metadata: {
            elapsedMs: Date.now() - startedAt,
            profileName: profile.name,
            cookieBannerPresent: candidatePass.cookieBannerPresent,
            cmpVendorName: candidatePass.cmpVendorName,
            cookieCountTotal: candidatePass.cookieCountTotal,
            trackerVendorCount: candidatePass.trackerVendors.length
          }
        });

        const candidateImprovesVisibility =
          candidatePass.cookieBannerPresent ||
          (!browserPass.cmpVendorName && Boolean(candidatePass.cmpVendorName)) ||
          candidatePass.consentAcceptButtonCount !== browserPass.consentAcceptButtonCount ||
          candidatePass.consentRejectButtonCount !== browserPass.consentRejectButtonCount ||
          candidatePass.consentPreferencesButtonCount !== browserPass.consentPreferencesButtonCount;
        await persistBuildPhaseDiagnostic({
          scanId: input.scanId,
          domainId: input.domainId,
          organizationId: input.organizationId,
          phase: "browser_pass_profile_compare",
          status: "ok",
          metadata: {
            elapsedMs: Date.now() - startedAt,
            profileName: profile.name,
            candidateImprovesVisibility
          }
        });

        if (candidateImprovesVisibility) {
          browserPass = candidatePass;
        }

        if (candidatePass.cookieBannerPresent) {
          break;
        }
      }
    }
  }

  await persistBuildPhaseDiagnostic({
    scanId: input.scanId,
    domainId: input.domainId,
    organizationId: input.organizationId,
    phase: "browser_pass_profile_sweep",
    status: "ok",
    metadata: {
      elapsedMs: Date.now() - startedAt,
      cookieBannerPresent: browserPass.cookieBannerPresent,
      cmpVendorName: browserPass.cmpVendorName,
      cookieCountTotal: browserPass.cookieCountTotal,
      trackerVendorCount: browserPass.trackerVendors.length
    }
  });

  return browserPass;
}

async function fetchTargetsWithConcurrency(input: {
  attemptedTargetUrls?: Set<string>;
  coverageTargetTypes?: Set<StaticPageResult["pageType"]>;
  homepageUrl: string;
  concurrency: number;
  fetchedPagesByUrl: Map<string, StaticPageResult>;
  domainId?: string;
  onTargetResult?: (result: {
    fetchOutcome: StaticPageResult["fetchStatus"];
    finalUrl: string | null;
    pageType: StaticPageResult["pageType"];
    statusCode: number | null;
    targetUrl: string;
  }) => void;
  organizationId?: string | null;
  phase?: string;
  robotsPolicy?: RobotsPolicy | null;
  scanId?: string;
  targets: Array<{
    pageType: StaticPageResult["pageType"];
    priority: number;
    url: string;
  }>;
}) {
  const queue = input.targets.filter(
    (target) => !input.fetchedPagesByUrl.has(target.url) && !(input.attemptedTargetUrls?.has(target.url) ?? false)
  );
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

      const phase = input.phase ?? "expansion_fetch_target";
      const targetMetadata = {
        pageType: target.pageType,
        targetUrl: target.url
      } satisfies Record<string, unknown>;
      input.attemptedTargetUrls?.add(target.url);

      if (input.scanId && input.domainId) {
        await persistBuildPhaseDiagnostic({
          scanId: input.scanId,
          domainId: input.domainId,
          organizationId: input.organizationId ?? null,
          phase,
          status: "start",
          metadata: targetMetadata
        });
      }

      const startedAt = Date.now();
      const page = await withStepTimeout(
        STATIC_FETCH_TARGET_TIMEOUT_MS,
        `Static fetch ${target.url}`,
        () =>
          fetchStaticPage({
            pageType: target.pageType,
            robotsPolicy: sameHostname(target.url, input.homepageUrl) ? input.robotsPolicy : null,
            url: target.url
          })
      ).catch(async (error) => {
        input.onTargetResult?.({
          fetchOutcome: "error",
          finalUrl: null,
          pageType: target.pageType,
          statusCode: null,
          targetUrl: target.url
        });
        if (input.scanId && input.domainId) {
          await persistBuildPhaseDiagnostic({
            scanId: input.scanId,
            domainId: input.domainId,
            organizationId: input.organizationId ?? null,
            phase,
            status: "error",
            metadata: {
              ...targetMetadata,
              elapsedMs: Date.now() - startedAt,
              error: error instanceof Error ? error.message : "Unknown error"
            }
          });
        }

        return null;
      });

      if (!page) {
        continue;
      }

      input.fetchedPagesByUrl.set(page.pageUrl, page);
      input.onTargetResult?.({
        fetchOutcome: page.fetchStatus,
        finalUrl: page.finalUrl,
        pageType: page.pageType,
        statusCode: page.statusCode,
        targetUrl: target.url
      });

      if (input.scanId && input.domainId) {
        await persistBuildPhaseDiagnostic({
          scanId: input.scanId,
          domainId: input.domainId,
          organizationId: input.organizationId ?? null,
          phase,
          status: "ok",
          metadata: {
            ...targetMetadata,
            elapsedMs: Date.now() - startedAt,
            fetchStatus: page.fetchStatus,
            finalUrl: page.finalUrl,
            statusCode: page.statusCode
          }
        });
      }
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
  const attemptedTargetUrls = new Set<string>();
  const keyPageFetchAttempts = new Map<string, KeyPageFetchAttempt>();
  const recordKeyPageFetchAttempt = (result: {
    fetchOutcome: StaticPageResult["fetchStatus"];
    finalUrl: string | null;
    pageType: StaticPageResult["pageType"];
    statusCode: number | null;
    targetUrl: string;
  }) => {
    if (!KEY_PAGE_TYPES.includes(result.pageType as (typeof KEY_PAGE_TYPES)[number])) {
      return;
    }

    keyPageFetchAttempts.set(result.targetUrl, {
      candidateUrl: result.targetUrl,
      fetchOutcome: result.fetchOutcome
    });
  };
  const preBrowserKeyPageDiscovery = await buildKeyPageDiscoveryState({
    homepageLanguage: homepage.language,
    homepageUrl,
    renderedLinks: homepage.links,
    renderedSource: "rendered_link",
    robotsPolicy: robotsState.policy,
    robotsTxtBody: robotsState.robotsTxtBody,
    sitemapUrls: robotsState.sitemapUrls,
    sourceUrl: homepageUrl
  });
  const preBrowserCandidates = mergeCandidateTargets(
    discoverCandidatePages(homepageUrl, homepage.links),
    preBrowserKeyPageDiscovery.candidates
  )
    .filter((target) => !sameHostname(target.url, homepageUrl) || isUrlAllowedByRobots(target.url, robotsState.policy))
    .sort((left, right) => right.priority - left.priority)
    .sort((left, right) => priorityForPage(right.pageType) - priorityForPage(left.pageType));

  const prefetchedTargets = selectTargets(preBrowserCandidates, prefetchTargetCount);
  const prefetchedPagesByUrl = new Map<string, StaticPageResult>();
  await fetchTargetsWithConcurrency({
    coverageTargetTypes: getCoverageTargetTypes(prefetchedTargets, prefetchTargetCount),
    homepageUrl,
    concurrency: staticFetchConcurrency,
    domainId: input.domainId,
    fetchedPagesByUrl: prefetchedPagesByUrl,
    organizationId: input.organizationId,
    robotsPolicy: robotsState.policy,
    scanId: input.scanId,
    attemptedTargetUrls,
    onTargetResult: recordKeyPageFetchAttempt,
    phase: "prefetch_fetch_target",
    targets: prefetchedTargets
  });
  const prefetchedPages: StaticPageResult[] = [...prefetchedPagesByUrl.values()];

  if (!prefetchedPages.some((page) => page.pageUrl === homepage.pageUrl)) {
    prefetchedPages.unshift(homepage);
  } else {
    homepage = prefetchedPages.find((page) => page.pageType === "homepage") ?? homepage;
  }

  const browserPass = await runBestBrowserPass({
    domain: new URL(homepageUrl).hostname,
    domainId: input.domainId,
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
        consentAcceptButtonCount: null,
        consentModeDetected: false,
        consentInteractionModel: null,
        consentPreferencesButtonCount: null,
        cookieBannerPresent: false,
        cookiePolicyLinkedFromBanner: false,
        consentRejectButtonCount: null,
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
        ruleExamples: [],
        discoveredLinks: [],
        domNodeCount: null,
        domStructureHash: null,
        initialCookieCount: null,
        initialCookieDomains: [],
        initialCookieNames: [],
        preconsentEvidenceUrls: [],
        sensitivePayloadViolations: [],
        scriptSrcDomains: [],
        scriptTagCount: 0,
        thirdPartyRequestCount: 0,
        thirdPartyRequestDomains: [],
        trackerDiagnostics: []
      }) satisfies BrowserPassResult
  );

  let keyPageDiscoveryState = mergeKeyPageDiscoveryStates([
    preBrowserKeyPageDiscovery,
    await buildKeyPageDiscoveryState({
      homepageLanguage: homepage.language,
      homepageUrl,
      renderedLinks: browserPass.discoveredLinks,
      renderedSource: "rendered_link",
      robotsPolicy: robotsState.policy,
      sourceUrl: homepageUrl
    })
  ]);

  const candidates = mergeCandidateTargets(
    discoverCandidatePages(homepageUrl, [...homepage.links, ...browserPass.discoveredLinks]),
    keyPageDiscoveryState.candidates
  )
    .filter((target) => !sameHostname(target.url, homepageUrl) || isUrlAllowedByRobots(target.url, robotsState.policy))
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
    await persistBuildPhaseDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      phase: "expansion_fetch",
      status: "start",
      metadata: {
        targetCount: expansionTargets.length,
        coverageTargetTypes: [...expansionCoverageTargetTypes.values()].sort()
      }
    });
    await fetchTargetsWithConcurrency({
      coverageTargetTypes: expansionCoverageTargetTypes,
      homepageUrl,
      concurrency: staticFetchConcurrency,
      domainId: input.domainId,
      fetchedPagesByUrl,
      organizationId: input.organizationId,
      robotsPolicy: robotsState.policy,
      scanId: input.scanId,
      attemptedTargetUrls,
      onTargetResult: recordKeyPageFetchAttempt,
      targets: expansionTargets
    });
    await persistBuildPhaseDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      phase: "expansion_fetch",
      status: "ok",
      metadata: {
        fetchedPageCount: fetchedPagesByUrl.size
      }
    });
  }

  if (!isPreviewScan) {
    let remainingAdditionalFetchAttempts: number = KEY_PAGE_DISCOVERY_BUDGETS.maxAdditionalFetchAttempts;
    const attemptedLegalHubUrls = new Set<string>();
    const secondHopUsageByType = new Map<string, number>();

    while (remainingAdditionalFetchAttempts > 0) {
      const currentPages = [...fetchedPagesByUrl.values()];
      const missingKeyPageTypes = getMissingKeyPageTypes(currentPages);
      if (missingKeyPageTypes.length === 0) {
        break;
      }

      const additionalTargets = toKeyPageFetchTargets({
        attemptedUrls: attemptedTargetUrls,
        candidates: keyPageDiscoveryState.candidates.filter((candidate) => missingKeyPageTypes.includes(candidate.pageType)),
        fetchedPages: currentPages,
        maxAttemptsPerType: KEY_PAGE_DISCOVERY_BUDGETS.maxFetchAttemptsPerType,
        maxTotalAttempts: Math.min(remainingAdditionalFetchAttempts, KEY_PAGE_DISCOVERY_BUDGETS.maxAdditionalFetchAttempts)
      }).map((candidate) => ({
        pageType: candidate.pageType,
        priority: priorityForPage(candidate.pageType) + candidate.candidateScore,
        url: candidate.candidateUrl
      }));

      if (additionalTargets.length > 0) {
        await fetchTargetsWithConcurrency({
          coverageTargetTypes: new Set(missingKeyPageTypes),
          homepageUrl,
          concurrency: staticFetchConcurrency,
          domainId: input.domainId,
          fetchedPagesByUrl,
          organizationId: input.organizationId,
          robotsPolicy: robotsState.policy,
          scanId: input.scanId,
          attemptedTargetUrls,
          onTargetResult: recordKeyPageFetchAttempt,
          phase: "key_page_coverage_fetch_target",
          targets: additionalTargets
        });
        remainingAdditionalFetchAttempts = Math.max(0, remainingAdditionalFetchAttempts - additionalTargets.length);
        continue;
      }

      const hubCandidate = keyPageDiscoveryState.legalHubCandidates.find((candidate) => {
        if (attemptedLegalHubUrls.has(candidate.candidateUrl)) {
          return false;
        }

        return missingKeyPageTypes.some(
          (pageType) =>
            (secondHopUsageByType.get(pageType) ?? 0) < KEY_PAGE_DISCOVERY_BUDGETS.maxSecondHopLegalHubFetchesPerMissingType
        );
      });

      if (!hubCandidate) {
        break;
      }

      attemptedLegalHubUrls.add(hubCandidate.candidateUrl);
      remainingAdditionalFetchAttempts = Math.max(0, remainingAdditionalFetchAttempts - 1);
      for (const pageType of missingKeyPageTypes) {
        secondHopUsageByType.set(pageType, (secondHopUsageByType.get(pageType) ?? 0) + 1);
      }

      const hubPhaseMetadata = {
        sourceUrl: hubCandidate.sourceUrl,
        targetUrl: hubCandidate.candidateUrl
      } satisfies Record<string, unknown>;
      await persistBuildPhaseDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        phase: "key_page_legal_hub_fetch",
        status: "start",
        metadata: hubPhaseMetadata
      });
      const hubStartedAt = Date.now();
      const legalHubPage = await withStepTimeout(
        STATIC_FETCH_TARGET_TIMEOUT_MS,
        `Static fetch ${hubCandidate.candidateUrl}`,
        () =>
          fetchStaticPage({
            pageType: "other",
            robotsPolicy: sameHostname(hubCandidate.candidateUrl, homepageUrl) ? robotsState.policy : null,
            url: hubCandidate.candidateUrl
          })
      ).catch(async (error) => {
        await persistBuildPhaseDiagnostic({
          scanId: input.scanId,
          domainId: input.domainId,
          organizationId: input.organizationId,
          phase: "key_page_legal_hub_fetch",
          status: "error",
          metadata: {
            ...hubPhaseMetadata,
            elapsedMs: Date.now() - hubStartedAt,
            error: error instanceof Error ? error.message : "Unknown error"
          }
        });
        return null;
      });

      if (!legalHubPage) {
        continue;
      }

      await persistBuildPhaseDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        phase: "key_page_legal_hub_fetch",
        status: "ok",
        metadata: {
          ...hubPhaseMetadata,
          elapsedMs: Date.now() - hubStartedAt,
          fetchStatus: legalHubPage.fetchStatus,
          finalUrl: legalHubPage.finalUrl,
          statusCode: legalHubPage.statusCode
        }
      });

      keyPageDiscoveryState = mergeKeyPageDiscoveryStates([
        keyPageDiscoveryState,
        await buildKeyPageDiscoveryState({
          homepageLanguage: legalHubPage.language ?? homepage.language,
          homepageUrl,
          renderedLinks: legalHubPage.links,
          renderedSource: "second_hop_legal_hub",
          robotsPolicy: robotsState.policy,
          sourceUrl: legalHubPage.finalUrl ?? hubCandidate.candidateUrl
        })
      ]);
    }
  }

  if (!isPreviewScan) {
    await persistBuildPhaseDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      phase: "upgrade_thin_policy_pages",
      status: "start",
      metadata: {
        fetchedPageCount: fetchedPagesByUrl.size
      }
    });
    const thinPolicyUpgradeTimeoutMs = Math.max(
      5_000,
      Number.parseInt(process.env.THIN_POLICY_UPGRADE_TIMEOUT_MS ?? "30000", 10) || 30_000
    );
    try {
      await withStepTimeout(thinPolicyUpgradeTimeoutMs, "Thin policy upgrade", () =>
        upgradeThinPolicyPages({
          domainId: input.domainId,
          fetchedPagesByUrl,
          organizationId: input.organizationId,
          plan: scanPlan,
          robotsPolicy: robotsState.policy,
          scanId: input.scanId
        })
      );
      await persistBuildPhaseDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        phase: "upgrade_thin_policy_pages",
        status: "ok",
        metadata: {
          fetchedPageCount: fetchedPagesByUrl.size
        }
      });
    } catch (error) {
      await persistBuildPhaseDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        phase: "upgrade_thin_policy_pages",
        status: "error",
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error",
          fetchedPageCount: fetchedPagesByUrl.size
        }
      });
    }
  }

  const fetchedPages = [...fetchedPagesByUrl.values()];
  const successfulPages = fetchedPages.filter((page) => page.fetchStatus === "ok" || page.fetchStatus === "redirected");
  const browserDiscoveredUrls = new Set(browserPass.discoveredLinks.map((link) => link.href));
  const browserDiscoveredPageTypes = new Set(
    discoverCandidatePages(homepageUrl, browserPass.discoveredLinks)
      .filter((candidate) => browserDiscoveredUrls.has(candidate.url))
      .map((candidate) => candidate.pageType)
      .filter((pageType) => pageType !== "homepage" && pageType !== "other")
  );
  const keyPageDiscoverySummary = buildKeyPageDiscoverySummary({
    attemptedUrls: attemptedTargetUrls,
    candidates: keyPageDiscoveryState.candidates,
    fetchAttempts: keyPageFetchAttempts,
    fetchedPages,
    homepageUrl,
    localeHints: keyPageDiscoveryState.localeHints,
    sameBrandSubdomainHostsInspected: keyPageDiscoveryState.sameBrandSubdomainHostsInspected,
    sitemapFilesFetched: keyPageDiscoveryState.sitemapFilesFetched,
    sitemapIndexUrlsFetched: keyPageDiscoveryState.sitemapIndexUrlsFetched,
    sitemapUrls: keyPageDiscoveryState.sitemapUrls
  });
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
  const staticTrackerDiagnostics = buildStaticTrackerDiagnostics(successfulPages);

  const allTrackers = dedupeTrackers([...staticTrackers, ...browserPass.trackerVendors]);
  const advertisingSignals = deriveAdvertisingClassification(allTrackers);
  const aiSignals = deriveAiInfrastructureSignals({
    pages: successfulPages,
    chatSupportVendor: techSignals.chatSupportVendor
  });
  const commercialSignals = deriveExpandedCommercialSignals(successfulPages);
  const trackerSummary = summarizeTrackers(allTrackers);
  const directSensitivePayloadDetected = browserPass.sensitivePayloadViolations.length > 0;
  const sessionReplayDisclosurePresent = policyPages.some((page) =>
    /\bsession replay\b|record your interactions|replay your session/i.test(`${page.title ?? ""} ${page.textContent}`)
  );
  const policyLlmTriggerReasons = isPreviewScan
    ? []
    : derivePolicyLlmTriggerReasons({
        aiAssistantWidgetDetected: aiSignals.aiAssistantWidgetDetected,
        aiDisclosureTextPresent: aiSignals.aiDisclosureTextPresent,
        autoRenewDisclosurePresent: commercialSignals.autoRenewDisclosurePresent,
        freeTrialDetected: commercialSignals.freeTrialDetected,
        highSensitivityDataCollectionDetected: formSignals.highSensitivityDataCollectionDetected || directSensitivePayloadDetected,
        policyBehaviorConflictCandidate: trackerSummary.advertisingTrackerCount > 0 && policySignals.doNotSellLinkPresent,
        sessionReplayWithoutDisclosureCandidate: trackerSummary.sessionReplayTrackerCount > 0 && !sessionReplayDisclosurePresent,
        subscriptionTermsPresent: commercialSignals.subscriptionTermsPresent
      });
  await persistBuildPhaseDiagnostic({
    scanId: input.scanId,
    domainId: input.domainId,
    organizationId: input.organizationId,
    phase: "policy_enrichment",
    status: "start",
    metadata: {
      policyPageCount: policyPages.length,
      triggerReasonCount: policyLlmTriggerReasons.length
    }
  });
  const policyEnrichmentTimeoutMs = Math.max(5_000, Number.parseInt(process.env.POLICY_ENRICHMENT_TIMEOUT_MS ?? "60000", 10) || 60_000);
  let policyEnrichmentBundle: Awaited<ReturnType<typeof enrichPolicyPages>>;
  try {
    policyEnrichmentBundle = await withStepTimeout(policyEnrichmentTimeoutMs, "Policy enrichment", () =>
      enrichPolicyPages({
        scanId: input.scanId,
        organizationId: input.organizationId,
        domainId: input.domainId,
        pages: policyPages,
        advertisingTrackerCount: trackerSummary.advertisingTrackerCount,
        sessionReplayTrackerCount: trackerSummary.sessionReplayTrackerCount,
        euExposureLikely: jurisdictionSignals.euExposureLikely,
        californiaExposureLikely: jurisdictionSignals.californiaExposureLikely,
        allowLlm: !isPreviewScan,
        archiveSource: null,
        forceLlm: false,
        llmTriggerReasons: policyLlmTriggerReasons
      })
    );
    await persistBuildPhaseDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      phase: "policy_enrichment",
      status: "ok",
      metadata: {
        diagnosticCount: policyEnrichmentBundle.diagnostics.length,
        snapshotOverrideKeys: Object.keys(policyEnrichmentBundle.snapshotOverrides ?? {}).length
      }
    });
  } catch (error) {
    await persistBuildPhaseDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      phase: "policy_enrichment",
      status: "error",
      metadata: {
        message: error instanceof Error ? error.message : "Unknown policy enrichment failure.",
        timeoutMs: policyEnrichmentTimeoutMs
      }
    });
    policyEnrichmentBundle = {
      diagnostics: [],
      enrichments: [],
      evidences: [],
      primaryPolicyEnrichmentId: null,
      reviewQueueItems: [],
      snapshotOverrides: {}
    };
  }
  for (const diagnostic of policyEnrichmentBundle.diagnostics) {
    await persistPolicyLlmDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      message: "Policy LLM chunk selection and execution summary recorded.",
      metadata: diagnostic
    });
  }
  const privacyCookieNoTrackingClaimed = policyEnrichmentBundle.enrichments.some(
    (enrichment) =>
      (enrichment.pageType === "privacy_policy" || enrichment.pageType === "cookie_policy") &&
      enrichment.policyClaimNoTracking === true
  );
  const privacyCookiePolicyConflictDetected =
    privacyCookieNoTrackingClaimed &&
    (trackerSummary.trackerCountTotal > 0 ||
      trackerSummary.advertisingTrackerCount > 0 ||
      trackerSummary.sessionReplayTrackerCount > 0 ||
      browserPass.preconsentTrackingDetected);
  const policyTermsConflictDetected = derivePolicyTermsConflictDetected({
    policyPages,
    policyEnrichments: policyEnrichmentBundle.enrichments
  });
  await persistBuildPhaseDiagnostic({
    scanId: input.scanId,
    domainId: input.domainId,
    organizationId: input.organizationId,
    phase: "tracker_diagnostic_persist",
    status: "start",
    metadata: {
      diagnosticCount: browserPass.trackerDiagnostics.length + staticTrackerDiagnostics.length
    }
  });
  for (const diagnostic of [...browserPass.trackerDiagnostics, ...staticTrackerDiagnostics]) {
    await persistTrackerVendorDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      message: `Tracker vendor ${diagnostic.vendorName} detection samples recorded.`,
      metadata: diagnostic
    });
  }
  await persistBuildPhaseDiagnostic({
    scanId: input.scanId,
    domainId: input.domainId,
    organizationId: input.organizationId,
    phase: "tracker_diagnostic_persist",
    status: "ok",
    metadata: {
      diagnosticCount: browserPass.trackerDiagnostics.length + staticTrackerDiagnostics.length
    }
  });
  const accessibilitySummary = buildAccessibilitySummary(browserPass.ruleCounts);
  const accessibilityWidget = detectAccessibilityWidgetFromPages(successfulPages);
  const cmpVendor = browserPass.cmpVendorName ? { name: browserPass.cmpVendorName, confidence: browserPass.cmpVendorConfidence } : detectCmpVendorFromPage(homepage);
  let securityTxt = null;
  if (!isPreviewScan) {
    const securityTxtUrl = new URL("/.well-known/security.txt", homepageUrl).toString();
    await persistBuildPhaseDiagnostic({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      phase: "security_txt_fetch",
      status: "start",
      metadata: {
        url: securityTxtUrl
      }
    });
    const startedAt = Date.now();
    securityTxt = await withStepTimeout(
      SECURITY_TXT_FETCH_TIMEOUT_MS,
      `security.txt fetch ${securityTxtUrl}`,
      () =>
        fetchTextPage(securityTxtUrl, 5, {
          robotsPolicy: robotsState.policy
        })
    ).catch(async (error) => {
      await persistBuildPhaseDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        phase: "security_txt_fetch",
        status: "error",
        metadata: {
          elapsedMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : "Unknown error",
          url: securityTxtUrl
        }
      });
      return null;
    });
    if (securityTxt) {
      await persistBuildPhaseDiagnostic({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        phase: "security_txt_fetch",
        status: "ok",
        metadata: {
          elapsedMs: Date.now() - startedAt,
          statusCode: securityTxt.status,
          timedOut: securityTxt.timedOut,
          url: securityTxtUrl
        }
      });
    }
  }
  const homepageHeaders: Record<string, string> = homepage.headers;
  await persistBuildPhaseDiagnostic({
    scanId: input.scanId,
    domainId: input.domainId,
    organizationId: input.organizationId,
    phase: "consent_audit_entry",
    status: "start",
    metadata: {
      cookieBannerPresent: browserPass.cookieBannerPresent,
      cmpVendorName: cmpVendor?.name ?? null
    }
  });
  const consentInteractionAudit =
    !isPreviewScan && (browserPass.cookieBannerPresent || cmpVendor?.name)
      ? await runConsentInteractionAudit(homepageUrl, {
          domainId: input.domainId,
          organizationId: input.organizationId,
          scanId: input.scanId
        }).catch(() => null)
      : null;
  await persistBuildPhaseDiagnostic({
    scanId: input.scanId,
    domainId: input.domainId,
    organizationId: input.organizationId,
    phase: "consent_audit_entry",
    status: "ok",
    metadata: {
      consentAuditCompleted: Boolean(consentInteractionAudit)
    }
  });
  const consentSurfaceDetected =
    browserPass.cookieBannerPresent ||
    Boolean(consentInteractionAudit?.postReject.interactionSucceeded || consentInteractionAudit?.postAccept.interactionSucceeded);
  const rejectAllPresent =
    browserPass.rejectAllPresent || Boolean(consentInteractionAudit?.postReject.interactionSucceeded);
  const acceptAllPresent =
    browserPass.acceptAllPresent || Boolean(consentInteractionAudit?.postAccept.interactionSucceeded);
  const consentInteractionModel =
    browserPass.consentInteractionModel ??
    (rejectAllPresent && acceptAllPresent
      ? "accept_reject"
      : rejectAllPresent
        ? "other"
        : acceptAllPresent
          ? "accept_only"
          : null);
  const consentMechanismType: ScanSnapshot["consentMechanismType"] = consentSurfaceDetected
    ? cmpVendor?.name
      ? "cmp"
      : browserPass.granularPreferencesPresent || rejectAllPresent
        ? "modal"
        : "banner"
    : "none";
  const preconsentBaselineEvidence = summarizePreconsentBaselineEvidence({
    browserPassPreconsentEvidenceUrls: browserPass.preconsentEvidenceUrls,
    browserPassTrackerVendorNames: browserPass.trackerVendors.map((vendor) => vendor.vendorName),
    consentAuditBaselineEvidenceUrls: consentInteractionAudit?.baseline.trackerEvidenceUrls ?? [],
    consentAuditBaselineTrackerVendorNames: consentInteractionAudit?.baseline.trackerVendorNames ?? []
  });
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
    domNodeCount: browserPass.domNodeCount,
    consentAuditCompleted: consentInteractionAudit ? true : null,
    consentRejectInteractionSucceeded: consentInteractionAudit?.postReject.interactionSucceeded ?? null,
    consentAcceptInteractionSucceeded: consentInteractionAudit?.postAccept.interactionSucceeded ?? null,
    consentRejectReducedTracking: consentInteractionAudit
      ? consentInteractionAudit.postReject.trackerVendorNames.length < consentInteractionAudit.baseline.trackerVendorNames.length
      : null,
    consentRejectReducedThirdPartyCookies: consentInteractionAudit
      ? consentInteractionAudit.postReject.thirdPartyCookieCount < consentInteractionAudit.baseline.thirdPartyCookieCount
      : null,
    consentBaselineCookieCount: consentInteractionAudit?.baseline.cookieCount ?? null,
    consentBaselineThirdPartyCookieCount: consentInteractionAudit?.baseline.thirdPartyCookieCount ?? null,
    consentPreconsentViolationCount: preconsentBaselineEvidence.violationCount > 0 ? preconsentBaselineEvidence.violationCount : null,
    consentBaselineTrackerEvidenceUrls: preconsentBaselineEvidence.trackerEvidenceUrls,
    consentBaselineTrackerVendorNames: preconsentBaselineEvidence.trackerVendorNames,
    sensitivePayloadViolations: browserPass.sensitivePayloadViolations,
    keyPageDiscoverySummary,
    consentRejectPersistedTrackerVendorNames: consentInteractionAudit?.rejectPersistedTrackerVendorNames ?? [],
    consentRejectNewTrackerVendorNames: consentInteractionAudit?.rejectNewTrackerVendorNames ?? [],
    consentRejectClickCount: consentInteractionAudit?.postReject.clickCount ?? null,
    consentAcceptClickCount: consentInteractionAudit?.postAccept.clickCount ?? null,
    consentOptInClicks: consentInteractionAudit?.optInClicks ?? null,
    consentOptOutClicks: consentInteractionAudit?.optOutClicks ?? null,
    consentFrictionDelta: consentInteractionAudit?.consentFrictionDelta ?? null,
    consentRedirectOrAuthRequired: consentInteractionAudit?.consentRedirectOrAuthRequired ?? null,
    consentOptInEvidenceLog: consentInteractionAudit?.optInEvidenceLog ?? [],
    consentOptOutEvidenceLog: consentInteractionAudit?.optOutEvidenceLog ?? [],
    consentPostRejectCookieCount: consentInteractionAudit?.postReject.cookieCount ?? null,
    consentPostRejectThirdPartyCookieCount: consentInteractionAudit?.postReject.thirdPartyCookieCount ?? null,
    consentPostRejectTrackerEvidenceUrls: consentInteractionAudit?.postReject.trackerEvidenceUrls ?? [],
    consentPostRejectTrackerVendorNames: consentInteractionAudit?.postReject.trackerVendorNames ?? [],
    consentAcceptNewTrackerVendorNames: consentInteractionAudit?.acceptNewTrackerVendorNames ?? [],
    consentPostAcceptCookieCount: consentInteractionAudit?.postAccept.cookieCount ?? null,
    consentPostAcceptThirdPartyCookieCount: consentInteractionAudit?.postAccept.thirdPartyCookieCount ?? null,
    consentPostAcceptTrackerEvidenceUrls: consentInteractionAudit?.postAccept.trackerEvidenceUrls ?? [],
    consentPostAcceptTrackerVendorNames: consentInteractionAudit?.postAccept.trackerVendorNames ?? []
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
    : await (async () => {
        await persistBuildPhaseDiagnostic({
          scanId: input.scanId,
          domainId: input.domainId,
          organizationId: input.organizationId,
          phase: "network_enrichment",
          status: "start",
          metadata: {
            hostname,
            registeredDomain
          }
        });
        const result = await Promise.all([
          cachedDnsSignals ? Promise.resolve(cachedDnsSignals) : fetchDnsSignals(registeredDomain),
          cachedTlsMetadata ? Promise.resolve(cachedTlsMetadata) : fetchTlsMetadata(hostname),
          cachedDomainRegistration ? Promise.resolve(cachedDomainRegistration) : fetchDomainRegistration(registeredDomain)
        ]);
        await persistBuildPhaseDiagnostic({
          scanId: input.scanId,
          domainId: input.domainId,
          organizationId: input.organizationId,
          phase: "network_enrichment",
          status: "ok",
          metadata: {
            hostname,
            registeredDomain
          }
        });
        return result;
      })();
  const allText = successfulPages.map((page) => page.textContent).join("\n");
  const keyPageCoverage = summarizeKeyPageCoverage({
    discoveredPageTypes: new Set(
      keyPageDiscoverySummary.pageSummaries.filter((summary) => summary.surfaceDetected).map((summary) => summary.pageType)
    ),
    failedAttemptedUrlsByPageType: Object.fromEntries(
      keyPageDiscoverySummary.pageSummaries.map((summary) => [summary.pageType, summary.successfulUrl ? [] : summary.attemptedUrls])
    ) as Partial<Record<StaticPageResult["pageType"], string[]>>,
    fetchedPages
  });
  const privacyPolicyPresent = keyPageCoverage.find((row) => row.pageType === "privacy_policy")?.fetched === true;
  const termsOfServicePresent = keyPageCoverage.find((row) => row.pageType === "terms_of_service")?.fetched === true;
  const cookiePolicyPresent = keyPageCoverage.find((row) => row.pageType === "cookie_policy")?.fetched === true;
  const accessibilityStatementPresent = keyPageCoverage.find((row) => row.pageType === "accessibility_statement")?.fetched === true;
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
  const contactPagePresent = keyPageCoverage.find((row) => row.pageType === "contact")?.fetched === true;
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
    cookieBannerPresent: consentSurfaceDetected,
    consentMechanismType,
    cmpVendorName: cmpVendor?.name ?? null,
    cmpVendorConfidence: cmpVendor?.confidence ?? null,
    consentInteractionModel,
    consentAcceptButtonCount: browserPass.consentAcceptButtonCount,
    consentRejectButtonCount: browserPass.consentRejectButtonCount,
    consentPreferencesButtonCount: browserPass.consentPreferencesButtonCount,
    rejectAllPresent,
    acceptAllPresent,
    granularPreferencesPresent: browserPass.granularPreferencesPresent,
    preconsentTrackingDetected: browserPass.preconsentTrackingDetected,
    cookiePolicyLinkedFromBanner: browserPass.cookiePolicyLinkedFromBanner,
    consentModeDetected: browserPass.consentModeDetected,
    darkPatternAcceptEmphasis: browserPass.darkPatternAcceptEmphasis,
    darkPatternRejectHidden: rejectAllPresent ? false : browserPass.darkPatternRejectHidden,
    darkPatternRejectButtonMissing: rejectAllPresent ? false : browserPass.darkPatternRejectButtonMissing,
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
    highSensitivityDataCollectionDetected: formSignals.highSensitivityDataCollectionDetected || directSensitivePayloadDetected,
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
    discountClaimPresent: commercialSignals.discountClaimPresent,
    originalPriceComparisonPresent: commercialSignals.originalPriceComparisonPresent,
    limitedTimeOfferLanguagePresent: commercialSignals.limitedTimeOfferLanguagePresent,
    refundOrReturnWindowDetected: commercialSignals.refundPolicyWindowDays !== null,
    refundPolicyWindowDays: commercialSignals.refundPolicyWindowDays,
    refundPolicyConditionsPresent: commercialSignals.refundPolicyConditionsPresent,
    refundRequestMethodPresent: commercialSignals.refundRequestMethodPresent,
    storeCreditOnlyPolicyPresent: commercialSignals.storeCreditOnlyPolicyPresent,
    exchangePolicyPresent: commercialSignals.exchangePolicyPresent,
    shippingTermsDetected: /shipping policy|delivery times|shipping rates/i.test(allText),
    renewalNoticePeriodPresent: commercialSignals.renewalNoticePeriodPresent,
    terminationForCauseClausePresent: commercialSignals.terminationForCauseClausePresent,
    accountDeletionTermsPresent: commercialSignals.accountDeletionTermsPresent,
    serviceSuspensionOrTerminationTermsPresent: commercialSignals.serviceSuspensionOrTerminationTermsPresent,
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
    policyTermsConflictDetected,
    privacyCookiePolicyConflictDetected,
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
    consentAcceptButtonCount: partiallyBuiltSnapshot.consentAcceptButtonCount,
    consentInteractionModel: partiallyBuiltSnapshot.consentInteractionModel,
    consentPreferencesButtonCount: partiallyBuiltSnapshot.consentPreferencesButtonCount,
    consentRejectButtonCount: partiallyBuiltSnapshot.consentRejectButtonCount,
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
  const baselineRightsFrictionScore =
    (partiallyBuiltSnapshot.privacyContactChannelType === "none" ? 45 : 0) +
    (partiallyBuiltSnapshot.privacyRequestFormPresent ? 0 : 10) +
    (partiallyBuiltSnapshot.dataAccessRequestPresent ? 0 : 15) +
    (partiallyBuiltSnapshot.dataDeletionRequestPresent ? 0 : 15) +
    (partiallyBuiltSnapshot.consentWithdrawalMechanismPresent ? 0 : 15);
  const runtimeRightsFrictionScore =
    runtimeArtifacts.consentRedirectOrAuthRequired === true
      ? 100
      : typeof runtimeArtifacts.consentFrictionDelta === "number" && runtimeArtifacts.consentFrictionDelta > 0
        ? Math.min(100, 65 + runtimeArtifacts.consentFrictionDelta * 15)
        : 0;
  partiallyBuiltSnapshot.userRightsFrictionScore = Math.max(baselineRightsFrictionScore, runtimeRightsFrictionScore);
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
  for (const coverage of keyPageCoverage) {
    if (!coverage.surfaceDetected) {
      compatibilitySignals.push(
        toTaxonomySignal({
          category: "disclosure",
          key: coverage.surfaceMissingSignalKey,
          label: coverage.surfaceMissingSignalLabel,
          value: true
        })
      );
    } else if (!coverage.fetched && coverage.failedPageUrls.length > 0) {
      compatibilitySignals.push(
        toTaxonomySignal({
          category: "disclosure",
          key: coverage.fetchFailedSignalKey,
          label: coverage.fetchFailedSignalLabel,
          value: coverage.failedPageUrls
        })
      );
    }
  }
  const unresolvedBoundedKeyPages = keyPageDiscoverySummary.pageSummaries
    .filter(
      (summary) =>
        !summary.successfulUrl &&
        (summary.surfaceDetected ||
          summary.guessedOnly ||
          summary.attemptCount > 0 ||
          summary.stopReason === "no_surface" ||
          summary.stopReason === "budget_exhausted")
    )
    .map((summary) => formatKeyPageTypeLabel(summary.pageType))
    .sort();
  if (unresolvedBoundedKeyPages.length > 0) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "disclosure",
        key: "disclosure.key_page_discovery_unresolved_after_bounded_search",
        label: "Bounded key-page discovery unresolved",
        value: unresolvedBoundedKeyPages
      })
    );
  }
  const sessionReplayDisclosurePages = policyEnrichmentBundle.enrichments
    .filter((enrichment) =>
      enrichment.policyMentions.some(
        (mention) => mention.topic === "session_replay_disclosure" && Number(mention.confidence ?? 0) >= 0.55
      )
    )
    .map((enrichment) => enrichment.pageUrl);
  const sessionReplayRuntimeVendors = [
    ...new Set(allTrackers.filter((tracker) => tracker.vendorCategory === "session_replay").map((tracker) => tracker.vendorName))
  ];
  const sessionReplayEvaluation = evaluateBehaviorDisclosure({
    behaviorKey: "session_replay",
    disclosureEvidence: sessionReplayDisclosurePages,
    disclosurePresent: sessionReplayDisclosurePages.length > 0,
    runtimeDetected: snapshotWithScores.sessionReplayToolDetected || snapshotWithScores.sessionReplayTrackerCount > 0,
    runtimeEvidence: sessionReplayRuntimeVendors,
    vendors: sessionReplayRuntimeVendors
  });

  if (sessionReplayEvaluation.runtimeDetected) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.session_replay_runtime_detected",
        label: "Session replay runtime detected",
        value: true
      })
    );
  }

  if (sessionReplayEvaluation.vendors.length > 0) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.session_replay_runtime_vendors",
        label: "Session replay runtime vendors",
        value: sessionReplayEvaluation.vendors
      })
    );
  }

  if (sessionReplayEvaluation.disclosurePresent) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "disclosure",
        key: "disclosure.session_replay_disclosure_present",
        label: "Session replay disclosure present",
        value: true
      })
    );
  }

  if (sessionReplayEvaluation.disclosureEvidence.length > 0) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "disclosure",
        key: "disclosure.session_replay_disclosure_pages",
        label: "Session replay disclosure pages",
        value: sessionReplayEvaluation.disclosureEvidence
      })
    );
  }

  if (runtimeArtifacts.consentAuditCompleted === true) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.consent_audit_completed",
        label: "Consent interaction audit completed",
        value: true
      })
    );
  }
  if (runtimeArtifacts.consentRejectInteractionSucceeded === true) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.consent_reject_interaction_succeeded",
        label: "Reject interaction succeeded",
        value: true
      })
    );
  }
  if (runtimeArtifacts.consentAcceptInteractionSucceeded === true) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.consent_accept_interaction_succeeded",
        label: "Accept interaction succeeded",
        value: true
      })
    );
  }
  if (runtimeArtifacts.consentRejectReducedTracking === false && runtimeArtifacts.consentRejectInteractionSucceeded === true) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.consent_reject_failed_to_reduce_tracking",
        label: "Reject did not reduce tracking",
        value: true
      })
    );
  }
  if (runtimeArtifacts.consentRejectPersistedTrackerVendorNames.length > 0) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.consent_reject_persisted_tracker_vendors",
        label: "Trackers still present after reject",
        value: runtimeArtifacts.consentRejectPersistedTrackerVendorNames
      })
    );
  }
  if (runtimeArtifacts.consentRejectNewTrackerVendorNames.length > 0) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.consent_reject_new_tracker_vendors",
        label: "New trackers appeared after reject",
        value: runtimeArtifacts.consentRejectNewTrackerVendorNames
      })
    );
  }
  if (runtimeArtifacts.consentAcceptNewTrackerVendorNames.length > 0) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.consent_accept_new_tracker_vendors",
        label: "New trackers appeared after accept",
        value: runtimeArtifacts.consentAcceptNewTrackerVendorNames
      })
    );
  }
  if ((runtimeArtifacts.consentPreconsentViolationCount ?? 0) > 0) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.preconsent_violation_count",
        label: "Pre-consent tracker violations",
        value: runtimeArtifacts.consentPreconsentViolationCount ?? 0
      })
    );
  }
  if (runtimeArtifacts.consentBaselineTrackerVendorNames.length > 0) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.preconsent_tracker_vendors",
        label: "Pre-consent tracker vendors",
        value: runtimeArtifacts.consentBaselineTrackerVendorNames
      })
    );
  }
  if (runtimeArtifacts.consentBaselineTrackerEvidenceUrls.length > 0) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.preconsent_tracker_evidence_urls",
        label: "Pre-consent tracker evidence URLs",
        value: runtimeArtifacts.consentBaselineTrackerEvidenceUrls
      })
    );
  }
  if (
    runtimeArtifacts.consentRejectReducedThirdPartyCookies === false &&
    runtimeArtifacts.consentRejectInteractionSucceeded === true
  ) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.consent_reject_failed_to_reduce_third_party_cookies",
        label: "Reject did not reduce third-party cookies",
        value: true
      })
    );
  }
  if ((runtimeArtifacts.consentOptOutClicks ?? runtimeArtifacts.consentRejectClickCount ?? 0) > 0) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.consent_reject_click_count",
        label: "Reject click count",
        value: runtimeArtifacts.consentOptOutClicks ?? runtimeArtifacts.consentRejectClickCount ?? 0
      })
    );
  }
  if ((runtimeArtifacts.consentOptInClicks ?? runtimeArtifacts.consentAcceptClickCount ?? 0) > 0) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.consent_accept_click_count",
        label: "Accept click count",
        value: runtimeArtifacts.consentOptInClicks ?? runtimeArtifacts.consentAcceptClickCount ?? 0
      })
    );
  }

  const reviewReasonsByEnrichmentId = new Map<string, Set<string>>();
  for (const row of policyEnrichmentBundle.reviewQueueItems) {
    const enrichmentId = String(row.policyEnrichmentId ?? "");
    if (!enrichmentId) {
      continue;
    }

    const existing = reviewReasonsByEnrichmentId.get(enrichmentId) ?? new Set<string>();
    existing.add(String(row.reason ?? ""));
    reviewReasonsByEnrichmentId.set(enrichmentId, existing);
  }

  let functionalMisalignmentDetected =
    runtimeArtifacts.consentRedirectOrAuthRequired === true ||
    (typeof runtimeArtifacts.consentFrictionDelta === "number" && runtimeArtifacts.consentFrictionDelta > 0);
  let missingTechnicalDisclosureDetected = false;
  let disclosureLikelyObstructedDetected = false;

  for (const enrichment of policyEnrichmentBundle.enrichments) {
    const reasons = reviewReasonsByEnrichmentId.get(String(enrichment.id ?? "")) ?? new Set<string>();
    if (!reasons.has("low_confidence_critical_fields")) {
      continue;
    }

    const flags = Array.isArray(enrichment.policyActionableFlags)
      ? enrichment.policyActionableFlags.filter((value): value is string => typeof value === "string")
      : [];
    const mentions = Array.isArray(enrichment.policyMentions) ? enrichment.policyMentions : [];

    if ((snapshotWithScores.userRightsFrictionScore ?? 0) >= 100) {
      functionalMisalignmentDetected = true;
    }

    if (
      snapshotWithScores.retargetingPixelDetected === true ||
      snapshotWithScores.sessionReplayWithoutDisclosureDetected === true
    ) {
      missingTechnicalDisclosureDetected = true;
    }

    if (
      hasSparsePolicyExtraction({
        confidence: enrichment.policySemanticConfidence,
        coverageRatio: enrichment.policyCoverageRatio,
        flags,
        mentions,
        snippetCount: enrichment.policySnippetCount,
        structurallyWeak: enrichment.policyStructurallyWeak,
        summaryShort: enrichment.policySummaryShort
      })
    ) {
      disclosureLikelyObstructedDetected = true;
    }
  }

  if (functionalMisalignmentDetected) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "privacy",
        key: "privacy.policy_runtime_functional_misalignment_detected",
        label: "Policy/runtime functional misalignment detected",
        value: true
      })
    );
  }

  if (missingTechnicalDisclosureDetected) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "disclosure",
        key: "disclosure.policy_runtime_missing_technical_disclosure_detected",
        label: "Missing technical disclosure detected",
        value: true
      })
    );
  }

  if (disclosureLikelyObstructedDetected) {
    compatibilitySignals.push(
      toTaxonomySignal({
        category: "disclosure",
        key: "disclosure.policy_runtime_disclosure_likely_obstructed",
        label: "Policy disclosure likely obstructed",
        value: true
      })
    );
  }

  const cookiePolicyEnrichment =
    policyEnrichmentBundle.enrichments.find((enrichment) => enrichment.pageType === "cookie_policy") ?? null;
  const runtimeCookieNames = [...new Set((runtimeArtifacts.initialCookieNames ?? []).map((value) => normalizeCookieName(value)).filter((value): value is string => Boolean(value)))];
  if (cookiePolicyEnrichment && runtimeCookieNames.length > 0) {
    const cookieDisclosures = Array.isArray(cookiePolicyEnrichment.policyCookieDisclosures)
      ? cookiePolicyEnrichment.policyCookieDisclosures
      : [];
    const cookieFlags = Array.isArray(cookiePolicyEnrichment.policyActionableFlags)
      ? cookiePolicyEnrichment.policyActionableFlags.filter((value): value is string => typeof value === "string")
      : [];
    const cookiePolicyStructurallyObstructed =
      cookieDisclosures.length === 0 ||
      (typeof cookiePolicyEnrichment.policySemanticConfidence === "number" && cookiePolicyEnrichment.policySemanticConfidence < 0.6) ||
      cookieFlags.includes("low_confidence") ||
      cookieFlags.includes("llm_provider_error");

    if (cookiePolicyStructurallyObstructed) {
      compatibilitySignals.push(
        toTaxonomySignal({
          category: "disclosure",
          key: "disclosure.cookie_policy_structurally_obstructed",
          label: "Cookie policy structurally obstructed",
          value: true
        })
      );
    } else {
      const unmatchedCookieNames = runtimeCookieNames.filter(
        (cookieName) => !matchCookieDisclosure({ cookieName, disclosures: cookieDisclosures })
      );
      if (unmatchedCookieNames.length > 0) {
        compatibilitySignals.push(
          toTaxonomySignal({
            category: "privacy",
            key: "privacy.cookie_runtime_disclosure_gap_detected",
            label: "Cookie disclosure gap detected",
            value: true
          })
        );
      }
    }
  }
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
    accessibilityRuleExamples: browserPass.ruleExamples,
    accessibilityRuleCounts: browserPass.ruleCounts,
    pages: fetchedPages.map((page) => buildPageMetadata(input.scanId, page)),
    compatibilitySignals
  };
}

export async function runConsentProbe(input: {
  domain: string;
  domainId: string;
  organizationId: string | null;
  profileSweep?: boolean;
  scanId: string;
}) : Promise<ConsentProbeResult> {
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  const startUrl = input.domain.startsWith("http://") || input.domain.startsWith("https://") ? input.domain : `https://${input.domain}`;
  const robotsState = await fetchRobotsState({
    startUrl,
    scanId: input.scanId,
    domainId: input.domainId
  });
  const homepage = await fetchStaticPage({
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
  const plan = buildScanPlan({
    homepage,
    requestedPageCount: 1,
    robotsCrawlDelayMs: robotsState.policy?.crawlDelayMs() ?? null
  });
  const homepageUrl = homepage.finalUrl ?? startUrl;
  const shouldSweepProfiles = input.profileSweep ?? true;
  const probeProfiles = shouldSweepProfiles ? getConsentProbeProfiles() : [{ name: "desktop_default", contextOptions: {} }];
  const attemptedProbeProfiles: string[] = [];
  let browserPass = await runBrowserPass({
    plan,
    domain: input.domain.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    domainId: input.domainId,
    homepageUrl,
    organizationId: input.organizationId,
    robotsPolicy: robotsState.policy,
    scanId: input.scanId,
    browserContextOptions: probeProfiles[0]?.contextOptions
  });
  let winningProbeProfile = probeProfiles[0]?.name ?? null;
  if (probeProfiles[0]) {
    attemptedProbeProfiles.push(probeProfiles[0].name);
  }

  if (!browserPass.cookieBannerPresent && shouldSweepProfiles) {
    const shouldRetryForVisibility =
      browserPass.cookieBannerPresent ||
      Boolean(browserPass.cmpVendorName) ||
      browserPass.trackerVendors.length > 0;

    if (shouldRetryForVisibility) {
      for (const profile of probeProfiles.slice(1)) {
        attemptedProbeProfiles.push(profile.name);
        const candidatePass = await runBrowserPass({
          plan,
          domain: input.domain.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
          domainId: input.domainId,
          homepageUrl,
          organizationId: input.organizationId,
          robotsPolicy: robotsState.policy,
          scanId: input.scanId,
          browserContextOptions: profile.contextOptions
        });

        const candidateImprovesVisibility =
          candidatePass.cookieBannerPresent ||
          (!browserPass.cmpVendorName && Boolean(candidatePass.cmpVendorName)) ||
          candidatePass.consentAcceptButtonCount !== browserPass.consentAcceptButtonCount ||
          candidatePass.consentRejectButtonCount !== browserPass.consentRejectButtonCount ||
          candidatePass.consentPreferencesButtonCount !== browserPass.consentPreferencesButtonCount;

        if (candidateImprovesVisibility) {
          browserPass = candidatePass;
          winningProbeProfile = profile.name;
        }

        if (candidatePass.cookieBannerPresent) {
          break;
        }
      }
    }
  }

  const cmpVendor = browserPass.cmpVendorName
    ? { name: browserPass.cmpVendorName, confidence: browserPass.cmpVendorConfidence }
    : detectCmpVendorFromPage(homepage);
  const consentMechanismType: ScanSnapshot["consentMechanismType"] = browserPass.cookieBannerPresent
    ? cmpVendor?.name
      ? "cmp"
      : browserPass.granularPreferencesPresent
        ? "modal"
        : "banner"
    : "none";
  const scanConfidence: ScanSnapshot["scanConfidence"] =
    homepage.fetchStatus === "ok" || homepage.fetchStatus === "redirected"
      ? browserPass.timedOut
        ? "medium"
        : "high"
      : homepage.fetchStatus === "forbidden" || homepage.fetchStatus === "blocked"
        ? "low"
        : "medium";
  const consentScore = clamp(
    85 -
      (browserPass.cookieBannerPresent ? 0 : browserPass.trackerVendors.length > 0 ? 25 : 0) -
      (browserPass.rejectAllPresent ? 0 : browserPass.cookieBannerPresent ? 12 : 0) -
      (browserPass.granularPreferencesPresent ? 0 : browserPass.cookieBannerPresent ? 8 : 0) -
      (browserPass.consentInteractionModel === "accept_only" ? 10 : 0) -
      (browserPass.consentInteractionModel === "dismiss_only" ? 8 : 0) -
      (browserPass.preconsentTrackingDetected ? 20 : 0) -
      (browserPass.darkPatternAcceptEmphasis ? 6 : 0) -
      (browserPass.darkPatternRejectHidden ? 6 : 0)
  );

  return {
    finalUrl: homepage.finalUrl ?? null,
    scanConfidence,
    cookieBannerPresent: browserPass.cookieBannerPresent,
    consentMechanismType,
    cmpVendorName: cmpVendor?.name ?? null,
    cmpVendorConfidence: cmpVendor?.confidence ?? null,
    consentInteractionModel: browserPass.consentInteractionModel,
    consentAcceptButtonCount: browserPass.consentAcceptButtonCount,
    consentRejectButtonCount: browserPass.consentRejectButtonCount,
    consentPreferencesButtonCount: browserPass.consentPreferencesButtonCount,
    acceptAllPresent: browserPass.acceptAllPresent,
    rejectAllPresent: browserPass.rejectAllPresent,
    granularPreferencesPresent: browserPass.granularPreferencesPresent,
    consentBannerLayoutType: browserPass.consentBannerLayoutType,
    consentBannerPosition: browserPass.consentBannerPosition,
    consentPersistenceMechanismDetected: browserPass.consentPersistenceMechanismDetected,
    preconsentTrackingDetected: browserPass.preconsentTrackingDetected,
    defaultTrackingState: browserPass.defaultTrackingState,
    cookieCategoryCount: browserPass.cookieCategoryCount,
    cookiePolicyLinkedFromBanner: browserPass.cookiePolicyLinkedFromBanner,
    darkPatternAcceptEmphasis: browserPass.darkPatternAcceptEmphasis,
    darkPatternRejectHidden: browserPass.darkPatternRejectHidden,
    darkPatternRejectButtonMissing: browserPass.darkPatternRejectButtonMissing,
    darkPatternAcceptButtonProminence: browserPass.darkPatternAcceptButtonProminence,
    darkPatternForcedConsentWall: browserPass.darkPatternForcedConsentWall,
    darkPatternAcceptOnlyBanner: browserPass.darkPatternAcceptOnlyBanner,
    darkPatternDismissWithoutReject: browserPass.darkPatternDismissWithoutReject,
    consentScore,
    trackerCountTotal: browserPass.trackerVendors.length,
    attemptedProbeProfiles,
    winningProbeProfile
  };
}
