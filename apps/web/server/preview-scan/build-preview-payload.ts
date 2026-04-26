import type {
  BlockPageClassification,
  PreviewEarlyResultItem,
  PreviewFallbackEvidence,
  BlockVendorGuess,
  PreviewIssueCounts,
  PreviewSampleFinding,
  PreviewScanPayload,
  ScanSnapshot
} from "@website-signal-risk-scanner/shared";
import { deriveScanStopReason } from "../../lib/scans/scan-stop-reason";
import { deriveScannerHealthWarnings } from "../../lib/scans/scanner-health-warnings";
import {
  deriveHighRiskTrackingContext,
  formatHighRiskVendorSummary
} from "../../lib/scans/high-risk-tracking-context";
import {
  classifyRuntimeCookieCategory,
  isFunctionalCookieExcludedFromTrackingEvidence,
  isNonEssentialCookieCategory
} from "../../lib/scans/runtime-cookie-evidence";

type PreviewSnapshotSource = {
  accessPostureClass?: ScanSnapshot["accessPostureClass"] | null;
  accessibilityScore: ScanSnapshot["accessibilityScore"];
  authWallDetected?: ScanSnapshot["authWallDetected"] | null;
  authWallSuspected?: ScanSnapshot["authWallSuspected"] | null;
  blockPageClassification?: ScanSnapshot["blockPageClassification"] | null;
  blockVendorGuess?: ScanSnapshot["blockVendorGuess"] | null;
  blockedFlag?: ScanSnapshot["blockedFlag"] | null;
  certscoreOverall: ScanSnapshot["certscoreOverall"];
  captchaFlag?: ScanSnapshot["captchaFlag"] | null;
  contactPagePresent: ScanSnapshot["contactPagePresent"];
  coverageLevel?: ScanSnapshot["coverageLevel"] | null;
  cookiePolicyPresent?: ScanSnapshot["cookiePolicyPresent"] | null;
  cookieBannerPresent: ScanSnapshot["cookieBannerPresent"];
  challengeSuspected?: ScanSnapshot["challengeSuspected"] | null;
  cmpVendorName?: ScanSnapshot["cmpVendorName"] | null;
  consentInteractionModel?: ScanSnapshot["consentInteractionModel"] | null;
  finalUrl: ScanSnapshot["finalUrl"];
  fingerprintBlockSuspected?: ScanSnapshot["fingerprintBlockSuspected"] | null;
  geoBlockSuspected?: ScanSnapshot["geoBlockSuspected"] | null;
  granularPreferencesPresent: ScanSnapshot["granularPreferencesPresent"];
  homepageFetchHttpStatus?: ScanSnapshot["homepageFetchHttpStatus"] | null;
  homepageFetchStatus: ScanSnapshot["homepageFetchStatus"] | null;
  normalizedBodyHash?: ScanSnapshot["normalizedBodyHash"] | null;
  passiveVerificationAttemptCount?: ScanSnapshot["passiveVerificationAttemptCount"] | null;
  passiveVerificationAttempted?: ScanSnapshot["passiveVerificationAttempted"] | null;
  pagesScanned: ScanSnapshot["pagesScanned"];
  partialScan: ScanSnapshot["partialScan"];
  privacyPolicyPresent: ScanSnapshot["privacyPolicyPresent"];
  privacyScore: ScanSnapshot["privacyScore"];
  preconsentTrackingDetected: ScanSnapshot["preconsentTrackingDetected"];
  rateLimitSuspected?: ScanSnapshot["rateLimitSuspected"] | null;
  rejectAllPresent: ScanSnapshot["rejectAllPresent"];
  redirectCount: ScanSnapshot["redirectCount"];
  registeredDomain: ScanSnapshot["registeredDomain"];
  robotsAllowed?: ScanSnapshot["robotsAllowed"] | null;
  robotsFetchHttpStatus?: ScanSnapshot["robotsFetchHttpStatus"] | null;
  robotsFetchStatus?: ScanSnapshot["robotsFetchStatus"] | null;
  termsOfServicePresent: ScanSnapshot["termsOfServicePresent"];
  thirdPartyCookieSetBeforeConsent: ScanSnapshot["thirdPartyCookieSetBeforeConsent"];
  totalSignals: ScanSnapshot["totalSignals"];
  trackingBeforeConsentDetected: ScanSnapshot["trackingBeforeConsentDetected"];
  wcagFormLabelErrorCount: ScanSnapshot["wcagFormLabelErrorCount"];
  wcagMissingAltCount: ScanSnapshot["wcagMissingAltCount"];
};

function pushFinding(
  findings: PreviewSampleFinding[],
  finding: PreviewSampleFinding | null,
  limit = 4
) {
  if (finding && findings.length < limit) {
    findings.push(finding);
  }
}

function deriveIssueCounts(findings: PreviewSampleFinding[]): PreviewIssueCounts {
  return findings.reduce<PreviewIssueCounts>(
    (counts, finding) => {
      if (finding.severity === "high") {
        counts.high += 1;
      } else if (finding.severity === "medium") {
        counts.medium += 1;
      } else {
        counts.low += 1;
      }

      return counts;
    },
    { high: 0, medium: 0, low: 0 }
  );
}

const FINDING_SEVERITY_RANK: Record<PreviewSampleFinding["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3
};

function sortPreviewFindings(findings: PreviewSampleFinding[]) {
  return findings.sort((a, b) => FINDING_SEVERITY_RANK[a.severity] - FINDING_SEVERITY_RANK[b.severity]);
}

function hostnameFromUrl(value: string | null) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function deriveVerifiedPublicSurfaces(snapshot: PreviewSnapshotSource) {
  const surfaces: string[] = [];

  if (snapshot.privacyPolicyPresent) {
    surfaces.push("privacy policy");
  }

  if (snapshot.termsOfServicePresent) {
    surfaces.push("terms of service");
  }

  if (snapshot.cookiePolicyPresent) {
    surfaces.push("cookie policy");
  }

  if (snapshot.contactPagePresent) {
    surfaces.push("contact page");
  }

  return surfaces;
}

type PreviewFallbackEvent = {
  event_type: string;
  metadata_json: Record<string, unknown> | null;
};

function getRecordString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getRecordNumber(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRecordArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

function getRecordStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  return getRecordArray(record, key).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function getNestedRecord(record: Record<string, unknown> | null | undefined, path: string[]) {
  let current: unknown = record ?? null;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current && typeof current === "object" && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : null;
}

function getNestedStringArray(record: Record<string, unknown> | null | undefined, path: string[]) {
  const value = path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    return (current as Record<string, unknown>)[key];
  }, record ?? null);

  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function eventHasStrongPrivacyDiscoveryCandidate(event: PreviewFallbackEvent) {
  if (event.event_type !== "runtime.build_phase_diagnostic") {
    return false;
  }

  const metadata = event.metadata_json;
  if (getRecordString(metadata, "phase") !== "page_discovery_fetch") {
    return false;
  }

  const discoveryDebug = getNestedRecord(metadata, ["discoveryDebug"]);
  const topCandidates = getRecordArray(discoveryDebug, "topDiscoveryCandidates");
  return topCandidates.some((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return false;
    }

    const record = candidate as Record<string, unknown>;
    const pageType = getRecordString(record, "pageType") ?? getRecordString(record, "page_type");
    const candidateScore =
      getRecordNumber(record, "candidateScore") ??
      getRecordNumber(record, "candidate_score") ??
      0;
    const candidateUrl = getRecordString(record, "candidateUrl") ?? getRecordString(record, "candidate_url");
    const anchorText = getRecordString(record, "anchorText") ?? getRecordString(record, "anchor_text");
    const discoveredFrom = getRecordString(record, "discoveredFrom") ?? getRecordString(record, "discovered_from");
    const haystack = `${candidateUrl ?? ""} ${anchorText ?? ""}`.toLowerCase();
    const strongDiscoverySource =
      discoveredFrom === "homepage_rendered_link" ||
      discoveredFrom === "rendered_link" ||
      discoveredFrom === "footer_link" ||
      discoveredFrom === "legal_hub";

    return (
      pageType === "privacy_policy" &&
      candidateScore >= 0.75 &&
      strongDiscoverySource &&
      /\bprivacy\b|privacy-policy|privacy-notice/.test(haystack)
    );
  });
}

