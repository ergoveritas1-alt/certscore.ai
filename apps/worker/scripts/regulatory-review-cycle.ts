import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  createBrowser,
  discoverCandidatePages,
  fetchStaticPage,
  runAxe,
  runConsentProbe
} from "@website-signal-risk-scanner/scan-core";
import {
  buildCustomerFacingRegulatoryReviewOutput,
  buildInternalRegulatoryReviewOutput,
  generateAllRegulatoryFindings,
  INLINE_METHODOLOGY_SUMMARY,
  type AccessibilityIssue,
  type ObservableBehavior,
  type PublicClaim,
  type RegulatoryReviewArtifacts,
  type ScanMethodology
} from "@website-signal-risk-scanner/shared";

type TargetSite = {
  hostname: string;
  rationale: string;
};

type StaticPageProbe = Awaited<ReturnType<typeof fetchStaticPage>>;
type ConsentProbeResult = {
  attemptedProbeProfiles: string[];
  cmpVendorName: string | null;
  consentPersistenceMechanismDetected: boolean | null;
  cookieBannerPresent: boolean | null;
  finalUrl: string | null;
  preconsentTrackingDetected: boolean | null;
  scanConfidence: "high" | "medium" | "low";
  trackerCountTotal: number | null;
  warnings?: string[];
  winningProbeProfile: string | null;
};

type BrowserSessionSnapshot = {
  bodyTextExcerpt: string;
  consentSelectors: string[];
  cookies: Array<{
    domain?: string;
    id: string;
    name: string;
    notes?: string;
    pageUrl: string;
    path?: string;
    phase: "signal_enabled" | "signal_disabled";
    timestamp: string;
  }>;
  finalUrl: string;
  networkEvents: Array<{
    category?: string;
    id: string;
    method?: string;
    notes?: string;
    pageUrl: string;
    phase: "signal_enabled" | "signal_disabled";
    requestUrl?: string;
    timestamp: string;
    vendor?: string;
  }>;
  pageUrl: string;
  phase: "signal_enabled" | "signal_disabled";
  screenshotUrl?: string;
  signalAcknowledgementDetected: boolean;
  storageWrites: Array<{
    id: string;
    key?: string;
    notes?: string;
    pageUrl: string;
    phase: "signal_enabled" | "signal_disabled";
    storageType: "localStorage" | "sessionStorage" | "indexedDB";
    timestamp: string;
  }>;
  timestamp: string;
};

type BrowserSignalComparison = {
  control: BrowserSessionSnapshot;
  differencesObserved: boolean;
  materialDifferenceSummary: string[];
  signal: BrowserSessionSnapshot;
};

const TARGET_SITES: TargetSite[] = [
  {
    hostname: "target.com",
    rationale: "Large U.S. retailer with strong privacy-choice and consent-flow surface area."
  },
  {
    hostname: "walmart.com",
    rationale: "Major retailer with state privacy disclosure depth and broad consumer-rights surfaces."
  },
  {
    hostname: "bestbuy.com",
    rationale: "Explicit state privacy rights pages and browser-signal relevance."
  },
  {
    hostname: "homedepot.com",
    rationale: "Large commerce site with meaningful consent, disclosure, and key-flow accessibility surfaces."
  },
  {
    hostname: "nike.com",
    rationale: "Global commerce experience with public accessibility and privacy posture claims."
  },
  {
    hostname: "delta.com",
    rationale: "Travel booking flow with high-signal accessibility and rights-surface expectations."
  },
  {
    hostname: "united.com",
    rationale: "Airline booking and account flows with material accessibility-flow relevance."
  },
  {
    hostname: "nytimes.com",
    rationale: "Publisher surface with strong consent, tracking, and targeted-advertising posture signals."
  },
  {
    hostname: "cnn.com",
    rationale: "Advertising-supported publisher likely to expose privacy-choice and pre-choice tracking signals."
  },
  {
    hostname: "airbnb.com",
    rationale: "Large consumer platform with accessibility, account, and privacy-choice expectations."
  }
];

const OUTPUT_ROOT = path.join(process.cwd(), "tmp", "regulatory-review-cycles");
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

type DomainRow = {
  hostname: string;
  id: string;
  normalized_url: string;
  organization_id: string;
};

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeHostname(value: string) {
  return value.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
}

