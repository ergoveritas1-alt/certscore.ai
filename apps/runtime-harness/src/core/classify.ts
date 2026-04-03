import type {
  ClassificationSummary,
  MainDocumentSummary,
  PhaseReached,
  RequestRecord,
  ResponseRecord,
  RuntimeRunResult,
  VendorCategory,
  VendorSummary
} from "./types";

type VendorRule = {
  category: VendorCategory;
  domains: string[];
  name: string;
};

const VENDOR_RULES: VendorRule[] = [
  { name: "Awswaf", category: "unknown", domains: ["edge.sdk.awswaf.com", "awswaf.com"] },
  { name: "Amazon", category: "functional", domains: ["amazonaws.com", "cloudfront.net"] },
  { name: "Google", category: "functional", domains: ["google.com", "googleapis.com", "gstatic.com"] },
  { name: "Google Tag Manager", category: "functional", domains: ["googletagmanager.com"] },
  { name: "Google Analytics", category: "analytics", domains: ["google-analytics.com", "analytics.google.com"] },
  { name: "Google Ads", category: "advertising", domains: ["googleadservices.com", "g.doubleclick.net"] },
  { name: "DoubleClick / Floodlight", category: "advertising", domains: ["doubleclick.net", "fls.doubleclick.net"] },
  { name: "Meta Pixel", category: "advertising", domains: ["facebook.com", "facebook.net", "connect.facebook.net"] },
  { name: "LinkedIn Insight", category: "advertising", domains: ["ads.linkedin.com", "snap.licdn.com", "px.ads.linkedin.com"] },
  { name: "Reddit Ads", category: "advertising", domains: ["ads.reddit.com", "events.redditmedia.com"] },
  { name: "Snap Pixel", category: "advertising", domains: ["sc-static.net", "snapchat.com", "tr.snapchat.com", "tr6.snapchat.com"] },
  { name: "Tapad", category: "advertising", domains: ["tapad.com", "pixel.tapad.com"] },
  { name: "Twitter / X", category: "advertising", domains: ["analytics.twitter.com", "t.co", "ads-twitter.com", "static.ads-twitter.com"] },
  { name: "TikTok", category: "advertising", domains: ["analytics.tiktok.com", "ads.tiktok.com", "tiktok.com", "tiktokw.us"] },
  { name: "OneTrust", category: "functional", domains: ["onetrust.com", "onetrust.io"] },
  { name: "Netflix Assets", category: "functional", domains: ["nflxext.com", "nflximg.net", "nflxso.net"] },
  { name: "Netflix Logging", category: "functional", domains: ["logs.netflix.com", "ichnaea-web.netflix.com"] },
  { name: "Netflix Web Platform", category: "functional", domains: ["web.prod.cloud.netflix.com"] },
  { name: "Amplitude", category: "analytics", domains: ["amplitude.com", "api2.amplitude.com", "cdn.amplitude.com"] },
  { name: "Sprig", category: "analytics", domains: ["sprig.com"] },
  { name: "LogRocket", category: "analytics", domains: ["logrocket.com", "cdn.lr-ingest.com", "r.lr-ingest.io"] },
  { name: "Riskified", category: "functional", domains: ["riskified.com"] },
  { name: "AppLovin", category: "advertising", domains: ["applovin.com", "appsflyersdk.com"] },
  { name: "Prodregistryv2", category: "unknown", domains: ["prodregistryv2.org"] },
  { name: "Featureassets", category: "unknown", domains: ["featureassets.org"] },
  { name: "Mgln", category: "unknown", domains: ["mgln.ai"] },
  { name: "Tvads", category: "unknown", domains: ["tvads.ai"] }
];