function hasStrongPrivacyDiscoveryCandidate(events: PreviewFallbackEvent[]) {
  return events.some((event) => eventHasStrongPrivacyDiscoveryCandidate(event));
}

function getEarlyResultNumber(items: PreviewEarlyResultItem[] | undefined, label: string) {
  const raw = items?.find((item) => item.label === label)?.value ?? null;
  if (!raw) {
    return null;
  }

  const match = raw.match(/\d+/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function insertSummaryBullet(summaryBullets: string[], bullet: string) {
  if (!summaryBullets.includes(bullet)) {
    summaryBullets.push(bullet);
  }
}

function prependFinding(findings: PreviewSampleFinding[], finding: PreviewSampleFinding, limit = 4) {
  if (findings.some((existing) => existing.title === finding.title)) {
    return;
  }

  findings.unshift(finding);
  if (findings.length > limit) {
    findings.length = limit;
  }
}

function pushPrioritizedFinding(findings: PreviewSampleFinding[], finding: PreviewSampleFinding, limit = 4) {
  if (findings.some((existing) => existing.title === finding.title)) {
    return;
  }

  findings.push(finding);
  sortPreviewFindings(findings);
  if (findings.length > limit) {
    findings.length = limit;
  }
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))];
}

function sumCounts(values: unknown[]) {
  return values.reduce<number>((total, value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return total;
    }

    const count = (value as Record<string, unknown>).count;
    return typeof count === "number" && Number.isFinite(count) ? total + count : total;
  }, 0);
}

function formatSurfaceLabel(surface: string) {
  return surface.replace(/_/g, " ");
}

function formatList(items: string[]) {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

type UrlscanFallbackSnapshot = {
  reportUrl: string | null;
  resultApiUrl: string | null;
  requestCount: number | null;
  thirdPartyRequestCount: number | null;
  initialCookieCount: number | null;
  verifiedSurfaceCount: number | null;
  verifiedSurfaceTargets: string[];
  domainCount: number | null;
  ipCount: number | null;
  countryCount: number | null;
  cookieDomains: string[];
  cookieNames: string[];
  observedDomains: string[];
  requestUrls: string[];
  topDomains: string[];
  countries: string[];
  serverNames: string[];
  technologyNames: string[];
  trackerVendorCount: number | null;
};

function extractRequestUrls(urlscanResult: Record<string, unknown> | null | undefined) {
  const dataRequests = getRecordArray(getNestedRecord(urlscanResult, ["data"]), "requests");
  const urls: string[] = [];

  for (const row of dataRequests) {
    const request = getNestedRecord(row, ["request"]);
    const response = getNestedRecord(row, ["response"]);
    const requestUrl = getRecordString(request, "url");
    const responseUrl = getRecordString(response, "url");
    if (requestUrl) {
      urls.push(requestUrl);
    }
    if (responseUrl) {
      urls.push(responseUrl);
    }
  }

  return uniqueStrings(urls);
}

function extractTechnologyNames(urlscanResult: Record<string, unknown> | null | undefined) {
  const candidates = [
    ...getNestedStringArray(urlscanResult, ["technologies"]),
    ...getNestedStringArray(urlscanResult, ["page", "technologies"]),
    ...getNestedStringArray(urlscanResult, ["meta", "processors", "technologies"]),
    ...getNestedStringArray(urlscanResult, ["meta", "processors", "wappa", "data"])
  ];

  const wappaRows = getNestedRecord(urlscanResult, ["meta", "processors", "wappa"]);
  const wappaData = Array.isArray(wappaRows?.data) ? wappaRows.data : [];
  for (const row of wappaData) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const app = getRecordString(row as Record<string, unknown>, "app");
    const name = getRecordString(row as Record<string, unknown>, "name");
    if (app) {
      candidates.push(app);
    }
    if (name) {
      candidates.push(name);
    }
  }

  return uniqueStrings(candidates);
}

function buildUrlscanFallbackSnapshot(input: {
  fallbackLookup: PreviewFallbackEvent | undefined;
  fallbackLegalFetch: PreviewFallbackEvent | undefined;
  liveEarlyResults?: PreviewEarlyResultItem[];
  urlscanResult?: Record<string, unknown> | null;
  urlscanSource?: {
    reportUrl?: string | null;
    resultApiUrl?: string | null;
  };
}) {
  const urlscanLists = getNestedRecord(input.urlscanResult, ["lists"]);
  const urlscanStats = getNestedRecord(input.urlscanResult, ["stats"]);
  const urlscanData = getNestedRecord(input.urlscanResult, ["data"]);
  const urlscanCookies = getRecordArray(urlscanData, "cookies");
  const urlscanRequestCountFromStats = Math.max(
    sumCounts(getRecordArray(urlscanStats, "domainStats")),
    getRecordNumber(urlscanStats, "totalRequests") ?? 0,
    getRecordArray(urlscanData, "requests").length
  );
  const urlscanRequestCount =
    (urlscanRequestCountFromStats > 0 ? urlscanRequestCountFromStats : null) ??
    getRecordNumber(input.fallbackLookup?.metadata_json ?? null, "requestCount") ??
    getEarlyResultNumber(input.liveEarlyResults, "Requests");
  const observedDomains = uniqueStrings(getRecordStringArray(urlscanLists, "domains"));
  const topDomains = observedDomains.slice(0, 5);
  const retainedThirdPartyRequestCount = Math.max(
    getEarlyResultNumber(input.liveEarlyResults, "3P requests") ?? 0,
    getRecordNumber(input.fallbackLookup?.metadata_json ?? null, "thirdPartyRequestCount") ?? 0,
    observedDomains.length
  );
  const countries = uniqueStrings(getRecordStringArray(urlscanLists, "countries").slice(0, 5));
  const serverNames = uniqueStrings(getRecordStringArray(urlscanLists, "servers").slice(0, 5));
  const verifiedSurfaceTargets = uniqueStrings([
    ...getRecordStringArray(input.fallbackLegalFetch?.metadata_json ?? null, "verifiedSurfaceTargets")
  ]);
  const domainCount = topDomains.length > 0 ? getRecordStringArray(urlscanLists, "domains").length : null;
  const ipCount = getRecordStringArray(urlscanLists, "ips").length > 0 ? getRecordStringArray(urlscanLists, "ips").length : null;
  const countryCount =
    getRecordNumber(urlscanStats, "uniqCountries") ??
    (countries.length > 0 ? countries.length : null);
  const technologyNames = extractTechnologyNames(input.urlscanResult);
  const cookieNames = uniqueStrings(urlscanCookies.map((cookie) => getRecordString(cookie, "name")));
  const cookieDomains = uniqueStrings(urlscanCookies.map((cookie) => getRecordString(cookie, "domain")));
  const requestUrls = extractRequestUrls(input.urlscanResult);

  return {
    reportUrl:
      input.urlscanSource?.reportUrl ??
      getRecordString(input.fallbackLookup?.metadata_json ?? null, "reportUrl"),
    resultApiUrl:
      input.urlscanSource?.resultApiUrl ??
      getRecordString(input.fallbackLookup?.metadata_json ?? null, "resultApiUrl"),
    requestCount: urlscanRequestCount,
    thirdPartyRequestCount: retainedThirdPartyRequestCount > 0 ? retainedThirdPartyRequestCount : null,
    initialCookieCount:
      (getRecordArray(urlscanData, "cookies").length > 0 ? getRecordArray(urlscanData, "cookies").length : null) ??
      getRecordNumber(urlscanStats, "cookies") ??
      getRecordNumber(input.fallbackLookup?.metadata_json ?? null, "cookieCount") ??
      getEarlyResultNumber(input.liveEarlyResults, "Initial cookies"),
    verifiedSurfaceCount:
      getRecordNumber(input.fallbackLegalFetch?.metadata_json ?? null, "verifiedCount") ??
      getEarlyResultNumber(input.liveEarlyResults, "Verified surfaces"),
    verifiedSurfaceTargets,
    domainCount,
    ipCount,
    countryCount,
    cookieDomains,
    cookieNames,
    observedDomains,
    requestUrls,
    topDomains,
    countries,
    serverNames,
    technologyNames,
    trackerVendorCount: getRecordNumber(input.fallbackLookup?.metadata_json ?? null, "trackerVendorCount")
  } satisfies UrlscanFallbackSnapshot;
}

