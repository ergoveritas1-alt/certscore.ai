import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Frame, type Locator, type Page, type Request } from "playwright";

type ScenarioName =
  | "fresh_visit"
  | "fresh_visit_gpc"
  | "accept_all"
  | "reject_all"
  | "custom_preferences";

type ChoiceAction = "accept" | "reject" | "manage";
type ChoicePhase = "before_interaction" | "after_choice" | "after_refresh";
type VendorCategory =
  | "strictly_necessary"
  | "analytics"
  | "advertising_marketing"
  | "social_embedded_media"
  | "session_replay_behavioral_analytics"
  | "unknown_needs_manual_review";

type NetworkEntry = {
  documentUrl: string | null;
  hostname: string;
  initiator: string | null;
  method: string;
  phase: ChoicePhase;
  resourceType: string;
  timestamp: string;
  url: string;
  vendorCategory: VendorCategory;
  vendorName: string | null;
};

type StorageEntry = {
  key: string;
  preview: string;
  size: number;
};

type StorageSnapshot = {
  cookies: Array<{
    domain: string;
    expires: number;
    httpOnly: boolean;
    name: string;
    path: string;
    sameSite: string;
    secure: boolean;
    valuePreview: string;
    vendorCategory: VendorCategory;
    vendorName: string | null;
  }>;
  indexedDbNames: string[];
  localStorage: StorageEntry[];
  sessionStorage: StorageEntry[];
};

type ActionCandidate = {
  ariaLabel: string | null;
  dataNav: string | null;
  frameUrl: string;
  inputValue: string | null;
  role: string | null;
  selector: string;
  tagName: string;
  text: string;
};

type SurfaceActionPresence = {
  accept: boolean;
  manage: boolean;
  reject: boolean;
};

type SurfaceActionSet = {
  accept: ActionCandidate | null;
  bannerHtml: string | null;
  bannerSelector: string | null;
  bannerText: string | null;
  cmpSelector: string | null;
  cmpType: string | null;
  frameUrl: string | null;
  manage: ActionCandidate | null;
  reject: ActionCandidate | null;
  surfaceDetected: boolean;
  visibleActions: SurfaceActionPresence;
};

type PreferencesSummary = {
  optionalCategoriesPreselected: boolean | null;
  toggleStates: Array<{
    checked: boolean;
    disabled: boolean;
    label: string;
    role: string;
  }>;
};

type ScenarioResult = {
  actionSummary: {
    acceptPath: {
      attempted: boolean;
      clicks: number | null;
      labels: string[];
      timeMs: number | null;
    };
    rejectPath: {
      attempted: boolean;
      clicks: number | null;
      labels: string[];
      timeMs: number | null;
    };
  };
  banner: {
    bannerHtmlPath: string | null;
    bannerPresent: boolean;
    bannerText: string | null;
    frameUrl: string | null;
    screenshots: {
      banner: string | null;
      firstLoad: string | null;
      preferencesCenter: string | null;
    };
    visibleActions: SurfaceActionPresence;
  };
  cmpSignals: Array<{
    key: string;
    source: "cookie" | "dom" | "localStorage" | "request";
    value: string;
  }>;
  errors: string[];
  network: NetworkEntry[];
  notes: string[];
  preferences: PreferencesSummary | null;
  refresh: {
    cookies: StorageSnapshot["cookies"];
    localStorage: StorageEntry[];
    network: NetworkEntry[];
    sessionStorage: StorageEntry[];
  } | null;
  storageDiffs: {
    acceptPhase: {
      consentSignalsAdded: string[];
      cookiesAdded: string[];
      cookiesRemoved: string[];
      localStorageAdded: string[];
      localStorageRemoved: string[];
      sessionStorageAdded: string[];
      sessionStorageRemoved: string[];
    } | null;
    refreshPhase: {
      consentSignalsAdded: string[];
      cookiesAdded: string[];
      cookiesRemoved: string[];
      localStorageAdded: string[];
      localStorageRemoved: string[];
      sessionStorageAdded: string[];
      sessionStorageRemoved: string[];
    } | null;
  };
  storageAfterAction: StorageSnapshot | null;
  storageBeforeInteraction: StorageSnapshot;
  timestamp: string;
  url: string;
};

type ScenarioReportMap = {
  accept_all: ScenarioResult;
  custom_preferences: ScenarioResult;
  fresh_visit: ScenarioResult;
  fresh_visit_gpc: ScenarioResult;
  reject_all: ScenarioResult;
};

type FindingRecord = {
  confidenceScore: number;
  conservativeWording: string;
  evidence: {
    cookies: string[];
    pageUrls: string[];
    requests: string[];
    screenshots: string[];
    storage: string[];
    uiText: string[];
  };
  findingId: string;
  observation: string;
  recommendedNextManualCheck: string;
  severity: "low" | "medium" | "high";
  title: string;
  whyThisMatters: string;
};

type SiteReport = {
  consentUxScorecard: {
    acceptRejectClickParity: string;
    bannerPresent: "yes" | "no" | "inconclusive";
    darkPatternIndicatorsObserved: string[];
    equalProminenceAssessment: string;
    rejectAllFirstLayer: "yes" | "no" | "inconclusive";
  };
  executiveSummary: {
    confidenceLevel: "high" | "medium" | "low";
    manualReviewRecommended: boolean;
    overallTestingStatus: string;
    strongestObservedRisks: string[];
  };
  finalClassification:
    | "no obvious issue observed"
    | "possible consent UX issue"
    | "likely dark-pattern consent design"
    | "possible pre-consent tracking"
    | "reject path may not suppress non-essential tracking"
    | "inconclusive / needs manual review";
  findings: FindingRecord[];
  methodology: {
    browserSignalsCompared: boolean;
    locale: string;
    noInteractionWaitMs: number;
    testedAt: string;
    viewport: { height: number; width: number };
  };
  preConsentTrackingSummary: {
    cookiesSetBeforeInteraction: string[];
    likelyVendorsObserved: string[];
    nonEssentialRequestsBeforeInteraction: string[];
    storageEntriesCreatedBeforeInteraction: string[];
  };
  rejectPathEffectivenessSummary: {
    consentSignalsChangedAfterReject: string[];
    refreshPreservedRejectOutcome: string;
    stillFiredAfterReject: string[];
    whatChangedAfterReject: string[];
  };
  scenarios: ScenarioReportMap;
  site: {
    hostname: string;
    startUrl: string;
  };
};

const TARGETS = [
  "https://temu.com/",
  "https://shein.com/",
  "https://amazon.com/",
  "https://tiktok.com/",
  "https://booking.com/",
  "https://ebay.com/",
  "https://aliexpress.com/",
  "https://etsy.com/",
  "https://tripadvisor.com/"
];

const OUTPUT_STAMP = new Date().toISOString().replaceAll(":", "-");
const OUTPUT_ROOT = path.join(process.cwd(), "apps/validation-worker/artifacts/live-consent-audit", OUTPUT_STAMP);
const VIEWPORT = { width: 1440, height: 2200 };
const LOAD_WAIT_MS = 5_000;
const NO_INTERACTION_WAIT_MS = 12_000;
const ACTION_WAIT_MS = 4_000;
const SCENARIO_TIMEOUT_MS = 120_000;

const ACCEPT_PATTERNS = [/^accept(?:\s+all)?$/i, /^allow(?:\s+all)?$/i, /^agree$/i, /^i agree$/i, /^ok(?:ay)?$/i, /^got it$/i];
const REJECT_PATTERNS = [
  /^reject(?:\s+all)?$/i,
  /^decline(?:\s+all)?$/i,
  /^deny(?:\s+all)?$/i,
  /^essential(?:\s+only)?$/i,
  /^only necessary$/i,
  /^use necessary only$/i,
  /^continue without accepting$/i,
  /^reject optional$/i,
  /^do not accept$/i
];
const MANAGE_PATTERNS = [
  /manage/i,
  /preference/i,
  /setting/i,
  /customi[sz]e/i,
  /choice/i,
  /privacy options/i,
  /select(?:ion)?/i
];
const SAVE_PATTERNS = [/^save(?:\s+(?:choices|preferences|settings|selection))?$/i, /^confirm(?:\s+(?:my\s+)??choices)?$/i];