const CHALLENGE_PATTERNS: Array<{ hint: string; pattern: RegExp }> = [
  { hint: "Vercel", pattern: /vercel security checkpoint|failed to verify your browser|request-challenge/i },
  { hint: "Cloudflare", pattern: /checking your browser|just a moment|attention required/i },
  { hint: "Akamai", pattern: /akamai|reference #\d+\.[\da-f]+\.[\da-f]+/i },
  { hint: "PerimeterX/HUMAN", pattern: /perimeterx|human security|press & hold|please verify you are human|access to this page has been denied/i }
];
const CHALLENGE_TITLE_PATTERNS = /checking your browser|just a moment|attention required|security check|access denied|blocked/i;

const CHALLENGE_HOST_HINTS: Array<{ hint: string; pattern: RegExp }> = [
  { hint: "Vercel", pattern: /(?:^|\.)vercel(?:-insights)?\.com$/i },
  { hint: "Cloudflare", pattern: /(?:^|\.)challenges\.cloudflare\.com$/i },
  { hint: "Akamai", pattern: /(?:^|\.)akamai(?:hd)?\.net$|(?:^|\.)edgesuite\.net$|(?:^|\.)edgekey\.net$/i },
  { hint: "PerimeterX/HUMAN", pattern: /(?:^|\.)px-cloud\.net$|(?:^|\.)px-client\.net$/i }
];

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function matchUrlToVendor(value: string) {
  const hostname = hostnameFromUrl(value);
  if (!hostname) {
    return null;
  }
  const matchedRule = VENDOR_RULES.find((rule) => rule.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)));
  return matchedRule ? { category: matchedRule.category, name: matchedRule.name } : null;
}