function buildNormalizedUrlscanFallbackEvidence(snapshot: UrlscanFallbackSnapshot): PreviewFallbackEvidence | null {
  const hasRequestEvidence =
    (snapshot.requestCount ?? 0) > 0 ||
    (snapshot.thirdPartyRequestCount ?? 0) > 0 ||
    (snapshot.initialCookieCount ?? 0) > 0 ||
    (snapshot.domainCount ?? 0) > 0 ||
    (snapshot.ipCount ?? 0) > 0 ||
    (snapshot.countryCount ?? 0) > 0;
  const hasVendorEvidence = snapshot.technologyNames.length > 0 || (snapshot.trackerVendorCount ?? 0) > 0 || snapshot.serverNames.length > 0;
  const hasDisclosureEvidence = (snapshot.verifiedSurfaceCount ?? 0) > 0 || snapshot.verifiedSurfaceTargets.length > 0;

  if (!hasRequestEvidence && !hasVendorEvidence && !hasDisclosureEvidence) {
    return null;
  }

  const requestDetails = uniqueStrings([
    snapshot.domainCount ? `Domains contacted: ${formatCountLabel(snapshot.domainCount, "domain")}` : null,
    snapshot.ipCount ? `IPs contacted: ${formatCountLabel(snapshot.ipCount, "IP")}` : null,
    snapshot.countryCount ? `Countries reached: ${formatCountLabel(snapshot.countryCount, "country", "countries")}` : null,
    snapshot.topDomains.length > 0 ? `Top hosts: ${snapshot.topDomains.slice(0, 3).join(", ")}` : null
  ]);
  const requestSummaryParts = [
    snapshot.requestCount ? formatCountLabel(snapshot.requestCount, "network request") : null,
    snapshot.thirdPartyRequestCount ? formatCountLabel(snapshot.thirdPartyRequestCount, "third-party request") : null,
    snapshot.initialCookieCount ? formatCountLabel(snapshot.initialCookieCount, "initial cookie") : null
  ].filter((value): value is string => Boolean(value));
  const trackingCookieNames = snapshot.cookieNames.filter((name) =>
    !isFunctionalCookieExcludedFromTrackingEvidence(name) &&
    isNonEssentialCookieCategory(classifyRuntimeCookieCategory(name))
  );
  const cookieSummary =
    trackingCookieNames.length > 0
      ? `${formatCountLabel(trackingCookieNames.length, "tracking cookie")} retained from supplemental public runtime evidence.`
      : null;
  const cookieDetails = uniqueStrings([
    trackingCookieNames.length > 0 ? `Tracking cookie names: ${trackingCookieNames.slice(0, 12).join(", ")}` : null,
    snapshot.cookieDomains.length > 0 ? `Cookie domains: ${snapshot.cookieDomains.slice(0, 8).join(", ")}` : null
  ]);

  const vendorSummary =
    snapshot.technologyNames.length > 0
      ? `Named technologies retained: ${formatList(snapshot.technologyNames.slice(0, 4))}.`
      : (snapshot.trackerVendorCount ?? 0) > 0
        ? `The fallback report retained ${formatCountLabel(snapshot.trackerVendorCount ?? 0, "named tracker vendor")} even though the live preview stayed lightweight.`
        : snapshot.serverNames.length > 0
          ? `No named tracking stack was retained, but the fallback report did preserve infrastructure signals such as ${formatList(snapshot.serverNames.slice(0, 2))}.`
          : null;
  const vendorDetails = uniqueStrings([
    snapshot.technologyNames.length > 0 ? `Technologies: ${snapshot.technologyNames.slice(0, 6).join(", ")}` : null,
    (snapshot.trackerVendorCount ?? 0) > 0 ? `Named tracker vendors: ${snapshot.trackerVendorCount}` : null,
    snapshot.serverNames.length > 0 ? `Observed servers: ${snapshot.serverNames.slice(0, 3).join(", ")}` : null,
    snapshot.countries.length > 0 ? `Observed countries: ${snapshot.countries.slice(0, 3).join(", ")}` : null
  ]);

  const disclosureSurfaceLabels = snapshot.verifiedSurfaceTargets.map(formatSurfaceLabel);
  const disclosureSummary =
    (snapshot.verifiedSurfaceCount ?? 0) > 0
      ? `Passive retrieval verified ${formatCountLabel(snapshot.verifiedSurfaceCount ?? 0, "public disclosure surface")} despite the lightweight homepage path.`
      : disclosureSurfaceLabels.length > 0
        ? `Passive retrieval retained disclosure evidence for ${formatList(disclosureSurfaceLabels.slice(0, 3))}.`
        : null;
  const disclosureDetails = uniqueStrings([
    disclosureSurfaceLabels.length > 0 ? `Verified surfaces: ${disclosureSurfaceLabels.join(", ")}` : null
  ]);

  return {
    source: "supplemental_public_runtime",
    sourceLabel: "Supplemental public runtime evidence",
    metrics: {
      requestCount: snapshot.requestCount ?? undefined,
      thirdPartyRequestCount: snapshot.thirdPartyRequestCount ?? undefined,
      initialCookieCount: snapshot.initialCookieCount ?? undefined,
      domainCount: snapshot.domainCount ?? undefined,
      ipCount: snapshot.ipCount ?? undefined,
      countryCount: snapshot.countryCount ?? undefined,
      verifiedSurfaceCount: snapshot.verifiedSurfaceCount ?? undefined
    },
    entities: {
      cookieDomains: snapshot.cookieDomains,
      cookieNames: trackingCookieNames,
      diagnosticCookieNamesExcludedFromTrackingEvidence: snapshot.cookieNames.filter((name) => !trackingCookieNames.includes(name)),
      technologyNames: snapshot.technologyNames,
      serverNames: snapshot.serverNames,
      topDomains: snapshot.topDomains,
      countries: snapshot.countries,
      verifiedSurfaceTargets: snapshot.verifiedSurfaceTargets
    },
    cookieFootprint:
      cookieSummary
        ? {
            title: "Supplemental cookie evidence",
            summary: cookieSummary,
            details: cookieDetails
          }
        : undefined,
    requestFootprint:
      hasRequestEvidence && requestSummaryParts.length > 0
        ? {
            title: "Request footprint",
            summary: `${requestSummaryParts.join(", ")} retained from supplemental public runtime evidence.`,
            details: requestDetails
          }
        : undefined,
    vendorFootprint:
      hasVendorEvidence && vendorSummary
        ? {
            title: "Vendor footprint",
            summary: vendorSummary,
            details: vendorDetails
          }
        : undefined,
    disclosureFootprint:
      hasDisclosureEvidence && disclosureSummary
        ? {
            title: "Disclosure footprint",
            summary: disclosureSummary,
            details: disclosureDetails
          }
        : undefined
  };
}