const CONSENT_KEYWORDS = [
  "cookie",
  "privacy",
  "consent",
  "tracking",
  "personalized",
  "preference",
  "partners",
  "legitimate interest"
];

const CMP_HINTS = [
  "onetrust",
  "trustarc",
  "didomi",
  "usercentrics",
  "quantcast",
  "cookiebot",
  "sourcepoint",
  "termly",
  "gpp",
  "usp",
  "usprivacy",
  "euconsent",
  "tcf"
];

const CMP_ROOT_SELECTORS = [
  "#onetrust-banner-sdk",
  "#onetrust-consent-sdk",
  "#didomi-host",
  "#CybotCookiebotDialog",
  "#usercentrics-root",
  "#qc-cmp2-ui",
  "#truste-consent-track",
  "[id*='sp_message_container']",
  "iframe[id*='sp_message_iframe']",
  "iframe[title*='consent' i]",
  "iframe[src*='consent' i]",
  "[data-testid*='cookie' i]",
  "[id*='cookie' i][role='dialog']"
];

const VENDOR_RULES: Array<{ category: VendorCategory; name: string; patterns: string[] }> = [
  { name: "Google Tag Manager", category: "analytics", patterns: ["googletagmanager.com"] },
  { name: "Google Analytics", category: "analytics", patterns: ["google-analytics.com", "analytics.google.com", "_ga", "_gid", "_gat"] },
  { name: "DoubleClick", category: "advertising_marketing", patterns: ["doubleclick.net", "adservice.google.com", "IDE", "test_cookie"] },
  { name: "Meta / Facebook", category: "advertising_marketing", patterns: ["facebook.net", "facebook.com/tr", "_fbp", "fr"] },
  { name: "TikTok", category: "advertising_marketing", patterns: ["analytics.tiktok.com", "tiktok.com/i18n/pixel", "_ttp"] },
  { name: "Amazon Ads", category: "advertising_marketing", patterns: ["amazon-adsystem.com"] },
  { name: "Criteo", category: "advertising_marketing", patterns: ["criteo.com", "criteo.net"] },
  { name: "AppNexus / Xandr", category: "advertising_marketing", patterns: ["adnxs.com"] },
  { name: "Hotjar", category: "session_replay_behavioral_analytics", patterns: ["hotjar.com", "_hj"] },
  { name: "FullStory", category: "session_replay_behavioral_analytics", patterns: ["fullstory.com", "fs.js"] },
  { name: "Segment", category: "analytics", patterns: ["segment.com", "segment.io", "ajs_"] },
  { name: "Pinterest", category: "social_embedded_media", patterns: ["pinimg.com", "ct.pinterest.com"] },
  { name: "Snap", category: "advertising_marketing", patterns: ["sc-static.net", "tr.snapchat.com"] }
];

const SECURITY_INTERSTITIAL_PATTERNS = [
  "captcha-delivery.com",
  "geo.captcha-delivery.com",
  "/captcha/",
  "datadome",
  "perimeterx",
  "px-captcha",
  "cloudflare/challenge-platform",
  "arkoselabs",
  "humansecurity",
  "bot protection"
];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function truncate(value: string, size = 160) {
  return value.length <= size ? value : `${value.slice(0, size)}...`;
}

function normalizeActionLabel(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function textImpliesAction(text: string | null | undefined, patterns: RegExp[]) {
  const normalized = normalizeActionLabel(text);
  return normalized.length > 0 && patterns.some((pattern) => pattern.test(normalized));
}

function inferVisibleActionsFromText(text: string | null | undefined): SurfaceActionPresence {
  return {
    accept: textImpliesAction(text, ACCEPT_PATTERNS),
    manage: textImpliesAction(text, MANAGE_PATTERNS),
    reject: textImpliesAction(text, REJECT_PATTERNS)
  };
}

function classifyArtifact(input: string): { category: VendorCategory; vendorName: string | null } {
  const haystack = input.toLowerCase();
  if (SECURITY_INTERSTITIAL_PATTERNS.some((pattern) => haystack.includes(pattern))) {
    return { category: "strictly_necessary", vendorName: "Security / anti-bot" };
  }

  const match = VENDOR_RULES.find((rule) => rule.patterns.some((pattern) => haystack.includes(pattern.toLowerCase())));
  if (match) {
    return { category: match.category, vendorName: match.name };
  }

  if (/(optanon|onetrust|consent|cookiebot|didomi|trustarc|usercentrics)/i.test(input)) {
    return { category: "strictly_necessary", vendorName: "Consent Management Platform" };
  }

  return { category: "unknown_needs_manual_review", vendorName: null };
}

function formatJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function withTimeout<T>(label: string, ms: number, work: () => Promise<T>): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${ms} ms`));
        }, ms);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function writeJson(filePath: string, value: unknown) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, formatJson(value), "utf8");
}

async function writeText(filePath: string, value: string) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, value, "utf8");
}

async function safeGoto(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(LOAD_WAIT_MS);
}

async function collectStorageSnapshot(context: BrowserContext, page: Page): Promise<StorageSnapshot> {
  const cookies = await context.cookies();
  const storage = await page.evaluate(async function () {
    const indexedDbNames: string[] = [];
    if (typeof indexedDB?.databases === "function") {
      const items = await indexedDB.databases();
      for (const item of items) {
        if (typeof item.name === "string" && item.name.length > 0) {
          indexedDbNames.push(item.name);
        }
      }
    }

    const localStorageEntries: Array<{ key: string; preview: string; size: number }> = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) {
        continue;
      }
      const value = String(localStorage.getItem(key) ?? "");
      localStorageEntries.push({
        key,
        preview: value.slice(0, 240),
        size: value.length
      });
    }

    const sessionStorageEntries: Array<{ key: string; preview: string; size: number }> = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key) {
        continue;
      }
      const value = String(sessionStorage.getItem(key) ?? "");
      sessionStorageEntries.push({
        key,
        preview: value.slice(0, 240),
        size: value.length
      });
    }

    return {
      indexedDbNames,
      localStorage: localStorageEntries,
      sessionStorage: sessionStorageEntries
    };
  });

  return {
    cookies: cookies.map((cookie) => {
      const classified = classifyArtifact(`${cookie.domain} ${cookie.name}`);
      return {
        domain: cookie.domain,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        name: cookie.name,
        path: cookie.path,
        sameSite: cookie.sameSite,
        secure: cookie.secure,
        valuePreview: truncate(cookie.value, 80),
        vendorCategory: classified.category,
        vendorName: classified.vendorName
      };
    }),
    indexedDbNames: storage.indexedDbNames,
    localStorage: storage.localStorage,
    sessionStorage: storage.sessionStorage
  };
}

function networkLogger() {
  const entries: NetworkEntry[] = [];
  let phase: ChoicePhase = "before_interaction";

  const handler = (request: Request) => {
    const url = request.url();
    const classified = classifyArtifact(url);
    entries.push({
      documentUrl: request.frame()?.url() ?? null,
      hostname: safeHostname(url),
      initiator: request.resourceType(),
      method: request.method(),
      phase,
      resourceType: request.resourceType(),
      timestamp: new Date().toISOString(),
      url,
      vendorCategory: classified.category,
      vendorName: classified.vendorName
    });
  };

  return {
    entries,
    getPhase: () => phase,
    setPhase: (next: ChoicePhase) => {
      phase = next;
    },
    handler
  };
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "unknown";
  }
}

function scenarioErrorResult(url: string, scenarioName: ScenarioName, error: unknown): ScenarioResult {
  return {
    actionSummary: {
      acceptPath: { attempted: false, clicks: null, labels: [], timeMs: null },
      rejectPath: { attempted: false, clicks: null, labels: [], timeMs: null }
    },
    banner: {
      bannerHtmlPath: null,
      bannerPresent: false,
      bannerText: null,
      frameUrl: null,
      screenshots: {
        banner: null,
        firstLoad: null,
        preferencesCenter: null
      },
      visibleActions: {
        accept: false,
        manage: false,
        reject: false
      }
    },
    cmpSignals: [],
    errors: [`Scenario ${scenarioName} failed: ${error instanceof Error ? error.message : String(error)}`],
    network: [],
    notes: [],
    preferences: null,
    refresh: null,
    storageDiffs: {
      acceptPhase: null,
      refreshPhase: null
    },
    storageAfterAction: null,
    storageBeforeInteraction: {
      cookies: [],
      indexedDbNames: [],
      localStorage: [],
      sessionStorage: []
    },
    timestamp: new Date().toISOString(),
    url
  };
}

async function getAllFrames(page: Page) {
  return page.frames().filter((frame) => frame.url() !== "about:blank" || frame === page.mainFrame());
}

async function firstVisibleLocator(frame: Frame, candidates: string[]) {
  for (const selector of candidates) {
    const locator = frame.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
  }

  return null;
}

async function findVisibleCmpRoot(frame: Frame) {
  const locator = await firstVisibleLocator(frame, CMP_ROOT_SELECTORS);
  return locator;
}

async function extractActionCandidate(locator: Locator, frame: Frame): Promise<ActionCandidate | null> {
  if (!(await locator.isVisible().catch(() => false))) {
    return null;
  }

  return locator.evaluate(function (element) {
    let selector = element.tagName.toLowerCase();
    const id = element.getAttribute("id");
    if (id) {
      selector = `#${id}`;
    } else {
      const testId = element.getAttribute("data-testid");
      if (testId) {
        selector = `[data-testid="${testId}"]`;
      } else {
        const ariaLabel = element.getAttribute("aria-label");
        if (ariaLabel) {
          selector = `${element.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`;
        }
      }
    }
    return {
      ariaLabel: element.getAttribute("aria-label"),
      dataNav: element.getAttribute("data-nav"),
      inputValue: element instanceof HTMLInputElement ? element.value : null,
      role: element.getAttribute("role"),
      selector,
      tagName: element.tagName.toLowerCase(),
      text: (element.textContent ?? "").replace(/\s+/g, " ").trim()
    };
  }).then((candidate) => ({
    ...candidate,
    frameUrl: frame.url()
  }));
}

