export type ScanOutcomeCode =
  | "completed_successfully"
  | "completed_partial"
  | "content_capture_degraded"
  | "reachability_blocked_homepage_403"
  | "reachability_blocked_homepage_401"
  | "reachability_blocked_challenge_suspected"
  | "reachability_blocked_captcha"
  | "reachability_blocked_auth_wall"
  | "reachability_blocked_geo_or_reputation"
  | "transport_failure"
  | "robots_restricted"
  | "timeout_navigation"
  | "unknown_access_limitation"
  | "domain_inactive_or_unstable"
  | "fallback_source_confirmed"
  | "verification_incomplete";

export type ScanStopReasonCode =
  | "content_capture_degraded"
  | "reachability_blocked_homepage_403"
  | "reachability_blocked_homepage_401"
  | "reachability_blocked_challenge_suspected"
  | "reachability_blocked_captcha"
  | "reachability_blocked_auth_wall"
  | "reachability_blocked_geo_or_reputation"
  | "homepage_rate_limited_429"
  | "transport_failure"
  | "robots_restricted"
  | "timeout_navigation"
  | "unknown_access_limitation"
  | "inactive_or_unstable"
  | "fallback_source_confirmed"
  | "no_pages_scanned";

export type BlockVendorGuess = "akamai" | "cloudflare" | "fastly" | "imperva" | "unknown";

export type BlockPageClassification =
  | "vendor_interstitial_probable"
  | "plain_origin_403"
  | "login_wall_probable"
  | "captcha_probable"
  | "empty_or_thin_block_page"
  | "unknown_block_page";

export type ContentLengthBucket = "empty" | "thin" | "medium" | "large";

export type RetainedBlockDiagnostics = {
  egressId?: string | null;
  egressType?: string | null;
  publicIpHash?: string | null;
  asn?: number | null;
  region?: string | null;
  userAgentFamily?: string | null;
  browserEngine?: string | null;
  headlessMode?: string | null;
  playwrightVersion?: string | null;
  chromiumVersion?: string | null;
  initialRequestMode?: string | null;
  homepageAttemptCount?: number | null;
  passiveVerificationAttemptCount?: number | null;
  staticFetchConcurrency?: number | null;
  domainRiskProfile?: string | null;
  homepageHttpStatus?: number | null;
  robotsHttpStatus?: number | null;
  finalUrl?: string | null;
  serverHeader?: string | null;
  cfRayPresent?: boolean | null;
  akamaiMarkerPresent?: boolean | null;
  captchaMarkerPresent?: boolean | null;
  interstitialMarkerPresent?: boolean | null;
  normalizedBodyTitle?: string | null;
  normalizedBodyHash?: string | null;
  setCookieNames?: string[] | null;
  blockVendorGuess?: BlockVendorGuess | null;
  challengeSuspected?: boolean | null;
  authWallSuspected?: boolean | null;
  rateLimitSuspected?: boolean | null;
  geoBlockSuspected?: boolean | null;
  fingerprintBlockSuspected?: boolean | null;
  blockPageClassification?: BlockPageClassification | null;
};

export type BlockClassifierInput = {
  title?: string | null;
  normalizedTextExcerpt?: string | null;
  contentLength?: number | null;
  headers?: Record<string, string | null | undefined> | null;
  serverHeader?: string | null;
  body?: string | null;
  cfRayPresent?: boolean | null;
  akamaiMarkerPresent?: boolean | null;
  captchaMarkerPresent?: boolean | null;
  interstitialMarkerPresent?: boolean | null;
};

export type BlockClassifierResult = {
  classification: BlockPageClassification;
  contentLengthBucket: ContentLengthBucket;
  challengeSuspected: boolean;
  authWallSuspected: boolean;
  geoBlockSuspected: boolean;
  fingerprintBlockSuspected: boolean;
  interstitialMarkerPresent: boolean;
  captchaMarkerPresent: boolean;
  vendorGuess: BlockVendorGuess;
};

