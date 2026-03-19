import type { ScanPage, ScanSnapshot } from "@website-signal-risk-scanner/shared";
import type { DomainRegistration, DnsSignals, TlsMetadata } from "./network-enrichment";
import type { StaticPageResult } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export const ENRICHMENT_CACHE_TTLS_MS = {
  dns: DAY_MS,
  rdap: 14 * DAY_MS,
  tls: DAY_MS
} as const;

const NON_COVERAGE_PAGE_TYPES = new Set<ScanPage["pageType"]>(["homepage", "other", "about", "blog", "support"]);
const SUCCESS_FETCH_STATUSES = new Set<ScanPage["fetchStatus"]>(["ok", "redirected"]);

type CandidateTarget = {
  pageType: StaticPageResult["pageType"];
  priority: number;
  url: string;
};

function isFresh(scanTimestamp: string | null, ttlMs: number, now: number) {
  if (!scanTimestamp) {
    return false;
  }

  const scannedAt = Date.parse(scanTimestamp);
  return Number.isFinite(scannedAt) && now - scannedAt <= ttlMs;
}

export function getCachedDnsSignals(snapshot: ScanSnapshot | null, now = Date.now()): DnsSignals | null {
  if (!snapshot || !isFresh(snapshot.scanTimestamp, ENRICHMENT_CACHE_TTLS_MS.dns, now)) {
    return null;
  }

  if (
    snapshot.dnssecEnabled === null ||
    snapshot.spfRecordPresent === null ||
    snapshot.dmarcRecordPresent === null ||
    snapshot.dkimRecordDetected === null
  ) {
    return null;
  }

  return {
    dnssecEnabled: snapshot.dnssecEnabled,
    spfRecordPresent: snapshot.spfRecordPresent,
    dmarcRecordPresent: snapshot.dmarcRecordPresent,
    dkimRecordDetected: snapshot.dkimRecordDetected
  };
}

export function getCachedTlsMetadata(snapshot: ScanSnapshot | null, now = Date.now()): TlsMetadata | null {
  if (!snapshot || !isFresh(snapshot.scanTimestamp, ENRICHMENT_CACHE_TTLS_MS.tls, now)) {
    return null;
  }

  if (!snapshot.tlsVersionMinSupported) {
    return null;
  }

  return {
    tlsVersionMinSupported: snapshot.tlsVersionMinSupported,
    certificateAuthority: snapshot.certificateAuthority,
    certificateValidDaysRemaining: snapshot.certificateValidDaysRemaining,
    certificateAutoRenewLikely: snapshot.certificateAutoRenewLikely
  };
}

export function getCachedDomainRegistration(snapshot: ScanSnapshot | null, now = Date.now()): DomainRegistration | null {
  if (!snapshot || !isFresh(snapshot.scanTimestamp, ENRICHMENT_CACHE_TTLS_MS.rdap, now)) {
    return null;
  }

  if (snapshot.domainRegistrationYear === null && snapshot.domainPrivacyProtectionEnabled === null) {
    return null;
  }

  return {
    domainRegistrationYear: snapshot.domainRegistrationYear,
    domainPrivacyProtectionEnabled: snapshot.domainPrivacyProtectionEnabled
  };
}

function isSuccessfulPage(page: StaticPageResult) {
  return SUCCESS_FETCH_STATUSES.has(page.fetchStatus);
}

export function getCoverageTargetTypes(candidates: CandidateTarget[], limit: number) {
  const targetTypes = new Set<StaticPageResult["pageType"]>();

  for (const candidate of candidates) {
    if (NON_COVERAGE_PAGE_TYPES.has(candidate.pageType)) {
      continue;
    }

    targetTypes.add(candidate.pageType);

    if (targetTypes.size >= limit) {
      break;
    }
  }

  return targetTypes;
}

export function hasCoverageForTargetTypes(pages: StaticPageResult[], targetTypes: Set<StaticPageResult["pageType"]>) {
  if (targetTypes.size === 0) {
    return false;
  }

  const coveredTypes = new Set(
    pages.filter(isSuccessfulPage).map((page) => page.pageType).filter((pageType) => !NON_COVERAGE_PAGE_TYPES.has(pageType))
  );

  for (const pageType of targetTypes) {
    if (!coveredTypes.has(pageType)) {
      return false;
    }
  }

  return true;
}

export function prioritizeUncoveredTargets(input: {
  candidates: CandidateTarget[];
  fetchedPages: StaticPageResult[];
}) {
  const coveredTypes = new Set(
    input.fetchedPages
      .filter(isSuccessfulPage)
      .map((page) => page.pageType)
      .filter((pageType) => !NON_COVERAGE_PAGE_TYPES.has(pageType))
  );

  const uncoveredTypeCandidates: CandidateTarget[] = [];
  const remainingCandidates: CandidateTarget[] = [];

  for (const candidate of input.candidates) {
    if (!coveredTypes.has(candidate.pageType) && !NON_COVERAGE_PAGE_TYPES.has(candidate.pageType)) {
      uncoveredTypeCandidates.push(candidate);
      continue;
    }

    remainingCandidates.push(candidate);
  }

  return [...uncoveredTypeCandidates, ...remainingCandidates];
}