export function buildUrlscanFallbackEvidenceFromResult(input: {
  urlscanResult?: Record<string, unknown> | null;
  urlscanSource?: {
    reportUrl?: string | null;
    resultApiUrl?: string | null;
  };
}) {
  return buildNormalizedUrlscanFallbackEvidence(
    buildUrlscanFallbackSnapshot({
      fallbackLegalFetch: undefined,
      fallbackLookup: undefined,
      urlscanResult: input.urlscanResult,
      urlscanSource: input.urlscanSource
    })
  );
}

function hasObservableConsentSurface(snapshot: PreviewSnapshotSource) {
  return (
    snapshot.cookieBannerPresent === true ||
    Boolean(snapshot.cmpVendorName) ||
    (snapshot.consentInteractionModel != null && snapshot.consentInteractionModel !== "none") ||
    snapshot.rejectAllPresent === true ||
    snapshot.granularPreferencesPresent === true
  );
}

function hasPreconsentTrackingEvidence(snapshot: PreviewSnapshotSource) {
  return (
    snapshot.trackingBeforeConsentDetected === true ||
    snapshot.preconsentTrackingDetected === true ||
    snapshot.thirdPartyCookieSetBeforeConsent === true
  );
}

function describePreconsentTrackingFinding(input: {
  hostname: string;
  snapshot: PreviewSnapshotSource;
  runtimeArtifacts?: Record<string, unknown> | null;
}) {
  const context = deriveHighRiskTrackingContext({
    hostname: input.hostname,
    snapshot: input.snapshot as unknown as Record<string, unknown>,
    runtimeArtifacts: input.runtimeArtifacts
  });
  const vendorSummary = formatHighRiskVendorSummary(context.highRiskVendors);

  if (context.isSensitiveContext && vendorSummary.length > 0) {
    return `Pre-consent tracking was observed on a ${context.sensitiveContextLabel}. Vendors observed include ${vendorSummary.join(", ")}. Sensitive-context behavioral data may be flowing to third parties before a clear consent interaction is completed.`;
  }

  if (vendorSummary.length > 0) {
    return `The live preview observed tracking signals or tracking cookies before consent. Vendors observed include ${vendorSummary.join(", ")}.`;
  }

  return "The live preview observed tracking signals or tracking cookies before a clear consent interaction point was completed.";
}

function buildFallbackRuntimeArtifacts(snapshot: UrlscanFallbackSnapshot) {
  return {
    consent_baseline_tracker_evidence_urls: snapshot.requestUrls,
    initial_cookie_names: snapshot.cookieNames,
    third_party_request_domains: snapshot.observedDomains
  };
}

function deriveFallbackHighRiskTrackingContext(input: {
  hostname: string;
  snapshot: PreviewSnapshotSource;
  fallbackSnapshot: UrlscanFallbackSnapshot;
}) {
  return deriveHighRiskTrackingContext({
    hostname: input.hostname,
    snapshot: input.snapshot as unknown as Record<string, unknown>,
    runtimeArtifacts: buildFallbackRuntimeArtifacts(input.fallbackSnapshot),
    evidenceUrls: input.fallbackSnapshot.requestUrls,
    thirdPartyDomains: input.fallbackSnapshot.observedDomains
  });
}

function hasFallbackObservableConsentSurface(snapshot: UrlscanFallbackSnapshot) {
  const context = deriveHighRiskTrackingContext({
    evidenceUrls: snapshot.requestUrls,
    runtimeArtifacts: buildFallbackRuntimeArtifacts(snapshot),
    thirdPartyDomains: snapshot.observedDomains
  });
  const haystack = uniqueStrings([
    ...snapshot.technologyNames,
    ...snapshot.observedDomains,
    ...snapshot.cookieNames,
    ...snapshot.requestUrls
  ]).join("\n");

  return (
    context.cmpVendors.length > 0 ||
    /\bonetrust\b/i.test(haystack) ||
    /\bcookielaw\b/i.test(haystack) ||
    /\btrustarc\b/i.test(haystack) ||
    /\btruste\b/i.test(haystack) ||
    /\bcookiebot\b/i.test(haystack) ||
    /\bsourcepoint\b/i.test(haystack) ||
    /\bOptanon(?:Consent|AlertBoxClosed)?\b/i.test(haystack)
  );
}

function describeFallbackPreconsentTrackingFinding(input: {
  hostname: string;
  snapshot: PreviewSnapshotSource;
  fallbackSnapshot: UrlscanFallbackSnapshot;
}) {
  const context = deriveFallbackHighRiskTrackingContext(input);
  const vendorSummary = formatHighRiskVendorSummary(context.highRiskVendors);

  if (context.isSensitiveContext && vendorSummary.length > 0) {
    return `Supplemental public runtime evidence retained tracking cookies or tracking requests on a ${context.sensitiveContextLabel}. Vendors observed include ${vendorSummary.join(", ")}. Sensitive-context behavioral data may be flowing to advertising, identity, or profiling systems before a clear consent interaction is completed.`;
  }

  if (vendorSummary.length > 0) {
    return `Supplemental public runtime evidence retained tracking cookies or tracking requests before consent. Vendors observed include ${vendorSummary.join(", ")}.`;
  }

  return "Supplemental public runtime evidence retained tracking activity or tracking cookies before a clear consent interaction point was completed.";
}

function isSensitiveContextFallbackPreconsentTracking(input: {
  hostname: string;
  snapshot: PreviewSnapshotSource;
  fallbackSnapshot: UrlscanFallbackSnapshot;
}) {
  const context = deriveFallbackHighRiskTrackingContext(input);
  return context.isSensitiveContext && context.highRiskVendors.length > 0;
}

function capScoresForSensitiveContextFallbackRisk(payload: PreviewScanPayload) {
  if (!payload.scores) {
    return;
  }

  const calibratedScores = {
    ...payload.scores,
    overall: Math.min(payload.scores.overall, 62),
    privacy: Math.min(payload.scores.privacy, 55)
  };
  payload.scores = calibratedScores;

  const scoreBulletIndex = payload.summaryBullets.findIndex((bullet) => bullet.startsWith("Preview scores:"));
  if (scoreBulletIndex >= 0) {
    payload.summaryBullets[scoreBulletIndex] =
      `Preview scores: overall ${calibratedScores.overall}, privacy ${calibratedScores.privacy}, accessibility ${calibratedScores.accessibility}.`;
  }

  insertSummaryBullet(
    payload.summaryBullets,
    "Preview scores were calibrated downward because sensitive-context tracking evidence was retained before consent."
  );
}

function replaceWithPreviewScoreBullet(payload: PreviewScanPayload, scores: NonNullable<PreviewScanPayload["scores"]>) {
  const scoreBullet = `Preview scores: overall ${scores.overall}, privacy ${scores.privacy}, accessibility ${scores.accessibility}.`;
  const scoreBulletIndex = payload.summaryBullets.findIndex((bullet) => bullet.startsWith("Preview scores:"));

  if (scoreBulletIndex >= 0) {
    payload.summaryBullets[scoreBulletIndex] = scoreBullet;
    return;
  }

  insertSummaryBullet(payload.summaryBullets, scoreBullet);
}

