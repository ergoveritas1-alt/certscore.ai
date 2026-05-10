import type { CertScoreFinding } from "./finding-registry";

export type ExecutivePosture = "Clear" | "Watch" | "Action Needed";
export type ExecutiveDisplayState = ExecutivePosture | "Limited review";

export type HostResolutionCategory = "same_host" | "same_site_alias" | "off_origin_landing";

export type CalibrationFindingSummary = {
  confidence: CertScoreFinding["confidence"];
  id: string;
  label: string;
  severity: CertScoreFinding["severity"];
  shortSummary: string;
};

export type ScanCalibrationSummary = {
  coverage: {
    coverageLevel: string | null;
    legalCoverageScore: number | null;
    pagesScanned: number | null;
    policyEnrichmentCount: number | null;
    scanOutcome: string | null;
    verifiedPublicSurfacesCount: number | null;
  };
  domain: string | null;
  executive: {
    findingsHeading: string;
    headline: string;
    hostResolutionCategory: HostResolutionCategory;
    limitedCoverage: boolean;
    displayState: ExecutiveDisplayState;
    posture: ExecutivePosture;
    summaryLabel: string;
    summaryMessage: string;
  };
  finalHost: string | null;
  landedOnDifferentHost: boolean;
  requestedHost: string | null;
  scanId: string | null;
  status: string | null;
  topFindings: CalibrationFindingSummary[];
};

function deriveHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.hostname || null;
  } catch {
    return value.includes("/") ? null : value;
  }
}

export function normalizeComparableHost(value: string | null | undefined) {
  const host = deriveHostname(value);
  return host ? host.toLowerCase().replace(/^www\./, "") : null;
}

export function deriveHostResolutionCategory(input: {
  finalHost: string | null;
  requestedHost: string | null;
}) {
  const normalizedRequestedHost = normalizeComparableHost(input.requestedHost);
  const normalizedFinalHost = normalizeComparableHost(input.finalHost);

  if (!normalizedRequestedHost || !normalizedFinalHost) {
    return "same_host" as const;
  }

  if (normalizedRequestedHost !== normalizedFinalHost) {
    return "off_origin_landing" as const;
  }

  const requestedHost = deriveHostname(input.requestedHost);
  const finalHost = deriveHostname(input.finalHost);

  if (requestedHost && finalHost && requestedHost.toLowerCase() !== finalHost.toLowerCase()) {
    return "same_site_alias" as const;
  }

  return "same_host" as const;
}

export function isThinCoverageSummary(input: {
  legalCoverageScore?: number | null;
  pagesScanned?: number | null;
  policyEnrichmentCount?: number | null;
  verifiedPublicSurfacesCount?: number | null;
}) {
  return (
    (input.pagesScanned ?? null) !== null &&
    (input.pagesScanned ?? 0) <= 1 &&
    ((input.policyEnrichmentCount ?? null) === null || (input.policyEnrichmentCount ?? 0) <= 0) &&
    ((input.verifiedPublicSurfacesCount ?? null) === null || (input.verifiedPublicSurfacesCount ?? 0) <= 0) &&
    ((input.legalCoverageScore ?? null) === null || (input.legalCoverageScore ?? 0) <= 0)
  );
}

function hasLimitedConfidenceOutcome(scanOutcome: string | null | undefined) {
  if (!scanOutcome) {
    return false;
  }

  return /blocked|captcha|auth|timeout|unreachable|not_found|interstitial|error/i.test(scanOutcome);
}

function hasLimitedCoverageLevel(coverageLevel: string | null | undefined) {
  if (!coverageLevel) {
    return false;
  }

  return /^limited_/i.test(coverageLevel);
}

function hasMeaningfulInterruption(input: {
  label: string;
  details?: string[];
}) {
  const haystack = `${input.label} ${(input.details ?? []).join(" ")}`;
  return /captcha|security challenge|bot challenge|authentication wall|auth wall|access denied|paywall|blocked by site protection|http\s*(?:401|403)|access limitation/i.test(haystack);
}

