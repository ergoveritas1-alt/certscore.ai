import type {
  AgeVerificationMechanismType,
  FetchStatus,
  PageType,
  ScanAccessibilityRuleCount,
  ScanPage,
  ScanSnapshot,
  ScanTrackerVendor
} from "@website-signal-risk-scanner/shared";
import {
  ACCESSIBILITY_WIDGET_SIGNATURES,
  analyzeVendorRequestMatch,
  CHAT_VENDOR_SIGNATURES,
  CMS_SIGNATURES,
  CMP_VENDOR_SIGNATURES,
  FRONTEND_FRAMEWORK_SIGNATURES,
  HOSTING_SIGNATURES,
  PAYMENT_VENDOR_SIGNATURES,
  TRACKER_VENDOR_SIGNATURES
  ,
  type VendorSignature
} from "./signature-registry";
import { normalizeTextForHash, stableHash } from "./hash";
import {
  getLocalizedKeywords,
  getLocalizedPathGuesses,
  getSupportedKeyPageTypes,
  inferLocaleHints,
  normalizeLegalMatchText,
  scoreKeywordMatches
} from "./key-page-locale-config";
import type { ExtractedForm, ExtractedInput, ExtractedLink, ExtractedScript, StaticPageResult } from "./types";
import type { RobotsPolicy } from "../robots/policy";
import { getCrawlerUserAgent } from "../crawler-identity";
import { isUrlAllowedByRobots, recordDomainBackoff, waitForDomainRequestSlot } from "../robots/policy";

const POLICY_PATH_GUESSES: Record<PageType, string[]> = {
  homepage: ["/"],
  privacy_policy: ["/privacy", "/privacy-policy", "/legal/privacy", "/legal/privacy-policy"],
  terms_of_service: ["/terms", "/terms-of-service", "/terms-and-conditions", "/legal/terms", "/legal/terms-of-service"],
  cookie_policy: ["/cookies", "/cookie-policy", "/legal/cookies", "/legal/cookie-policy"],
  accessibility_statement: ["/accessibility", "/accessibility-statement"],
  refund_policy: ["/refund-policy", "/returns", "/refunds", "/return-policy"],
  shipping_policy: ["/shipping", "/shipping-policy"],
  subscription_terms: ["/subscription-terms", "/subscriptions", "/billing-terms"],
  affiliate_disclosure: ["/affiliate-disclosure", "/affiliate"],
  advertising_disclosure: ["/advertising-disclosure", "/sponsored-content"],
  contact: ["/contact", "/contact-us"],
  product: ["/product", "/products", "/shop"],
  pricing: ["/pricing", "/plans"],
  signup: ["/signup", "/register"],
  login: ["/login", "/sign-in"],
  checkout: ["/checkout", "/cart"],
  blog: ["/blog", "/articles"],
  about: ["/about"],
  support: ["/support", "/help"],
  other: []
};

const FIELD_LABEL_PATTERNS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "email", patterns: [/email/i, /e-mail/i] },
  { key: "phone", patterns: [/phone/i, /tel/i, /mobile/i] },
  { key: "address", patterns: [/address/i, /street/i, /zip/i, /postal/i] },
  { key: "payment_card", patterns: [/card/i, /cvv/i, /expiry/i, /payment/i] },
  { key: "date_of_birth", patterns: [/date of birth/i, /\bdob\b/i, /birth/i] },
  { key: "file_upload", patterns: [/upload/i, /attachment/i, /resume/i] },
  { key: "password", patterns: [/password/i] },
  { key: "age", patterns: [/\bage\b/i, /over 13/i, /over 16/i] }
];

type RedirectFetchResult = {
  body: string;
  blockedByPolicy: boolean;
  finalUrl: string | null;
  headers: Record<string, string>;
  redirectCount: number;
  status: number | null;
  timedOut: boolean;
};

const HTTP_FETCH_TIMEOUT_MS = 8_000;
const CROSS_DOMAIN_POLICY_PAGE_TYPES = new Set<PageType>([
  "privacy_policy",
  "terms_of_service",
  "cookie_policy",
  "accessibility_statement",
  "refund_policy",
  "shipping_policy",
  "subscription_terms",
  "affiliate_disclosure",
  "advertising_disclosure"
]);

const RENDER_FALLBACK_PAGE_TYPES = new Set<PageType>([
  "privacy_policy",
  "terms_of_service",
  "cookie_policy",
  "accessibility_statement",
  "refund_policy",
  "shipping_policy",
  "subscription_terms",
  "affiliate_disclosure",
  "advertising_disclosure"
]);

const POLICY_RENDER_FALLBACK_MIN_TEXT_LENGTH = 800;
const POLICY_RENDER_FALLBACK_MIN_WORD_COUNT = 120;