export type AccessLimitationInput = {
  accessPostureClass?: string | null;
  authWallDetected?: boolean | null;
  blockedFlag?: boolean | null;
  captchaFlag?: boolean | null;
  fallbackSourceLabel?: string | null;
  fallbackSourceReason?: string | null;
  homepageFetchHttpStatus?: number | null;
  homepageFetchStatus?: string | null;
  pagesScanned?: number | null;
  normalizedBodyMissing?: boolean | null;
  robotsAllowed?: boolean | null;
  robotsFetchHttpStatus?: number | null;
  robotsFetchStatus?: string | null;
  blockPageClassification?: BlockPageClassification | null;
  blockVendorGuess?: BlockVendorGuess | null;
  challengeSuspected?: boolean | null;
  authWallSuspected?: boolean | null;
  rateLimitSuspected?: boolean | null;
  geoBlockSuspected?: boolean | null;
  fingerprintBlockSuspected?: boolean | null;
};

export type AccessLimitationOutcome = {
  kind: ScanStopReasonCode;
  outcome: ScanOutcomeCode;
  outcomeTitle: string;
  previewFindingTitle: string;
  reason: string;
  reviewMessage: string;
  reviewTitle: string;
  whatThisMeans: string[];
};

export type RetryPolicyInput = {
  accessPostureClass?: string | null;
  homepageHttpStatus?: number | null;
  homepageFetchStatus?: string | null;
  normalizedBodyMissing?: boolean | null;
  pagesScanned?: number | null;
  blockedFlag?: boolean | null;
  transportFailure?: boolean | null;
  blockPageClassification?: BlockPageClassification | null;
  authWallSuspected?: boolean | null;
  challengeSuspected?: boolean | null;
  repeated403Cluster?: boolean | null;
  rateLimitSuspected?: boolean | null;
};

export type RetryPolicyDecision = {
  cooldownHours: number;
  maxPassiveVerificationUrls: number;
  retryRecommended: boolean;
  stopHomepageRetry: boolean;
};

export type EgressRiskObservation = {
  blockedHomepage403DistinctDomainsLastHour: number;
};

export type EgressRiskDecision = {
  concurrency: number;
  highBlockRiskMode: boolean;
  launchJitterMs: {
    min: number;
    max: number;
  };
  suppressNonEssentialRescans: boolean;
};

const CHALLENGE_PHRASES = [
  "verify you are human",
  "verify you’re human",
  "checking your browser before accessing",
  "just a moment",
  "attention required",
  "enable javascript and cookies",
  "press and hold",
  "security check",
  "ddos protection by",
  "bot verification"
];

const CAPTCHA_PHRASES = [
  "captcha",
  "recaptcha",
  "hcaptcha",
  "i am human",
  "prove you are human"
];

const LOGIN_PHRASES = [
  "sign in",
  "log in",
  "login required",
  "member access",
  "account required",
  "please authenticate",
  "authentication required"
];

const GEO_PHRASES = [
  "not available in your region",
  "access from your location",
  "unavailable in your country",
  "geo restricted",
  "not available in this location"
];

const FINGERPRINT_PHRASES = [
  "unusual traffic",
  "automated queries",
  "browser integrity",
  "suspicious activity",
  "request could not be satisfied"
];

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9\s:/._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnyPhrase(haystack: string, phrases: string[]) {
  return phrases.some((phrase) => haystack.includes(phrase));
}

function getContentLengthBucket(length: number | null | undefined): ContentLengthBucket {
  const value = typeof length === "number" && Number.isFinite(length) ? length : 0;
  if (value <= 24) {
    return "empty";
  }
  if (value < 512) {
    return "thin";
  }
  if (value < 2_048) {
    return "medium";
  }
  return "large";
}

