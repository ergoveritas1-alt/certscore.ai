import type { AutoDecisionReason } from "./core/types";

export type BrowserPassResult = {
  challengeLikeSignalsDetected: boolean;
  cookieCountTotal: number | null;
  finalDocumentStatus: number | null;
  hybridRuntimeEvidence: {
    networkSummary: {
      totalRequestCount: number;
    };
  } | null;
  initialDocumentStatus: number | null;
  originLikelyReached: boolean;
  thirdPartyRequestDomains: string[];
  timedOut: boolean;
  trackerVendors: Array<{
    vendorName: string;
  }>;
};

export type HybridAutoDecision = {
  detail: string;
  reason: AutoDecisionReason;
  shouldEscalate: boolean;
};

const CHALLENGE_INFRA_HOST_PATTERNS = [
  /(?:^|\.)cloudflare(?:insights)?\.com$/i,
  /(?:^|\.)cloudflarechallenge\.com$/i,
  /(?:^|\.)challenges\.cloudflare\.com$/i,
  /(?:^|\.)turnstile\.com$/i,
  /(?:^|\.)cf-chl-bypass\.com$/i,
  /(?:^|\.)arkoselabs\.com$/i,
  /(?:^|\.)funcaptcha\.com$/i,
  /(?:^|\.)hcaptcha\.com$/i,
  /(?:^|\.)recaptcha\.net$/i,
  /(?:^|\.)google\.com$/i,
  /(?:^|\.)datadome\.co$/i,
  /(?:^|\.)datadome\.com$/i,
  /(?:^|\.)perimeterx\.net$/i,
  /(?:^|\.)humansecurity\.com$/i
];

function detectChallengeInfraHost(hostnames: string[]) {
  return hostnames.find((hostname) => CHALLENGE_INFRA_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) ?? null;
}

// Keep this logic aligned with the scanner's canonical hybrid browser-pass decision rules until a shared package exists.
export function getHybridAutoDecision(pass: BrowserPassResult): HybridAutoDecision {
  const mainStatus = pass.finalDocumentStatus ?? pass.initialDocumentStatus;
  const cookieCount = pass.cookieCountTotal ?? 0;
  const vendorCount = new Set(pass.trackerVendors.map((tracker) => tracker.vendorName)).size;
  const thirdPartyDomainCount = pass.thirdPartyRequestDomains.length;
  const requestCount = pass.hybridRuntimeEvidence?.networkSummary.totalRequestCount ?? 0;
  const challengeInfraHost = detectChallengeInfraHost(pass.thirdPartyRequestDomains);
  const healthyFullRuntime =
    !pass.timedOut &&
    mainStatus === 200 &&
    pass.originLikelyReached &&
    (thirdPartyDomainCount >= 4 || cookieCount >= 4 || vendorCount >= 2 || requestCount >= 40);
  const likelyThinRuntime = pass.timedOut || (requestCount <= 20 && thirdPartyDomainCount <= 1);
  const thinSuccessfulRuntime =
    mainStatus === 200 &&
    ((thirdPartyDomainCount <= 2 && cookieCount === 0) ||
      (thirdPartyDomainCount <= 2 && vendorCount <= 1) ||
      (thirdPartyDomainCount <= 2 && cookieCount <= 1 && vendorCount <= 1));

  // Branch order matters:
  // 1. explicit challenge-like signals outrank generic thin-runtime heuristics
  // 2. thin-success should win before origin-not-reached when a 200 response still looks suspiciously shallow
  // 3. healthy full runtimes suppress escalation even if challenge infrastructure appeared transiently
  if (pass.challengeLikeSignalsDetected && !healthyFullRuntime) {
    return {
      detail: challengeInfraHost
        ? `Challenge-like runtime observed and challenge-related host was seen: ${challengeInfraHost}.`
        : "Challenge-like runtime observed during the local pass.",
      reason: "verification_interstitial",
      shouldEscalate: true
    };
  }

  if (likelyThinRuntime) {
    return {
      detail: challengeInfraHost
        ? `Local pass stayed too thin and challenge-related host was seen: ${challengeInfraHost}.`
        : "Local pass did not collect enough runtime depth.",
      reason: "thin_runtime",
      shouldEscalate: true
    };
  }

  if (thinSuccessfulRuntime) {
    return {
      detail: "Local pass reached 200 but vendor/cookie depth stayed suspiciously low.",
      reason: "thin_success",
      shouldEscalate: true
    };
  }

  if (mainStatus && [401, 403, 429, 503].includes(mainStatus)) {
    return {
      detail: `Local main document returned ${mainStatus}.`,
      reason: "http_block_status",
      shouldEscalate: true
    };
  }

  if (!pass.originLikelyReached && !healthyFullRuntime) {
    return {
      detail: "Local pass did not appear to reach the requested origin cleanly.",
      reason: "origin_not_reached",
      shouldEscalate: true
    };
  }

  return {
    detail: "Local pass looked healthy enough to keep as final.",
    reason: "not_needed",
    shouldEscalate: false
  };
}