function removeAccessWithholdingSummaryBullets(summaryBullets: string[]) {
  return summaryBullets.filter((bullet) => {
    if (bullet === "Access limited by site protections.") {
      return false;
    }

    if (bullet.startsWith("Preview scores are withheld")) {
      return false;
    }

    if (bullet.startsWith("Reason:")) {
      return false;
    }

    if (/captcha|bot challenge|authentication wall|site protections/i.test(bullet)) {
      return false;
    }

    return true;
  });
}

function maybePromoteSensitiveProtectedPreview(input: {
  payload: PreviewScanPayload;
  snapshot: PreviewSnapshotSource;
  runtimeArtifacts?: Record<string, unknown> | null;
}) {
  if (!input.payload.resultState || input.payload.scores) {
    return;
  }

  const hasProtectedAccessState = [
    "reachability_blocked_challenge_suspected",
    "reachability_blocked_captcha",
    "unknown_access_limitation"
  ].includes(input.payload.resultState.code);
  const hasHighPreconsentFinding = input.payload.sampleFindings.some(
    (finding) => finding.title === "Tracking activity observed before consent" && finding.severity === "high"
  );
  const homepageFetchHttpStatusSuccessful =
    input.snapshot.homepageFetchHttpStatus == null ||
    (input.snapshot.homepageFetchHttpStatus >= 200 && input.snapshot.homepageFetchHttpStatus < 400);
  const highRiskContext = deriveHighRiskTrackingContext({
    hostname:
      getRecordString(input.snapshot as unknown as Record<string, unknown>, "registeredDomain") ??
      hostnameFromUrl(input.snapshot.finalUrl) ??
      "scanned domain",
    snapshot: input.snapshot as unknown as Record<string, unknown>,
    runtimeArtifacts: input.runtimeArtifacts
  });
  const canPromote =
    hasProtectedAccessState &&
    hasHighPreconsentFinding &&
    highRiskContext.isSensitiveContext &&
    highRiskContext.highRiskVendors.length > 0 &&
    hasPreconsentTrackingEvidence(input.snapshot) &&
    input.snapshot.homepageFetchStatus === "ok" &&
    homepageFetchHttpStatusSuccessful &&
    input.snapshot.blockedFlag !== true &&
    input.snapshot.authWallDetected !== true &&
    input.snapshot.certscoreOverall > 0 &&
    input.snapshot.privacyScore > 0 &&
    input.snapshot.accessibilityScore > 0 &&
    input.snapshot.totalSignals >= 20;

  if (!canPromote) {
    return;
  }

  delete input.payload.resultState;
  delete input.payload.evidence;
  input.payload.scores = {
    overall: input.snapshot.certscoreOverall,
    privacy: input.snapshot.privacyScore,
    accessibility: input.snapshot.accessibilityScore
  };
  input.payload.summaryBullets = removeAccessWithholdingSummaryBullets(input.payload.summaryBullets);
  replaceWithPreviewScoreBullet(input.payload, input.payload.scores);
  insertSummaryBullet(
    input.payload.summaryBullets,
    "Site protections limited page-depth verification, but retained live-browser evidence was sufficient to surface sensitive-context tracking risk."
  );
  capScoresForSensitiveContextFallbackRisk(input.payload);
  sortPreviewFindings(input.payload.sampleFindings);
  input.payload.issueCounts = deriveIssueCounts(input.payload.sampleFindings);
}

function canSurfaceScoresWithCoverageCaveat(input: {
  siteSurfaceUnverified: boolean;
  snapshot: PreviewSnapshotSource;
}) {
  return (
    input.siteSurfaceUnverified &&
    input.snapshot.accessPostureClass === "degraded_but_useful" &&
    input.snapshot.blockedFlag !== true &&
    input.snapshot.captchaFlag !== true &&
    input.snapshot.authWallDetected !== true &&
    input.snapshot.challengeSuspected !== true &&
    input.snapshot.homepageFetchStatus === "ok" &&
    input.snapshot.homepageFetchHttpStatus !== 401 &&
    input.snapshot.homepageFetchHttpStatus !== 403 &&
    input.snapshot.homepageFetchHttpStatus !== 429 &&
    input.snapshot.totalSignals >= 20 &&
    input.snapshot.certscoreOverall > 0 &&
    input.snapshot.privacyScore > 0 &&
    input.snapshot.accessibilityScore > 0
  );
}

function isEvidenceRichZeroPagePreview(snapshot: PreviewSnapshotSource, verifiedSurfaces: string[]) {
  const homepageFetchStatusOk = snapshot.homepageFetchStatus === "ok";
  const homepageFetchHttpStatusSuccessful =
    snapshot.homepageFetchHttpStatus == null ||
    (snapshot.homepageFetchHttpStatus >= 200 && snapshot.homepageFetchHttpStatus < 400);
  const corroboratedEvidencePresent =
    verifiedSurfaces.length > 0 ||
    snapshot.totalSignals > 0 ||
    snapshot.trackingBeforeConsentDetected === true ||
    snapshot.preconsentTrackingDetected === true ||
    snapshot.thirdPartyCookieSetBeforeConsent === true;

  return (
    snapshot.pagesScanned === 0 &&
    homepageFetchStatusOk &&
    homepageFetchHttpStatusSuccessful &&
    snapshot.blockedFlag !== true &&
    snapshot.captchaFlag !== true &&
    snapshot.authWallDetected !== true &&
    snapshot.challengeSuspected !== true &&
    corroboratedEvidencePresent
  );
}

function hasUsablePublicCoverageDespiteProtectionLabel(snapshot: PreviewSnapshotSource, verifiedSurfaces: string[]) {
  const broadEvidenceRichCoverage =
    snapshot.coverageLevel === "broad" &&
    snapshot.pagesScanned >= 3 &&
    snapshot.totalSignals >= 20 &&
    verifiedSurfaces.length > 0 &&
    hasPreconsentTrackingEvidence(snapshot);
  const homepageFetchHttpStatusSuccessful =
    snapshot.homepageFetchHttpStatus == null ||
    (snapshot.homepageFetchHttpStatus >= 200 && snapshot.homepageFetchHttpStatus < 400);
  const meaningfulCoverage =
    snapshot.pagesScanned >= 1 &&
    snapshot.totalSignals >= 20 &&
    (verifiedSurfaces.length > 0 || hasPreconsentTrackingEvidence(snapshot));

  if (broadEvidenceRichCoverage) {
    return true;
  }

  return (
    meaningfulCoverage &&
    (snapshot.homepageFetchStatus === "ok" || homepageFetchHttpStatusSuccessful) &&
    homepageFetchHttpStatusSuccessful &&
    snapshot.blockedFlag !== true &&
    snapshot.captchaFlag !== true &&
    snapshot.challengeSuspected !== true &&
    snapshot.rateLimitSuspected !== true
  );
}