async function findAction(frame: Frame, patterns: RegExp[]) {
  const candidate = await frame
    .locator("button, [role='button'], a, input[type='button'], input[type='submit']")
    .evaluateAll((elements, serializedPatterns) => {
      const compiledPatterns = (serializedPatterns as string[]).map((source) => new RegExp(source, "i"));
      let bestMatch: null | {
        ariaLabel: string | null;
        dataNav: string | null;
        inputValue: string | null;
        role: string | null;
        score: number;
        selector: string;
        tagName: string;
        text: string;
      } = null;

      for (const element of elements) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.visibility === "hidden" || style.display === "none" || rect.width <= 0 || rect.height <= 0) {
          continue;
        }

        const text = (element.getAttribute("aria-label") ?? (element instanceof HTMLInputElement ? element.value : null) ?? element.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (!text || !compiledPatterns.some((pattern) => pattern.test(text))) {
          continue;
        }

        const id = element.getAttribute("id");
        const testId = element.getAttribute("data-testid");
        const dataNav = element.getAttribute("data-nav");
        const ariaLabel = element.getAttribute("aria-label");
        const selector =
          id ? `#${id}` :
          testId ? `[data-testid="${testId.replace(/"/g, '\\"')}"]` :
          dataNav ? `[data-nav="${dataNav.replace(/"/g, '\\"')}"]` :
          ariaLabel ? `${element.tagName.toLowerCase()}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]` :
          element.tagName.toLowerCase();

        let score = 0;
        if (element.tagName.toLowerCase() === "button") {
          score += 4;
        }
        if (element.getAttribute("role") === "button") {
          score += 2;
        }
        if (id) {
          score += 3;
        }
        if (ariaLabel) {
          score += 2;
        }
        if (compiledPatterns.some((pattern) => pattern.test(text) && new RegExp(`^${pattern.source}$`, "i").test(text))) {
          score += 6;
        }

        const current = {
          ariaLabel,
          dataNav,
          inputValue: element instanceof HTMLInputElement ? element.value : null,
          role: element.getAttribute("role"),
          score,
          selector,
          tagName: element.tagName.toLowerCase(),
          text
        };
        if (!bestMatch || current.score > bestMatch.score) {
          bestMatch = current;
        }
      }

      return bestMatch;
    }, patterns.map((pattern) => pattern.source));

  return candidate
    ? {
        ariaLabel: candidate.ariaLabel,
        dataNav: candidate.dataNav,
        frameUrl: frame.url(),
        inputValue: candidate.inputValue,
        role: candidate.role,
        selector: candidate.selector,
        tagName: candidate.tagName,
        text: candidate.text
      }
    : null;
}

async function detectConsentSurface(page: Page): Promise<SurfaceActionSet> {
  for (const frame of await getAllFrames(page)) {
    const cmpRoot = await findVisibleCmpRoot(frame);
    const cmpRootCandidate = cmpRoot ? await extractActionCandidate(cmpRoot, frame).catch(() => null) : null;
    const cmpType =
      cmpRootCandidate?.selector.includes("onetrust") ? "onetrust" :
      cmpRootCandidate?.selector.includes("didomi") ? "didomi" :
      cmpRootCandidate?.selector.toLowerCase().includes("cybot") ? "cookiebot" :
      cmpRootCandidate?.selector.toLowerCase().includes("usercentrics") ? "usercentrics" :
      cmpRootCandidate?.selector.toLowerCase().includes("sp_message") ? "sourcepoint" :
      cmpRootCandidate ? "detected_cmp_root" : null;

    const surface = await frame.evaluate(function (keywords) {
      const elements = [...document.querySelectorAll("dialog, [role='dialog'], [aria-modal='true'], aside, section, div, form, iframe")];
      let bestMatch: { html: string; score: number; selector: string; text: string } | null = null;
      for (const element of elements) {
        const style = window.getComputedStyle(element as HTMLElement);
        const rect = (element as HTMLElement).getBoundingClientRect();
        if (style.visibility === "hidden" || style.display === "none" || rect.width <= 80 || rect.height <= 30) {
          continue;
        }
        const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text.length < 24 || text.length > 2000) {
          continue;
        }
        let keywordHits = 0;
        for (const keyword of keywords as string[]) {
          if (text.toLowerCase().includes(keyword)) {
            keywordHits += 1;
          }
        }
        if (keywordHits === 0) {
          continue;
        }

        const lowerText = text.toLowerCase();
        const position = style.position;
        const zIndex = Number.parseInt(style.zIndex || "0", 10);
        const selector = element.id ? `#${element.id}` : element.getAttribute("aria-label") ? `[aria-label="${element.getAttribute("aria-label")}"]` : element.tagName.toLowerCase();

        let score = keywordHits * 5;
        if (element.tagName.toLowerCase() === "dialog" || element.getAttribute("role") === "dialog" || element.getAttribute("aria-modal") === "true") {
          score += 12;
        }
        if (element.tagName.toLowerCase() === "iframe") {
          score += 8;
        }
        if (position === "fixed" || position === "sticky") {
          score += 8;
        }
        if (zIndex >= 100) {
          score += 6;
        }
        if (lowerText.includes("accept") || lowerText.includes("reject") || lowerText.includes("preferences") || lowerText.includes("settings")) {
          score += 10;
        }
        if (rect.height <= window.innerHeight * 0.75 && rect.width >= window.innerWidth * 0.2) {
          score += 4;
        }
        if (rect.top <= 80 || rect.bottom >= window.innerHeight - 80) {
          score += 4;
        }

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            html: element.outerHTML.slice(0, 15_000),
            score,
            selector,
            text: text.slice(0, 4_000)
          };
        }
      }

      if (bestMatch && bestMatch.score >= 12) {
        return {
          html: bestMatch.html,
          selector: bestMatch.selector,
          text: bestMatch.text
        };
      }
      return null;
    }, CONSENT_KEYWORDS);

    const accept = await findAction(frame, ACCEPT_PATTERNS);
    const reject = await findAction(frame, REJECT_PATTERNS);
    const manage = (await findAction(frame, MANAGE_PATTERNS)) ?? (await findAction(frame, SAVE_PATTERNS));
    const impliedActions = inferVisibleActionsFromText(surface?.text);

    if (surface || accept || reject || manage || cmpRootCandidate) {
      return {
        accept,
        bannerHtml: surface?.html ?? null,
        bannerSelector: surface?.selector ?? null,
        bannerText: surface?.text ?? null,
        cmpSelector: cmpRootCandidate?.selector ?? null,
        cmpType,
        frameUrl: frame.url(),
        manage,
        reject,
        surfaceDetected: true,
        visibleActions: {
          accept: Boolean(accept) || impliedActions.accept,
          manage: Boolean(manage) || impliedActions.manage,
          reject: Boolean(reject) || impliedActions.reject
        }
      };
    }
  }

  return {
    accept: null,
    bannerHtml: null,
    bannerSelector: null,
    bannerText: null,
    cmpSelector: null,
    cmpType: null,
    frameUrl: null,
    manage: null,
    reject: null,
    surfaceDetected: false,
    visibleActions: {
      accept: false,
      manage: false,
      reject: false
    }
  };
}

