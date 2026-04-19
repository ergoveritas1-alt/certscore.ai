import type { CertScoreFinding } from "./finding-registry";

export type ExecutivePosture = "Clear" | "Watch" | "Action Needed";

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

function getCoverageScopedPostureHeadline(posture: ExecutivePosture) {
  if (posture === "Clear") {
    return "Limited scan coverage did not surface major homepage privacy concerns";
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
  posture: ExecutivePosture;
  policyEnrichmentCount?: number | null;
  requestedHost: string | null;
  scanOutcome?: string | null;
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

  if (limitedCoverage) {
    return {
      findingsHeading: "Possible homepage issues",
      headline: getCoverageScopedPostureHeadline(input.posture),
      hostResolutionCategory,
      limitedCoverage,
      summaryLabel: "Coverage note:",
      summaryMessage: `Possible homepage findings were retained from limited public coverage. ${input.executiveHeadline}`
    };
  }

  return {
    findingsHeading: "Highest-priority issues",
    headline: getPostureHeadline(input.posture),
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
  coverageLevel?: string | null;
  domain: string | null;
  finalHost: string | null;
  legalCoverageScore?: number | null;
  pagesScanned?: number | null;
  policyEnrichmentCount?: number | null;
  posture: ExecutivePosture;
  requestedHost: string | null;
  scanId: string | null;
  scanOutcome?: string | null;
  status: string | null;
  topFindings: CertScoreFinding[];
  verifiedPublicSurfacesCount?: number | null;
}) {
  const executiveHeadline = formatTopFindingHeadline(input.topFindings);
  const presentation = deriveExecutiveNarrativePresentation({
    accessLimitationNotice: input.accessLimitationNotice,
    executiveHeadline,
    finalHost: input.finalHost,
    coverageLevel: input.coverageLevel,
    legalCoverageScore: input.legalCoverageScore,
    pagesScanned: input.pagesScanned,
    policyEnrichmentCount: input.policyEnrichmentCount,
    posture: input.posture,
    requestedHost: input.requestedHost,
    scanOutcome: input.scanOutcome,
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