function policySurfaceSuggestsTrackingContext(input: {
  details: string[];
  pageLabel: string;
}) {
  const haystack = `${input.pageLabel} ${input.details.join(" ")}`;
  return /privacy|cookie|tracking|advertis(?:e|ing)|sale|share|privacy choice|do not sell|do not share|targeted/i.test(haystack);
}

export function deriveExecutiveDisplayState(input: {
  beforeConsentCookieCount?: number | null;
  coverageLevel?: string | null;
  domainBenchmark?: {
    expectedThirdPartyRequests: number;
  } | null;
  policySurfaces?: Array<{
    details: string[];
    pageLabel: string;
  }> | null;
  posture: ExecutivePosture;
  scanInterruptions?: Array<{
    details?: string[];
    label: string;
  }> | null;
  scanOutcome?: string | null;
  thirdPartyDomains?: string[] | null;
  thirdPartyRequestCount?: number | null;
  topFindingCount?: number | null;
  vendorCount?: number | null;
}) {
  if (input.posture === "Action Needed") {
    return input.posture;
  }

  const topFindingCount = input.topFindingCount ?? 0;
  if (topFindingCount > 0) {
    return input.posture;
  }

  const meaningfulInterruption = (input.scanInterruptions ?? []).some(hasMeaningfulInterruption);
  const explicitLimitedCoverage =
    hasLimitedCoverageLevel(input.coverageLevel) ||
    hasLimitedConfidenceOutcome(input.scanOutcome);
  const aboveBenchmarkRequests =
    typeof input.thirdPartyRequestCount === "number" &&
    typeof input.domainBenchmark?.expectedThirdPartyRequests === "number" &&
    input.thirdPartyRequestCount > input.domainBenchmark.expectedThirdPartyRequests;
  const hasRuntimeContext =
    aboveBenchmarkRequests ||
    (input.vendorCount ?? 0) > 0 ||
    (input.thirdPartyDomains?.length ?? 0) > 0 ||
    (input.beforeConsentCookieCount ?? 0) > 0;
  const hasPolicyContext = (input.policySurfaces ?? []).some(policySurfaceSuggestsTrackingContext);

  if (explicitLimitedCoverage || (meaningfulInterruption && (hasRuntimeContext || hasPolicyContext))) {
    return "Limited review";
  }

  return input.posture;
}

export function hasMeaningfulExecutiveInterruption(input: {
  scanInterruptions?: Array<{
    details?: string[];
    label: string;
  }> | null;
}) {
  return (input.scanInterruptions ?? []).some(hasMeaningfulInterruption);
}

export function formatTopFindingHeadline(findings: CertScoreFinding[]) {
  const labels = findings.slice(0, 3).map((finding) => finding.label);
  if (labels.length === 0) {
    return "No headline findings surfaced from the available scan coverage.";
  }

  if (labels.length === 1) {
    return labels[0] ?? "";
  }

  if (labels.length === 2) {
    return `${labels[0]} · ${labels[1]}`;
  }

  return `${labels[0]} · ${labels[1]} · ${labels[2]}`;
}

function getPostureHeadline(posture: ExecutivePosture) {
  if (posture === "Action Needed") {
    return "Immediate privacy and consent issues detected";
  }
  if (posture === "Watch") {
    return "Privacy and consent issues worth prompt review";
  }
  return "No major privacy and consent issues surfaced";
}

function getDisplayStateHeadline(displayState: ExecutiveDisplayState, posture: ExecutivePosture) {
  if (displayState === "Limited review") {
    return "Runtime coverage was limited by site protections";
  }

  return getPostureHeadline(posture);
}

function getCoverageScopedPostureHeadline(posture: ExecutivePosture, findingSections: string[] = []) {
  if (posture === "Clear") {
    return "Limited scan coverage did not surface major homepage privacy concerns";
  }
  if (findingSections.some((section) => section === "Financial & Claims")) {
    return "Limited scan coverage surfaced possible financial-claims concerns";
  }

  return "Limited scan coverage surfaced possible homepage privacy concerns";
}