function toAbsoluteUrl(candidate: string, baseUrl: string) {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseHeaders(headers: Headers): Record<string, string> {
  const values: Record<string, string> = {};

  headers.forEach((value, key) => {
    values[key.toLowerCase()] = value;
  });

  return values;
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

function classifyPageType(url: string): PageType {
  const pathname = new URL(url).pathname.toLowerCase();
  const normalizedPath = normalizeLegalMatchText(pathname);

  if (pathname === "/") {
    return "homepage";
  }

  for (const pageType of getSupportedKeyPageTypes()) {
    const localizedKeywords = getLocalizedKeywords(pageType, ["en", "fr", "de", "es", "it", "nl", "pt"]);
    if (scoreKeywordMatches(normalizedPath, localizedKeywords) >= 8) {
      return pageType;
    }
  }

  if (pathname.includes("privacy")) {
    return "privacy_policy";
  }

  if (pathname.includes("terms") || pathname.includes("conditions")) {
    return "terms_of_service";
  }

  if (pathname.includes("cookie")) {
    return "cookie_policy";
  }

  if (pathname.includes("accessibility")) {
    return "accessibility_statement";
  }

  if (pathname.includes("refund") || pathname.includes("return")) {
    return "refund_policy";
  }

  if (pathname.includes("shipping")) {
    return "shipping_policy";
  }

  if (pathname.includes("subscription") || pathname.includes("billing")) {
    return "subscription_terms";
  }

  if (pathname.includes("affiliate")) {
    return "affiliate_disclosure";
  }

  if (pathname.includes("advertis") || pathname.includes("sponsor")) {
    return "advertising_disclosure";
  }

  if (pathname.includes("contact")) {
    return "contact";
  }

  if (pathname.includes("product") || pathname.includes("shop")) {
    return "product";
  }

  if (pathname.includes("pricing") || pathname.includes("plan")) {
    return "pricing";
  }

  if (pathname.includes("signup") || pathname.includes("register")) {
    return "signup";
  }

  if (pathname.includes("login") || pathname.includes("sign-in")) {
    return "login";
  }

  if (pathname.includes("checkout") || pathname.includes("cart")) {
    return "checkout";
  }

  if (pathname.includes("blog") || pathname.includes("article")) {
    return "blog";
  }

  if (pathname.includes("about")) {
    return "about";
  }

  if (pathname.includes("support") || pathname.includes("help")) {
    return "support";
  }

  return "other";
}

export function getRegisteredDomain(hostname: string) {
  const parts = hostname.split(".").filter(Boolean);

  if (parts.length <= 2) {
    return hostname;
  }

  const secondLevelTlds = new Set(["co.uk", "org.uk", "com.au"]);
  const tail = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");

  if (secondLevelTlds.has(tail) && parts.length >= 3) {
    return lastThree;
  }

  return tail;
}

export async function fetchTextPage(
  url: string,
  maxRedirects = 5,
  options?: { bypassRobots?: boolean; robotsPolicy?: RobotsPolicy | null }
): Promise<RedirectFetchResult> {
  let currentUrl = url;
  let redirectCount = 0;
  let attempt = 1;

  while (redirectCount <= maxRedirects) {
    if (!options?.bypassRobots && !isUrlAllowedByRobots(currentUrl, options?.robotsPolicy)) {
      return {
        body: "",
        blockedByPolicy: true,
        finalUrl: currentUrl,
        headers: {},
        redirectCount,
        status: null,
        timedOut: false
      };
    }

    const crawlDelayMs = options?.robotsPolicy?.crawlDelayMs();
    await waitForDomainRequestSlot(currentUrl, {
      minDelayMs: crawlDelayMs
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_FETCH_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        headers: {
          "user-agent": getCrawlerUserAgent()
        },
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof Error && error.name === "AbortError") {
        return {
          body: "",
          blockedByPolicy: false,
          finalUrl: currentUrl,
          headers: {},
          redirectCount,
          status: -1,
          timedOut: true
        };
      }

      throw error;
    }

    clearTimeout(timeout);

    if (response.status === 429) {
      recordDomainBackoff(currentUrl, {
        attempt,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after"))
      });
      attempt += 1;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location) {
        return {
          body: "",
          blockedByPolicy: false,
          finalUrl: currentUrl,
          headers: parseHeaders(response.headers),
          redirectCount,
          status: response.status,
          timedOut: false
        };
      }

      const nextUrl = toAbsoluteUrl(location, currentUrl);

      if (!nextUrl) {
        return {
          body: "",
          blockedByPolicy: false,
          finalUrl: currentUrl,
          headers: parseHeaders(response.headers),
          redirectCount,
          status: response.status,
          timedOut: false
        };
      }

      currentUrl = nextUrl;
      redirectCount += 1;
      continue;
    }

    let bodyTimeout: ReturnType<typeof setTimeout> | undefined;
    const body = await Promise.race([
      response.text(),
      new Promise<string>((_, reject) => {
        bodyTimeout = setTimeout(() => {
          reject(new Error(`Response body read timed out after ${HTTP_FETCH_TIMEOUT_MS}ms.`));
        }, HTTP_FETCH_TIMEOUT_MS);
      })
    ])
      .catch((error) => {
        if (error instanceof Error && /timed out/i.test(error.message)) {
          return null;
        }

        throw error;
      })
      .finally(() => {
        if (bodyTimeout) {
          clearTimeout(bodyTimeout);
        }
      });

    if (body === null) {
      return {
        body: "",
        blockedByPolicy: false,
        finalUrl: response.url || currentUrl,
        headers: parseHeaders(response.headers),
        redirectCount,
        status: -1,
        timedOut: true
      };
    }

    return {
      body,
      blockedByPolicy: false,
      finalUrl: response.url || currentUrl,
      headers: parseHeaders(response.headers),
      redirectCount,
      status: response.status,
      timedOut: false
    };
  }

  return {
    body: "",
    blockedByPolicy: false,
    finalUrl: currentUrl,
    headers: {},
    redirectCount,
    status: null,
    timedOut: false
  };
}

function toFetchStatus(status: number | null): FetchStatus {
  if (status === null) {
    return "error";
  }

  if (status === -1) {
    return "timeout";
  }

  if (status >= 200 && status < 300) {
    return "ok";
  }

  if (status === 401 || status === 403) {
    return "forbidden";
  }

  if (status === 404) {
    return "not_found";
  }

  return "error";
}

function stripTags(html: string) {
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

function countWords(text: string) {
  return text.match(/\b[\w'-]+\b/g)?.length ?? 0;
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractLanguage(html: string) {
  const match = html.match(/<html[^>]*\slang=["']?([^"'\s>]+)["']?/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
  const matches = html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  const results: ExtractedLink[] = [];

  for (const match of matches) {
    const href = toAbsoluteUrl(match[1] ?? "", baseUrl);

    if (!href) {
      continue;
    }

    results.push({
      href,
      text: stripTags(match[2] ?? "").slice(0, 200)
    });
  }

  return results;
}

function extractScripts(html: string, baseUrl: string): ExtractedScript[] {
  const matches = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  const results: ExtractedScript[] = [];

  for (const match of matches) {
    const attributes = match[1] ?? "";
    const srcMatch = attributes.match(/\ssrc=["']([^"']+)["']/i);
    const src = srcMatch?.[1] ? toAbsoluteUrl(srcMatch[1], baseUrl) : null;
    const host = src ? new URL(src).hostname : null;
    const contentSample = (match[2] ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || null;
    results.push({
      src,
      host,
      contentSample
    });
  }

  return results;
}

function parseAttributes(input: string) {
  const attributes: Record<string, string> = {};

  for (const match of input.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["']([^"']*)["']/g)) {
    const key = match[1];
    const value = match[2];

    if (!key || value === undefined) {
      continue;
    }

    attributes[key.toLowerCase()] = value;
  }

  return attributes;
}

function extractInputLabel(formHtml: string, attributes: Record<string, string>) {
  const id = attributes.id;

  if (id) {
    const labelMatch = formHtml.match(new RegExp(`<label[^>]*for=["']${id}["'][^>]*>([\\s\\S]*?)<\\/label>`, "i"));
    if (labelMatch?.[1]) {
      return stripTags(labelMatch[1]).slice(0, 120);
    }
  }

  return null;
}

function extractInputs(formHtml: string): ExtractedInput[] {
  const matches = formHtml.matchAll(/<(input|textarea|select)\b([^>]*)>/gi);
  const inputs: ExtractedInput[] = [];

  for (const match of matches) {
    const attributes = parseAttributes(match[2] ?? "");
    const fieldType = attributes.type ?? match[1]?.toLowerCase() ?? null;

    inputs.push({
      type: fieldType,
      name: attributes.name ?? null,
      autocomplete: attributes.autocomplete ?? null,
      ariaLabel: attributes["aria-label"] ?? null,
      id: attributes.id ?? null,
      labelText: extractInputLabel(formHtml, attributes),
      placeholder: attributes.placeholder ?? null
    });
  }

  return inputs;
}

function extractForms(html: string): ExtractedForm[] {
  const matches = html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi);
  const forms: ExtractedForm[] = [];

  for (const match of matches) {
    const attributes = parseAttributes(match[1] ?? "");
    const body = match[2] ?? "";
    const inputs = extractInputs(body);
    forms.push({
      action: attributes.action ?? null,
      inputs,
      hasPasswordField: inputs.some((input) => input.type === "password"),
      textSample: stripTags(body).slice(0, 220)
    });
  }

  return forms;
}

export async function fetchStaticPage(input: { pageType?: PageType; robotsPolicy?: RobotsPolicy | null; url: string }): Promise<StaticPageResult> {
  const fetched = await fetchTextPage(input.url, 5, {
    robotsPolicy: input.robotsPolicy
  });
  return buildStaticPageResult({
    blockedByPolicy: fetched.blockedByPolicy,
    finalUrl: fetched.finalUrl ?? input.url,
    headers: fetched.headers,
    html: fetched.body,
    pageType: input.pageType,
    pageUrl: input.url,
    redirectCount: fetched.redirectCount,
    statusCode: fetched.status,
    textContentOverride: null,
    timedOut: fetched.timedOut
  });
}

export function buildStaticPageResult(input: {
  blockedByPolicy?: boolean;
  finalUrl: string;
  headers: Record<string, string>;
  html: string;
  pageType?: PageType;
  pageUrl: string;
  redirectCount?: number;
  statusCode: number | null;
  textContentOverride?: string | null;
  timedOut?: boolean;
}): StaticPageResult {
  const finalUrl = input.finalUrl;
  const textContent = input.textContentOverride?.trim() || stripTags(input.html);

  return {
    blockedByPolicy: input.blockedByPolicy,
    pageUrl: finalUrl,
    pageType: input.pageType ?? classifyPageType(finalUrl),
    fetchStatus: input.blockedByPolicy
      ? "blocked"
      : input.timedOut
        ? "timeout"
        : (input.redirectCount ?? 0) > 0 && input.statusCode && input.statusCode >= 200 && input.statusCode < 300
          ? "redirected"
          : toFetchStatus(input.statusCode),
    finalUrl,
    headers: input.headers,
    html: input.html,
    language: extractLanguage(input.html),
    links: extractLinks(input.html, finalUrl),
    redirectCount: input.redirectCount,
    redirected: (input.redirectCount ?? 0) > 0,
    scripts: extractScripts(input.html, finalUrl),
    statusCode: input.statusCode,
    textContent,
    title: extractTitle(input.html),
    forms: extractForms(input.html)
  };
}

export function assessPolicyPageContentQuality(page: Pick<StaticPageResult, "pageType" | "textContent" | "html">) {
  const textLength = page.textContent.trim().length;
  const wordCount = countWords(page.textContent);
  const shellMarkerDetected =
    /id=["'](?:root|app|__next|__nuxt)["']|data-reactroot|ng-version=|window\.__|<script[^>]+type=["']module["']/i.test(page.html) ||
    /enable javascript|loading\.\.\.|please wait/i.test(page.textContent);
  const eligibleForRenderedFallback = RENDER_FALLBACK_PAGE_TYPES.has(page.pageType);
  const insufficientContent =
    eligibleForRenderedFallback &&
    (textLength < POLICY_RENDER_FALLBACK_MIN_TEXT_LENGTH || wordCount < POLICY_RENDER_FALLBACK_MIN_WORD_COUNT);

  return {
    eligibleForRenderedFallback,
    insufficientContent,
    shellMarkerDetected,
    textLength,
    wordCount
  };
}

function urlMatchesPageType(url: string, pageType: PageType) {
  const pathname = new URL(url).pathname.toLowerCase();

  return POLICY_PATH_GUESSES[pageType].some((guess) => pathname === guess || pathname.startsWith(`${guess}/`) || pathname.includes(guess));
}

function classifyPageTypeFromLink(link: ExtractedLink, localeHints: string[]): PageType {
  const byUrl = classifyPageType(link.href);

  if (byUrl !== "other") {
    return byUrl;
  }

  const text = normalizeLegalMatchText(link.text);

  for (const pageType of getSupportedKeyPageTypes()) {
    const localizedKeywords = getLocalizedKeywords(pageType, localeHints);
    const score = scoreKeywordMatches(text, localizedKeywords) * 3 + scoreKeywordMatches(link.href, localizedKeywords) * 2;
    if (score >= 12) {
      return pageType;
    }
  }

  if (/privacy/.test(text)) {
    return "privacy_policy";
  }

  if (/terms|conditions/.test(text)) {
    return "terms_of_service";
  }

  if (/cookie/.test(text)) {
    return "cookie_policy";
  }

  if (/accessibility/.test(text)) {
    return "accessibility_statement";
  }

  if (/refund|return/.test(text)) {
    return "refund_policy";
  }

  if (/shipping|delivery/.test(text)) {
    return "shipping_policy";
  }

  if (/subscription|billing/.test(text)) {
    return "subscription_terms";
  }

  if (/affiliate/.test(text)) {
    return "affiliate_disclosure";
  }

  if (/advertis|sponsor/.test(text)) {
    return "advertising_disclosure";
  }

  if (/contact/.test(text)) {
    return "contact";
  }

  if (/pricing|plans/.test(text)) {
    return "pricing";
  }

  if (/shop|product/.test(text)) {
    return "product";
  }

  if (/sign up|register/.test(text)) {
    return "signup";
  }

  if (/sign in|log in|login/.test(text)) {
    return "login";
  }

  if (/checkout|cart/.test(text)) {
    return "checkout";
  }

  if (/support|help/.test(text)) {
    return "support";
  }

  return "other";
}

export function discoverCandidatePages(homepageUrl: string, links: ExtractedLink[]) {
  const homepageHostname = new URL(homepageUrl).hostname;
  const localeHints = inferLocaleHints({
    homepageLanguage: null,
    homepageUrl,
    links
  });
  const discovered = new Map<string, PageType>();

  discovered.set(homepageUrl, "homepage");

  for (const link of links) {
    const pageType = classifyPageTypeFromLink(link, localeHints);
    const hostname = new URL(link.href).hostname;

    if (hostname !== homepageHostname && !CROSS_DOMAIN_POLICY_PAGE_TYPES.has(pageType)) {
      continue;
    }

    const existing = discovered.get(link.href);

    if (!existing || existing === "other") {
      discovered.set(link.href, pageType);
    }
  }

  for (const pageType of getSupportedKeyPageTypes()) {
    for (const guessedUrl of getLocalizedPathGuesses({
      homepageUrl,
      localeHints,
      pageType
    })) {
      if (discovered.has(guessedUrl)) {
        continue;
      }

      discovered.set(guessedUrl, pageType);
    }
  }

  for (const [pageType, guesses] of Object.entries(POLICY_PATH_GUESSES) as Array<[PageType, string[]]>) {
    for (const guess of guesses) {
      const guessedUrl = toAbsoluteUrl(guess, homepageUrl);

      if (!guessedUrl || discovered.has(guessedUrl)) {
        continue;
      }

      discovered.set(guessedUrl, pageType);
    }
  }

  return [...discovered.entries()].map(([url, pageType]) => ({
    url,
    pageType,
    priority: pageType === "homepage" ? 1000 : pageType === "privacy_policy" ? 990 : pageType === "terms_of_service" ? 980 : 100
  }));
}

function matchSignature(content: string, scripts: ExtractedScript[], signature: VendorSignature) {
  const lowerContent = content.toLowerCase();

  if (signature.htmlPatterns?.some((entry) => entry.test(content))) {
    return true;
  }

  if (signature.textPatterns?.some((entry) => entry.test(content))) {
    return true;
  }

  if (signature.hostnamePatterns?.length) {
    for (const script of scripts) {
      const host = script.host;
      const hostMatches = host
        ? signature.hostnamePatterns.some((pattern) => host === pattern || host.endsWith(`.${pattern}`))
        : false;

      if (hostMatches && !signature.pathFragments?.length) {
        return true;
      }

      if (
        hostMatches &&
        script.src &&
        signature.pathFragments?.some((fragment) => {
          const src = script.src;
          return src ? src.toLowerCase().includes(fragment.toLowerCase()) : false;
        })
      ) {
        return true;
      }
    }
  }

  return signature.domMarkers?.some((marker) => lowerContent.includes(marker.toLowerCase())) ?? false;
}

function vendorParty(host: string | null, pageHostname: string) {
  if (!host) {
    return "unknown" as const;
  }

  return host === pageHostname || host.endsWith(`.${pageHostname}`) ? "first_party" : "third_party";
}

function extractStaticTrackerSample(input: {
  content: string;
  pageHostname: string;
  scripts: ExtractedScript[];
  signature: VendorSignature;
}) {
  const matchedScript = input.scripts
    .map((script) => ({ script, match: script.src ? analyzeVendorRequestMatch(script.src, input.signature, input.pageHostname) : null }))
    .find((entry) => entry.match);

  if (matchedScript?.script.src) {
    return {
      collectionEndpointType: matchedScript.match?.collectionEndpointType ?? "unknown",
      sampleText: matchedScript.script.src.slice(0, 280),
      sampleType: "script_src" as const,
      scriptHost: matchedScript.match?.requestHost ?? matchedScript.script.host ?? null
    };
  }

  const contentSample = input.scripts
    .map((script) => script.contentSample)
    .find((sample) => {
      if (!sample) {
        return false;
      }

      return (
        input.signature.htmlPatterns?.some((pattern) => pattern.test(sample)) ||
        input.signature.textPatterns?.some((pattern) => pattern.test(sample))
      );
    });

  if (contentSample) {
    return {
      collectionEndpointType: "unknown" as const,
      sampleText: contentSample.slice(0, 280),
      sampleType: "script_content" as const,
      scriptHost: null
    };
  }

  const textPattern = input.signature.textPatterns?.find((pattern) => pattern.test(input.content));
  const htmlPattern = input.signature.htmlPatterns?.find((pattern) => pattern.test(input.content));
  const matchedPattern = textPattern ?? htmlPattern ?? null;

  if (matchedPattern) {
    const matchedText = input.content.match(matchedPattern)?.[0] ?? input.signature.name;
    return {
      collectionEndpointType: "unknown" as const,
      sampleText: matchedText.slice(0, 280),
      sampleType: "html_signature" as const,
      scriptHost: null
    };
  }

  return {
    collectionEndpointType: "unknown" as const,
    sampleText: input.signature.name,
    sampleType: "vendor_name" as const,
    scriptHost: null
  };
}

export function detectTrackerVendorsFromStaticPage(input: {
  pageHostname: string;
  pageText: string;
  scanId: string;
  scripts: ExtractedScript[];
}): ScanTrackerVendor[] {
  const content = `${input.pageText}\n${input.scripts.map((script) => `${script.src ?? ""} ${script.contentSample ?? ""}`).join("\n")}`;
  const detected: ScanTrackerVendor[] = [];

  for (const signature of TRACKER_VENDOR_SIGNATURES) {
    if (!matchSignature(content, input.scripts, signature)) {
      continue;
    }

    const matchedScript = input.scripts
      .map((script) => ({ script, match: script.src ? analyzeVendorRequestMatch(script.src, signature, input.pageHostname) : null }))
      .find((entry) => entry.match);
    const scriptHost =
      matchedScript?.match?.requestHost ??
      input.scripts.find(
        (script) =>
          Boolean(script.host) &&
          (signature.hostnamePatterns?.some((pattern) => {
            const host = script.host;
            return host ? host === pattern || host.endsWith(`.${pattern}`) : false;
          }) ?? false)
      )?.host ??
      null;

    detected.push({
      scanId: input.scanId,
      vendorName: signature.name,
      vendorCategory: signature.category,
      detectionSource: signature.detectionSource,
      confidence: signature.confidence,
      firstPartyOrThirdParty: vendorParty(scriptHost, input.pageHostname),
      collectionEndpointType: matchedScript?.match?.collectionEndpointType ?? "unknown",
      // Static detections cannot reliably establish consent timing.
      beforeConsent: null,
      scriptHost,
      matchedSignatureId: signature.id
    });
  }

  return detected;
}

export function collectStaticTrackerDiagnostics(input: {
  pageHostname: string;
  pageText: string;
  scripts: ExtractedScript[];
}) {
  const content = `${input.pageText}\n${input.scripts.map((script) => `${script.src ?? ""} ${script.contentSample ?? ""}`).join("\n")}`;

  return TRACKER_VENDOR_SIGNATURES.flatMap((signature) => {
    if (!matchSignature(content, input.scripts, signature)) {
      return [];
    }

    const sample = extractStaticTrackerSample({
      content,
      pageHostname: input.pageHostname,
      scripts: input.scripts,
      signature
    });

    return [
      {
        collectionEndpointType: sample.collectionEndpointType,
        detectionSource: "script_signature",
        matchedSignatureId: signature.id,
        sampleText: sample.sampleText,
        sampleType: sample.sampleType,
        sampleUrls: input.scripts
          .map((script) => script.src)
          .filter((src): src is string => Boolean(src))
          .filter((src) => Boolean(analyzeVendorRequestMatch(src, signature, input.pageHostname)))
          .slice(0, 3),
        scriptHost: sample.scriptHost,
        vendorCategory: signature.category,
        vendorName: signature.name
      }
    ];
  });
}

export function detectNamedVendor(content: string, scripts: ExtractedScript[], signatures: VendorSignature[]) {
  for (const signature of signatures) {
    if (matchSignature(content, scripts, signature)) {
      return signature;
    }
  }

  return null;
}

function findTechByPatterns(content: string, patterns: Array<{ name: string; patterns: RegExp[] }>) {
  const match = patterns.find((entry) => entry.patterns.some((pattern) => pattern.test(content)));
  return match?.name ?? null;
}

export function deriveTechSignals(pages: StaticPageResult[]) {
  const combinedContent = pages
    .map((page) => `${page.html}\n${JSON.stringify(page.headers)}\n${page.scripts.map((script) => `${script.src ?? ""} ${script.contentSample ?? ""}`).join("\n")}`)
    .join("\n");
  const lowerContent = combinedContent.toLowerCase();
  const scriptHosts = new Set(
    pages.flatMap((page) =>
      page.scripts
        .map((script) => script.host)
        .filter((host): host is string => typeof host === "string" && host.length > 0)
    )
  );

  const paymentSignature = detectNamedVendor(
    combinedContent,
    pages.flatMap((page) => page.scripts),
    PAYMENT_VENDOR_SIGNATURES
  );
  const chatSignature = detectNamedVendor(combinedContent, pages.flatMap((page) => page.scripts), CHAT_VENDOR_SIGNATURES);
  const widgetSignature = detectNamedVendor(
    combinedContent,
    pages.flatMap((page) => page.scripts),
    ACCESSIBILITY_WIDGET_SIGNATURES
  );

  return {
    cmsPlatform: findTechByPatterns(combinedContent, CMS_SIGNATURES),
    ecommercePlatform: /shopify|woocommerce|bigcommerce/i.test(combinedContent)
      ? /shopify/i.test(combinedContent)
        ? "Shopify"
        : /woocommerce/i.test(combinedContent)
          ? "WooCommerce"
          : "BigCommerce"
      : null,
    frontendFramework: findTechByPatterns(combinedContent, FRONTEND_FRAMEWORK_SIGNATURES),
    hostingOrCdnProvider: findTechByPatterns(combinedContent, HOSTING_SIGNATURES),
    cdnProvider: /cloudflare/i.test(lowerContent)
      ? "Cloudflare"
      : /fastly/i.test(lowerContent)
        ? "Fastly"
        : /akamai/i.test(lowerContent)
          ? "Akamai"
          : /cloudfront/i.test(lowerContent)
            ? "CloudFront"
            : null,
    edgeSecurityProvider: /cloudflare/i.test(lowerContent)
      ? "Cloudflare"
      : /akamai/i.test(lowerContent)
        ? "Akamai"
        : /imperva|incapsula/i.test(lowerContent)
          ? "Imperva"
          : /sucuri/i.test(lowerContent)
            ? "Sucuri"
            : null,
    paymentProcessorHints: paymentSignature ? [paymentSignature.name] : [],
    chatSupportVendor: chatSignature?.name ?? null,
    accessibilityWidgetVendor: widgetSignature?.name ?? null,
    serviceWorkerDetected: /serviceworker|navigator\.serviceworker|workbox/i.test(lowerContent),
    publicApiEndpointDetected: /\/api\/|graphql|rest api|api\./i.test(lowerContent),
    thirdPartyScriptDomainCount: scriptHosts.size
  };
}

function hasText(content: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(content));
}

function normalizeMatchingText(...parts: Array<string | null | undefined>) {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function matchesKeywordSet(haystack: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(haystack));
}

function deriveGovernanceLinkSignals(pages: StaticPageResult[]) {
  const normalizedLinks = pages.flatMap((page) =>
    page.links.map((link) => {
      const href = link.href.toLowerCase();
      const text = link.text.toLowerCase();
      return { href, text, combined: `${href} ${text}` };
    })
  );

  // Governance hits are driven by public link discovery, not deep browsing.
  return {
    vulnerabilityDisclosurePagePresent: normalizedLinks.some(({ combined }) =>
      /(vulnerability|responsible|security)\s*-?\s*(disclosure|report|researcher|contact)|\/security(?:\/|$)|\/responsible-disclosure|\/vulnerability-disclosure|\bsecurity\b/.test(
        combined
      )
    ),
    trustCenterPresent: normalizedLinks.some(({ combined }) => /\btrust center\b|\/trust(?:-center)?(?:\/|$)|security trust/.test(combined)),
    incidentStatusPagePresent: normalizedLinks.some(({ href, combined, text }) =>
      /^https?:\/\/status\./.test(href) || /statuspage\.io|system status|service status|\bstatus\b/.test(combined) || text === "status"
    )
  };
}

type SensitiveFormSignals = {
  formCollectsBirthdate: boolean;
  formCollectsFinancialInformation: boolean;
  formCollectsGeolocation: boolean;
  formCollectsGovernmentId: boolean;
  formCollectsHealthInformation: boolean;
  formCollectsSsn: boolean;
};

function deriveSensitiveCollectionSignals(forms: ExtractedForm[]): SensitiveFormSignals {
  const formHaystack = forms
    .map((form) =>
      normalizeMatchingText(
        form.textSample,
        ...form.inputs.flatMap((input) => [
          input.type,
          input.name,
          input.labelText,
          input.autocomplete,
          input.placeholder,
          input.ariaLabel,
          input.id
        ])
      )
    )
    .join("\n");
  const combinedText = normalizeMatchingText(formHaystack);

  return {
    formCollectsSsn: matchesKeywordSet(combinedText, [/\bssn\b/i, /social security/i, /taxpayer identification/i]),
    formCollectsGovernmentId: matchesKeywordSet(combinedText, [/\bpassport\b/i, /driver'?s?\s*licen[sc]e/i, /national id/i, /government id/i]),
    formCollectsHealthInformation: matchesKeywordSet(combinedText, [/\bmedical\b/i, /\bhealth\b/i, /\bpatient\b/i, /diagnosis/i, /insurance member/i, /prescription/i]),
    formCollectsFinancialInformation: matchesKeywordSet(combinedText, [/\bbank account\b/i, /\brouting\b/i, /\biban\b/i, /\bincome\b/i, /\bsalary\b/i, /\bcard number\b/i, /\bpayment card\b/i]),
    formCollectsBirthdate: matchesKeywordSet(combinedText, [/\bdate of birth\b/i, /\bdob\b/i, /\bbirthdate\b/i, /\bbirthday\b/i]),
    // Geolocation intentionally excludes plain address collection to stay conservative.
    formCollectsGeolocation: matchesKeywordSet(combinedText, [/\bgeolocation\b/i, /\bgps\b/i, /\bcurrent location\b/i, /\blatitude\b/i, /\blongitude\b/i, /\bcoordinates\b/i])
  };
}

function deriveCommercialSignals(pages: StaticPageResult[]) {
  const combinedText = normalizeMatchingText(...pages.map((page) => `${page.title ?? ""} ${page.textContent}`));
  const offerText = normalizeMatchingText(
    ...pages
      .filter((page) => ["homepage", "product", "pricing", "checkout"].includes(page.pageType))
      .map((page) => `${page.title ?? ""} ${page.textContent}`)
  );
  const refundText = normalizeMatchingText(
    ...pages
      .filter((page) => ["refund_policy", "shipping_policy", "contact", "support"].includes(page.pageType))
      .map((page) => `${page.title ?? ""} ${page.textContent}`)
  );
  const termsText = normalizeMatchingText(
    ...pages
      .filter((page) => ["terms_of_service", "subscription_terms"].includes(page.pageType))
      .map((page) => `${page.title ?? ""} ${page.textContent}`)
  );
  const refundWindowDaysMatch =
    refundText.match(/\b(?:within|up to|for)\s+(\d{1,3})\s+days?\b.{0,40}\b(?:refund|return)s?\b/) ??
    refundText.match(/\b(\d{1,3})\s+day(?:s)?\b.{0,24}\b(?:refund|return)s?\b/) ??
    refundText.match(/\b(?:refund|return)s?\b.{0,24}\b(\d{1,3})\s+day(?:s)?\b/);
  const refundPolicyWindowDays = refundWindowDaysMatch ? Number.parseInt(refundWindowDaysMatch[1] ?? "", 10) : null;

  return {
    subscriptionTermsPresent: /subscription|membership|recurring billing|billing terms/.test(combinedText),
    autoRenewDisclosurePresent: /auto.?renew|automatically renew|renews automatically|recurring charge|renews unless cancelled/.test(combinedText),
    subscriptionCancellationPolicyPresent: /cancellation policy|cancel anytime|how to cancel|cancel your subscription/.test(combinedText),
    freeTrialDetected: /free trial|trial period|try for free/.test(combinedText),
    discountClaimPresent: /\b\d{1,3}%\s+off\b|\bsave\s+\$?\d+\b|\bdiscount\b|\bsale price\b|\bpromo(?:tional)?\b/.test(offerText),
    originalPriceComparisonPresent: /\bwas\s+\$?\d[\d,.]*\b.{0,24}\bnow\s+\$?\d[\d,.]*\b|\boriginally\s+\$?\d[\d,.]*\b|\bcompare at\s+\$?\d[\d,.]*\b|\bstrikethrough price\b/.test(
      offerText
    ),
    limitedTimeOfferLanguagePresent: /\blimited time\b|\boffer ends\b|\bends tonight\b|\btoday only\b|\bwhile supplies last\b|\bexpires\b|\blast chance\b/.test(
      offerText
    ),
    refundPolicyPresent: /refund policy|money-back|money back guarantee|return policy|refunds/.test(combinedText),
    refundPolicyWindowDays,
    refundPolicyConditionsPresent: /\bmust be\b|\bprovided that\b|\bsubject to\b|\bunused\b|\bunopened\b|\bin original packaging\b|\bproof of purchase\b/.test(
      refundText
    ),
    refundRequestMethodPresent: /\brequest a refund\b|\bcontact support\b|\bemail us\b|\bsubmit (?:a )?return request\b|\bstart a return\b/.test(
      refundText
    ),
    storeCreditOnlyPolicyPresent: /\bstore credit only\b|\brefunds?(?: are| will be)? issued as store credit\b|\bcredit only\b/.test(refundText),
    exchangePolicyPresent: /\bexchange(?:s|d)?\b|\bexchange policy\b|\breplacement(?:s)?\b/.test(refundText),
    renewalNoticePeriodPresent: /\bnotify you\b.{0,40}\bbefore (?:your )?(?:subscription )?renewal\b|\brenewal notice\b|\badvance notice\b/.test(termsText),
    terminationForCauseClausePresent: /\bfor cause\b|\bmaterial breach\b|\bviolation of these terms\b|\bterminate your account if\b/.test(termsText),
    accountDeletionTermsPresent: /\bdelete your account\b|\baccount deletion\b|\bclose your account\b|\bterminate your account\b/.test(termsText),
    serviceSuspensionOrTerminationTermsPresent: /\bsuspend(?:ed|sion)?\b.{0,32}\baccount\b|\bterminate(?:d|s|ion)?\b.{0,32}\baccess\b|\bwe may suspend or terminate\b/.test(
      termsText
    )
  };
}

function deriveAiSignals(input: { chatSupportVendor: string | null; pages: StaticPageResult[] }) {
  const allPagesContent = normalizeMatchingText(...input.pages.map((page) => `${page.title ?? ""} ${page.textContent} ${page.html}`));
  const allScripts = input.pages.flatMap((page) => page.scripts);
  const vendorSignals = CHAT_VENDOR_SIGNATURES.filter((signature) => matchSignature(allPagesContent, allScripts, signature))
    .sort((left, right) => right.confidence - left.confidence);
  const primaryVendor = vendorSignals[0]?.name ?? input.chatSupportVendor ?? null;
  const visibleAiWidgetLanguage = [
    /\bask ai\b/,
    /\bai assistant\b/,
    /\bchat with ai\b/,
    /\bai help\b/,
    /\bvirtual assistant\b/,
    /\bour ai assistant\b/,
    /\bautomated assistant\b/
  ];
  const chatbotMarkers = [
    /\blive chat\b/,
    /\bchat with us\b/,
    /\bmessage us\b/,
    /\bhelp widget\b/,
    /data-testid=["'][^"']*(assistant|chatbot|launcher)[^"']*["']/,
    /aria-label=["'][^"']*(chat|assistant|support)[^"']*["']/
  ];
  const disclosurePatterns = [
    /\bpowered by ai\b/,
    /\bai-generated\b/,
    /\bresponses may be generated by ai\b/,
    /\bour ai assistant\b/,
    /\bgenerative ai\b/,
    /\bautomated assistant\b/
  ];
  const policyPatterns = [
    /\bartificial intelligence\b/,
    /(^|[^a-z])ai([^a-z]|$)/,
    /\bmachine learning\b/,
    /\bgenerative ai\b/,
    /\bautomated decision(?:-making)?\b/,
    /\bautomated processing\b/
  ];
  const helpPatterns = [
    /\bhow to use (?:our )?ai assistant\b/,
    /\bai support article\b/,
    /\bhelp center\b.{0,40}\bai\b/,
    /\bchatbot\b.{0,40}\bhelp\b/,
    /\bassistant\b.{0,40}\bhelp\b/
  ];
  const searchPatterns = [
    /\bask a question\b.{0,40}\b(ai|assistant|answers?)\b/,
    /\bget instant answers\b/,
    /\bai answers\b/,
    /\banswer assistant\b/,
    /\bsearch with ai\b/,
    /\bask anything\b/
  ];
  const hiringPatterns = [
    /\bautomated screening\b/,
    /\bai screening\b/,
    /\bautomated decision(?:-making)?\b.{0,40}\b(candidate|applicant|hiring)\b/,
    /\bcandidate ranking\b/,
    /\bmachine learning\b.{0,40}\b(hiring|recruit|applicant)\b/,
    /\bautomated applicant review\b/
  ];

  const policyPages = input.pages.filter((page) =>
    page.pageType === "privacy_policy" ||
    page.pageType === "terms_of_service" ||
    page.pageType === "subscription_terms" ||
    /acceptable use|responsible ai|usage policy|privacy/i.test(`${page.title ?? ""} ${page.pageUrl}`)
  );
  const helpPages = input.pages.filter((page) =>
    page.pageType === "support" ||
    /help|support|docs|knowledge base|faq/i.test(`${page.title ?? ""} ${page.pageUrl}`)
  );
  const aiAssistantWidgetDetected =
    matchesKeywordSet(allPagesContent, visibleAiWidgetLanguage) &&
    (Boolean(primaryVendor) || matchesKeywordSet(allPagesContent, chatbotMarkers));
  const aiDisclosureTextPresent = matchesKeywordSet(allPagesContent, disclosurePatterns);
  const aiTermsOrPolicyAiReference = policyPages.length > 0
    ? matchesKeywordSet(normalizeMatchingText(...policyPages.map((page) => `${page.title ?? ""} ${page.textContent}`)), policyPatterns)
    : null;
  const aiHelpCenterAiReference = helpPages.length > 0
    ? matchesKeywordSet(normalizeMatchingText(...helpPages.map((page) => `${page.title ?? ""} ${page.textContent}`)), [...policyPatterns, ...helpPatterns])
    : null;
  const aiSearchOrAnswerExperienceDetected = matchesKeywordSet(allPagesContent, searchPatterns)
    ? matchesKeywordSet(allPagesContent, [/\bai\b/, /\bassistant\b/, /\banswers?\b/])
    : false;
  const aiHiringAutomationSignalDetected = matchesKeywordSet(allPagesContent, hiringPatterns)
    ? matchesKeywordSet(allPagesContent, [/\bcareer|careers|job|jobs|candidate|applicant|recruit/i])
    : false;
  const aiChatbotPresent =
    primaryVendor !== null ||
    (matchesKeywordSet(allPagesContent, chatbotMarkers) && (aiAssistantWidgetDetected || aiDisclosureTextPresent));

  // If multiple vendors are present, select the highest-confidence signature hit as the primary visible provider.
  return {
    aiAssistantWidgetDetected,
    aiChatbotVendor: primaryVendor,
    aiChatbotPresent,
    aiDisclosureTextPresent,
    aiTermsOrPolicyAiReference,
    aiHelpCenterAiReference,
    aiSearchOrAnswerExperienceDetected,
    aiHiringAutomationSignalDetected
  };
}

function deriveAdvertisingSignals(trackers: ScanTrackerVendor[]) {
  const trackerIds = new Set(trackers.map((tracker) => tracker.matchedSignatureId));
  const retargetingIds = ["google_ads", "meta_pixel", "linkedin_insight", "tiktok_pixel", "pinterest_tag", "reddit_pixel"];

  // Advertising and replay classifications are vendor-signature driven so they remain deterministic.
  return {
    adNetworkGoogleAds: trackerIds.has("google_ads"),
    adNetworkMetaAds: trackerIds.has("meta_pixel"),
    retargetingPixelDetected: retargetingIds.some((id) => trackerIds.has(id)),
    sessionReplayToolDetected: trackers.some((tracker) => tracker.vendorCategory === "session_replay")
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function estimateReadingScore(text: string) {
  const words = text.match(/\b[\w'-]+\b/g) ?? [];
  const sentences = text.split(/[.!?]+/).filter((segment) => segment.trim().length > 0);
  const syllables = words.reduce((total, word) => total + Math.max(1, (word.toLowerCase().match(/[aeiouy]+/g) ?? []).length), 0);

  if (words.length === 0 || sentences.length === 0) {
    return null;
  }

  const flesch = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
  return clampScore(flesch);
}

function parseLooseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function extractPolicyDate(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  const explicitDateMatch =
    normalized.match(/\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2},\s+\d{4}\b/i) ??
    normalized.match(/\b\d{4}-\d{2}-\d{2}\b/) ??
    normalized.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/);

  return parseLooseDate(explicitDateMatch?.[0] ?? null);
}

export function derivePolicySignals(policyPages: StaticPageResult[]) {
  const combinedPolicyText = policyPages.map((page) => page.textContent).join("\n").toLowerCase();
  const privacyPolicy = policyPages.find((page) => page.pageType === "privacy_policy");
  const termsPolicy = policyPages.find((page) => page.pageType === "terms_of_service");
  const cookiePolicy = policyPages.find((page) => page.pageType === "cookie_policy");
  const privacyPolicyLastUpdatedMatch =
    privacyPolicy?.textContent.match(/(last updated|effective date)[:\s]+([a-z0-9,\-/ ]{4,80})/i)?.[2]?.trim() ?? null;
  const privacyPolicyLastUpdatedDate = extractPolicyDate(privacyPolicyLastUpdatedMatch);
  const privacyPolicyWordCount = privacyPolicy?.textContent.match(/\b[\w'-]+\b/g)?.length ?? null;
  const readability = privacyPolicy ? estimateReadingScore(privacyPolicy.textContent) : null;
  const namedVendorCount = (privacyPolicy?.textContent.match(/\b(google|meta|facebook|stripe|shopify|hubspot|salesforce|zendesk|mailchimp)\b/gi) ?? []).length;

  return {
    privacyPolicyHash: privacyPolicy ? stableHash(normalizeTextForHash(privacyPolicy.textContent)) : null,
    termsPolicyHash: termsPolicy ? stableHash(normalizeTextForHash(termsPolicy.textContent)) : null,
    cookiePolicyHash: cookiePolicy ? stableHash(normalizeTextForHash(cookiePolicy.textContent)) : null,
    privacyPolicyLastUpdatedFound: privacyPolicyLastUpdatedDate,
    privacyPolicyLastUpdatedDate,
    privacyPolicyWordCount,
    privacyPolicyComplexityScore: readability === null ? null : clampScore(100 - readability),
    privacyLanguageReadabilityScore: readability,
    mentionsGdpr: hasText(combinedPolicyText, [/\bgdpr\b/i, /general data protection regulation/i]),
    mentionsCcpaOrCpra: hasText(combinedPolicyText, [/\bccpa\b/i, /\bcpra\b/i, /california consumer privacy/i]),
    mentionsCoppa: hasText(combinedPolicyText, [/\bcoppa\b/i, /children'?s online privacy/i]),
    mentionsUnder13: hasText(combinedPolicyText, [/under 13/i, /children under the age of 13/i]),
    mentionsUnder16: hasText(combinedPolicyText, [/under 16/i, /children under the age of 16/i]),
    mentionsSensitiveData: hasText(combinedPolicyText, [/sensitive personal/i, /sensitive data/i]),
    mentionsBiometricData: hasText(combinedPolicyText, [/biometric/i]),
    mentionsHealthData: hasText(combinedPolicyText, [/health data/i, /health information/i, /\bphi\b/i]),
    mentionsFinancialData: hasText(combinedPolicyText, [/financial information/i, /payment information/i]),
    mentionsLocationData: hasText(combinedPolicyText, [/location data/i, /geolocation/i]),
    mentionsDataRetention: hasText(combinedPolicyText, [/retain/i, /retention/i, /keep your data/i]),
    dataRetentionSpecificPeriodDetected: hasText(combinedPolicyText, [/\b\d+\s+(day|days|month|months|year|years)\b/i]),
    mentionsDataSaleOrSharing: hasText(combinedPolicyText, [/sell your personal/i, /share your personal/i, /sale of personal/i]),
    mentionsCrossBorderTransfer: hasText(combinedPolicyText, [/cross-border/i, /international transfer/i, /transfer.*outside/i]),
    crossBorderTransferMechanismDetected: hasText(combinedPolicyText, [/\bsccs?\b/i, /standard contractual clauses/i, /\bdpf\b/i, /data privacy framework/i, /adequacy decision/i]),
    mentionsSubprocessorsOrVendors: hasText(combinedPolicyText, [/subprocessor/i, /service provider/i, /vendor/i]),
    mentionsAutomatedDecisioning: hasText(combinedPolicyText, [/automated decision/i, /profiling/i]),
    mentionsAiUsage: hasText(combinedPolicyText, [/\bai\b/i, /artificial intelligence/i, /machine learning/i]),
    privacyContactMethodPresent: hasText(combinedPolicyText, [/privacy@/i, /contact us/i, /reach us/i]),
    dsarRequestMechanismPresent: hasText(combinedPolicyText, [/request access/i, /delete your data/i, /data subject request/i]),
    privacyRequestFormPresent: hasText(combinedPolicyText, [/privacy request form/i, /request form/i, /submit.*request/i]),
    dataAccessRequestPresent: hasText(combinedPolicyText, [/request access/i, /access your data/i, /right to know/i]),
    dataDeletionRequestPresent: hasText(combinedPolicyText, [/delete your data/i, /request deletion/i, /erase your data/i]),
    subprocessorListPresent: hasText(combinedPolicyText, [/subprocessor list/i, /list of subprocessors/i]),
    privacyEmailSpecificPresent: hasText(combinedPolicyText, [/privacy@/i, /dpo@/i]),
    dpoReferencePresent: hasText(combinedPolicyText, [/\bdpo\b/i, /data protection officer/i]),
    dpoEmailDetected: hasText(combinedPolicyText, [/dpo@/i]),
    doNotSellLinkPresent: hasText(combinedPolicyText, [/do not sell/i, /do not share/i]),
    lawEnforcementRequestPolicyPresent: hasText(combinedPolicyText, [/law enforcement request/i, /government request/i]),
    transparencyReportPresent: hasText(combinedPolicyText, [/transparency report/i]),
    doubleOptInReferencePresent: hasText(combinedPolicyText, [/double opt-?in/i, /confirm your subscription/i]),
    thirdPartyDisclosureSpecificity: namedVendorCount > 0 ? "named_vendors" : hasText(combinedPolicyText, [/third parties|service providers|vendors/i]) ? "generic" : "none",
    entityJurisdictionDetected:
      privacyPolicy?.textContent.match(/(organized under the laws of|incorporated in|registered in)\s+([A-Za-z ,.-]{2,80})/i)?.[2]?.trim() ?? null,
    supervisoryAuthorityReferencePresent: hasText(combinedPolicyText, [/supervisory authority/i, /lodge a complaint/i, /data protection authority/i])
  };
}

function inputMatches(input: ExtractedInput, fieldKey: string) {
  const haystack = [input.type, input.name, input.labelText, input.autocomplete, input.placeholder, input.ariaLabel, input.id]
    .filter(Boolean)
    .join(" ");
  const config = FIELD_LABEL_PATTERNS.find((entry) => entry.key === fieldKey);
  return config?.patterns.some((pattern) => pattern.test(haystack)) ?? false;
}

export function deriveFormSignals(pages: StaticPageResult[]) {
  const forms = pages.flatMap((page) => page.forms);
  const allInputs = forms.flatMap((form) => form.inputs);
  const pageText = pages.map((page) => page.textContent).join("\n");
  const formOnlyText = normalizeMatchingText(
    ...forms.map((form) =>
      normalizeMatchingText(
        form.textSample,
        ...form.inputs.flatMap((input) => [
          input.type,
          input.name,
          input.labelText,
          input.autocomplete,
          input.placeholder,
          input.ariaLabel,
          input.id
        ])
      )
    )
  );
  const sensitiveCollectionSignals = deriveSensitiveCollectionSignals(forms);

  const ageVerificationMechanismType: AgeVerificationMechanismType = allInputs.some((input) => inputMatches(input, "date_of_birth"))
    ? "date_of_birth"
    : /i am over 13|i am over 16|confirm your age/i.test(pageText)
      ? "checkbox"
      : /enter your birthday|birth date/i.test(pageText)
        ? "date_of_birth"
        : /verify your age|age gate/i.test(pageText)
          ? "hard_gate"
          : "none";

  return {
    formCountTotal: forms.length,
    contactFormPresent: forms.some((form) => /contact|message|send us/i.test(form.textSample)),
    newsletterSignupPresent: forms.some((form) => /newsletter|subscribe/i.test(form.textSample)),
    accountSignupPresent: forms.some((form) => /sign up|create account|register/i.test(form.textSample)),
    loginPagePresent: pages.some((page) => page.pageType === "login") || forms.some((form) => form.hasPasswordField),
    passwordResetPresent: /forgot password|reset password/i.test(pageText),
    checkoutOrPaymentFormPresent: pages.some((page) => page.pageType === "checkout") || allInputs.some((input) => inputMatches(input, "payment_card")),
    fileUploadFieldPresent: allInputs.some((input) => input.type === "file" || inputMatches(input, "file_upload")),
    emailInputPresent: allInputs.some((input) => input.type === "email" || inputMatches(input, "email")),
    phoneInputPresent: allInputs.some((input) => input.type === "tel" || inputMatches(input, "phone")),
    addressInputPresent: allInputs.some((input) => inputMatches(input, "address")),
    paymentCardInputPresent: allInputs.some((input) => inputMatches(input, "payment_card")),
    dateOfBirthInputPresent: allInputs.some((input) => inputMatches(input, "date_of_birth")),
    ...sensitiveCollectionSignals,
    ageGatePresent: /age gate|must be 13|must be 16|confirm your age/i.test(pageText),
    ageVerificationMechanismType,
    parentalConsentReferencePresent: /parental consent|parent or guardian/i.test(pageText),
    sensitiveDataFormHintsPresent: /health|medical|biometric|social security|ssn/i.test(formOnlyText),
    highSensitivityDataCollectionDetected:
      sensitiveCollectionSignals.formCollectsSsn ||
      sensitiveCollectionSignals.formCollectsGovernmentId ||
      sensitiveCollectionSignals.formCollectsHealthInformation ||
      sensitiveCollectionSignals.formCollectsFinancialInformation ||
      allInputs.some((input) => /\b(ssn|medical|insurance)\b/i.test([input.name, input.labelText, input.placeholder].filter(Boolean).join(" "))),
    privacyContactChannelType: forms.some((form) => /privacy|data subject|data request/i.test(form.textSample))
      ? "form"
      : /privacy portal|request portal/i.test(pageText)
        ? "portal"
        : /privacy@|dpo@/i.test(pageText)
          ? "email"
          : "none",
    consentWithdrawalMechanismPresent: /cookie settings|manage cookies|privacy choices|withdraw consent/i.test(pageText),
    formsSignatureHash: stableHash(
      forms.map((form) => ({
        action: form.action,
        inputs: form.inputs.map((input) => ({
          type: input.type,
          name: input.name,
          autocomplete: input.autocomplete
        }))
      }))
    )
  };
}

export function deriveContactSignals(pages: StaticPageResult[]) {
  const combinedText = pages.map((page) => page.textContent).join("\n");

  return {
    legalEntityNameDetected: /\b(llc|inc\.|incorporated|corp\.|corporation|limited)\b/i.test(combinedText),
    physicalBusinessAddressPresent: /\b\d{1,6}\s+[A-Za-z0-9.\- ]+\s+(street|st|road|rd|avenue|ave|boulevard|blvd)\b/i.test(combinedText),
    emailContactPublicPresent: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(combinedText),
    phoneNumberPublicPresent: /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/.test(combinedText),
    accessibilityContactMethodPresent: /accessibility@|accessibility feedback|request accommodation/i.test(combinedText),
    privacyRequestFormPresent: /privacy request|data request|subject access request/i.test(combinedText)
  };
}

export function deriveJurisdictionAndIndustry(pages: StaticPageResult[], domain: string) {
  const combinedText = pages.map((page) => page.textContent).join("\n");
  const lowerText = combinedText.toLowerCase();

  return {
    countryInferred: /\.ca$/.test(domain) ? "CA" : /\.uk$/.test(domain) ? "GB" : "US",
    regionStateInferred: /\bcalifornia\b/i.test(combinedText) ? "CA" : null,
    jurisdictionGuess: /\beuropean union\b|\bgdpr\b/i.test(combinedText)
      ? "eu"
      : /\bcalifornia\b|\bccpa\b|\bcpra\b/i.test(combinedText)
        ? "us-ca"
        : "us",
    euExposureLikely: /\bgdpr\b|european union|eea/i.test(combinedText),
    californiaExposureLikely: /\bccpa\b|\bcpra\b|california resident/i.test(combinedText),
    childrenAudienceLikely: /kids|children|students|young learners|parents/i.test(lowerText),
    kidDirectedContentDetected: /cartoon|kids club|for ages \d+|children's|young learners/i.test(lowerText),
    healthcareSiteLikely: /patient|hipaa|health care|medical/i.test(lowerText),
    financialServicesSiteLikely: /loan|insurance|investment|bank|fintech/i.test(lowerText),
    ecommerceSiteLikely: /add to cart|checkout|shipping|returns/i.test(lowerText),
    saasSiteLikely: /book a demo|start free trial|request demo|pricing plan/i.test(lowerText),
    educationSiteLikely: /curriculum|course catalog|student portal|faculty/i.test(lowerText),
    multilingualSite: pages.some((page) => /hreflang|lang="/i.test(page.html)),
    mobileAppLinksDetected: pages.some((page) => /apps\.apple\.com|play\.google\.com/i.test(page.html))
  };
}

export function deriveGovernanceSignals(pages: StaticPageResult[]) {
  return deriveGovernanceLinkSignals(pages);
}

export function deriveExpandedCommercialSignals(pages: StaticPageResult[]) {
  return deriveCommercialSignals(pages);
}

export function deriveAdvertisingClassification(trackers: ScanTrackerVendor[]) {
  return deriveAdvertisingSignals(trackers);
}

export function deriveAiInfrastructureSignals(input: { chatSupportVendor: string | null; pages: StaticPageResult[] }) {
  return deriveAiSignals(input);
}

export function buildPageMetadata(scanId: string, page: StaticPageResult): ScanPage {
  return {
    scanId,
    pageType: page.pageType,
    pageUrl: page.pageUrl,
    fetchStatus: page.fetchStatus,
    fetchedVia: "http",
    normalizedContentHash: page.textContent ? stableHash(normalizeTextForHash(page.textContent)) : null,
    titleHash: page.title ? stableHash(normalizeTextForHash(page.title)) : null,
    pageLanguage: page.language
  };
}

export function buildAccessibilitySummary(ruleCounts: ScanAccessibilityRuleCount[]) {
  const countFor = (pattern: RegExp) =>
    ruleCounts.filter((rule) => pattern.test(rule.ruleCode) || pattern.test(rule.ruleGroup)).reduce((sum, rule) => sum + rule.instanceCount, 0);

  return {
    wcagErrorCountTotal: ruleCounts.reduce((sum, rule) => sum + rule.instanceCount, 0),
    wcagWarningCountTotal: ruleCounts
      .filter((rule) => rule.severity === "low" || rule.severity === "info")
      .reduce((sum, rule) => sum + rule.instanceCount, 0),
    wcagContrastFailuresCount: countFor(/contrast/i),
    wcagMissingAltCount: countFor(/alt/i),
    wcagFormLabelErrorCount: countFor(/label/i),
    wcagAriaErrorCount: countFor(/aria/i),
    wcagHeadingStructureErrorCount: countFor(/heading/i),
    wcagLinkNameErrorCount: countFor(/link/i),
    wcagKeyboardNavigationIssueCount: countFor(/keyboard/i),
    wcagFocusIndicatorIssueCount: countFor(/focus/i),
    wcagLandmarkIssueCount: countFor(/landmark|region/i),
    accessibilitySignatureHash: stableHash(
      ruleCounts
        .map((rule) => ({
          code: rule.ruleCode,
          count: rule.instanceCount
        }))
        .sort((left, right) => left.code.localeCompare(right.code))
    )
  };
}

export function summarizeTrackers(trackers: ScanTrackerVendor[]) {
  const countByCategory = (category: ScanTrackerVendor["vendorCategory"]) =>
    trackers.filter((tracker) => tracker.vendorCategory === category).length;
  const onlyAnalytics = trackers.length > 0 && trackers.every((tracker) => tracker.vendorCategory === "analytics");
  const uniqueVendors = [...new Set(trackers.map((tracker) => tracker.vendorName))];
  const uniqueCategories = [...new Set(trackers.map((tracker) => tracker.vendorCategory))];
  const largestVendorShare =
    uniqueVendors.length === 0 ? null : Math.max(...uniqueVendors.map((vendor) => trackers.filter((tracker) => tracker.vendorName === vendor).length)) / trackers.length;

  return {
    trackerCountTotal: trackers.length,
    analyticsTrackerCount: countByCategory("analytics"),
    advertisingTrackerCount: countByCategory("advertising"),
    socialTrackerCount: countByCategory("social"),
    sessionReplayTrackerCount: countByCategory("session_replay"),
    tagManagerPresent: trackers.some((tracker) => tracker.vendorCategory === "tag_manager"),
    firstPartyAnalyticsOnly: onlyAnalytics && trackers.every((tracker) => tracker.firstPartyOrThirdParty !== "third_party"),
    adtechStackComplexityScore: Math.min(100, trackers.length * 8 + countByCategory("advertising") * 6 + countByCategory("session_replay") * 10),
    fingerprintingOrIdentityVendorDetected: trackers.some((tracker) => tracker.vendorCategory === "fingerprinting"),
    trackerVendorSetHash: stableHash(uniqueVendors.sort()),
    trackerCategorySetHash: stableHash(uniqueCategories.sort()),
    trackerVendorConcentrationScore: largestVendorShare === null ? null : clampScore(largestVendorShare * 100),
    trackerDiversityScore: uniqueCategories.length === 0 ? null : clampScore((uniqueCategories.length / 8) * 100)
  };
}

export function policyPresenceHash(snapshot: Pick<
  ScanSnapshot,
  | "privacyPolicyPresent"
  | "termsOfServicePresent"
  | "cookiePolicyPresent"
  | "accessibilityStatementPresent"
  | "refundPolicyPresent"
  | "shippingPolicyPresent"
  | "subscriptionTermsPresent"
  | "affiliateDisclosurePresent"
  | "advertisingDisclosurePresent"
  | "contactPagePresent"
>) {
  return stableHash(snapshot);
}

export function consentSignatureHash(input: {
  acceptAllPresent: boolean;
  consentAcceptButtonCount: number | null;
  consentInteractionModel: string | null;
  consentPreferencesButtonCount: number | null;
  consentRejectButtonCount: number | null;
  cmpVendorName: string | null;
  cookieBannerPresent: boolean;
  cookiePolicyLinkedFromBanner: boolean;
  granularPreferencesPresent: boolean;
  rejectAllPresent: boolean;
}) {
  return stableHash(input);
}

export function homepageStructuredHash(page: StaticPageResult) {
  return stableHash({
    links: page.links.slice(0, 40).map((link) => ({ href: new URL(link.href).pathname, text: link.text })),
    scripts: page.scripts.slice(0, 20).map((script) => ({ host: script.host, src: script.src ? new URL(script.src).pathname : null })),
    forms: page.forms.map((form) => form.inputs.map((input) => input.type ?? "unknown"))
  });
}

export function detectCmpVendorFromPage(page: StaticPageResult) {
  const combinedContent = `${page.html}\n${page.scripts.map((script) => `${script.src ?? ""} ${script.contentSample ?? ""}`).join("\n")}`;
  return detectNamedVendor(combinedContent, page.scripts, CMP_VENDOR_SIGNATURES);
}

export function detectAccessibilityWidgetFromPages(pages: StaticPageResult[]) {
  const combinedContent = pages.map((page) => `${page.html}\n${page.scripts.map((script) => `${script.src ?? ""} ${script.contentSample ?? ""}`).join("\n")}`).join("\n");
  return detectNamedVendor(combinedContent, pages.flatMap((page) => page.scripts), ACCESSIBILITY_WIDGET_SIGNATURES);
}

export function inferSiteSizeHint(pageCount: number) {
  if (pageCount <= 3) {
    return "small";
  }

  if (pageCount <= 10) {
    return "medium";
  }

  return "large";
}

export function policyPagesFromFetchedPages(pages: StaticPageResult[]) {
  return pages.filter((page) =>
    [
      "privacy_policy",
      "terms_of_service",
      "cookie_policy",
      "accessibility_statement",
      "refund_policy",
      "shipping_policy",
      "subscription_terms",
      "affiliate_disclosure",
      "advertising_disclosure"
    ].includes(page.pageType)
  );
}

export function isLikelyPolicyPage(page: StaticPageResult) {
  return page.pageType !== "other" && page.pageType !== "homepage" && urlMatchesPageType(page.pageUrl, page.pageType);
}