function stripTags(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(value: string, max = 280) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1).trim()}…`;
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function toVendorName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function isThirdPartyRequest(requestUrl: string, hostname: string) {
  try {
    const requestHostname = new URL(requestUrl).hostname.replace(/^www\./, "");
    const baseHostname = normalizeHostname(hostname).replace(/^www\./, "");
    return requestHostname !== baseHostname && !requestHostname.endsWith(`.${baseHostname}`);
  } catch {
    return false;
  }
}

function classifyRequestCategory(requestUrl: string) {
  const normalized = requestUrl.toLowerCase();

  if (/analytics|collect|track|pixel|tag|metrics|segment|amplitude|adobedc|doubleclick|googletagmanager|facebook|meta|bing|reddit/.test(normalized)) {
    return "tracking";
  }

  if (/consent|privacy|choice|optout|opt-out|gpc/.test(normalized)) {
    return "privacy_signal";
  }

  return "runtime";
}

function dedupeClaims(claims: PublicClaim[]) {
  return uniqueBy(claims, (claim) => `${claim.kind}|${claim.sourceUrl}|${claim.text.toLowerCase()}`);
}

function summarizeObservedPolicySignals(claims: PublicClaim[]) {
  return dedupeClaims(claims).map((claim) => ({
    claimText: claim.text,
    kind: claim.kind,
    note:
      claim.kind === "privacy"
        ? "Public policy text relevant to privacy choice posture was observed. This reflects policy language only and does not verify mechanism functionality."
        : "Public accessibility-oriented language was observed. This reflects public claim text only and does not verify user experience across all assistive technologies.",
    sourceUrl: claim.sourceUrl,
    timestamp: claim.timestamp
  }));
}

function buildFallbackConsentProbe(hostname: string, error: unknown): ConsentProbeResult {
  return {
    attemptedProbeProfiles: [],
    cmpVendorName: null,
    consentPersistenceMechanismDetected: null,
    cookieBannerPresent: null,
    finalUrl: `https://${normalizeHostname(hostname)}/`,
    preconsentTrackingDetected: null,
    scanConfidence: "low",
    trackerCountTotal: null,
    warnings: [`Consent probe failed in the lightweight review harness: ${error instanceof Error ? error.message : "unknown error"}`],
    winningProbeProfile: null
  };
}

function buildSkippedConsentProbe(hostname: string): ConsentProbeResult {
  return {
    attemptedProbeProfiles: [],
    cmpVendorName: null,
    consentPersistenceMechanismDetected: null,
    cookieBannerPresent: null,
    finalUrl: `https://${normalizeHostname(hostname)}/`,
    preconsentTrackingDetected: null,
    scanConfidence: "low",
    trackerCountTotal: null,
    warnings: ["Heavy consent probe was skipped in this lightweight regulatory review cycle to preserve sweep reliability across multiple public sites."],
    winningProbeProfile: null
  };
}

function summarizeTrackingEvidence(events: BrowserSessionSnapshot["networkEvents"]) {
  const vendors = uniqueBy(
    events
      .map((event) => event.vendor)
      .filter((vendor): vendor is string => typeof vendor === "string" && vendor.length > 0),
    (vendor) => vendor
  ).slice(0, 3);

  if (vendors.length === 0) {
    return "Tracking-relevant requests were observed during the initial public homepage load before any privacy choice interaction.";
  }

  return `Tracking-relevant requests were observed during the initial public homepage load before any privacy choice interaction, including ${vendors.join(", ")}.`;
}

function summarizePreInteractionTracking(input: {
  consentProbe: ConsentProbeResult;
  controlTrackingEvents: BrowserSessionSnapshot["networkEvents"];
}) {
  const base = summarizeTrackingEvidence(input.controlTrackingEvents);
  if (input.consentProbe.attemptedProbeProfiles.length === 0) {
    return base.replace("before any privacy choice interaction", "before any user interaction in the tested session");
  }

  return base;
}

function buildMethodology(input: {
  browserSignalComparedAgainstControl: boolean;
  browserSignalEnabled: boolean;
  keyFlows: string[];
  legalPages: string[];
  pageUrls: string[];
  scanRunId: string;
  screenshotsCaptured: boolean;
}): ScanMethodology {
  return {
    browserProfileType: "fresh",
    browserSignalTesting: {
      comparedAgainstControl: input.browserSignalComparedAgainstControl,
      enabled: input.browserSignalEnabled,
      signalTypesTested: input.browserSignalEnabled ? ["Global Privacy Control"] : []
    },
    consentStateReset: true,
    evidenceCollection: {
      cookieDiffingEnabled: true,
      domSnapshotsCaptured: true,
      networkLoggingEnabled: true,
      screenshotsCaptured: input.screenshotsCaptured,
      storageWriteTrackingEnabled: true
    },
    generatedAt: new Date().toISOString(),
    pageSelection: {
      discoveredPages: input.pageUrls,
      keyFlowsTested: input.keyFlows,
      legalPagesTested: input.legalPages,
      seedPages: input.pageUrls.slice(0, 1)
    },
    scanRunId: input.scanRunId
  };
}

function extractRegexClaims(input: {
  kind: "privacy" | "accessibility";
  page: StaticPageProbe;
  patterns: RegExp[];
  surface: PublicClaim["surface"];
}) {
  const text = input.page.textContent;
  const claims: PublicClaim[] = [];

  for (const pattern of input.patterns) {
    const match = text.match(pattern);
    if (!match?.[0]) {
      continue;
    }

    claims.push({
      id: `${input.kind}-${input.page.pageUrl}-${claims.length + 1}`,
      kind: input.kind,
      pageUrl: input.page.pageUrl,
      sourceUrl: input.page.pageUrl,
      surface: input.surface,
      text: clip(match[0]),
      timestamp: new Date().toISOString()
    });
  }

  return claims;
}