function getRedirectedHostHeadline(input: {
  finalHost: string | null;
  requestedHost: string | null;
}) {
  if (input.finalHost && input.requestedHost) {
    return "Requested domain resolved to a different host during this scan";
  }

  return "Requested domain did not stay on the expected host during this scan";
}

function getRedirectedHostSummary(input: {
  finalHost: string | null;
  requestedHost: string | null;
}) {
  if (input.finalHost && input.requestedHost) {
    return `Observed runtime and disclosure signals came from ${input.finalHost}, not ${input.requestedHost}.`;
  }

  return "Observed runtime and disclosure signals came from a different landed host than the one originally requested.";
}

export function deriveExecutiveNarrativePresentation(input: {
  accessLimitationNotice?: {
    headline: string;
    message: string;
  } | null;
  executiveHeadline: string;
  finalHost: string | null;
  coverageLevel?: string | null;
  legalCoverageScore?: number | null;
  pagesScanned?: number | null;
  displayState?: ExecutiveDisplayState;
  posture: ExecutivePosture;
  policyEnrichmentCount?: number | null;
  requestedHost: string | null;
  scanOutcome?: string | null;
  topFindingSections?: string[];
  verifiedPublicSurfacesCount?: number | null;
}) {
  const hostResolutionCategory = deriveHostResolutionCategory({
    finalHost: input.finalHost,
    requestedHost: input.requestedHost
  });
  const limitedCoverageBySurface =
    !input.accessLimitationNotice &&
    isThinCoverageSummary({
      legalCoverageScore: input.legalCoverageScore,
      pagesScanned: input.pagesScanned,
      policyEnrichmentCount: input.policyEnrichmentCount,
      verifiedPublicSurfacesCount: input.verifiedPublicSurfacesCount
    });
  const limitedCoverage =
    limitedCoverageBySurface ||
    hasLimitedConfidenceOutcome(input.scanOutcome) ||
    hasLimitedCoverageLevel(input.coverageLevel);

  if (input.accessLimitationNotice) {
    return {
      findingsHeading: "Access limitation",
      headline: input.accessLimitationNotice.headline,
      hostResolutionCategory,
      limitedCoverage: false,
      summaryLabel: "Scan limitation:",
      summaryMessage: input.accessLimitationNotice.message
    };
  }

  if (hostResolutionCategory === "off_origin_landing") {
    return {
      findingsHeading: "Observed on landed host",
      headline: getRedirectedHostHeadline({
        finalHost: input.finalHost,
        requestedHost: input.requestedHost
      }),
      hostResolutionCategory,
      limitedCoverage,
      summaryLabel: "Scope note:",
      summaryMessage: getRedirectedHostSummary({
        finalHost: input.finalHost,
        requestedHost: input.requestedHost
      })
    };
  }

  const displayState = input.displayState ?? input.posture;

  if (displayState === "Limited review") {
    return {
      findingsHeading: "Automated homepage findings",
      headline: getDisplayStateHeadline(displayState, input.posture),
      hostResolutionCategory,
      limitedCoverage: true,
      summaryLabel: "Coverage note:",
      summaryMessage:
        "CertScore did not confirm a headline homepage issue from retained evidence. Observed vendor and request counts may be incomplete. Review retained evidence and consider external corroboration before treating this scan as clean."
    };
  }

  if (limitedCoverage) {
    return {
      findingsHeading: "Automated homepage findings",
      headline: getCoverageScopedPostureHeadline(input.posture, input.topFindingSections),
      hostResolutionCategory,
      limitedCoverage,
      summaryLabel: "Coverage note:",
      summaryMessage: `These are automated observations from the public scan. Review the evidence before taking action. ${input.executiveHeadline}`
    };
  }

  return {
    findingsHeading: "Highest-priority issues",
    headline: getDisplayStateHeadline(displayState, input.posture),
    hostResolutionCategory,
    limitedCoverage: false,
    summaryLabel: "Primary concerns:",
    summaryMessage: input.executiveHeadline
  };
}

