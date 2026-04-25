import type { PreviewScanPayload } from "@website-signal-risk-scanner/shared";
import { buildUrlscanFallbackEvidenceFromResult } from "../preview-scan/build-preview-payload";
import {
  choosePreferredUrlscanSource,
  isUrlscanResultThin,
  searchUrlscanCandidates,
  type UrlscanFallbackSource
} from "../preview-scan/urlscan-fallback";

function getString(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key];
  return typeof value === "boolean" ? value : null;
}

function getVerifiedSurfaceCount(snapshot: Record<string, unknown> | null | undefined) {
  const count = getNumber(snapshot, "verified_public_surfaces_count");
  if (count !== null) {
    return count;
  }

  const surfaces = snapshot?.verified_public_surfaces;
  return Array.isArray(surfaces) ? surfaces.length : 0;
}

function normalizeHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split("/")[0]?.toLowerCase() || null;
  }
}

function buildNormalizedUrl(input: {
  domainHostname: string | null;
  snapshot: Record<string, unknown> | null;
}) {
  const finalUrl = getString(input.snapshot, "final_effective_url") ?? getString(input.snapshot, "final_url");
  if (finalUrl && /^https?:\/\//i.test(finalUrl)) {
    return finalUrl;
  }

  const hostname = normalizeHostname(input.domainHostname);
  return hostname ? `https://${hostname}/` : "";
}

export function shouldAttemptFullScanUrlscanSupplement(input: {
  snapshot: Record<string, unknown> | null;
}) {
  const snapshot = input.snapshot;
  if (!snapshot) {
    return false;
  }

  if (getVerifiedSurfaceCount(snapshot) > 0) {
    return false;
  }

  const homepageFetchStatus = getString(snapshot, "homepage_fetch_status");
  const homepageFetchHttpStatus = getNumber(snapshot, "homepage_fetch_http_status");
  const scanOutcome = getString(snapshot, "scan_outcome");
  const coverageLevel = getString(snapshot, "coverage_level");
  const blockedByFlags =
    getBoolean(snapshot, "blocked_flag") === true ||
    getBoolean(snapshot, "captcha_flag") === true ||
    getBoolean(snapshot, "auth_wall_detected") === true ||
    getBoolean(snapshot, "auth_wall_suspected") === true ||
    getBoolean(snapshot, "challenge_suspected") === true;
  const blockedByStatus =
    homepageFetchStatus === "blocked" ||
    homepageFetchStatus === "forbidden" ||
    homepageFetchHttpStatus === 401 ||
    homepageFetchHttpStatus === 403;
  const blockedByOutcome = Boolean(scanOutcome && /blocked|captcha|auth|challenge|forbidden/i.test(scanOutcome));
  const blockedByCoverage = coverageLevel === "limited_partial" && getNumber(snapshot, "pages_scanned") === 0;

  return blockedByFlags || blockedByStatus || blockedByOutcome || blockedByCoverage;
}

export function buildFullScanUrlscanSupplementPayload(input: {
  domainHostname: string | null;
  hostname: string;
  normalizedUrl: string;
  selectedSource: UrlscanFallbackSource;
  snapshot: Record<string, unknown> | null;
}): PreviewScanPayload | null {
  const fallbackEvidence = buildUrlscanFallbackEvidenceFromResult({
    urlscanResult: input.selectedSource.result,
    urlscanSource: {
      reportUrl: input.selectedSource.reportUrl,
      resultApiUrl: input.selectedSource.resultApiUrl
    }
  });

  if (!fallbackEvidence) {
    return null;
  }

  const homepageFetchStatus = getString(input.snapshot, "homepage_fetch_status");
  const homepageFetchHttpStatus = getNumber(input.snapshot, "homepage_fetch_http_status");
  const robotsFetchHttpStatus = getNumber(input.snapshot, "robots_fetch_http_status");
  const protectionVendor =
    getString(input.snapshot, "block_vendor_guess") ??
    getString(input.snapshot, "cmp_vendor_name");

  return {
    version: "preview-v1",
    hostname: input.hostname,
    normalizedUrl: input.normalizedUrl,
    issueCounts: {
      high: 0,
      medium: 0,
      low: 0
    },
    resultState: {
      code: "full_scan_urlscan_supplement",
      coverageLevel: "limited_partial",
      title: "Indirect public evidence available",
      message: "CertScore was blocked before public-page verification, but urlscan.io retained supplemental same-host runtime evidence."
    },
    evidence: {
      coverageLevel: "limited_partial",
      homepageStatus: homepageFetchHttpStatus ?? homepageFetchStatus ?? null,
      passiveVerificationAttempted: true,
      robotsStatus: robotsFetchHttpStatus,
      verifiedPublicSurfacesCount: 0,
      protectionVendor
    },
    fallbackEvidence,
    summaryBullets: [
      "CertScore did not promote normal privacy findings because the live browser pass was blocked.",
      "urlscan.io retained same-host runtime evidence that can help explain what a public browser saw.",
      "This indirect evidence is supplemental and is not treated as a verified CertScore finding."
    ],
    sampleFindings: [],
    disclaimer: "urlscan.io supplemental evidence is indirect public runtime evidence and does not replace CertScore live verification."
  };
}

export async function getFullScanUrlscanSupplement(input: {
  domainHostname: string | null;
  snapshot: Record<string, unknown> | null;
}) {
  if (!shouldAttemptFullScanUrlscanSupplement({ snapshot: input.snapshot })) {
    return null;
  }

  const normalizedUrl = buildNormalizedUrl({
    domainHostname: input.domainHostname,
    snapshot: input.snapshot
  });
  const preferredHostname =
    normalizeHostname(getString(input.snapshot, "final_effective_url")) ??
    normalizeHostname(getString(input.snapshot, "final_url")) ??
    normalizeHostname(input.domainHostname);

  if (!preferredHostname) {
    return null;
  }

  const candidates = await searchUrlscanCandidates({
    hostname: preferredHostname,
    limit: 5
  });
  const selectedSource = choosePreferredUrlscanSource({
    retained: null,
    candidates,
    preferredHostname
  });

  if (!selectedSource?.result || isUrlscanResultThin(selectedSource.result, preferredHostname)) {
    return null;
  }

  return buildFullScanUrlscanSupplementPayload({
    domainHostname: input.domainHostname,
    hostname: preferredHostname,
    normalizedUrl,
    selectedSource,
    snapshot: input.snapshot
  });
}