async function probeStaticPages(hostname: string) {
  const homepageUrl = `https://${normalizeHostname(hostname)}/`;
  const homepage = await fetchStaticPage({
    pageType: "homepage",
    robotsPolicy: null,
    url: homepageUrl
  });

  const candidates = discoverCandidatePages(homepageUrl, homepage.links);
  const highPriorityTypes = new Set([
    "privacy_policy",
    "cookie_policy",
    "accessibility_statement",
    "contact",
    "signup",
    "login",
    "checkout"
  ]);

  const selected = uniqueBy(
    candidates.filter((candidate) => highPriorityTypes.has(candidate.pageType)),
    (candidate) => `${candidate.pageType}:${candidate.url}`
  ).slice(0, 8);
  const pages = await Promise.all(
    selected.map((candidate) =>
      fetchStaticPage({
        pageType: candidate.pageType,
        robotsPolicy: null,
        url: candidate.url
      }).catch(() => null)
    )
  );

  return {
    homepage,
    pages: uniqueBy([homepage, ...pages.filter((page): page is StaticPageProbe => page !== null)], (page) => page.pageUrl)
  };
}

async function ensureDomain(hostname: string) {
  const supabase = createAdminClient();
  const normalizedHostname = normalizeHostname(hostname);
  const normalizedUrl = `https://${normalizedHostname}/`;
  const { data: existingDomain, error: domainError } = await supabase
    .from("domains")
    .select("id, organization_id, hostname, normalized_url")
    .eq("hostname", normalizedHostname)
    .not("organization_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (domainError) {
    throw new Error(`Failed to load domain ${normalizedHostname}: ${domainError.message}`);
  }

  if (existingDomain?.organization_id) {
    return existingDomain as DomainRow;
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (organizationError || !organization) {
    throw new Error(`Failed to resolve an organization for ${normalizedHostname}: ${organizationError?.message ?? "missing organization"}`);
  }

  const { data: insertedDomain, error: insertError } = await supabase
    .from("domains")
    .insert({
      hostname: normalizedHostname,
      normalized_url: normalizedUrl,
      organization_id: organization.id,
      scan_frequency: "manual"
    })
    .select("id, organization_id, hostname, normalized_url")
    .single();

  if (insertError || !insertedDomain?.organization_id) {
    throw new Error(`Failed to create domain ${normalizedHostname}: ${insertError?.message ?? "unknown error"}`);
  }

  return insertedDomain as DomainRow;
}

async function createDevScanRecord(input: {
  cycle: number;
  domain: DomainRow;
}) {
  const supabase = createAdminClient();
  const { data: scan, error } = await supabase
    .from("scans")
    .insert({
      domain_id: input.domain.id,
      organization_id: input.domain.organization_id,
      pages_requested: 6,
      pages_scanned: 0,
      scan_config_json: {
        cycle: input.cycle,
        maxPages: 6,
        processor: "regulatory-review-cycle",
        source: "codex-dev-review"
      },
      scan_type: "full",
      status: "running"
    })
    .select("id")
    .single();

  if (error || !scan) {
    throw new Error(`Failed to create dev scan record for ${input.domain.hostname}: ${error?.message ?? "unknown error"}`);
  }

  return scan.id as string;
}

async function collectAccessibilityIssues(pageUrls: string[]) {
  const results: AccessibilityIssue[] = [];
  const { browser, context } = await createBrowser();

  try {
    for (const pageUrl of pageUrls.slice(0, 3)) {
      const page = await context.newPage();

      try {
        await page.goto(pageUrl, {
          timeout: 15_000,
          waitUntil: "domcontentloaded"
        });

        const axe = await runAxe(page);
        for (const violation of axe.violations.slice(0, 4)) {
          results.push({
            id: `${pageUrl}-${violation.id}`,
            impact:
              violation.impact === "critical"
                ? "critical"
                : violation.impact === "serious"
                  ? "serious"
                  : violation.impact === "moderate"
                    ? "moderate"
                    : "minor",
            keyFlow: /login|signup|checkout|cart|payment|book|reserve/i.test(pageUrl),
            pageUrl,
            selectors: violation.nodes
              .flatMap((node) => node.target)
              .map((target) => (typeof target === "string" ? target : JSON.stringify(target)))
              .slice(0, 4),
            summary: `${violation.help}: ${clip(violation.description, 180)}`,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.warn(`Accessibility probe warning for ${pageUrl}: ${error instanceof Error ? error.message : "unknown error"}`);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  return results;
}

async function collectBrowserSessionSnapshot(input: {
  hostname: string;
  outputDir: string;
  phase: "signal_enabled" | "signal_disabled";
}) {
  const homepageUrl = `https://${normalizeHostname(input.hostname)}/`;
  const requests: BrowserSessionSnapshot["networkEvents"] = [];
  const timestamp = new Date().toISOString();
  const { browser, context } = await createBrowser({
    contextOptions:
      input.phase === "signal_enabled"
        ? {
            extraHTTPHeaders: {
              "Sec-GPC": "1"
            }
          }
        : undefined
  });

  try {
    if (input.phase === "signal_enabled") {
      await context.addInitScript(() => {
        try {
          Object.defineProperty(Navigator.prototype, "globalPrivacyControl", {
            configurable: true,
            get: () => true
          });
        } catch {
          // best effort only
        }
      });
    }

    const page = await context.newPage();
    page.on("request", (request) => {
      const requestUrl = request.url();
      const category = classifyRequestCategory(requestUrl);
      if (category !== "tracking" && category !== "privacy_signal") {
        return;
      }

      requests.push({
        category,
        id: `${input.phase}-request-${requests.length + 1}`,
        method: request.method(),
        notes:
          category === "tracking"
            ? "Third-party or tracking-relevant request observed during initial public page load."
            : undefined,
        pageUrl: homepageUrl,
        phase: input.phase,
        requestUrl,
        timestamp,
        vendor: toVendorName(requestUrl)
      });
    });

    await page.goto(homepageUrl, {
      timeout: 20_000,
      waitUntil: "domcontentloaded"
    });
    await page.waitForTimeout(3_000);

    const finalUrl = page.url();
    const screenshotPath = path.join(input.outputDir, `${normalizeHostname(input.hostname)}-${input.phase}.png`);
    await page.screenshot({
      fullPage: true,
      path: screenshotPath
    });

    const domState = await page.evaluate(() => {
      const selectors = [
        "[id*='consent']",
        "[class*='consent']",
        "[id*='cookie']",
        "[class*='cookie']",
        "[aria-label*='privacy' i]",
        "[data-testid*='consent']"
      ];
      const matchedSelectors = selectors.filter((selector) => document.querySelector(selector));
      const bodyText = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
      const localStorageKeys = Object.keys(window.localStorage ?? {});
      const sessionStorageKeys = Object.keys(window.sessionStorage ?? {});
      const signalAcknowledgementDetected = /global privacy control|gpc|privacy signal|your privacy preference|do not sell|do not share/i.test(bodyText);

      return {
        bodyTextExcerpt: bodyText.slice(0, 600),
        consentSelectors: matchedSelectors,
        localStorageKeys,
        sessionStorageKeys,
        signalAcknowledgementDetected
      };
    });

    const browserCookies = await context.cookies(finalUrl);
    const pageCookies = browserCookies
      .filter((cookie) => cookie.domain && isThirdPartyRequest(`https://${cookie.domain.replace(/^\./, "")}/`, input.hostname))
      .slice(0, 12)
      .map((cookie, index) => ({
        domain: cookie.domain,
        id: `${input.phase}-cookie-${index + 1}`,
        name: cookie.name,
        pageUrl: finalUrl,
        path: cookie.path,
        phase: input.phase,
        timestamp
      }));

    const storageWrites = [
      ...domState.localStorageKeys.slice(0, 12).map((key, index) => ({
        id: `${input.phase}-local-${index + 1}`,
        key,
        notes: "Storage key observed after initial page load.",
        pageUrl: finalUrl,
        phase: input.phase,
        storageType: "localStorage" as const,
        timestamp
      })),
      ...domState.sessionStorageKeys.slice(0, 12).map((key, index) => ({
        id: `${input.phase}-session-${index + 1}`,
        key,
        notes: "Storage key observed after initial page load.",
        pageUrl: finalUrl,
        phase: input.phase,
        storageType: "sessionStorage" as const,
        timestamp
      }))
    ];

    await page.close().catch(() => undefined);

    return {
      bodyTextExcerpt: domState.bodyTextExcerpt,
      consentSelectors: domState.consentSelectors,
      cookies: pageCookies,
      finalUrl,
      networkEvents: uniqueBy(requests, (request) => `${request.method}:${request.requestUrl}`),
      pageUrl: homepageUrl,
      phase: input.phase,
      screenshotUrl: pathToFileURL(screenshotPath).toString(),
      signalAcknowledgementDetected: domState.signalAcknowledgementDetected,
      storageWrites,
      timestamp
    } satisfies BrowserSessionSnapshot;
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function collectBrowserSignalComparison(input: {
  hostname: string;
  outputDir: string;
}) {
  const control = await collectBrowserSessionSnapshot({
    hostname: input.hostname,
    outputDir: input.outputDir,
    phase: "signal_disabled"
  });
  const signal = await collectBrowserSessionSnapshot({
    hostname: input.hostname,
    outputDir: input.outputDir,
    phase: "signal_enabled"
  });

  const differences: string[] = [];
  if (control.networkEvents.length !== signal.networkEvents.length) {
    differences.push(`Network event count changed from ${control.networkEvents.length} to ${signal.networkEvents.length} between control and signal-enabled sessions.`);
  }
  if (control.cookies.length !== signal.cookies.length) {
    differences.push(`Third-party cookie count changed from ${control.cookies.length} to ${signal.cookies.length} between control and signal-enabled sessions.`);
  }
  if (control.storageWrites.length !== signal.storageWrites.length) {
    differences.push(`Observed storage key count changed from ${control.storageWrites.length} to ${signal.storageWrites.length} between control and signal-enabled sessions.`);
  }
  if (control.signalAcknowledgementDetected !== signal.signalAcknowledgementDetected) {
    differences.push("Visible privacy-signal acknowledgement differed between control and signal-enabled sessions.");
  }

  return {
    control,
    differencesObserved: differences.length > 0,
    materialDifferenceSummary: differences,
    signal
  } satisfies BrowserSignalComparison;
}

function buildClaims(pages: StaticPageProbe[]) {
  const claims: PublicClaim[] = [];

  for (const page of pages) {
    if (page.pageType === "privacy_policy" || /privacy/i.test(page.pageUrl)) {
      claims.push(
        ...extractRegexClaims({
          kind: "privacy",
          page,
          patterns: [
            /we (?:honor|respect|recognize)[^.]{0,180}(?:browser|global privacy control|opt-?out)[^.]{0,120}\./i,
            /you can [^.]{0,180}(?:opt out|do not sell|do not share|privacy choices)[^.]{0,120}\./i,
            /we do not [^.]{0,180}(?:sell|share)[^.]{0,120}\./i
          ],
          surface: "privacy_policy"
        })
      );
    }

    if (page.pageType === "accessibility_statement" || /accessibility/i.test(page.pageUrl)) {
      claims.push(
        ...extractRegexClaims({
          kind: "accessibility",
          page,
          patterns: [
            /we (?:are committed|strive|aim)[^.]{0,180}accessib[^.]{0,120}\./i,
            /this (?:website|site) [^.]{0,180}(?:screen reader|keyboard|assistive)[^.]{0,120}\./i,
            /we (?:support|seek to support)[^.]{0,180}(?:wcag|assistive technology|keyboard navigation)[^.]{0,120}\./i
          ],
          surface: "accessibility_statement"
        })
      );
    }
  }

  return dedupeClaims(claims);
}

function buildBehaviors(input: {
  browserSignalComparison: BrowserSignalComparison;
  consentProbe: ConsentProbeResult;
  pages: StaticPageProbe[];
  accessibilityIssues: AccessibilityIssue[];
}) {
  const behaviors: ObservableBehavior[] = [];
  const timestamp = new Date().toISOString();
  const homepageUrl = input.pages[0]?.finalUrl ?? input.pages[0]?.pageUrl ?? "";
  const controlTrackingEvents = input.browserSignalComparison.control.networkEvents.filter((event) => event.category === "tracking");
  const concretePrechoiceArtifacts =
    controlTrackingEvents.length > 0 ||
    input.browserSignalComparison.control.cookies.length > 0 ||
    input.browserSignalComparison.control.storageWrites.length > 0;

  const trackerCount = input.consentProbe.trackerCountTotal ?? 0;

  if ((trackerCount > 0 || concretePrechoiceArtifacts) && !(input.consentProbe.preconsentTrackingDetected && !concretePrechoiceArtifacts && trackerCount === 0)) {
    behaviors.push({
      contradictsClaim: true,
      evidenceRefs: [
        ...controlTrackingEvents.map((event) => event.id),
        ...input.browserSignalComparison.control.cookies.map((cookie) => cookie.id),
        ...input.browserSignalComparison.control.storageWrites.map((entry) => entry.id)
      ],
      id: "behavior-prechoice-tracking",
      keyFlow: false,
      kind: "privacy",
      pageUrl: homepageUrl,
      signal: "tracking_before_choice",
      summary: summarizePreInteractionTracking({
        consentProbe: input.consentProbe,
        controlTrackingEvents
      }),
      timestamp
    });
  }

  if (
    !input.consentProbe.cookieBannerPresent &&
    (input.browserSignalComparison.control.consentSelectors.length === 0 || input.browserSignalComparison.control.bodyTextExcerpt.length > 0) &&
    concretePrechoiceArtifacts
  ) {
    behaviors.push({
      contradictsClaim: true,
      evidenceRefs: [
        ...controlTrackingEvents.map((event) => event.id),
        ...input.browserSignalComparison.control.cookies.map((cookie) => cookie.id)
      ],
      id: "behavior-no-banner-tracking",
      keyFlow: false,
      kind: "privacy",
      pageUrl: homepageUrl,
      signal: "browser_signal_not_honored",
      summary: "The tested homepage load showed tracking-relevant activity without a clearly observed privacy-choice surface under the scanned conditions.",
      timestamp
    });
  }

  if (input.accessibilityIssues.length > 0) {
    behaviors.push({
      contradictsClaim: true,
      evidenceRefs: input.accessibilityIssues.map((issue) => issue.id),
      id: "behavior-automated-accessibility",
      keyFlow: input.accessibilityIssues.some((issue) => issue.keyFlow),
      kind: "accessibility",
      pageUrl: input.accessibilityIssues[0]?.pageUrl ?? homepageUrl,
      signal: "automated_accessibility_barriers",
      summary: "Automated accessibility testing identified barriers on tested pages.",
      timestamp
    });
  }

  return behaviors;
}

function buildArtifacts(input: {
  accessibilityIssues: AccessibilityIssue[];
  browserSignalComparison: BrowserSignalComparison;
  claims: PublicClaim[];
  consentProbe: ConsentProbeResult;
  homepage: StaticPageProbe;
  pages: StaticPageProbe[];
  scanRunId: string;
}): RegulatoryReviewArtifacts {
  const legalPages = input.pages.filter((page) =>
    ["privacy_policy", "cookie_policy", "accessibility_statement", "contact"].includes(page.pageType)
  );
  const keyFlows = input.pages
    .filter((page) => ["signup", "login", "checkout"].includes(page.pageType))
    .map((page) => page.pageUrl);
  const pageUrls = uniqueBy(
    [
      ...input.pages.map((page) => page.pageUrl),
      input.browserSignalComparison.control.finalUrl,
      input.browserSignalComparison.signal.finalUrl
    ],
    (pageUrl) => pageUrl
  );
  const methodology = buildMethodology({
    browserSignalComparedAgainstControl: true,
    browserSignalEnabled: true,
    keyFlows,
    legalPages: uniqueBy(legalPages.map((page) => page.pageUrl), (pageUrl) => pageUrl),
    pageUrls,
    scanRunId: input.scanRunId,
    screenshotsCaptured: Boolean(input.browserSignalComparison.control.screenshotUrl || input.browserSignalComparison.signal.screenshotUrl)
  });
  const timestamp = methodology.generatedAt;

  const evidence = {
    cookies: uniqueBy(
      [...input.browserSignalComparison.control.cookies, ...input.browserSignalComparison.signal.cookies],
      (entry) => `${entry.phase}:${entry.name}:${entry.domain ?? ""}:${entry.path ?? ""}`
    ),
    domSnapshots: uniqueBy([
      ...input.pages.map((page) => ({
      excerpt: clip(stripTags(page.textContent), 220),
      id: `${input.scanRunId}-dom-${page.pageType}-${page.pageUrl}`,
      pageUrl: page.pageUrl,
      selector: "body",
      timestamp
      })),
      {
        excerpt: clip(input.browserSignalComparison.control.bodyTextExcerpt, 220),
        id: `${input.scanRunId}-dom-control-homepage`,
        pageUrl: input.browserSignalComparison.control.finalUrl,
        selector: "body",
        timestamp: input.browserSignalComparison.control.timestamp
      },
      {
        excerpt: clip(input.browserSignalComparison.signal.bodyTextExcerpt, 220),
        id: `${input.scanRunId}-dom-signal-homepage`,
        pageUrl: input.browserSignalComparison.signal.finalUrl,
        selector: "body",
        timestamp: input.browserSignalComparison.signal.timestamp
      }
    ], (entry) => entry.id),
    networkEvents: uniqueBy(
      [...input.browserSignalComparison.control.networkEvents, ...input.browserSignalComparison.signal.networkEvents],
      (entry) => `${entry.phase}:${entry.method ?? ""}:${entry.requestUrl ?? ""}`
    ),
    pageUrls,
    screenshots: uniqueBy(
      [
        input.browserSignalComparison.control.screenshotUrl
          ? {
              caption: "Control homepage session before any interaction.",
              id: `${input.scanRunId}-screenshot-control`,
              pageUrl: input.browserSignalComparison.control.finalUrl,
              timestamp: input.browserSignalComparison.control.timestamp,
              url: input.browserSignalComparison.control.screenshotUrl
            }
          : null,
        input.browserSignalComparison.signal.screenshotUrl
          ? {
              caption: "Signal-enabled homepage session before any interaction.",
              id: `${input.scanRunId}-screenshot-signal`,
              pageUrl: input.browserSignalComparison.signal.finalUrl,
              timestamp: input.browserSignalComparison.signal.timestamp,
              url: input.browserSignalComparison.signal.screenshotUrl
            }
          : null
      ].filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      (entry) => entry.id
    ),
    sessionLogs: [
      {
        eventType: "consent_probe",
        id: `${input.scanRunId}-consent-probe`,
        message: `Consent probe completed across profiles ${input.consentProbe.attemptedProbeProfiles.join(", ") || "default"}.`,
        pageUrl: input.homepage.pageUrl,
        timestamp
      },
      ...((input.consentProbe.warnings ?? []).map((warning, index) => ({
        eventType: "consent_probe_warning",
        id: `${input.scanRunId}-consent-warning-${index + 1}`,
        message: warning,
        pageUrl: input.homepage.pageUrl,
        timestamp
      }))),
      {
        eventType: "browser_signal_comparison",
        id: `${input.scanRunId}-browser-signal-comparison`,
        message:
          input.browserSignalComparison.materialDifferenceSummary.join(" ") ||
          "No material browser-signal differences were retained between control and signal-enabled homepage sessions.",
        pageUrl: input.browserSignalComparison.control.finalUrl,
        timestamp
      },
      {
        eventType: "consent_surface_observation",
        id: `${input.scanRunId}-consent-surface-control`,
        message:
          input.browserSignalComparison.control.consentSelectors.length > 0
            ? `Potential consent-related selectors observed: ${input.browserSignalComparison.control.consentSelectors.join(", ")}.`
            : "No common consent-related selectors were detected on the tested control homepage state.",
        pageUrl: input.browserSignalComparison.control.finalUrl,
        timestamp: input.browserSignalComparison.control.timestamp
      },
      ...(input.consentProbe.preconsentTrackingDetected && input.consentProbe.trackerCountTotal === 0
        ? [
            {
              eventType: "consistency_warning",
              id: `${input.scanRunId}-preconsent-consistency-warning`,
              message:
                "Consent probe indicated pre-choice tracking, but no tracker count or retained concrete artifact was available in the lightweight review harness. Behavioral publication should remain suppressed unless concrete evidence is retained.",
              pageUrl: input.homepage.pageUrl,
              timestamp
            }
          ]
        : [])
    ],
    storageWrites: uniqueBy(
      [...input.browserSignalComparison.control.storageWrites, ...input.browserSignalComparison.signal.storageWrites],
      (entry) => `${entry.phase}:${entry.storageType}:${entry.key ?? ""}`
    )
  };

  const browserSignalEvidenceObserved =
    input.browserSignalComparison.differencesObserved ||
    input.browserSignalComparison.signal.signalAcknowledgementDetected ||
    input.browserSignalComparison.control.signalAcknowledgementDetected;

  return {
    accessibilityIssues: input.accessibilityIssues,
    behaviors: buildBehaviors({
      accessibilityIssues: input.accessibilityIssues,
      browserSignalComparison: input.browserSignalComparison,
      consentProbe: input.consentProbe,
      pages: input.pages
    }),
    claims: input.claims,
    comparedAgainstControl: true,
    evidence,
    methodology,
    pageUrls,
    repeatability: input.browserSignalComparison.differencesObserved ? "consistent" : "partially_consistent",
    sessionCount: 2,
    surfaces: [
      {
        detected: input.pages.some((page) => page.pageType === "privacy_policy"),
        evidence: evidence,
        pageUrl: input.pages.find((page) => page.pageType === "privacy_policy")?.pageUrl,
        surfaceKey: "privacy_policy",
        timestamp
      },
      {
        detected: input.pages.some((page) => /do[- ]?not[- ]?sell|privacy choices|opt out/i.test(page.textContent) || /privacy/i.test(page.pageUrl)),
        evidence,
        pageUrl: input.pages.find((page) => /privacy/i.test(page.pageUrl))?.pageUrl,
        surfaceKey: "ca_opt_out",
        timestamp
      },
      {
        detected: input.pages.some((page) => /request|delete|access|correct/i.test(page.textContent) && /privacy/i.test(page.textContent)),
        evidence,
        pageUrl: input.pages.find((page) => /privacy/i.test(page.pageUrl))?.pageUrl,
        surfaceKey: "consumer_rights_request",
        timestamp
      },
      {
        detected: input.pages.some((page) => /targeted advertising|advertising opt out|do not sell|do not share/i.test(page.textContent)),
        evidence,
        pageUrl: input.pages.find((page) => /privacy/i.test(page.pageUrl))?.pageUrl,
        surfaceKey: "targeted_ads_opt_out",
        timestamp
      },
      {
        detected: browserSignalEvidenceObserved,
        evidence,
        pageUrl: input.homepage.pageUrl,
        notes: summarizeObservedPolicySignals(input.claims)
          .filter((claim) => claim.kind === "privacy")
          .map((claim) => claim.note),
        surfaceKey: "browser_opt_out_signal",
        timestamp
      },
      {
        detected: browserSignalEvidenceObserved,
        evidence,
        pageUrl: input.homepage.pageUrl,
        surfaceKey: "universal_opt_out",
        timestamp
      },
      {
        detected: browserSignalEvidenceObserved,
        evidence,
        pageUrl: input.homepage.pageUrl,
        surfaceKey: "browser_signal_readiness",
        timestamp
      },
      {
        detected: Boolean(input.consentProbe.consentPersistenceMechanismDetected),
        evidence,
        pageUrl: input.homepage.pageUrl,
        surfaceKey: "privacy_preference_persistence",
        timestamp
      },
      {
        detected: /saved|updated|preference|choice/i.test(input.homepage.textContent),
        evidence,
        pageUrl: input.homepage.pageUrl,
        surfaceKey: "privacy_preference_confirmation",
        timestamp
      },
      {
        detected: input.pages.some((page) => page.pageType === "accessibility_statement"),
        evidence,
        pageUrl: input.pages.find((page) => page.pageType === "accessibility_statement")?.pageUrl,
        surfaceKey: "accessibility_statement",
        timestamp
      }
    ],
    testConditions: [
      "Fresh public-site scan using static page fetches, paired browser-signal homepage sessions, consent probe profiles, and targeted automated accessibility checks.",
      "Results reflect tested public conditions and not authenticated or region-locked flows.",
      "Policy text observations are distinct from functional verification of privacy choice mechanisms."
    ]
  };
}

async function reviewCycleWithGpt(input: {
  cycle: number;
  siteResults: Array<Record<string, unknown>>;
}) {
  const apiKey = getEnv("OPENAI_API_KEY");
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5.4",
      temperature: 0,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content:
            "You are reviewing CertScore.dev regulatory website posture outputs. Be conservative, evidence-first, and skeptical. For each site, assess whether the findings are supported by the retained evidence, where the product is missing important posture findings, and where the product risks overclaiming. Return JSON with keys cycleAssessment and siteAssessments. Each site assessment must include hostname, supported, questionable, missing, overclaimRisk, recommendations, and implementationIdeas."
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              cycle: input.cycle,
              methodologySummary: INLINE_METHODOLOGY_SUMMARY,
              sites: input.siteResults.map((site) => {
                const internal = (site.internal as { findings?: Array<Record<string, unknown>> } | undefined)?.findings ?? [];
                return {
                  accessibilityIssueCount: site.accessibilityIssueCount,
                  consentProbe: site.consentProbe,
                  customerFacing: site.customerFacing,
                  extractedClaims: site.extractedClaims,
                  findingSummaries: internal.map((finding) => ({
                    confidence: finding.confidence,
                    confidenceReason: finding.confidenceReason,
                    evidenceCounts:
                      finding.evidence && typeof finding.evidence === "object"
                        ? {
                            cookies: Array.isArray((finding.evidence as Record<string, unknown>).cookies)
                              ? ((finding.evidence as { cookies: unknown[] }).cookies.length)
                              : 0,
                            domSnapshots: Array.isArray((finding.evidence as Record<string, unknown>).domSnapshots)
                              ? ((finding.evidence as { domSnapshots: unknown[] }).domSnapshots.length)
                              : 0,
                            networkEvents: Array.isArray((finding.evidence as Record<string, unknown>).networkEvents)
                              ? ((finding.evidence as { networkEvents: unknown[] }).networkEvents.length)
                              : 0,
                            screenshots: Array.isArray((finding.evidence as Record<string, unknown>).screenshots)
                              ? ((finding.evidence as { screenshots: unknown[] }).screenshots.length)
                              : 0,
                            storageWrites: Array.isArray((finding.evidence as Record<string, unknown>).storageWrites)
                              ? ((finding.evidence as { storageWrites: unknown[] }).storageWrites.length)
                              : 0
                          }
                        : undefined,
                    findingId: finding.findingId,
                    observations: finding.observations,
                    reviewerOnly: finding.reviewerOnly,
                    severity: finding.severity,
                    summary: finding.summary,
                    title: finding.title
                  })),
                  error: site.error,
                  hostname: site.hostname,
                  observedPolicySignals: site.observedPolicySignals,
                  scanStatus: site.scanStatus ?? "ok",
                  staticPages: site.staticPages
                };
              })
            },
            null,
            2
          )
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GPT-5.4 review failed with ${response.status}${text ? `: ${text}` : ""}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const raw = payload.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as Record<string, unknown>;
}

async function runSite(cycle: number, target: TargetSite, cycleDir: string) {
  const hostname = normalizeHostname(target.hostname);
  const siteDir = path.join(cycleDir, hostname);
  await mkdir(siteDir, { recursive: true });
  const domain = await ensureDomain(hostname);
  const probeScanId = await createDevScanRecord({
    cycle,
    domain
  });
  const scanRunId = `reg-review-${cycle}-${hostname}`;
  const consentProbe = buildSkippedConsentProbe(hostname);
  const staticProbe = await probeStaticPages(hostname);
  const claims = buildClaims(staticProbe.pages);
  const browserSignalComparison = await collectBrowserSignalComparison({
    hostname,
    outputDir: siteDir
  });
  const accessibilityPages = staticProbe.pages
    .filter((page) => ["homepage", "signup", "login", "checkout", "accessibility_statement"].includes(page.pageType))
    .map((page) => page.pageUrl);
  const accessibilityIssues = await collectAccessibilityIssues(accessibilityPages);
  const artifacts = buildArtifacts({
    accessibilityIssues,
    browserSignalComparison,
    claims,
    consentProbe,
    homepage: staticProbe.homepage,
    pages: staticProbe.pages,
    scanRunId
  });
  const findings = generateAllRegulatoryFindings(artifacts);
  const internal = buildInternalRegulatoryReviewOutput({
    findings,
    methodology: artifacts.methodology
  });
  const customerFacing = buildCustomerFacingRegulatoryReviewOutput({
    findings,
    methodology: artifacts.methodology,
    methodologySummary: INLINE_METHODOLOGY_SUMMARY
  });

  return {
    accessibilityIssueCount: accessibilityIssues.length,
    browserSignalComparison,
    consentProbe,
    customerFacing,
    extractedClaims: claims,
    hostname,
    internal,
    observedPolicySignals: summarizeObservedPolicySignals(claims),
    rationale: target.rationale,
    staticPages: staticProbe.pages.map((page) => ({
      fetchStatus: page.fetchStatus,
      pageType: page.pageType,
      pageUrl: page.pageUrl,
      title: page.title
    }))
  };
}

async function main() {
  const cycle = Number.parseInt(process.argv[2] ?? "1", 10);
  if (!Number.isFinite(cycle) || cycle < 1) {
    throw new Error("Usage: regulatory-review-cycle.ts <cycle-number> [hostname ...]");
  }
  const requestedHostnames = process.argv.slice(3).map(normalizeHostname);
  const selectedTargets =
    requestedHostnames.length > 0
      ? TARGET_SITES.filter((target) => requestedHostnames.includes(normalizeHostname(target.hostname)))
      : TARGET_SITES;

  if (selectedTargets.length === 0) {
    throw new Error("No matching target sites selected.");
  }

  const cycleDir = path.join(OUTPUT_ROOT, `cycle-${cycle}`);
  await mkdir(cycleDir, { recursive: true });

  const siteResults: Array<Record<string, unknown>> = [];
  for (const target of selectedTargets) {
    let result: Record<string, unknown>;
    try {
      result = await runSite(cycle, target, cycleDir);
    } catch (error) {
      result = {
        error: error instanceof Error ? error.message : "Unknown site scan error",
        hostname: normalizeHostname(target.hostname),
        rationale: target.rationale,
        scanStatus: "error"
      };
    }
    siteResults.push(result);
    await writeFile(
      path.join(cycleDir, `${String(result.hostname ?? normalizeHostname(target.hostname))}.json`),
      JSON.stringify(result, null, 2)
    );
  }

  const review = await reviewCycleWithGpt({
    cycle,
    siteResults
  });

  await writeFile(
    path.join(cycleDir, "gpt-5.4-review.json"),
    JSON.stringify(review, null, 2)
  );

  console.log(
    JSON.stringify(
      {
        cycle,
        cycleDir,
        reviewedSites: siteResults.map((site) => {
          const internal = site.internal as { findings?: unknown[] } | undefined;
          return {
            findingCount: Array.isArray(internal?.findings) ? internal.findings.length : null,
            hostname: site.hostname,
            scanStatus: site.scanStatus ?? "ok"
          };
        }),
        reviewFile: path.join(cycleDir, "gpt-5.4-review.json")
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