export function buildPreviewPayloadFromSnapshot(input: {
  hostname: string;
  normalizedUrl: string;
  snapshot: PreviewSnapshotSource;
}): PreviewScanPayload {
  const findings: PreviewSampleFinding[] = [];
  const verifiedSurfaces = deriveVerifiedPublicSurfaces(input.snapshot);
  const evidenceRichZeroPagePreview = isEvidenceRichZeroPagePreview(input.snapshot, verifiedSurfaces);
  const observableConsentSurface = hasObservableConsentSurface(input.snapshot);
  const normalizedBodyMissing =
    "normalizedBodyHash" in input.snapshot
      ? !(typeof input.snapshot.normalizedBodyHash === "string" && input.snapshot.normalizedBodyHash.trim().length > 0)
      : null;
  const scanStopReason = deriveScanStopReason({
    accessPostureClass: input.snapshot.accessPostureClass,
    authWallDetected: input.snapshot.authWallDetected,
    authWallSuspected: input.snapshot.authWallSuspected,
    blockPageClassification: input.snapshot.blockPageClassification as BlockPageClassification | null | undefined,
    blockVendorGuess: input.snapshot.blockVendorGuess as BlockVendorGuess | null | undefined,
    blockedFlag: input.snapshot.blockedFlag,
    captchaFlag: input.snapshot.captchaFlag,
    challengeSuspected: input.snapshot.challengeSuspected,
    fingerprintBlockSuspected: input.snapshot.fingerprintBlockSuspected,
    geoBlockSuspected: input.snapshot.geoBlockSuspected,
    homepageFetchHttpStatus: input.snapshot.homepageFetchHttpStatus,
    homepageFetchStatus: input.snapshot.homepageFetchStatus,
    normalizedBodyMissing,
    pagesScanned: input.snapshot.pagesScanned,
    rateLimitSuspected: input.snapshot.rateLimitSuspected,
    robotsAllowed: input.snapshot.robotsAllowed,
    robotsFetchHttpStatus: input.snapshot.robotsFetchHttpStatus,
    robotsFetchStatus: input.snapshot.robotsFetchStatus
  });
  const usablePublicCoverageDespiteProtectionLabel =
    scanStopReason &&
    [
      "reachability_blocked_challenge_suspected",
      "reachability_blocked_captcha",
      "reachability_blocked_auth_wall",
      "reachability_blocked_geo_or_reputation",
      "unknown_access_limitation"
    ].includes(scanStopReason.kind) &&
    hasUsablePublicCoverageDespiteProtectionLabel(input.snapshot, verifiedSurfaces);
  const siteSurfaceUnverified =
    scanStopReason !== null &&
    !evidenceRichZeroPagePreview &&
    !usablePublicCoverageDespiteProtectionLabel;
  const surfaceScoresWithCoverageCaveat = canSurfaceScoresWithCoverageCaveat({
    siteSurfaceUnverified,
    snapshot: input.snapshot
  });
  const secondarySurfaceCoverageLimited = input.snapshot.partialScan || input.snapshot.pagesScanned < 3;
  const requestedHostname = input.hostname.toLowerCase().replace(/^www\./, "");
  const finalHostname = hostnameFromUrl(input.snapshot.finalUrl);
  const registeredDomain = input.snapshot.registeredDomain?.toLowerCase().replace(/^www\./, "") ?? null;
  const offDomainRedirect =
    Boolean(finalHostname) && finalHostname !== requestedHostname && (!registeredDomain || finalHostname !== registeredDomain);

  const snapshotScoresLookUnreliable =
    evidenceRichZeroPagePreview &&
    input.snapshot.certscoreOverall === 0 &&
    input.snapshot.privacyScore === 0 &&
    input.snapshot.accessibilityScore === 0;

  pushFinding(
    findings,
    siteSurfaceUnverified &&
    scanStopReason &&
      [
        "reachability_blocked_homepage_403",
        "reachability_blocked_homepage_401",
        "reachability_blocked_challenge_suspected",
        "reachability_blocked_captcha",
        "reachability_blocked_auth_wall",
        "reachability_blocked_geo_or_reputation",
        "robots_restricted",
        "homepage_rate_limited_429",
        "unknown_access_limitation"
      ].includes(scanStopReason.kind)
      ? {
          affectedPage: "Homepage",
          category: "legal",
          severity: "medium",
          title: scanStopReason.previewFindingTitle,
          description: scanStopReason.reason.replace(/^Reason:\s*/i, "")
        }
      : null
  );

  pushFinding(
    findings,
    siteSurfaceUnverified && scanStopReason && ["timeout_navigation", "transport_failure"].includes(scanStopReason.kind)
      ? {
          affectedPage: "Homepage",
          category: "legal",
          severity: "high",
          title: scanStopReason.previewFindingTitle,
          description: scanStopReason.reason.replace(/^Reason:\s*/i, "")
        }
      : null
  );

  pushFinding(
    findings,
    siteSurfaceUnverified && scanStopReason?.kind === "inactive_or_unstable"
      ? {
          affectedPage: "Homepage",
          category: "legal",
          severity: "high",
          title: scanStopReason.previewFindingTitle,
          description: scanStopReason.reason.replace(/^Reason:\s*/i, "")
        }
      : null
  );

  pushFinding(
    findings,
    siteSurfaceUnverified && verifiedSurfaces.length > 0
      ? {
          affectedPage: "Public disclosures",
          category: "legal",
          severity: "low",
          title: "Verified public disclosure surfaces detected",
          description: `Despite the blocked primary scan path, the preview still verified: ${verifiedSurfaces.join(", ")}.`
        }
      : null,
    5
  );

  pushFinding(
    findings,
    offDomainRedirect
      ? {
          affectedPage: "Homepage",
          category: "legal",
          severity: "high",
          title: "Domain redirected to a different site",
          description: `The requested domain resolved to ${finalHostname}, which suggests the site may now redirect to a different operator or destination.`
        }
      : null
  );

  pushFinding(
    findings,
    input.snapshot.wcagMissingAltCount > 0
      ? {
          affectedPage: "Homepage",
          category: "accessibility",
          severity: input.snapshot.wcagMissingAltCount >= 3 ? "high" : "medium",
          title: "Missing image alternative text",
          description:
            input.snapshot.wcagMissingAltCount === 1
              ? "Automated checks found at least one image without alternative text."
              : `Automated checks found ${input.snapshot.wcagMissingAltCount} homepage images without alternative text.`
        }
      : null
  );

  pushFinding(
    findings,
    observableConsentSurface &&
    hasPreconsentTrackingEvidence(input.snapshot)
      ? {
          affectedPage: "Homepage",
          category: "privacy",
          severity: "high",
          title: "Tracking activity observed before consent",
          description: describePreconsentTrackingFinding({
            hostname: input.hostname,
            snapshot: input.snapshot
          })
        }
      : null
  );

  pushFinding(
    findings,
    !siteSurfaceUnverified && !input.snapshot.privacyPolicyPresent
      ? {
          affectedPage: "Homepage",
          category: "legal",
          severity: "high",
          title: "Privacy policy not detected",
          description: "The live preview did not detect a likely privacy policy page from the scanned site surface."
        }
      : null
  );

  pushFinding(
    findings,
    observableConsentSurface && !input.snapshot.rejectAllPresent && !input.snapshot.granularPreferencesPresent
      ? {
          affectedPage: "Cookie banner",
          category: "privacy",
          severity: "medium",
          title: "Cookie preferences control not obvious",
          description:
            "A consent surface was observed, but a clear reject-all or granular preferences path was not detected."
        }
      : null
  );

  pushFinding(
    findings,
    input.snapshot.wcagFormLabelErrorCount > 0
      ? {
          affectedPage: "Homepage",
          category: "accessibility",
          severity: "medium",
          title: "Form labeling issues detected",
          description:
            "Automated accessibility checks found interactive controls that may not expose clear labels."
        }
      : null
  );

  pushFinding(
    findings,
    !siteSurfaceUnverified && !secondarySurfaceCoverageLimited && !input.snapshot.termsOfServicePresent
      ? {
          affectedPage: "Footer",
          category: "legal",
          severity: "medium",
          title: "Terms or disclosure link not detected",
          description:
            "The preview did not clearly detect a likely terms, conditions, or comparable disclosure page from the scanned site surface."
        }
      : null
  );

  pushFinding(
    findings,
    !siteSurfaceUnverified && !secondarySurfaceCoverageLimited && !input.snapshot.contactPagePresent
      ? {
          affectedPage: "Footer",
          category: "legal",
          severity: "medium",
          title: "Public contact path not detected",
          description:
            "The preview did not clearly detect a public contact page or contact route from the scanned site surface."
        }
      : null
  );

  const issueCounts = deriveIssueCounts(findings);
  const pagesScannedDescriptor =
    siteSurfaceUnverified
      ? scanStopReason?.reason.replace(/^Reason:\s*/i, "") ?? "This preview could not verify a usable homepage fetch during the live pass."
      : input.snapshot.pagesScanned === 0
        ? "This lightweight preview retained public runtime evidence, but page-depth verification was limited."
        : input.snapshot.pagesScanned === 1
        ? "This preview focused on the homepage."
        : `This preview scanned ${input.snapshot.pagesScanned} pages in a lightweight pass.`;
  const confidenceDescriptor = siteSurfaceUnverified
    ? "Some legal and disclosure checks could not be verified because the scanned site surface was only partially reachable during the live preview."
    : secondarySurfaceCoverageLimited
      ? "This lightweight preview may not verify every secondary legal or contact route unless those pages are directly fetched during the live pass."
      : null;
  const verifiedSurfaceDescriptor =
    siteSurfaceUnverified && verifiedSurfaces.length > 0
      ? `Verified public surfaces detected: ${verifiedSurfaces.join(", ")}.`
      : null;
  const redirectDescriptor =
    offDomainRedirect && finalHostname
      ? `The requested domain redirected to ${finalHostname} during the live pass, so observed content may belong to a different destination site.`
      : null;
  const coverageLevel =
    input.snapshot.coverageLevel ??
    (siteSurfaceUnverified
      ? (verifiedSurfaces.length > 0 ? "limited_partial" : "limited_none")
      : secondarySurfaceCoverageLimited
        ? "lightweight_partial"
        : "broad");
  const passiveVerificationAttempted =
    input.snapshot.passiveVerificationAttempted === true || (input.snapshot.passiveVerificationAttemptCount ?? 0) > 0;
  const homepageStatusEvidence = input.snapshot.homepageFetchHttpStatus ?? input.snapshot.homepageFetchStatus ?? null;
  const robotsStatusEvidence = input.snapshot.robotsFetchHttpStatus ?? input.snapshot.robotsFetchStatus ?? null;
  const protectionVendor =
    scanStopReason?.outcomeTitle === "Access limited by site protections" &&
    typeof input.snapshot.blockVendorGuess === "string" &&
    input.snapshot.blockVendorGuess !== "unknown"
      ? input.snapshot.blockVendorGuess
      : null;

  return {
    version: "preview-v1",
    hostname: input.hostname,
    normalizedUrl: input.normalizedUrl,
    issueCounts,
    resultState: siteSurfaceUnverified
      ? {
          code: scanStopReason?.outcome ?? "unknown_access_limitation",
          coverageLevel,
          title: scanStopReason?.outcomeTitle ?? "Access limited by site protections",
          message:
            scanStopReason?.outcomeTitle === "Access limited by site protections"
              ? "This run could not fully verify public pages because the site limited automated access from the scan environment. This does not by itself mean expected disclosures are absent."
              : scanStopReason?.reviewMessage ?? "This run could not fully verify public pages."
        }
      : undefined,
    evidence: siteSurfaceUnverified
      ? {
          coverageLevel,
          homepageStatus: homepageStatusEvidence,
          passiveVerificationAttempted,
          robotsStatus: robotsStatusEvidence,
          verifiedPublicSurfacesCount: verifiedSurfaces.length,
          protectionVendor
        }
      : undefined,
    scores: (siteSurfaceUnverified && !surfaceScoresWithCoverageCaveat) || snapshotScoresLookUnreliable
      ? undefined
      : {
          overall: input.snapshot.certscoreOverall,
          privacy: input.snapshot.privacyScore,
          accessibility: input.snapshot.accessibilityScore
        },
    summaryBullets: [
      `${input.snapshot.totalSignals} structured signals were observed in this live preview.`,
      ...(siteSurfaceUnverified
        ? [
            "Access limited by site protections.",
            surfaceScoresWithCoverageCaveat
              ? `Preview scores are shown with a coverage caveat: overall ${input.snapshot.certscoreOverall}, privacy ${input.snapshot.privacyScore}, accessibility ${input.snapshot.accessibilityScore}.`
              : "Preview scores are withheld because the live pass stopped before it verified a trustworthy public site surface.",
            scanStopReason?.reason ?? "Reason: the scanner could not verify a usable homepage surface."
          ]
        : snapshotScoresLookUnreliable
          ? [
              "Preview scores are temporarily withheld because structured evidence was retained but the saved score fields were incomplete for this run."
            ]
          : [`Preview scores: overall ${input.snapshot.certscoreOverall}, privacy ${input.snapshot.privacyScore}, accessibility ${input.snapshot.accessibilityScore}.`]),
      pagesScannedDescriptor,
      ...(redirectDescriptor ? [redirectDescriptor] : []),
      ...(verifiedSurfaceDescriptor ? [verifiedSurfaceDescriptor] : []),
      ...(confidenceDescriptor ? [confidenceDescriptor] : [])
    ],
    sampleFindings: findings,
    disclaimer: "Preview results show publicly observable website signals only."
  };
}