function normalizeHeaders(headers: Record<string, string> | null): Record<string, string> | null {
  if (!headers) {
    return null;
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

function findChallengeHostHint(records: Array<{ url: string }>): { hint: string; hostname: string } | null {
  for (const record of records) {
    const hostname = hostnameFromUrl(record.url);
    if (!hostname) {
      continue;
    }
    const match = CHALLENGE_HOST_HINTS.find((item) => item.pattern.test(hostname));
    if (match) {
      return { hint: match.hint, hostname };
    }
  }
  return null;
}

function buildBlockerEvidence(input: {
  challengeMatch: { hint: string; pattern: RegExp } | undefined;
  challengeHostHint: { hint: string; hostname: string } | null;
  headers: Record<string, string> | null;
  maxPhaseReached: PhaseReached;
  status: number | null;
}) {
  const evidence: string[] = [];
  const normalizedHeaders = input.headers;

  if (typeof input.status === "number") {
    evidence.push(`main_document_status:${input.status}`);
  }
  if (input.challengeMatch) {
    evidence.push(`challenge_pattern:${input.challengeMatch.hint}`);
  }
  if (input.challengeHostHint) {
    evidence.push(`challenge_host:${input.challengeHostHint.hostname}`);
  }
  if (normalizedHeaders?.server) {
    evidence.push(`server_header:${normalizedHeaders.server}`);
  }
  if (normalizedHeaders?.["x-vercel-mitigated"]) {
    evidence.push(`x-vercel-mitigated:${normalizedHeaders["x-vercel-mitigated"]}`);
  }
  if (normalizedHeaders?.["cf-ray"]) {
    evidence.push("cf-ray:present");
  }
  if (normalizedHeaders?.["akamai-grn"]) {
    evidence.push("akamai-grn:present");
  }
  if (input.maxPhaseReached === "third_party_signals") {
    evidence.push("runtime_reached:third_party_signals");
  }
  return evidence;
}

export function summarizeVendors(input: { requestedUrl: string; requests: RequestRecord[]; responses: ResponseRecord[] }): VendorSummary {
  const originHostname = hostnameFromUrl(input.requestedUrl);
  const domainCounts = new Map<string, number>();
  const vendorCounts = new Map<string, number>();
  const categories: Record<VendorCategory, number> = {
    advertising: 0,
    analytics: 0,
    functional: 0,
    unknown: 0
  };

  const considerUrl = (value: string) => {
    const hostname = hostnameFromUrl(value);
    if (!hostname) {
      return;
    }
    domainCounts.set(hostname, (domainCounts.get(hostname) ?? 0) + 1);
    const matchedRule = matchUrlToVendor(value);
    if (!matchedRule) {
      categories.unknown += 1;
      return;
    }
    vendorCounts.set(matchedRule.name, (vendorCounts.get(matchedRule.name) ?? 0) + 1);
    categories[matchedRule.category] += 1;
  };

  for (const request of input.requests) {
    considerUrl(request.url);
  }
  for (const response of input.responses) {
    considerUrl(response.url);
  }

  const rawDomains = [...domainCounts.keys()].sort();
  const thirdPartyDomains = rawDomains.filter((domain) => domain !== originHostname && originHostname && !domain.endsWith(`.${originHostname}`));

  return {
    categories,
    normalizedVendors: [...vendorCounts.keys()].sort(),
    rawDomains: thirdPartyDomains,
    vendorCounts: Object.fromEntries([...vendorCounts.entries()].sort((left, right) => left[0].localeCompare(right[0])))
  };
}

function derivePhase(input: {
  bodyTextExcerpt: string | null;
  hasDomContentLoaded: boolean;
  mainDocument: MainDocumentSummary;
  requests: RequestRecord[];
  vendorSummary: VendorSummary;
}): PhaseReached {
  const originUrl = input.mainDocument.url;
  const originHost = originUrl ? hostnameFromUrl(originUrl) : null;
  if (input.vendorSummary.normalizedVendors.length > 0 || input.vendorSummary.rawDomains.length > 0) {
    return "third_party_signals";
  }
  if (
    originHost &&
    input.requests.some((request) => {
      const host = hostnameFromUrl(request.url);
      return host === originHost && request.resourceType !== "document";
    })
  ) {
    return "first_party_subresources";
  }
  if (input.bodyTextExcerpt && input.bodyTextExcerpt.trim().length > 0) {
    return "html_snapshot";
  }
  if (input.hasDomContentLoaded) {
    return "dom_content_loaded";
  }
  if (input.mainDocument.url || input.mainDocument.status !== null) {
    return "main_document";
  }
  return "navigation_started";
}

function normalizeBodyText(value: string | null): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function isTrivialPlaceholderBody(value: string | null): boolean {
  const normalized = normalizeBodyText(value);
  if (!normalized) {
    return false;
  }
  return ["ok", "pong", "healthy", "healthz", "ready", "readyz"].includes(normalized);
}

function detectTransportFailure(errors: string[]) {
  const joined = errors.join("\n");
  if (/ERR_NAME_NOT_RESOLVED/i.test(joined)) {
    return {
      classification: "dns_failure" as const,
      stopReason: "DNS resolution failed before the main document responded."
    };
  }
  if (/main document response deadline exceeded/i.test(joined)) {
    return {
      classification: "origin_timeout" as const,
      stopReason: "Main document did not respond before the response deadline."
    };
  }
  if (/ERR_CONNECTION_CLOSED/i.test(joined)) {
    return {
      classification: "connection_closed" as const,
      stopReason: "Connection closed before the main document response completed."
    };
  }
  return null;
}

export function classifyRun(input: {
  bodyTextExcerpt: string | null;
  consoleMessages: RuntimeRunResult["consoleMessages"];
  errors: string[];
  finalUrl: string | null;
  hadDomContentLoaded: boolean;
  mainDocument: MainDocumentSummary;
  requestedUrl: string;
  requests: RequestRecord[];
  responses: ResponseRecord[];
  title: string | null;
  vendorSummary: VendorSummary;
}): ClassificationSummary {
  const notes: string[] = [];
  const haystack = [input.title ?? "", input.bodyTextExcerpt ?? "", input.finalUrl ?? "", ...input.errors, ...input.consoleMessages.map((entry) => entry.text)].join("\n");
  const challengeMatch = CHALLENGE_PATTERNS.find((item) => item.pattern.test(haystack));
  const challengeHostHint = findChallengeHostHint([...input.requests, ...input.responses]);
  const challengeHint = challengeMatch?.hint ?? challengeHostHint?.hint;
  const normalizedHeaders = normalizeHeaders(input.mainDocument.headers);
  const status = input.mainDocument.status;
  const maxPhaseReached = derivePhase({
    bodyTextExcerpt: input.bodyTextExcerpt,
    hasDomContentLoaded: input.hadDomContentLoaded,
    mainDocument: input.mainDocument,
    requests: input.requests,
    vendorSummary: input.vendorSummary
  });
  const requestedOrigin = hostnameFromUrl(input.requestedUrl);
  const finalOrigin = input.finalUrl ? hostnameFromUrl(input.finalUrl) : null;
  const originLikelyReached = Boolean(finalOrigin && requestedOrigin && (finalOrigin === requestedOrigin || finalOrigin.endsWith(`.${requestedOrigin}`)));
  const normalizedBodyText = normalizeBodyText(input.bodyTextExcerpt);

  if (status !== null) {
    notes.push(`Main document status ${status}.`);
  } else {
    notes.push("Main document status unavailable.");
  }
  if (challengeMatch) {
    notes.push(`Challenge indicators matched ${challengeMatch.hint}.`);
  }
  if (challengeHostHint && challengeHostHint.hint !== challengeMatch?.hint) {
    notes.push(`Challenge host ${challengeHostHint.hostname} suggests ${challengeHostHint.hint}.`);
  }
  if (normalizedHeaders?.server) {
    notes.push(`Server header ${normalizedHeaders.server}.`);
  }
  if (input.vendorSummary.normalizedVendors.length > 0) {
    notes.push(`Detected vendors: ${input.vendorSummary.normalizedVendors.join(", ")}.`);
  }

  const blockerEvidence = buildBlockerEvidence({
    challengeMatch,
    challengeHostHint,
    headers: normalizedHeaders,
    maxPhaseReached,
    status
  });

  const noBlockerSummary = {
    confidence: 0.5,
    evidence: blockerEvidence,
    outcome: "no_blocker_detected" as const,
    vendorHint: challengeHint ?? null
  };

  if (status !== null && [401, 403, 429, 503].includes(status)) {
    return {
      blockerSummary: {
        confidence: challengeHint ? 0.98 : 0.9,
        evidence: blockerEvidence,
        outcome: "hard_block",
        vendorHint: challengeHint ?? null
      },
      challengeDetected: Boolean(challengeHint),
      classifierNotes: notes,
      classification: "edge_block",
      maxPhaseReached,
      originLikelyReached,
      stopReason: `Main document returned ${status}.`,
      verificationVendorHint: challengeHint ?? null
    };
  }

  if (challengeHint) {
    const runtimeReached = maxPhaseReached === "third_party_signals";
    const titleLooksRecovered = Boolean(input.title && !CHALLENGE_TITLE_PATTERNS.test(input.title));
    const strongRuntimeDepth =
      input.vendorSummary.rawDomains.length >= 5 || input.vendorSummary.normalizedVendors.length >= 2 || input.responses.length >= 25;
    const recoveredChallengeRuntime = runtimeReached && status === 200 && titleLooksRecovered && strongRuntimeDepth;
    if (recoveredChallengeRuntime) {
      return {
        blockerSummary: {
          confidence: 0.75,
          evidence: blockerEvidence,
          outcome: "challenge_markers_runtime_reached",
          vendorHint: challengeHint
        },
        challengeDetected: true,
        classifierNotes: [...notes, "Challenge markers were present, but the runtime reached a usable post-challenge state."],
        classification: "full_runtime",
        maxPhaseReached,
        originLikelyReached,
        stopReason: `Challenge markers observed (${challengeHint}), but runtime recovered to usable page state.`,
        verificationVendorHint: challengeHint
      };
    }
    return {
      blockerSummary: {
        confidence: runtimeReached ? 0.8 : 0.95,
        evidence: blockerEvidence,
        outcome: runtimeReached ? "challenge_markers_runtime_reached" : "challenge_wall",
        vendorHint: challengeHint
      },
      challengeDetected: true,
      classifierNotes: notes,
      classification: "verification_interstitial",
      maxPhaseReached,
      originLikelyReached,
      stopReason: `Verification page detected (${challengeHint}).`,
      verificationVendorHint: challengeHint
    };
  }

  const transportFailure = detectTransportFailure(input.errors);
  if (transportFailure) {
    return {
      blockerSummary: noBlockerSummary,
      challengeDetected: false,
      classifierNotes: [...notes, transportFailure.stopReason],
      classification: transportFailure.classification,
      maxPhaseReached,
      originLikelyReached,
      stopReason: transportFailure.stopReason,
      verificationVendorHint: null
    };
  }

  if (
    originLikelyReached &&
    status === 404 &&
    input.vendorSummary.normalizedVendors.length === 0 &&
    input.vendorSummary.rawDomains.length === 0
  ) {
    return {
      blockerSummary: noBlockerSummary,
      challengeDetected: false,
      classifierNotes: [...notes, "Origin returned 404 page without meaningful runtime activity."],
      classification: "error_404",
      maxPhaseReached,
      originLikelyReached,
      stopReason: "Main document returned 404 with only thin terminal page content.",
      verificationVendorHint: null
    };
  }

  if (
    originLikelyReached &&
    status === 502 &&
    input.vendorSummary.normalizedVendors.length === 0 &&
    input.vendorSummary.rawDomains.length === 0
  ) {
    return {
      blockerSummary: noBlockerSummary,
      challengeDetected: false,
      classifierNotes: [...notes, "Origin returned 502 page without meaningful runtime activity."],
      classification: "error_502",
      maxPhaseReached,
      originLikelyReached,
      stopReason: "Main document returned 502 with only thin terminal page content.",
      verificationVendorHint: null
    };
  }

  if (!input.bodyTextExcerpt || input.bodyTextExcerpt.trim().length === 0) {
    return {
      blockerSummary: noBlockerSummary,
      challengeDetected: false,
      classifierNotes: notes,
      classification: "early_runtime",
      maxPhaseReached,
      originLikelyReached,
      stopReason: "No meaningful HTML body text was captured.",
      verificationVendorHint: null
    };
  }

  if (
    originLikelyReached &&
    status !== null &&
    status === 410 &&
    input.vendorSummary.normalizedVendors.length === 0 &&
    input.vendorSummary.rawDomains.length === 0
  ) {
    return {
      blockerSummary: noBlockerSummary,
      challengeDetected: false,
      classifierNotes: [...notes, `Origin returned terminal ${status} page without runtime activity.`],
      classification: "early_runtime",
      maxPhaseReached,
      originLikelyReached,
      stopReason: `Main document returned ${status} with only thin terminal page content.`,
      verificationVendorHint: null
    };
  }

  if (
    originLikelyReached &&
    status === 200 &&
    isTrivialPlaceholderBody(normalizedBodyText) &&
    input.vendorSummary.normalizedVendors.length === 0 &&
    input.vendorSummary.rawDomains.length === 0 &&
    input.requests.length <= 1 &&
    input.responses.length <= 1
  ) {
    return {
      blockerSummary: noBlockerSummary,
      challengeDetected: false,
      classifierNotes: [...notes, `Body matched trivial placeholder content (${normalizedBodyText}).`],
      classification: "early_runtime",
      maxPhaseReached,
      originLikelyReached,
      stopReason: "Origin responded with trivial placeholder content and no runtime activity.",
      verificationVendorHint: null
    };
  }

  if (input.vendorSummary.normalizedVendors.length > 0 || input.vendorSummary.rawDomains.length >= 2) {
    return {
      blockerSummary: noBlockerSummary,
      challengeDetected: false,
      classifierNotes: notes,
      classification: "full_runtime",
      maxPhaseReached,
      originLikelyReached,
      stopReason: "Observed meaningful third-party runtime activity.",
      verificationVendorHint: null
    };
  }

  if (input.requests.length > 3 || input.responses.length > 2) {
    return {
      blockerSummary: noBlockerSummary,
      challengeDetected: false,
      classifierNotes: notes,
      classification: "partial_html",
      maxPhaseReached,
      originLikelyReached,
      stopReason: "HTML loaded but runtime progression remained shallow.",
      verificationVendorHint: null
    };
  }

  return {
    blockerSummary: noBlockerSummary,
    challengeDetected: false,
    classifierNotes: notes,
    classification: "unknown",
    maxPhaseReached,
    originLikelyReached,
    stopReason: "Run did not cleanly match blocked, partial, or full patterns.",
    verificationVendorHint: null
  };
}