async function clickAction(page: Page, candidate: ActionCandidate): Promise<boolean> {
  const frame = page.frames().find((item) => item.url() === candidate.frameUrl) ?? page.mainFrame();
  const escapedText = candidate.text.replace(/"/g, '\\"');
  const escapedAria = candidate.ariaLabel?.replace(/"/g, '\\"') ?? null;
  const escapedValue = candidate.inputValue?.replace(/"/g, '\\"') ?? null;
  const escapedDataNav = candidate.dataNav?.replace(/"/g, '\\"') ?? null;
  const options = [
    candidate.selector,
    escapedDataNav ? `[data-nav="${escapedDataNav}"]` : null,
    escapedAria ? `${candidate.tagName}[aria-label="${escapedAria}"]` : null,
    escapedValue ? `input[value="${escapedValue}"]` : null,
    escapedText ? `button:has-text("${escapedText}")` : null,
    escapedText ? `[role="button"]:has-text("${escapedText}")` : null,
    escapedText ? `a:has-text("${escapedText}")` : null,
    escapedText ? `text="${escapedText}"` : null
  ].filter((value): value is string => Boolean(value));

  for (const selector of options) {
    const locator = frame.locator(selector).first();
    if (!(await locator.count().catch(() => 0))) {
      continue;
    }
    if (!(await locator.isVisible().catch(() => false))) {
      continue;
    }
    try {
      await locator.click({ timeout: 10_000 });
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

async function captureBannerScreenshot(page: Page, siteDir: string, scenarioName: ScenarioName) {
  const surface = await detectConsentSurface(page);
  const screenshotPath = path.join(siteDir, scenarioName, "banner.png");
  if (!surface.surfaceDetected || !surface.bannerSelector) {
    return { path: null, surface };
  }

  const frame = page.frames().find((item) => item.url() === surface.frameUrl) ?? page.mainFrame();
  const locator = frame.locator(surface.bannerSelector).first();
  if (await locator.count().catch(() => 0)) {
    await locator.screenshot({ path: screenshotPath }).catch(() => undefined);
    return { path: screenshotPath, surface };
  }

  return { path: null, surface };
}

async function summarizePreferences(page: Page) {
  return page.evaluate(function () {
    const labels = [...document.querySelectorAll("label, [role='switch'], [role='checkbox'], input[type='checkbox']")];
    const toggleStates: Array<{ checked: boolean; disabled: boolean; label: string; role: string }> = [];
    for (const element of labels) {
      const input =
        element instanceof HTMLInputElement
          ? element
          : element.querySelector("input[type='checkbox'], input[role='switch'], [role='checkbox']");
      if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLElement)) {
        continue;
      }

      const checked = input instanceof HTMLInputElement ? input.checked : input.getAttribute("aria-checked") === "true";
      const disabled = input instanceof HTMLInputElement ? input.disabled : input.getAttribute("aria-disabled") === "true";
      const label = (element.textContent ?? input.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim();
      const role = input.getAttribute("role") ?? input.tagName.toLowerCase();
      toggleStates.push({ checked, disabled, label, role });
    }

    let optionalCategoriesPreselected: boolean | null = null;
    if (toggleStates.length > 0) {
      optionalCategoriesPreselected = false;
      for (const item of toggleStates) {
        if (!/necessary|essential|required|strictly necessary|always active|always on|active at all times/i.test(item.label) && item.label.length > 0 && item.checked) {
          optionalCategoriesPreselected = true;
          break;
        }
      }
    }

    return {
      optionalCategoriesPreselected,
      toggleStates
    };
  });
}

function extractCmpSignals(result: ScenarioResult) {
  const signals = new Map<string, { key: string; source: "cookie" | "dom" | "localStorage" | "request"; value: string }>();
  const push = (key: string, source: "cookie" | "dom" | "localStorage" | "request", value: string) => {
    const mapKey = `${source}:${key}:${value}`;
    if (!signals.has(mapKey)) {
      signals.set(mapKey, { key, source, value });
    }
  };

  for (const cookie of result.storageBeforeInteraction.cookies) {
    if (CMP_HINTS.some((hint) => cookie.name.toLowerCase().includes(hint))) {
      push(cookie.name, "cookie", cookie.domain);
    }
  }

  for (const entry of result.storageBeforeInteraction.localStorage) {
    if (CMP_HINTS.some((hint) => entry.key.toLowerCase().includes(hint))) {
      push(entry.key, "localStorage", truncate(entry.preview, 120));
    }
  }

  if (result.banner.bannerText) {
    for (const hint of CMP_HINTS) {
      if (result.banner.bannerText.toLowerCase().includes(hint)) {
        push(hint, "dom", truncate(result.banner.bannerText, 120));
      }
    }
  }

  for (const request of result.network) {
    if (CMP_HINTS.some((hint) => request.url.toLowerCase().includes(hint))) {
      push(request.hostname, "request", request.url);
    }
  }

  return [...signals.values()];
}

function nonEssentialNetwork(entries: NetworkEntry[]) {
  return entries.filter((entry) => entry.vendorCategory !== "strictly_necessary" && entry.vendorCategory !== "unknown_needs_manual_review");
}

function nonEssentialCookies(snapshot: StorageSnapshot) {
  return snapshot.cookies.filter((cookie) => cookie.vendorCategory !== "strictly_necessary" && cookie.vendorCategory !== "unknown_needs_manual_review");
}

function nonEssentialStorage(snapshot: StorageSnapshot) {
  return [...snapshot.localStorage, ...snapshot.sessionStorage].filter((entry) => classifyArtifact(`${entry.key} ${entry.preview}`).category !== "strictly_necessary");
}

function collectLikelyVendors(entries: Array<{ vendorName: string | null }>) {
  return [...new Set(entries.map((entry) => entry.vendorName).filter((value): value is string => Boolean(value)))].sort();
}

function sortedUnique(values: string[]) {
  return [...new Set(values)].sort();
}

function snapshotCookieKeys(snapshot: StorageSnapshot) {
  return snapshot.cookies.map((cookie) => `${cookie.name}@${cookie.domain}`);
}

function snapshotStorageKeys(entries: StorageEntry[]) {
  return entries.map((entry) => entry.key);
}

function extractConsentSignals(snapshot: StorageSnapshot) {
  return sortedUnique([
    ...snapshot.cookies.filter((cookie) => CMP_HINTS.some((hint) => `${cookie.name} ${cookie.domain}`.toLowerCase().includes(hint))).map((cookie) => `${cookie.name}@${cookie.domain}`),
    ...snapshot.localStorage.filter((entry) => CMP_HINTS.some((hint) => `${entry.key} ${entry.preview}`.toLowerCase().includes(hint))).map((entry) => `localStorage:${entry.key}`),
    ...snapshot.sessionStorage.filter((entry) => CMP_HINTS.some((hint) => `${entry.key} ${entry.preview}`.toLowerCase().includes(hint))).map((entry) => `sessionStorage:${entry.key}`)
  ]);
}

function diffSets(before: string[], after: string[]) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: [...afterSet].filter((item) => !beforeSet.has(item)).sort(),
    removed: [...beforeSet].filter((item) => !afterSet.has(item)).sort()
  };
}

function buildStorageDiff(before: StorageSnapshot, after: StorageSnapshot) {
  const cookies = diffSets(snapshotCookieKeys(before), snapshotCookieKeys(after));
  const localStorage = diffSets(snapshotStorageKeys(before.localStorage), snapshotStorageKeys(after.localStorage));
  const sessionStorage = diffSets(snapshotStorageKeys(before.sessionStorage), snapshotStorageKeys(after.sessionStorage));
  const consentSignals = diffSets(extractConsentSignals(before), extractConsentSignals(after));

  return {
    consentSignalsAdded: consentSignals.added,
    cookiesAdded: cookies.added,
    cookiesRemoved: cookies.removed,
    localStorageAdded: localStorage.added,
    localStorageRemoved: localStorage.removed,
    sessionStorageAdded: sessionStorage.added,
    sessionStorageRemoved: sessionStorage.removed
  };
}

function securityInterstitialRequests(entries: NetworkEntry[]) {
  return entries.filter((entry) => entry.vendorName === "Security / anti-bot");
}

function securityInterstitialObserved(result: ScenarioResult) {
  return (
    securityInterstitialRequests(result.network).length > 0 ||
    result.notes.some((note) => /captcha|interstitial|bot/i.test(note)) ||
    result.url.toLowerCase().includes("captcha")
  );
}

function postRejectResidualEvidence(reject: ScenarioResult) {
  const postRejectRequests = nonEssentialNetwork(reject.network.filter((entry) => entry.phase === "after_choice"));
  const postRefreshRequests = reject.refresh ? nonEssentialNetwork(reject.refresh.network) : [];
  const postRejectCookies = reject.storageAfterAction ? nonEssentialCookies(reject.storageAfterAction) : [];
  const postRejectStorage = reject.storageAfterAction ? nonEssentialStorage(reject.storageAfterAction) : [];

  return {
    postRefreshRequests,
    postRejectCookies,
    postRejectRequests,
    postRejectStorage
  };
}

async function runScenario(siteDir: string, url: string, scenarioName: ScenarioName): Promise<ScenarioResult> {
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    headless: true
  });

  const context = await browser.newContext({
    extraHTTPHeaders:
      scenarioName === "fresh_visit_gpc"
        ? {
            DNT: "1",
            "Sec-GPC": "1"
          }
        : undefined,
    locale: "en-US",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    viewport: VIEWPORT
  });

  if (scenarioName === "fresh_visit_gpc") {
    await context.addInitScript(function () {
      Object.defineProperty(navigator, "globalPrivacyControl", {
        configurable: true,
        get: () => true
      });
      Object.defineProperty(navigator, "doNotTrack", {
        configurable: true,
        get: () => "1"
      });
    });
  }

  const page = await context.newPage();
  const logger = networkLogger();
  page.on("request", logger.handler);

  const scenarioDir = path.join(siteDir, scenarioName);
  await ensureDir(scenarioDir);
  try {
    return await withTimeout(`scenario ${scenarioName} for ${safeHostname(url)}`, SCENARIO_TIMEOUT_MS, async () => {
      const errors: string[] = [];
      const notes: string[] = [];
      const actionSummary = {
        acceptPath: { attempted: false, clicks: null as number | null, labels: [] as string[], timeMs: null as number | null },
        rejectPath: { attempted: false, clicks: null as number | null, labels: [] as string[], timeMs: null as number | null }
      };

      try {
        await safeGoto(page, url);
      } catch (error) {
        errors.push(`Navigation failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      const firstLoadPath = path.join(scenarioDir, "first-load.png");
      await page.screenshot({ fullPage: true, path: firstLoadPath }).catch((error) => {
        errors.push(`First-load screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
      });

      const bannerCapture = await captureBannerScreenshot(page, siteDir, scenarioName);
      const surface = bannerCapture.surface;
      if (!surface.surfaceDetected) {
        notes.push("No consent surface detected with current heuristics on the tested first load.");
      }

      if (surface.bannerHtml) {
        await writeText(path.join(scenarioDir, "banner.html"), surface.bannerHtml);
      }
      if (surface.bannerText) {
        await writeText(path.join(scenarioDir, "banner.txt"), `${surface.bannerText}\n`);
      }

      const storageBeforeInteraction = await collectStorageSnapshot(context, page).catch(() => ({
        cookies: [],
        indexedDbNames: [],
        localStorage: [],
        sessionStorage: []
      }));

      await writeJson(path.join(scenarioDir, "storage-before.json"), storageBeforeInteraction);

      if (scenarioName === "fresh_visit" || scenarioName === "fresh_visit_gpc") {
        await page.waitForTimeout(NO_INTERACTION_WAIT_MS);
        notes.push(`No interaction wait completed for ${NO_INTERACTION_WAIT_MS} ms.`);
      }

      let preferences: PreferencesSummary | null = null;
      let preferencesCenterPath: string | null = null;
      let storageAfterAction: StorageSnapshot | null = null;
      let refresh: ScenarioResult["refresh"] = null;
      let storageDiffs: ScenarioResult["storageDiffs"] = {
        acceptPhase: null,
        refreshPhase: null
      };

      const act = async (choice: ChoiceAction) => {
        const actionStart = Date.now();
        const refreshedSurface = await detectConsentSurface(page);
        const candidate = choice === "accept" ? refreshedSurface.accept : choice === "reject" ? refreshedSurface.reject : refreshedSurface.manage;
        if (!candidate) {
          notes.push(`No ${choice} action detected.`);
          return false;
        }

        const summary = choice === "accept" ? actionSummary.acceptPath : actionSummary.rejectPath;
        summary.attempted = true;

        if (choice === "reject" && !refreshedSurface.reject && refreshedSurface.manage) {
          notes.push("Reject control was not visible on the first layer; manage/preferences control was visible.");
        }

        if (choice === "manage" || (choice === "reject" && !refreshedSurface.reject && refreshedSurface.manage)) {
          const manageCandidate = refreshedSurface.manage;
          if (manageCandidate) {
            const manageClicked = await clickAction(page, manageCandidate);
            if (manageClicked) {
              await page.waitForTimeout(ACTION_WAIT_MS);
              preferences = await summarizePreferences(page).catch(() => null);
              preferencesCenterPath = path.join(scenarioDir, "preferences-center.png");
              await page.screenshot({ fullPage: true, path: preferencesCenterPath }).catch(() => undefined);
            }
          }
        }

        const retrySurface = await detectConsentSurface(page);
        const targetCandidate =
          choice === "accept"
            ? retrySurface.accept
            : retrySurface.reject ?? (await findAction(page.frames().find((item) => item.url() === retrySurface.frameUrl) ?? page.mainFrame(), SAVE_PATTERNS));
        if (!targetCandidate) {
          notes.push(`After opening preferences, no ${choice} control was detected.`);
          return false;
        }

        const clicked = await clickAction(page, targetCandidate);
        if (!clicked) {
          notes.push(`Detected ${choice} control but click failed.`);
          return false;
        }

        logger.setPhase("after_choice");
        summary.clicks = choice === "reject" && surface.reject == null && surface.manage ? 2 : 1;
        summary.labels.push(targetCandidate.text);
        summary.timeMs = Date.now() - actionStart;
        await page.waitForTimeout(ACTION_WAIT_MS);
        return true;
      };

      if (scenarioName === "accept_all") {
        await act("accept");
      } else if (scenarioName === "reject_all") {
        const directReject = await act("reject");
        if (!directReject && surface.manage) {
          await act("manage");
          await act("reject");
        }
      } else if (scenarioName === "custom_preferences") {
        const opened = await act("manage");
        if (opened) {
          preferences = preferences ?? (await summarizePreferences(page).catch(() => null));
        }
      }

      if (scenarioName === "accept_all" || scenarioName === "reject_all" || scenarioName === "custom_preferences") {
        storageAfterAction = await collectStorageSnapshot(context, page).catch(() => null);
        if (storageAfterAction) {
          storageDiffs.acceptPhase = buildStorageDiff(storageBeforeInteraction, storageAfterAction);
          await writeJson(path.join(scenarioDir, "storage-after-action.json"), storageAfterAction);
          await writeJson(path.join(scenarioDir, "storage-diff-after-action.json"), storageDiffs.acceptPhase);
        }

        logger.setPhase("after_refresh");
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch((error) => {
          errors.push(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        await page.waitForTimeout(LOAD_WAIT_MS);

        const refreshSnapshot = await collectStorageSnapshot(context, page).catch(() => null);
        if (refreshSnapshot) {
          if (storageAfterAction) {
            storageDiffs.refreshPhase = buildStorageDiff(storageAfterAction, refreshSnapshot);
            await writeJson(path.join(scenarioDir, "storage-diff-after-refresh.json"), storageDiffs.refreshPhase);
          }
          refresh = {
            cookies: refreshSnapshot.cookies,
            localStorage: refreshSnapshot.localStorage,
            network: logger.entries.filter((entry) => entry.phase === "after_refresh"),
            sessionStorage: refreshSnapshot.sessionStorage
          };
          await writeJson(path.join(scenarioDir, "storage-after-refresh.json"), refreshSnapshot);
        }
      }

      const result: ScenarioResult = {
        actionSummary,
        banner: {
          bannerHtmlPath: surface.bannerHtml ? path.join(scenarioDir, "banner.html") : null,
        bannerPresent: surface.surfaceDetected,
        bannerText: surface.bannerText,
        frameUrl: surface.frameUrl,
        screenshots: {
          banner: bannerCapture.path,
          firstLoad: firstLoadPath,
          preferencesCenter: preferencesCenterPath
        },
        visibleActions: surface.visibleActions
      },
        cmpSignals: [],
        errors,
        network: logger.entries,
        notes,
        preferences,
        refresh,
        storageDiffs,
        storageAfterAction,
        storageBeforeInteraction,
        timestamp: new Date().toISOString(),
        url: page.url()
      };

      result.cmpSignals = extractCmpSignals(result);
      await writeJson(path.join(scenarioDir, "scenario.json"), result);
      return result;
    });
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

function buildFindings(report: SiteReport): FindingRecord[] {
  const findings: FindingRecord[] = [];
  const fresh = report.scenarios.fresh_visit;
  const gpc = report.scenarios.fresh_visit_gpc;
  const reject = report.scenarios.reject_all;

  const preConsentRequests = nonEssentialNetwork(fresh.network.filter((entry) => entry.phase === "before_interaction"));
  if (preConsentRequests.length > 0 || nonEssentialCookies(fresh.storageBeforeInteraction).length > 0) {
    findings.push({
      confidenceScore: preConsentRequests.length > 2 ? 0.87 : 0.72,
      conservativeWording: "possible pre-consent tracking observed",
      evidence: {
        cookies: nonEssentialCookies(fresh.storageBeforeInteraction).map((cookie) => `${cookie.name} @ ${cookie.domain}`),
        pageUrls: [fresh.url],
        requests: preConsentRequests.slice(0, 12).map((entry) => entry.url),
        screenshots: [fresh.banner.screenshots.firstLoad, fresh.banner.screenshots.banner].filter((value): value is string => Boolean(value)),
        storage: nonEssentialStorage(fresh.storageBeforeInteraction).map((entry) => `${entry.key}=${truncate(entry.preview, 60)}`),
        uiText: fresh.banner.bannerText ? [truncate(fresh.banner.bannerText, 400)] : []
      },
      findingId: "F001",
      observation: "On the fresh first-load scenario, network or storage activity matching likely analytics or advertising vendors was observed before any consent interaction was completed.",
      recommendedNextManualCheck: "Confirm whether each retained request or identifier is genuinely non-essential in the tested region and whether any server-side gating explains the activity.",
      severity: "high",
      title: "Possible pre-consent tracking signals on first load",
      whyThisMatters: "If the activity is non-essential, reviewers typically expect it to be suppressed until a valid positive choice is completed."
    });
  }

  if (fresh.banner.bannerPresent && report.consentUxScorecard.rejectAllFirstLayer === "no") {
    findings.push({
      confidenceScore: 0.84,
      conservativeWording: "reject path appears less easy than accept path",
      evidence: {
        cookies: [],
        pageUrls: [fresh.url],
        requests: [],
        screenshots: [fresh.banner.screenshots.banner, report.scenarios.reject_all.banner.screenshots.preferencesCenter].filter((value): value is string => Boolean(value)),
        storage: [],
        uiText: [fresh.banner.bannerText ?? "", ...fresh.notes].filter(Boolean)
      },
      findingId: "F002",
      observation: "A visible first-layer reject-all control was not detected, while accept or manage controls were detected on the initial consent surface.",
      recommendedNextManualCheck: "Re-run interactively in the same region and confirm whether reject exists on hover, in a secondary tab, or only after expanding settings.",
      severity: "medium",
      title: "Reject path appears less direct than accept path",
      whyThisMatters: "A deeper or less visible reject path can materially steer visitors toward acceptance even when a formal opt-out path exists."
    });
  }

  if (typeof reject.actionSummary.rejectPath.clicks === "number" && reject.actionSummary.rejectPath.clicks > 0) {
    const residual = postRejectResidualEvidence(reject);
    if (
      residual.postRejectRequests.length > 0 ||
      residual.postRefreshRequests.length > 0 ||
      residual.postRejectCookies.length > 0 ||
      residual.postRejectStorage.length > 0
    ) {
      findings.push({
        confidenceScore: residual.postRefreshRequests.length > 0 ? 0.82 : 0.7,
        conservativeWording: "reject path may not suppress non-essential tracking",
        evidence: {
          cookies: residual.postRejectCookies.map((cookie) => `${cookie.name} @ ${cookie.domain}`),
          pageUrls: [reject.url],
          requests: [...residual.postRejectRequests, ...residual.postRefreshRequests].slice(0, 12).map((entry) => entry.url),
          screenshots: [reject.banner.screenshots.banner, reject.banner.screenshots.preferencesCenter].filter((value): value is string => Boolean(value)),
          storage: residual.postRejectStorage.map((entry) => `${entry.key}=${truncate(entry.preview, 60)}`),
          uiText: [reject.banner.bannerText ?? "", ...reject.notes].filter(Boolean)
        },
        findingId: "F003",
        observation: "After an explicit reject-path interaction, likely non-essential requests or identifiers still appeared during the post-choice or refreshed session.",
        recommendedNextManualCheck: "Confirm whether the retained vendors are actually consent-gated in this geography and whether the reject control modified any consent string despite continued requests.",
        severity: "high",
        title: "Reject path may not fully suppress non-essential activity",
        whyThisMatters: "A reject control that does not materially change runtime behavior can indicate that the consent surface is not effectively governing optional tracking."
      });
    }
  }

  if (report.scenarios.custom_preferences.preferences?.optionalCategoriesPreselected) {
    findings.push({
      confidenceScore: 0.76,
      conservativeWording: "optional categories appear preselected by default",
      evidence: {
        cookies: [],
        pageUrls: [report.scenarios.custom_preferences.url],
        requests: [],
        screenshots: [report.scenarios.custom_preferences.banner.screenshots.preferencesCenter].filter((value): value is string => Boolean(value)),
        storage: [],
        uiText: report.scenarios.custom_preferences.preferences.toggleStates.map((item) => `${item.label}: ${item.checked ? "on" : "off"}`)
      },
      findingId: "F004",
      observation: "Within the detected preferences center, at least one apparently optional category toggle was enabled by default.",
      recommendedNextManualCheck: "Inspect the same preferences panel manually and verify whether the enabled controls correspond to optional analytics, marketing, partner, or personalization purposes.",
      severity: "medium",
      title: "Optional controls appear enabled by default",
      whyThisMatters: "Default-on optional categories can undermine the clarity of the user’s affirmative choice."
    });
  }

  if (gpc && preConsentRequests.length > 0) {
    const gpcRequests = nonEssentialNetwork(gpc.network.filter((entry) => entry.phase === "before_interaction"));
    if (gpcRequests.length >= preConsentRequests.length) {
      findings.push({
        confidenceScore: 0.61,
        conservativeWording: "browser-level privacy signal did not appear to change first-load behavior",
        evidence: {
          cookies: nonEssentialCookies(gpc.storageBeforeInteraction).map((cookie) => `${cookie.name} @ ${cookie.domain}`),
          pageUrls: [fresh.url, gpc.url],
          requests: gpcRequests.slice(0, 12).map((entry) => entry.url),
          screenshots: [gpc.banner.screenshots.firstLoad, gpc.banner.screenshots.banner].filter((value): value is string => Boolean(value)),
          storage: nonEssentialStorage(gpc.storageBeforeInteraction).map((entry) => `${entry.key}=${truncate(entry.preview, 60)}`),
          uiText: [gpc.banner.bannerText ?? ""].filter(Boolean)
        },
        findingId: "F005",
        observation: "In the signal-enabled session, first-load tracking signals did not show a clear reduction relative to the control session.",
        recommendedNextManualCheck: "Check whether the site states that it honors GPC or similar browser-level signals and, if so, retest with a browser extension or alternate locale to confirm runtime handling.",
        severity: "low",
        title: "Browser-level privacy signal effect not evident",
        whyThisMatters: "When a site represents that it honors browser-level choices, reviewers usually expect observable runtime suppression or clear confirmation."
      });
    }
  }

  return findings;
}

function classifyFinal(report: SiteReport): SiteReport["finalClassification"] {
  if (
    securityInterstitialObserved(report.scenarios.fresh_visit) &&
    !report.scenarios.fresh_visit.banner.bannerPresent &&
    report.findings.every((finding) => finding.findingId !== "F002" && finding.findingId !== "F003")
  ) {
    return "inconclusive / needs manual review";
  }

  const titles = report.findings.map((finding) => finding.title);
  if (titles.some((title) => /Reject path may not fully suppress/i.test(title))) {
    return "reject path may not suppress non-essential tracking";
  }
  if (titles.some((title) => /pre-consent tracking/i.test(title))) {
    return "possible pre-consent tracking";
  }
  if (titles.some((title) => /Reject path appears less direct/i.test(title)) || titles.some((title) => /Optional controls appear enabled/i.test(title))) {
    return "possible consent UX issue";
  }
  if (report.scenarios.fresh_visit.errors.length > 0) {
    return "inconclusive / needs manual review";
  }
  return "no obvious issue observed";
}

function classifyOverallTestingStatus(fresh: ScenarioResult, freshSecurityInterstitial: boolean) {
  if (fresh.errors.some((error) => /ERR_NAME_NOT_RESOLVED|net::ERR_NAME_NOT_RESOLVED/i.test(error))) {
    return "blocked by domain resolution failure during scenario startup";
  }
  if (fresh.errors.length > 0) {
    return "partially completed with blocking or anti-automation issues on some scenarios";
  }
  if (freshSecurityInterstitial) {
    return "completed, but security or anti-bot interstitial behavior affected at least one scenario";
  }
  return "completed for the configured scenarios";
}

export function buildSiteReport(url: string, scenarios: ScenarioReportMap): SiteReport {
  const hostname = safeHostname(url);
  const fresh = scenarios.fresh_visit;
  const reject = scenarios.reject_all;
  const accept = scenarios.accept_all;
  const preConsentRequests = nonEssentialNetwork(fresh.network.filter((entry) => entry.phase === "before_interaction"));
  const preConsentCookies = nonEssentialCookies(fresh.storageBeforeInteraction);
  const preConsentStorage = nonEssentialStorage(fresh.storageBeforeInteraction);
  const freshSecurityInterstitial = securityInterstitialObserved(fresh);
  const rejectResidual = postRejectResidualEvidence(reject);
  const firstLayerRejectDetected = fresh.banner.visibleActions.reject;
  const firstLayerAcceptDetected = fresh.banner.visibleActions.accept;
  const equalProminenceAssessment =
    fresh.banner.bannerPresent && !firstLayerRejectDetected && firstLayerAcceptDetected
      ? "accept appears more prominent than reject based on detected first-layer controls"
      : fresh.banner.bannerPresent && firstLayerRejectDetected && firstLayerAcceptDetected
        ? "accept and reject controls were both detected, but visual prominence was not programmatically confirmed"
        : "inconclusive";

  const report: SiteReport = {
    consentUxScorecard: {
      acceptRejectClickParity:
        typeof accept.actionSummary.acceptPath.clicks === "number" && typeof reject.actionSummary.rejectPath.clicks === "number"
          ? `${accept.actionSummary.acceptPath.clicks} click(s) to accept vs ${reject.actionSummary.rejectPath.clicks} click(s) to reject`
          : "inconclusive",
      bannerPresent: fresh.banner.bannerPresent ? "yes" : fresh.errors.length > 0 ? "inconclusive" : "no",
      darkPatternIndicatorsObserved: [
        ...(fresh.banner.bannerPresent && !firstLayerRejectDetected ? ["reject not detected on first layer"] : []),
        ...(equalProminenceAssessment.includes("more prominent") ? ["accept control appears more prominent than reject"] : []),
        ...(scenarios.custom_preferences.preferences?.optionalCategoriesPreselected ? ["optional categories appear pre-enabled"] : []),
        ...(freshSecurityInterstitial ? ["security or anti-bot interstitial observed during testing"] : [])
      ],
      equalProminenceAssessment,
      rejectAllFirstLayer: fresh.banner.bannerPresent ? (firstLayerRejectDetected ? "yes" : "no") : "inconclusive"
    },
    executiveSummary: {
      confidenceLevel: fresh.errors.length > 0 ? "low" : preConsentRequests.length > 0 || (reject.refresh?.network.length ?? 0) > 0 ? "medium" : "low",
      manualReviewRecommended: true,
      overallTestingStatus: classifyOverallTestingStatus(fresh, freshSecurityInterstitial),
      strongestObservedRisks: []
    },
    finalClassification: "inconclusive / needs manual review",
    findings: [],
    methodology: {
      browserSignalsCompared: true,
      locale: "en-US",
      noInteractionWaitMs: NO_INTERACTION_WAIT_MS,
      testedAt: new Date().toISOString(),
      viewport: VIEWPORT
    },
    preConsentTrackingSummary: {
      cookiesSetBeforeInteraction: preConsentCookies.map((cookie) => `${cookie.name} @ ${cookie.domain}`),
      likelyVendorsObserved: collectLikelyVendors([...preConsentRequests, ...preConsentCookies]),
      nonEssentialRequestsBeforeInteraction: preConsentRequests.map((entry) => entry.url),
      storageEntriesCreatedBeforeInteraction: preConsentStorage.map((entry) => `${entry.key}=${truncate(entry.preview, 60)}`)
    },
    rejectPathEffectivenessSummary: {
      consentSignalsChangedAfterReject: [
        ...(reject.storageDiffs.acceptPhase?.consentSignalsAdded ?? []),
        ...(reject.storageDiffs.refreshPhase?.consentSignalsAdded ?? [])
      ],
      refreshPreservedRejectOutcome:
        reject.refresh && rejectResidual.postRefreshRequests.length === 0 ? "no obvious reintroduction observed on refresh" : "tracking-like activity still appeared or refresh evidence was inconclusive",
      stillFiredAfterReject: rejectResidual.postRejectRequests.map((entry) => entry.url),
      whatChangedAfterReject: reject.storageAfterAction
        ? [
            `${Math.max(0, preConsentCookies.length - nonEssentialCookies(reject.storageAfterAction).length)} non-essential cookie(s) no longer present after reject`,
            `${Math.max(0, preConsentRequests.length - rejectResidual.postRejectRequests.length)} fewer likely non-essential request(s) after reject`
          ]
        : ["reject scenario did not capture a stable post-choice storage snapshot"]
    },
    scenarios,
    site: {
      hostname,
      startUrl: url
    }
  };

  report.findings = buildFindings(report);
  report.executiveSummary.strongestObservedRisks = report.findings.slice(0, 3).map((finding) => finding.conservativeWording);
  report.finalClassification = classifyFinal(report);
  return report;
}

function renderMarkdown(report: SiteReport) {
  const lines: string[] = [];
  lines.push(`# ${report.site.hostname}`);
  lines.push("");
  lines.push("## 1. Executive summary");
  lines.push(`- overall testing status: ${report.executiveSummary.overallTestingStatus}`);
  lines.push(`- strongest observed risks: ${report.executiveSummary.strongestObservedRisks.join("; ") || "none surfaced by the current run"}`);
  lines.push(`- confidence level: ${report.executiveSummary.confidenceLevel}`);
  lines.push(`- manual review recommended: ${report.executiveSummary.manualReviewRecommended ? "yes" : "no"}`);
  lines.push("");
  lines.push("## 2. Consent UX scorecard");
  lines.push(`- banner present: ${report.consentUxScorecard.bannerPresent}`);
  lines.push(`- reject-all first layer: ${report.consentUxScorecard.rejectAllFirstLayer}`);
  lines.push(`- accept/reject click parity: ${report.consentUxScorecard.acceptRejectClickParity}`);
  lines.push(`- equal prominence assessment: ${report.consentUxScorecard.equalProminenceAssessment}`);
  lines.push(`- dark-pattern indicators observed: ${report.consentUxScorecard.darkPatternIndicatorsObserved.join("; ") || "none programmatically confirmed"}`);
  lines.push("");
  lines.push("## 3. Pre-consent tracking summary");
  lines.push(`- cookies set before interaction: ${report.preConsentTrackingSummary.cookiesSetBeforeInteraction.join("; ") || "none classified as likely non-essential"}`);
  lines.push(`- storage entries created before interaction: ${report.preConsentTrackingSummary.storageEntriesCreatedBeforeInteraction.join("; ") || "none classified as likely non-essential"}`);
  lines.push(`- non-essential requests before interaction: ${report.preConsentTrackingSummary.nonEssentialRequestsBeforeInteraction.slice(0, 12).join("; ") || "none classified with current rules"}`);
  lines.push(`- likely vendors observed: ${report.preConsentTrackingSummary.likelyVendorsObserved.join("; ") || "none classified with current rules"}`);
  lines.push("");
  lines.push("## 4. Reject-path effectiveness summary");
  lines.push(`- what changed after reject: ${report.rejectPathEffectivenessSummary.whatChangedAfterReject.join("; ")}`);
  lines.push(`- what still fired after reject: ${report.rejectPathEffectivenessSummary.stillFiredAfterReject.slice(0, 12).join("; ") || "none classified with current rules"}`);
  lines.push(`- whether refresh preserved reject outcome: ${report.rejectPathEffectivenessSummary.refreshPreservedRejectOutcome}`);
  lines.push("");
  lines.push("## 5. Findings list");
  if (report.findings.length === 0) {
    lines.push("- no evidence-backed findings were generated from this run");
  } else {
    for (const finding of report.findings) {
      lines.push(`### ${finding.findingId} ${finding.title}`);
      lines.push(`- severity: ${finding.severity}`);
      lines.push(`- observation: ${finding.observation}`);
      lines.push(`- whyThisMatters: ${finding.whyThisMatters}`);
      lines.push(`- confidenceScore: ${finding.confidenceScore.toFixed(2)}`);
      lines.push(`- screenshots: ${finding.evidence.screenshots.join("; ") || "none"}`);
      lines.push(`- uiText: ${finding.evidence.uiText.join("; ") || "none"}`);
      lines.push(`- cookies: ${finding.evidence.cookies.join("; ") || "none"}`);
      lines.push(`- requests: ${finding.evidence.requests.join("; ") || "none"}`);
      lines.push(`- storage: ${finding.evidence.storage.join("; ") || "none"}`);
      lines.push(`- pageUrls: ${finding.evidence.pageUrls.join("; ") || "none"}`);
      lines.push(`- conservative wording: ${finding.conservativeWording}`);
      lines.push(`- recommended next manual check: ${finding.recommendedNextManualCheck}`);
      lines.push("");
    }
  }
  lines.push("## 6. Final classification");
  lines.push(`- ${report.finalClassification}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function main() {
  await ensureDir(OUTPUT_ROOT);
  const configuredTargets =
    process.env.CONSENT_AUDIT_TARGETS?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? TARGETS;

  const summary: Array<{
    finalClassification: SiteReport["finalClassification"];
    hostname: string;
    likelyVendorsObserved: string[];
    manualReviewRecommended: boolean;
    preConsentRequestCount: number;
    rejectResidualRequestCount: number;
  }> = [];

  for (const target of configuredTargets) {
    const hostname = safeHostname(target);
    const siteDir = path.join(OUTPUT_ROOT, slugify(hostname));
    await ensureDir(siteDir);
    console.info(`[consent-audit] site start ${hostname}`);

    const scenarios = {} as ScenarioReportMap;
    const scenarioOrder: ScenarioName[] = ["fresh_visit", "fresh_visit_gpc", "accept_all", "reject_all", "custom_preferences"];
    for (const scenario of scenarioOrder) {
      console.info(`[consent-audit] scenario start ${hostname} ${scenario}`);
      try {
        scenarios[scenario] = await runScenario(siteDir, target, scenario);
      } catch (error) {
        console.error(`[consent-audit] scenario failed ${hostname} ${scenario}`, error);
        scenarios[scenario] = scenarioErrorResult(target, scenario, error);
      }
    }

    try {
      const report = buildSiteReport(target, scenarios);
      await writeJson(path.join(siteDir, "report.json"), report);
      await writeText(path.join(siteDir, "report.md"), renderMarkdown(report));

      summary.push({
        finalClassification: report.finalClassification,
        hostname,
        likelyVendorsObserved: report.preConsentTrackingSummary.likelyVendorsObserved,
        manualReviewRecommended: report.executiveSummary.manualReviewRecommended,
        preConsentRequestCount: report.preConsentTrackingSummary.nonEssentialRequestsBeforeInteraction.length,
        rejectResidualRequestCount: report.rejectPathEffectivenessSummary.stillFiredAfterReject.length
      });
      console.info(`[consent-audit] site complete ${hostname}`);
    } catch (error) {
      console.error(`[consent-audit] site report failed ${hostname}`, error);
      await writeJson(path.join(siteDir, "report-error.json"), {
        error: error instanceof Error ? error.message : String(error),
        hostname,
        scenarios
      });
      summary.push({
        finalClassification: "inconclusive / needs manual review",
        hostname,
        likelyVendorsObserved: [],
        manualReviewRecommended: true,
        preConsentRequestCount: 0,
        rejectResidualRequestCount: 0
      });
    }
  }

  await writeJson(path.join(OUTPUT_ROOT, "summary.json"), summary);
  await writeText(
    path.join(OUTPUT_ROOT, "summary.csv"),
    ["hostname,finalClassification,manualReviewRecommended,preConsentRequestCount,rejectResidualRequestCount,likelyVendorsObserved"]
      .concat(
        summary.map((row) =>
          [
            row.hostname,
            row.finalClassification,
            String(row.manualReviewRecommended),
            String(row.preConsentRequestCount),
            String(row.rejectResidualRequestCount),
            `"${row.likelyVendorsObserved.join("|")}"`
          ].join(",")
        )
      )
      .join("\n")
      .concat("\n")
  );

  console.info(`Live consent audit artifacts written to ${OUTPUT_ROOT}`);
}

const invokedAsScript =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("/live-consent-audit.ts") || process.argv[1].endsWith("/live-consent-audit.js"));

if (invokedAsScript) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