export function buildScanCalibrationSummary(input: {
  accessLimitationNotice?: {
    headline: string;
    message: string;
  } | null;
  beforeConsentCookieCount?: number | null;
  coverageLevel?: string | null;
  domain: string | null;
  domainBenchmark?: {
    expectedThirdPartyRequests: number;
  } | null;
  finalHost: string | null;
  legalCoverageScore?: number | null;
  pagesScanned?: number | null;
  policySurfaces?: Array<{
    details: string[];
    pageLabel: string;
  }> | null;
  displayState?: ExecutiveDisplayState;
  policyEnrichmentCount?: number | null;
  posture: ExecutivePosture;
  requestedHost: string | null;
  scanId: string | null;
  scanInterruptions?: Array<{
    details?: string[];
    label: string;
  }> | null;
  scanOutcome?: string | null;
  status: string | null;
  thirdPartyDomains?: string[] | null;
  thirdPartyRequestCount?: number | null;
  topFindings: CertScoreFinding[];
  vendorCount?: number | null;
  verifiedPublicSurfacesCount?: number | null;
}) {
  const executiveHeadline = formatTopFindingHeadline(input.topFindings);
  const displayState = input.displayState ?? deriveExecutiveDisplayState({
    beforeConsentCookieCount: input.beforeConsentCookieCount,
    coverageLevel: input.coverageLevel,
    domainBenchmark: input.domainBenchmark,
    policySurfaces: input.policySurfaces,
    posture: input.posture,
    scanInterruptions: input.scanInterruptions,
    scanOutcome: input.scanOutcome,
    thirdPartyDomains: input.thirdPartyDomains,
    thirdPartyRequestCount: input.thirdPartyRequestCount,
    topFindingCount: input.topFindings.length,
    vendorCount: input.vendorCount
  });
  const presentation = deriveExecutiveNarrativePresentation({
    accessLimitationNotice: input.accessLimitationNotice,
    executiveHeadline,
    finalHost: input.finalHost,
    coverageLevel: input.coverageLevel,
    legalCoverageScore: input.legalCoverageScore,
    pagesScanned: input.pagesScanned,
    displayState,
    policyEnrichmentCount: input.policyEnrichmentCount,
    posture: input.posture,
    requestedHost: input.requestedHost,
    scanOutcome: input.scanOutcome,
    topFindingSections: input.topFindings.map((finding) => finding.section),
    verifiedPublicSurfacesCount: input.verifiedPublicSurfacesCount
  });

  return {
    coverage: {
      coverageLevel: input.coverageLevel ?? null,
      legalCoverageScore: input.legalCoverageScore ?? null,
      pagesScanned: input.pagesScanned ?? null,
      policyEnrichmentCount: input.policyEnrichmentCount ?? null,
      scanOutcome: input.scanOutcome ?? null,
      verifiedPublicSurfacesCount: input.verifiedPublicSurfacesCount ?? null
    },
    domain: input.domain,
    executive: {
      findingsHeading: presentation.findingsHeading,
      headline: presentation.headline,
      hostResolutionCategory: presentation.hostResolutionCategory,
      limitedCoverage: presentation.limitedCoverage,
      displayState,
      posture: input.posture,
      summaryLabel: presentation.summaryLabel,
      summaryMessage: presentation.summaryMessage
    },
    finalHost: input.finalHost,
    landedOnDifferentHost: presentation.hostResolutionCategory === "off_origin_landing",
    requestedHost: input.requestedHost,
    scanId: input.scanId,
    status: input.status,
    topFindings: input.topFindings.slice(0, 5).map((finding) => ({
      confidence: finding.confidence,
      id: finding.id,
      label: finding.label,
      severity: finding.severity,
      shortSummary: finding.shortSummary
    }))
  } satisfies ScanCalibrationSummary;
}