export function enrichPreviewPayloadWithFallbackEvidence(input: {
  payload: PreviewScanPayload;
  snapshot: PreviewSnapshotSource;
  events: PreviewFallbackEvent[];
  runtimeArtifacts?: Record<string, unknown> | null;
  liveEarlyResults?: PreviewEarlyResultItem[];
  urlscanResult?: Record<string, unknown> | null;
  urlscanSource?: {
    reportUrl?: string | null;
    resultApiUrl?: string | null;
  };
}) {
  const scannerHealthWarnings = deriveScannerHealthWarnings(
    input.events.map((event) => ({
      eventType: event.event_type,
      metadataJson: event.metadata_json
    }))
  );
  const payload: PreviewScanPayload = {
    ...input.payload,
    scannerHealthWarnings,
    summaryBullets: [...input.payload.summaryBullets],
    sampleFindings: input.payload.sampleFindings.map((finding) =>
      finding.title === "Tracking activity observed before consent"
        ? {
            ...finding,
            description: describePreconsentTrackingFinding({
              hostname: getRecordString(input.snapshot as unknown as Record<string, unknown>, "registeredDomain") ??
                hostnameFromUrl(input.snapshot.finalUrl) ??
                "scanned domain",
              snapshot: input.snapshot,
              runtimeArtifacts: input.runtimeArtifacts
            })
          }
        : finding
    )
  };

  if (scannerHealthWarnings.length === 0) {
    delete payload.scannerHealthWarnings;
  } else {
    for (const warning of scannerHealthWarnings) {
      insertSummaryBullet(payload.summaryBullets, `Scanner health warning: ${warning.message}`);
    }
  }

  maybePromoteSensitiveProtectedPreview({
    payload,
    snapshot: input.snapshot,
    runtimeArtifacts: input.runtimeArtifacts
  });

  if (!input.snapshot.privacyPolicyPresent && hasStrongPrivacyDiscoveryCandidate(input.events)) {
    payload.sampleFindings = payload.sampleFindings.filter((finding) => finding.title !== "Privacy policy not detected");
    insertSummaryBullet(
      payload.summaryBullets,
      "A likely privacy notice link was retained from the scanned homepage surface."
    );
    payload.issueCounts = deriveIssueCounts(payload.sampleFindings);
  }

  const observableConsentSurface = hasObservableConsentSurface(input.snapshot);
  const worthwhileLeanPreview =
    input.snapshot.pagesScanned === 0 &&
    !payload.resultState &&
    input.snapshot.partialScan === true;

  if (!worthwhileLeanPreview) {
    return payload;
  }

  const fallbackLookup = [...input.events].reverse().find((event) => (
    event.event_type === "runtime.build_phase_diagnostic" &&
    getRecordString(event.metadata_json, "phase") === "urlscan_preflight_lookup" &&
    ["search_hit", "ok"].includes(getRecordString(event.metadata_json, "status") ?? "")
  ));
  const fallbackLegalFetch = [...input.events].reverse().find((event) => (
    event.event_type === "runtime.build_phase_diagnostic" &&
    getRecordString(event.metadata_json, "phase") === "urlscan_preflight_legal_fetch" &&
    ["search_hit", "ok"].includes(getRecordString(event.metadata_json, "status") ?? "")
  ));

  if (!fallbackLookup && !fallbackLegalFetch) {
    return payload;
  }

  const fallbackSnapshot = buildUrlscanFallbackSnapshot({
    fallbackLegalFetch,
    fallbackLookup,
    liveEarlyResults: input.liveEarlyResults,
    urlscanResult: input.urlscanResult,
    urlscanSource: input.urlscanSource
  });
  const fallbackEvidence = buildNormalizedUrlscanFallbackEvidence(fallbackSnapshot);

  if (!fallbackEvidence) {
    return payload;
  }

  payload.supplementalEvidence = fallbackEvidence;
  const fallbackConsentSurface = observableConsentSurface || hasFallbackObservableConsentSurface(fallbackSnapshot);
  const fallbackTrackingCookieCount = fallbackEvidence.entities?.cookieNames?.length ?? 0;
  const fallbackTrackingActivityRetained =
    fallbackTrackingCookieCount > 0 ||
    (fallbackSnapshot.thirdPartyRequestCount ?? 0) > 0 ||
    fallbackSnapshot.requestUrls.length > 0;

  insertSummaryBullet(
    payload.summaryBullets,
    "Supplemental public runtime evidence was retained for this lightweight preview."
  );

  if (fallbackEvidence.requestFootprint) {
    insertSummaryBullet(
      payload.summaryBullets,
      fallbackEvidence.requestFootprint.summary
    );
  }

  if (fallbackEvidence.disclosureFootprint) {
    insertSummaryBullet(
      payload.summaryBullets,
      fallbackEvidence.disclosureFootprint.summary
    );
  }

  if (fallbackEvidence.vendorFootprint) {
    insertSummaryBullet(
      payload.summaryBullets,
      fallbackEvidence.vendorFootprint.summary
    );
  }

  if (fallbackConsentSurface && fallbackTrackingActivityRetained) {
    insertSummaryBullet(
      payload.summaryBullets,
      "Supplemental public runtime evidence retained a consent platform and tracking activity."
    );
    const findingHostname = getRecordString(input.snapshot as unknown as Record<string, unknown>, "registeredDomain") ??
      hostnameFromUrl(input.snapshot.finalUrl) ??
      "scanned domain";
    const sensitiveContextFallbackRisk = isSensitiveContextFallbackPreconsentTracking({
      hostname: findingHostname,
      snapshot: input.snapshot,
      fallbackSnapshot
    });
    const sensitiveContext = deriveFallbackHighRiskTrackingContext({
      hostname: findingHostname,
      snapshot: input.snapshot,
      fallbackSnapshot
    });
    const sensitiveVendorSummary = formatHighRiskVendorSummary(sensitiveContext.highRiskVendors);

    pushPrioritizedFinding(payload.sampleFindings, {
      affectedPage: "Homepage",
      category: "privacy",
      severity: "high",
      title: "Tracking activity observed before consent",
      description: describeFallbackPreconsentTrackingFinding({
        hostname: findingHostname,
        snapshot: input.snapshot,
        fallbackSnapshot
      })
    });

    if (sensitiveContextFallbackRisk) {
      const sensitiveVendorCategories = new Set(sensitiveContext.highRiskVendors.map((vendor) => vendor.category));
      const sensitiveFindingTitle = sensitiveVendorCategories.has("identity_data_broker")
        ? "Identity data broker tracking before consent"
        : sensitiveVendorCategories.has("dmp")
          ? "DMP audience profiling before consent"
          : "Sensitive-context tracking before consent";
      pushPrioritizedFinding(payload.sampleFindings, {
        affectedPage: "Homepage",
        category: "privacy",
        severity: "high",
        title: sensitiveFindingTitle,
        description: `Sensitive-context behavioral data may be flowing to advertising, identity, or profiling systems before consent on a ${sensitiveContext.sensitiveContextLabel ?? "sensitive-context site"}. Vendors observed include ${sensitiveVendorSummary.join(", ")}.`
      }, 5);
      capScoresForSensitiveContextFallbackRisk(payload);
    }
  }

  if (!fallbackConsentSurface && ((fallbackSnapshot.thirdPartyRequestCount ?? 0) > 0 || (fallbackSnapshot.initialCookieCount ?? 0) > 0)) {
    insertSummaryBullet(
      payload.summaryBullets,
      "No observable consent surface was retained, so supplemental runtime activity was not promoted into a consent-violation claim."
    );
  }

  if ((fallbackSnapshot.thirdPartyRequestCount ?? 0) > 0 || (fallbackSnapshot.initialCookieCount ?? 0) > 0) {
    const footprintParts = [
      (fallbackSnapshot.thirdPartyRequestCount ?? 0) > 0
        ? formatCountLabel(fallbackSnapshot.thirdPartyRequestCount ?? 0, "third-party request")
        : null,
      (fallbackSnapshot.initialCookieCount ?? 0) > 0
        ? formatCountLabel(fallbackSnapshot.initialCookieCount ?? 0, "initial cookie")
        : null,
      (fallbackSnapshot.domainCount ?? 0) > 0
        ? formatCountLabel(fallbackSnapshot.domainCount ?? 0, "domain")
        : null
    ].filter((value): value is string => Boolean(value));

    pushPrioritizedFinding(payload.sampleFindings, {
      affectedPage: "Homepage",
      category: "privacy",
      severity: "medium",
      title: "Third-party data collection footprint retained",
      description: `Supplemental public runtime evidence retained ${footprintParts.join(", ")} for this lightweight preview.`
    });
  }

  if (fallbackEvidence.vendorFootprint && ((fallbackSnapshot.technologyNames.length > 0) || ((fallbackSnapshot.trackerVendorCount ?? 0) > 0))) {
    pushPrioritizedFinding(payload.sampleFindings, {
      affectedPage: "Homepage",
      category: "privacy",
      severity: "low",
      title: "Tracking or consent technologies retained",
      description: fallbackEvidence.vendorFootprint.summary
    });
  }

  if (fallbackEvidence.disclosureFootprint) {
    pushPrioritizedFinding(payload.sampleFindings, {
      affectedPage: "Public disclosures",
      category: "legal",
      severity: "low",
      title: "Disclosure surfaces verified via supplemental retrieval",
      description: fallbackEvidence.disclosureFootprint.summary
    });
  }

  sortPreviewFindings(payload.sampleFindings);
  payload.issueCounts = deriveIssueCounts(payload.sampleFindings);

  return payload;
}
