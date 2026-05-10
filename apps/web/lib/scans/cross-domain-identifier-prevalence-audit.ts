export type CrossDomainIdentifierPrevalenceScanInput = {
  domain: string | null;
  finalUrl?: string | null;
  manifestRow?: number | null;
  registeredDomain?: string | null;
  scanId?: string | null;
  topFindingIds?: string[];
  trancoRank?: number | null;
};

export type CrossDomainIdentifierPrevalenceAudit = {
  findingId: "cross_domain_identifier_sharing_observed";
  rawPositiveScanCount: number;
  uniqueCanonicalReportingDomainCount: number;
  countChangedUnderStrictCanonicalGrouping: boolean;
  rawPositiveDomains: string[];
  canonicalReportingGroups: Array<{
    canonicalReportingDomain: string;
    domains: string[];
    finalUrls: string[];
    manifestRows: number[];
    scanIds: string[];
    trancoRanks: number[];
  }>;
  possibleSiblingCandidates: Array<{
    domains: string[];
    reason:
      | "same_canonical_reporting_domain"
      | "same_final_url"
      | "possible_sibling_not_deduped";
    dedupedInStrictCanonicalGrouping: boolean;
  }>;
};

const FINDING_ID = "cross_domain_identifier_sharing_observed";

function normalizeDomain(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return trimmed.includes(".") ? trimmed : null;
}

function hostnameFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return normalizeDomain(new URL(value).hostname);
  } catch {
    return null;
  }
}

function roughEtldPlusOne(hostname: string | null | undefined) {
  const normalized = normalizeDomain(hostname);
  if (!normalized) {
    return null;
  }
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length <= 2) {
    return normalized;
  }
  const knownTwoPartSuffixes = new Set(["co.uk", "com.br", "co.jp", "com.au", "com.tr", "com.mx", "com.cn"]);
  const suffix = parts.slice(-2).join(".");
  return knownTwoPartSuffixes.has(suffix) && parts.length >= 3 ? parts.slice(-3).join(".") : suffix;
}

function canonicalReportingDomain(scan: CrossDomainIdentifierPrevalenceScanInput) {
  return (
    normalizeDomain(scan.registeredDomain) ??
    roughEtldPlusOne(hostnameFromUrl(scan.finalUrl)) ??
    normalizeDomain(scan.domain) ??
    "unknown"
  );
}

function sortNumbers(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)))].sort(
    (left, right) => left - right
  );
}

function sortStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))].sort();
}

function brandSkeleton(domain: string) {
  return domain
    .replace(/^www\./, "")
    .split(".")[0]
    ?.replace(/ington/g, "")
    .replace(/post$/, "post")
    .replace(/[^a-z0-9]/g, "") ?? domain;
}

function findPossibleSiblingCandidates(
  positives: Array<CrossDomainIdentifierPrevalenceScanInput & { canonicalReportingDomain: string }>
) {
  const candidates: CrossDomainIdentifierPrevalenceAudit["possibleSiblingCandidates"] = [];
  for (let leftIndex = 0; leftIndex < positives.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < positives.length; rightIndex += 1) {
      const left = positives[leftIndex];
      const right = positives[rightIndex];
      if (!left || !right) {
        continue;
      }
      const leftDomain = normalizeDomain(left.domain);
      const rightDomain = normalizeDomain(right.domain);
      if (!leftDomain || !rightDomain) {
        continue;
      }
      const sameCanonical = left.canonicalReportingDomain === right.canonicalReportingDomain;
      const leftFinal = normalizeDomain(hostnameFromUrl(left.finalUrl));
      const rightFinal = normalizeDomain(hostnameFromUrl(right.finalUrl));
      const sameFinal = Boolean(leftFinal && rightFinal && leftFinal === rightFinal);
      const possibleLexicalSibling =
        !sameCanonical &&
        !sameFinal &&
        brandSkeleton(leftDomain) === brandSkeleton(rightDomain) &&
        leftDomain !== rightDomain;
      if (!sameCanonical && !sameFinal && !possibleLexicalSibling) {
        continue;
      }
      candidates.push({
        domains: [leftDomain, rightDomain].sort(),
        reason: sameCanonical ? "same_canonical_reporting_domain" : sameFinal ? "same_final_url" : "possible_sibling_not_deduped",
        dedupedInStrictCanonicalGrouping: sameCanonical || sameFinal
      });
    }
  }
  return candidates;
}

export function buildCrossDomainIdentifierPrevalenceAudit(
  scans: CrossDomainIdentifierPrevalenceScanInput[]
): CrossDomainIdentifierPrevalenceAudit {
  const positives = scans
    .filter((scan) => scan.topFindingIds?.includes(FINDING_ID))
    .map((scan) => ({
      ...scan,
      canonicalReportingDomain: canonicalReportingDomain(scan)
    }));
  const groups = new Map<string, typeof positives>();
  for (const scan of positives) {
    groups.set(scan.canonicalReportingDomain, [...(groups.get(scan.canonicalReportingDomain) ?? []), scan]);
  }

  const canonicalReportingGroups = [...groups.entries()]
    .map(([domain, group]) => ({
      canonicalReportingDomain: domain,
      domains: sortStrings(group.map((scan) => normalizeDomain(scan.domain))),
      finalUrls: sortStrings(group.map((scan) => scan.finalUrl ?? null)),
      manifestRows: sortNumbers(group.map((scan) => scan.manifestRow)),
      scanIds: sortStrings(group.map((scan) => scan.scanId ?? null)),
      trancoRanks: sortNumbers(group.map((scan) => scan.trancoRank))
    }))
    .sort((left, right) => {
      const leftRank = left.trancoRanks[0] ?? Number.POSITIVE_INFINITY;
      const rightRank = right.trancoRanks[0] ?? Number.POSITIVE_INFINITY;
      return leftRank - rightRank;
    });

  return {
    findingId: FINDING_ID,
    rawPositiveScanCount: positives.length,
    uniqueCanonicalReportingDomainCount: canonicalReportingGroups.length,
    countChangedUnderStrictCanonicalGrouping: positives.length !== canonicalReportingGroups.length,
    rawPositiveDomains: positives.map((scan) => scan.domain).filter((value): value is string => Boolean(value)),
    canonicalReportingGroups,
    possibleSiblingCandidates: findPossibleSiblingCandidates(positives)
  };
}
