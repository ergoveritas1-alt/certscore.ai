import type { ScanPage, ScanRuntimeArtifact, ScanSnapshot } from "@website-signal-risk-scanner/shared";

const LEGAL_PAGE_TYPES = new Set<ScanPage["pageType"]>([
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

export type AccessLimitationCode =
  | "access.blocked_by_robots"
  | "access.http_forbidden"
  | "access.bot_challenge_detected"
  | "access.auth_wall_detected"
  | "access.legal_pages_limited"
  | "access.partial_scan";

export type AccessClassification = {
  codes: AccessLimitationCode[];
  message: string;
  metadata: Record<string, unknown>;
};

function detectBotChallenge(snapshot: ScanSnapshot, runtimeArtifacts: ScanRuntimeArtifact | null | undefined) {
  if (snapshot.captchaFlag) {
    return true;
  }

  const challengeHints = [
    runtimeArtifacts?.responseHeaders?.["cf-mitigated"],
    runtimeArtifacts?.responseHeaders?.server,
    runtimeArtifacts?.responseHeaders?.["x-sucuri-block"]
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /challenge|captcha|sucuri/i.test(challengeHints);
}

export function classifyScanAccess(input: {
  pages: ScanPage[];
  runtimeArtifacts?: ScanRuntimeArtifact | null;
  snapshot: ScanSnapshot;
}): AccessClassification | null {
  const homepageForbidden =
    input.snapshot.homepageFetchStatus === "forbidden" || input.snapshot.homepageFetchHttpStatus === 403;
  const blockedByRobots = !input.snapshot.robotsAllowed;
  const botChallengeDetected = detectBotChallenge(input.snapshot, input.runtimeArtifacts);
  const authWallDetected = input.snapshot.authWallDetected;
  const limitedLegalPages = input.pages.filter(
    (page) =>
      LEGAL_PAGE_TYPES.has(page.pageType) &&
      (page.fetchStatus === "blocked" || page.fetchStatus === "forbidden" || page.fetchStatus === "skipped")
  );

  const codes: AccessLimitationCode[] = [];

  if (blockedByRobots) {
    codes.push("access.blocked_by_robots");
  }

  if (homepageForbidden) {
    codes.push("access.http_forbidden");
  }

  if (botChallengeDetected) {
    codes.push("access.bot_challenge_detected");
  }

  if (authWallDetected) {
    codes.push("access.auth_wall_detected");
  }

  if (limitedLegalPages.length > 0) {
    codes.push("access.legal_pages_limited");
  }

  if (input.snapshot.partialScan && codes.length > 0) {
    codes.push("access.partial_scan");
  }

  if (codes.length === 0) {
    return null;
  }

  const messageParts: string[] = [];

  if (blockedByRobots) {
    messageParts.push("robots policy limited crawl coverage");
  }

  if (homepageForbidden) {
    messageParts.push("homepage returned forbidden");
  }

  if (botChallengeDetected) {
    messageParts.push("bot challenge indicators detected");
  }

  if (authWallDetected) {
    messageParts.push("auth wall detected");
  }

  if (limitedLegalPages.length > 0) {
    messageParts.push(`${limitedLegalPages.length} legal page fetches were blocked, forbidden, or skipped`);
  }

  if (input.snapshot.partialScan) {
    messageParts.push("scan coverage is partial");
  }

  return {
    codes,
    message: `Access limitations detected: ${messageParts.join("; ")}.`,
    metadata: {
      authWallDetected,
      blockedFlag: input.snapshot.blockedFlag,
      botChallengeDetected,
      captchaFlag: input.snapshot.captchaFlag,
      homepageFetchHttpStatus: input.snapshot.homepageFetchHttpStatus,
      homepageFetchStatus: input.snapshot.homepageFetchStatus,
      legalPageLimitations: limitedLegalPages.map((page) => ({
        pageType: page.pageType,
        pageUrl: page.pageUrl,
        fetchStatus: page.fetchStatus
      })),
      partialScan: input.snapshot.partialScan,
      robotsAllowed: input.snapshot.robotsAllowed,
      scanConfidence: input.snapshot.scanConfidence,
      challengeHeaders: {
        cfMitigated: input.runtimeArtifacts?.responseHeaders?.["cf-mitigated"] ?? null,
        server: input.runtimeArtifacts?.responseHeaders?.server ?? null,
        xSucuriBlock: input.runtimeArtifacts?.responseHeaders?.["x-sucuri-block"] ?? null
      }
    }
  };
}