function normalizeHeaders(headers: Record<string, string | null | undefined> | null | undefined) {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (typeof value === "string" && value.trim().length > 0) {
      normalized[key.toLowerCase()] = value.trim().toLowerCase();
    }
  }
  return normalized;
}

export function classifyBlockedResponse(input: BlockClassifierInput): BlockClassifierResult {
  const normalizedTitle = normalizeText(input.title);
  const normalizedExcerpt = normalizeText(input.normalizedTextExcerpt);
  const normalizedBody = normalizeText(input.body);
  const joinedText = [normalizedTitle, normalizedExcerpt, normalizedBody].filter(Boolean).join(" ");
  const headers = normalizeHeaders(input.headers);
  const serverHeader = normalizeText(input.serverHeader ?? headers.server);
  const cfRayPresent =
    input.cfRayPresent === true || typeof headers["cf-ray"] === "string" || joinedText.includes("cloudflare");
  const akamaiMarkerPresent =
    input.akamaiMarkerPresent === true ||
    joinedText.includes("akamai") ||
    Object.keys(headers).some((key) => key.startsWith("akamai"));
  const impervaPresent = joinedText.includes("imperva") || joinedText.includes("incapsula");
  const fastlyPresent = serverHeader.includes("fastly") || joinedText.includes("fastly");
  const interstitialMarkerPresent =
    input.interstitialMarkerPresent === true ||
    hasAnyPhrase(joinedText, CHALLENGE_PHRASES) ||
    cfRayPresent ||
    akamaiMarkerPresent ||
    impervaPresent;
  const captchaMarkerPresent =
    input.captchaMarkerPresent === true || hasAnyPhrase(joinedText, CAPTCHA_PHRASES);
  const authWallSuspected = hasAnyPhrase(joinedText, LOGIN_PHRASES);
  const challengeSuspected = interstitialMarkerPresent || hasAnyPhrase(joinedText, FINGERPRINT_PHRASES);
  const geoBlockSuspected = hasAnyPhrase(joinedText, GEO_PHRASES);
  const fingerprintBlockSuspected = hasAnyPhrase(joinedText, FINGERPRINT_PHRASES);
  const contentLengthBucket = getContentLengthBucket(input.contentLength ?? joinedText.length);

  const vendorGuess: BlockVendorGuess =
    cfRayPresent || serverHeader.includes("cloudflare")
      ? "cloudflare"
      : akamaiMarkerPresent || serverHeader.includes("akamai")
        ? "akamai"
        : fastlyPresent
          ? "fastly"
          : impervaPresent || serverHeader.includes("imperva")
            ? "imperva"
            : "unknown";

  let classification: BlockPageClassification = "unknown_block_page";

  if (captchaMarkerPresent) {
    classification = "captcha_probable";
  } else if (authWallSuspected) {
    classification = "login_wall_probable";
  } else if (interstitialMarkerPresent) {
    classification = "vendor_interstitial_probable";
  } else if (contentLengthBucket === "empty" || contentLengthBucket === "thin") {
    classification = "empty_or_thin_block_page";
  } else if (joinedText.includes("403") || joinedText.includes("forbidden") || joinedText.includes("access denied")) {
    classification = "plain_origin_403";
  }

  return {
    classification,
    contentLengthBucket,
    challengeSuspected,
    authWallSuspected,
    geoBlockSuspected,
    fingerprintBlockSuspected,
    interstitialMarkerPresent,
    captchaMarkerPresent,
    vendorGuess
  };
}

function buildBlockedWhatThisMeans() {
  return [
    "The scanner did not verify a trustworthy public homepage surface for this run.",
    "This does not by itself mean expected disclosures are absent.",
    "Use the retained diagnostics to distinguish site protection, transport failure, and incomplete coverage."
  ];
}

function normalizeStatus(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasKnownAccessBlockSignal(input: {
  accessPostureClass?: string | null;
  authWallDetected?: boolean | null;
  authWallSuspected?: boolean | null;
  blockedFlag?: boolean | null;
  blockPageClassification?: BlockPageClassification | null;
  captchaFlag?: boolean | null;
  challengeSuspected?: boolean | null;
  geoBlockSuspected?: boolean | null;
  fingerprintBlockSuspected?: boolean | null;
  homepageFetchHttpStatus?: number | null;
  homepageFetchStatus?: string | null;
  rateLimitSuspected?: boolean | null;
}) {
  const accessPostureClass = normalizeStatus(input.accessPostureClass);
  const homepageFetchStatus = normalizeStatus(input.homepageFetchStatus);
  const homepageFetchHttpStatus = getFiniteNumber(input.homepageFetchHttpStatus);
  const reachedUsefulOrigin =
    (accessPostureClass === "tolerant" || accessPostureClass === "degraded_but_useful") &&
    homepageFetchStatus === "ok" &&
    homepageFetchHttpStatus !== 401 &&
    homepageFetchHttpStatus !== 403 &&
    homepageFetchHttpStatus !== 429 &&
    input.blockedFlag !== true &&
    input.authWallDetected !== true &&
    input.authWallSuspected !== true &&
    input.captchaFlag !== true &&
    input.challengeSuspected !== true &&
    input.geoBlockSuspected !== true &&
    input.fingerprintBlockSuspected !== true &&
    input.rateLimitSuspected !== true;
  const blockPageClassification = reachedUsefulOrigin && (
    input.blockPageClassification === "login_wall_probable" ||
    input.blockPageClassification === "vendor_interstitial_probable"
  )
    ? null
    : input.blockPageClassification;

  return (
    input.authWallDetected === true ||
    input.authWallSuspected === true ||
    input.blockedFlag === true ||
    input.captchaFlag === true ||
    input.challengeSuspected === true ||
    input.geoBlockSuspected === true ||
    input.fingerprintBlockSuspected === true ||
    input.rateLimitSuspected === true ||
    blockPageClassification === "captcha_probable" ||
    blockPageClassification === "login_wall_probable" ||
    blockPageClassification === "vendor_interstitial_probable" ||
    homepageFetchHttpStatus === 401 ||
    homepageFetchHttpStatus === 403 ||
    homepageFetchHttpStatus === 429 ||
    homepageFetchStatus === "forbidden" ||
    homepageFetchStatus === "blocked"
  );
}

function isContentCaptureDegraded(input: {
  accessPostureClass?: string | null;
  authWallDetected?: boolean | null;
  authWallSuspected?: boolean | null;
  blockedFlag?: boolean | null;
  blockPageClassification?: BlockPageClassification | null;
  captchaFlag?: boolean | null;
  challengeSuspected?: boolean | null;
  fingerprintBlockSuspected?: boolean | null;
  geoBlockSuspected?: boolean | null;
  homepageFetchHttpStatus?: number | null;
  homepageFetchStatus?: string | null;
  normalizedBodyMissing?: boolean | null;
  pagesScanned?: number | null;
  rateLimitSuspected?: boolean | null;
}) {
  const homepageFetchStatus = normalizeStatus(input.homepageFetchStatus);
  const homepageFetchHttpStatus = getFiniteNumber(input.homepageFetchHttpStatus);
  const pagesScanned = getFiniteNumber(input.pagesScanned);
  const accessPostureClass = normalizeStatus(input.accessPostureClass);

  return (
    input.normalizedBodyMissing === true &&
    (pagesScanned ?? 0) > 0 &&
    homepageFetchStatus === "ok" &&
    !hasKnownAccessBlockSignal({
      authWallDetected: input.authWallDetected,
      authWallSuspected: input.authWallSuspected,
      accessPostureClass,
      blockedFlag: input.blockedFlag,
      blockPageClassification: input.blockPageClassification,
      captchaFlag: input.captchaFlag,
      challengeSuspected: input.challengeSuspected,
      fingerprintBlockSuspected: input.fingerprintBlockSuspected,
      geoBlockSuspected: input.geoBlockSuspected,
      homepageFetchHttpStatus,
      homepageFetchStatus,
      rateLimitSuspected: input.rateLimitSuspected
    }) &&
    (accessPostureClass === "tolerant" ||
      accessPostureClass === "degraded_but_useful" ||
      accessPostureClass === "unknown" ||
      accessPostureClass === null ||
      input.blockPageClassification === "empty_or_thin_block_page")
  );
}

export function deriveAccessLimitationOutcome(input: AccessLimitationInput): AccessLimitationOutcome | null {
  const fallbackSourceLabel = typeof input.fallbackSourceLabel === "string" ? input.fallbackSourceLabel.trim() : "";
  const fallbackSourceReason = typeof input.fallbackSourceReason === "string" ? input.fallbackSourceReason.trim() : "";
  const homepageFetchStatus = normalizeStatus(input.homepageFetchStatus);
  const homepageFetchHttpStatus = getFiniteNumber(input.homepageFetchHttpStatus);
  const pagesScanned = getFiniteNumber(input.pagesScanned);
  const normalizedBodyMissing = input.normalizedBodyMissing === true;
  const accessPostureClass = normalizeStatus(input.accessPostureClass);
  const robotsAllowed = input.robotsAllowed === true ? true : input.robotsAllowed === false ? false : null;
  const robotsFetchStatus = normalizeStatus(input.robotsFetchStatus);
  const robotsFetchHttpStatus = getFiniteNumber(input.robotsFetchHttpStatus);
  const challengeSuspected = input.challengeSuspected === true;
  const authWallSuspected = input.authWallSuspected === true;
  const geoBlockSuspected = input.geoBlockSuspected === true;
  const blockedWhatThisMeans = buildBlockedWhatThisMeans();
  const reachedUsefulOrigin =
    (accessPostureClass === "tolerant" || accessPostureClass === "degraded_but_useful") &&
    homepageFetchStatus === "ok" &&
    homepageFetchHttpStatus !== 401 &&
    homepageFetchHttpStatus !== 403 &&
    homepageFetchHttpStatus !== 429 &&
    input.blockedFlag !== true &&
    input.authWallDetected !== true &&
    !authWallSuspected &&
    input.captchaFlag !== true &&
    !challengeSuspected &&
    !geoBlockSuspected &&
    input.fingerprintBlockSuspected !== true &&
    input.rateLimitSuspected !== true &&
    (pagesScanned ?? 0) > 0;
  const blockPageClassification = reachedUsefulOrigin && (
    input.blockPageClassification === "login_wall_probable" ||
    input.blockPageClassification === "vendor_interstitial_probable"
  )
    ? null
    : input.blockPageClassification;

  if (fallbackSourceLabel && fallbackSourceReason) {
    return {
      kind: "fallback_source_confirmed",
      outcome: "fallback_source_confirmed",
      outcomeTitle: "Fallback source confirmed",
      previewFindingTitle: "Authoritative fallback source confirmed",
      reason: `Reason: ${fallbackSourceReason}`,
      reviewMessage: `Primary homepage verification did not complete, but ${fallbackSourceLabel} confirms the property or content through an authoritative alternate source.`,
      reviewTitle: "Fallback source confirmed",
      whatThisMeans: [
        "The primary site path did not verify cleanly during this run.",
        "An authoritative alternate source confirms the property or content still exists.",
        "Treat the fallback confirmation as source-specific context, not as proof that the primary domain was fully reachable."
      ]
    };
  }

  if (robotsAllowed === false) {
    return {
      kind: "robots_restricted",
      outcome: "robots_restricted",
      outcomeTitle: "Access limited by site protections",
      previewFindingTitle: "Robots policy blocked live scan access",
      reason:
        robotsFetchStatus === "ok"
          ? "Reason: robots.txt disallowed scanner access to the homepage."
          : robotsFetchHttpStatus
            ? `Reason: crawler access was blocked by robots handling with HTTP ${robotsFetchHttpStatus} before homepage verification.`
            : "Reason: crawler access was disallowed by robots policy before homepage verification.",
      reviewMessage:
        "Public crawler access was restricted before homepage verification, so this run did not produce a trustworthy public-site review.",
      reviewTitle: "Access limited by site protections",
      whatThisMeans: blockedWhatThisMeans
    };
  }

  if (input.captchaFlag === true || blockPageClassification === "captcha_probable") {
    return {
      kind: "reachability_blocked_captcha",
      outcome: "reachability_blocked_captcha",
      outcomeTitle: "Access limited by site protections",
      previewFindingTitle: "Bot challenge blocked homepage verification",
      reason: "Reason: the homepage triggered a captcha or bot challenge before the scanner could verify a usable public page surface.",
      reviewMessage: "This run could not fully verify public pages because the site presented a captcha or bot challenge to the scan environment.",
      reviewTitle: "Access limited by site protections",
      whatThisMeans: blockedWhatThisMeans
    };
  }

  if (input.authWallDetected === true || authWallSuspected || blockPageClassification === "login_wall_probable") {
    return {
      kind: "reachability_blocked_auth_wall",
      outcome: "reachability_blocked_auth_wall",
      outcomeTitle: "Access limited by site protections",
      previewFindingTitle: "Authentication wall blocked homepage verification",
      reason: "Reason: the homepage presented an authentication wall before the scanner could verify a usable public page surface.",
      reviewMessage: "This run could not fully verify public pages because the site presented an authentication wall to the scan environment.",
      reviewTitle: "Access limited by site protections",
      whatThisMeans: blockedWhatThisMeans
    };
  }

  if (homepageFetchHttpStatus === 401) {
    return {
      kind: "reachability_blocked_homepage_401",
      outcome: "reachability_blocked_homepage_401",
      outcomeTitle: "Access limited by site protections",
      previewFindingTitle: "Homepage access required authorization",
      reason: "Reason: homepage returned HTTP 401 Unauthorized before the scanner could verify a usable public page surface.",
      reviewMessage: "This run could not fully verify public pages because the homepage required authorization from the scan environment.",
      reviewTitle: "Access limited by site protections",
      whatThisMeans: blockedWhatThisMeans
    };
  }

  if (geoBlockSuspected || input.fingerprintBlockSuspected === true) {
    return {
      kind: "reachability_blocked_geo_or_reputation",
      outcome: "reachability_blocked_geo_or_reputation",
      outcomeTitle: "Access limited by site protections",
      previewFindingTitle: "Homepage limited by geo or reputation controls",
      reason: "Reason: the site likely limited access based on region, IP reputation, or browser fingerprint before public verification completed.",
      reviewMessage: "This run could not fully verify public pages because the site appears to limit automated access based on region, reputation, or fingerprint signals.",
      reviewTitle: "Access limited by site protections",
      whatThisMeans: blockedWhatThisMeans
    };
  }

  if (challengeSuspected || blockPageClassification === "vendor_interstitial_probable") {
    return {
      kind: "reachability_blocked_challenge_suspected",
      outcome: "reachability_blocked_challenge_suspected",
      outcomeTitle: "Access limited by site protections",
      previewFindingTitle: "Homepage challenge suspected",
      reason: "Reason: the homepage appeared to serve an interstitial or anti-bot challenge before the scanner could verify a usable public page surface.",
      reviewMessage: "This run could not fully verify public pages because the site likely served a bot-management or challenge interstitial to the scan environment.",
      reviewTitle: "Access limited by site protections",
      whatThisMeans: blockedWhatThisMeans
    };
  }

  if (homepageFetchHttpStatus === 429 || input.rateLimitSuspected === true) {
    return {
      kind: "homepage_rate_limited_429",
      outcome: "unknown_access_limitation",
      outcomeTitle: "Access limited by site protections",
      previewFindingTitle: "Homepage rate-limited during live scan",
      reason: "Reason: homepage request was rate-limited with HTTP 429 before the scanner could verify a usable page surface.",
      reviewMessage: "This run could not fully verify public pages because the site rate-limited automated access from the scan environment.",
      reviewTitle: "Access limited by site protections",
      whatThisMeans: blockedWhatThisMeans
    };
  }

  if (homepageFetchHttpStatus === 403 || homepageFetchStatus === "forbidden" || homepageFetchStatus === "blocked" || input.blockedFlag === true) {
    return {
      kind: "reachability_blocked_homepage_403",
      outcome: "reachability_blocked_homepage_403",
      outcomeTitle: "Access limited by site protections",
      previewFindingTitle: "Homepage blocked during live scan",
      reason: homepageFetchHttpStatus
        ? `Reason: homepage request was blocked with HTTP ${homepageFetchHttpStatus}.`
        : "Reason: homepage request was blocked by bot protection, access controls, or a forbidden response.",
      reviewMessage:
        "This run could not fully verify public pages because the site limited automated access from the scan environment.",
      reviewTitle: "Access limited by site protections",
      whatThisMeans: blockedWhatThisMeans
    };
  }

  if (homepageFetchStatus === "not_found") {
    return {
      kind: "inactive_or_unstable",
      outcome: "domain_inactive_or_unstable",
      outcomeTitle: "Domain inactive or unstable",
      previewFindingTitle: "Homepage may be inactive or unstable",
      reason: homepageFetchHttpStatus
        ? `Reason: homepage returned HTTP ${homepageFetchHttpStatus} Not Found.`
        : "Reason: homepage returned a not-found response.",
      reviewMessage:
        "Homepage fetch did not resolve to a usable public page, which can indicate domain inactivity, shutdown, or unstable site state rather than a simple scan miss.",
      reviewTitle: "Domain inactive or unstable",
      whatThisMeans: [
        "The primary domain did not resolve to a usable public homepage during this run.",
        "This can reflect shutdown, abandonment, domain decay, or unstable hosting.",
        "Treat the result as site-state risk, not as evidence that the scanner reviewed the full public surface."
      ]
    };
  }

  if (homepageFetchStatus === "timeout") {
    return {
      kind: "timeout_navigation",
      outcome: "timeout_navigation",
      outcomeTitle: "Transport failure",
      previewFindingTitle: "Homepage could not be reached reliably",
      reason: "Reason: homepage navigation timed out before the scanner could verify a usable page surface.",
      reviewMessage:
        "Homepage fetch failed for this scan path because the site could not be reached reliably over the network, so this run does not support ordinary compliance conclusions.",
      reviewTitle: "Transport failure",
      whatThisMeans: buildBlockedWhatThisMeans()
    };
  }

  if (homepageFetchStatus === "error") {
    return {
      kind: "transport_failure",
      outcome: "transport_failure",
      outcomeTitle: "Transport failure",
      previewFindingTitle: "Homepage could not be reached reliably",
      reason: "Reason: homepage could not be reached reliably because of a connection, DNS, TLS, or other transport failure.",
      reviewMessage:
        "Homepage fetch failed for this scan path because the site could not be reached reliably over the network, so this run does not support ordinary compliance conclusions.",
      reviewTitle: "Transport failure",
      whatThisMeans: buildBlockedWhatThisMeans()
    };
  }

  if (
    isContentCaptureDegraded({
      accessPostureClass,
      authWallDetected: input.authWallDetected,
      authWallSuspected,
      blockedFlag: input.blockedFlag,
      blockPageClassification,
      captchaFlag: input.captchaFlag,
      challengeSuspected,
      fingerprintBlockSuspected: input.fingerprintBlockSuspected,
      geoBlockSuspected,
      homepageFetchHttpStatus,
      homepageFetchStatus,
      normalizedBodyMissing,
      pagesScanned,
      rateLimitSuspected: input.rateLimitSuspected
    })
  ) {
    return {
      kind: "content_capture_degraded",
      outcome: "content_capture_degraded",
      outcomeTitle: "Content capture degraded",
      previewFindingTitle: "Homepage content was not retained cleanly",
      reason:
        "Reason: homepage fetch succeeded, but the run did not retain a usable normalized homepage body for downstream review.",
      reviewMessage:
        "This run reached the homepage but did not retain enough normalized homepage content to support ordinary review conclusions, so findings may understate what was actually present on the site.",
      reviewTitle: "Content capture degraded",
      whatThisMeans: [
        "The scanner reached the homepage, but the retained content artifacts were incomplete for review.",
        "This is different from a bot block or transport failure.",
        "Retry the run or inspect scanner-side content retention before treating missing findings as meaningful absence."
      ]
    };
  }

  if (pagesScanned === 0) {
    return {
      kind: "unknown_access_limitation",
      outcome: "unknown_access_limitation",
      outcomeTitle: "Access limited by site protections",
      previewFindingTitle: "No verified public pages were captured",
      reason: "Reason: no specific reachability blocker was retained for this run.",
      reviewMessage:
        "This run could not fully verify public pages and did not retain a more specific access-limitation reason.",
      reviewTitle: "Access limited by site protections",
      whatThisMeans: blockedWhatThisMeans
    };
  }

  return null;
}

export function deriveRetryPolicy(input: RetryPolicyInput): RetryPolicyDecision {
  const cleanHomepageButMissingBody = isContentCaptureDegraded({
    accessPostureClass: input.accessPostureClass,
    blockedFlag: input.blockedFlag,
    authWallSuspected: input.authWallSuspected,
    blockPageClassification: input.blockPageClassification,
    challengeSuspected: input.challengeSuspected,
    homepageFetchHttpStatus: input.homepageHttpStatus,
    homepageFetchStatus: input.homepageFetchStatus,
    normalizedBodyMissing: input.normalizedBodyMissing,
    pagesScanned: input.pagesScanned,
    rateLimitSuspected: input.rateLimitSuspected
  });

  if (cleanHomepageButMissingBody) {
    return {
      cooldownHours: 2,
      maxPassiveVerificationUrls: 4,
      retryRecommended: true,
      stopHomepageRetry: false
    };
  }

  if (input.transportFailure === true) {
    return {
      cooldownHours: 2,
      maxPassiveVerificationUrls: 4,
      retryRecommended: true,
      stopHomepageRetry: false
    };
  }

  if (input.homepageHttpStatus === 429 || input.rateLimitSuspected === true) {
    return {
      cooldownHours: 8,
      maxPassiveVerificationUrls: 4,
      retryRecommended: false,
      stopHomepageRetry: true
    };
  }

  if (input.homepageHttpStatus === 403) {
    return {
      cooldownHours: input.challengeSuspected === true || input.repeated403Cluster === true ? 24 : 12,
      maxPassiveVerificationUrls: 4,
      retryRecommended: false,
      stopHomepageRetry: true
    };
  }

  return {
    cooldownHours: 6,
    maxPassiveVerificationUrls: 4,
    retryRecommended: false,
    stopHomepageRetry: false
  };
}

export function deriveEgressRiskDecision(input: EgressRiskObservation): EgressRiskDecision {
  const highBlockRiskMode = input.blockedHomepage403DistinctDomainsLastHour >= 5;
  return {
    concurrency: highBlockRiskMode ? 1 : 4,
    highBlockRiskMode,
    launchJitterMs: highBlockRiskMode ? { min: 15_000, max: 90_000 } : { min: 1_000, max: 10_000 },
    suppressNonEssentialRescans: highBlockRiskMode
  };
}
