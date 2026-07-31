export type LegalFrameworkCanonicalStatus =
  | "current"
  | "superseded"
  | "invalidated";

export type LegalFrameworkStatusAtScan =
  | "current"
  | "superseded"
  | "invalidated"
  | "not_yet_effective";

export type LegalFrameworkValidityEntry = {
  aliases: readonly string[];
  authoritativeSources: readonly {
    label: string;
    url: string;
  }[];
  canonicalId: string;
  canonicalName: string;
  canonicalStatus: LegalFrameworkCanonicalStatus;
  effectiveFrom: string;
  invalidatedFrom?: string;
  reviewMessage?: string;
  subjectArea: "international_data_transfers";
  supersededBy?: string;
  supersededFrom?: string;
};

export type LegalFrameworkValidityMatch = {
  canonicalId: string;
  canonicalName: string;
  canonicalStatus: LegalFrameworkCanonicalStatus;
  effectiveFrom: string;
  invalidatedFrom?: string;
  matchedAlias: string;
  reviewMessage?: string;
  statusAtScan: LegalFrameworkStatusAtScan;
  subjectArea: LegalFrameworkValidityEntry["subjectArea"];
  supersededBy?: string;
  supersededFrom?: string;
};

export const LEGAL_FRAMEWORK_VALIDITY_REGISTRY: readonly LegalFrameworkValidityEntry[] = [
  {
    aliases: [
      "EU-US Privacy Shield",
      "EU–US Privacy Shield",
      "EU U.S. Privacy Shield",
      "Privacy Shield",
    ],
    authoritativeSources: [
      {
        label: "Court of Justice of the European Union — Schrems II press release",
        url: "https://curia.europa.eu/site/upload/docs/application/pdf/2020-07/cp200091en.pdf",
      },
    ],
    canonicalId: "eu_us_privacy_shield",
    canonicalName: "EU-US Privacy Shield",
    canonicalStatus: "invalidated",
    effectiveFrom: "2016-07-12",
    invalidatedFrom: "2020-07-16",
    reviewMessage:
      "An obsolete EU-US Privacy Shield reference was observed. Privacy Shield was invalidated on 16 July 2020; the current transfer basis was not established by this scan. Review the policy wording and the safeguards actually in use.",
    subjectArea: "international_data_transfers",
    supersededBy: "eu_us_data_privacy_framework",
    supersededFrom: "2023-07-10",
  },
  {
    aliases: [
      "EU-US Data Privacy Framework",
      "EU–US Data Privacy Framework",
      "EU U.S. Data Privacy Framework",
      "Data Privacy Framework",
      "EU-US DPF",
      "EU U.S. DPF",
    ],
    authoritativeSources: [
      {
        label: "European Commission — EU-US data transfers",
        url: "https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/eu-us-data-transfers_en",
      },
    ],
    canonicalId: "eu_us_data_privacy_framework",
    canonicalName: "EU-US Data Privacy Framework",
    canonicalStatus: "current",
    effectiveFrom: "2023-07-10",
    subjectArea: "international_data_transfers",
  },
] as const;

function parseDateOnly(value: string) {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeScanTimestamp(value: string | Date) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusAtScan(
  entry: LegalFrameworkValidityEntry,
  scanTimestamp: number | null,
): LegalFrameworkStatusAtScan {
  if (scanTimestamp === null) {
    return entry.canonicalStatus;
  }

  const effectiveFrom = parseDateOnly(entry.effectiveFrom);
  if (effectiveFrom !== null && scanTimestamp < effectiveFrom) {
    return "not_yet_effective";
  }

  const invalidatedFrom = entry.invalidatedFrom
    ? parseDateOnly(entry.invalidatedFrom)
    : null;
  if (invalidatedFrom !== null && scanTimestamp >= invalidatedFrom) {
    return "invalidated";
  }

  const supersededFrom = entry.supersededFrom
    ? parseDateOnly(entry.supersededFrom)
    : null;
  if (supersededFrom !== null && scanTimestamp >= supersededFrom) {
    return "superseded";
  }

  return "current";
}

function aliasPattern(alias: string) {
  const escaped = alias
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[\s–—-]+/g, "[\\s–—-]+");
  return new RegExp(`(?:^|[^a-z0-9])(${escaped})(?=$|[^a-z0-9])`, "i");
}

export function evaluateLegalFrameworkValidity(
  text: string,
  scanDate?: string | Date | null,
): LegalFrameworkValidityMatch[] {
  const boundedText = text.slice(0, 100_000);
  const scanTimestamp = scanDate ? normalizeScanTimestamp(scanDate) : null;
  const matches: LegalFrameworkValidityMatch[] = [];

  for (const entry of LEGAL_FRAMEWORK_VALIDITY_REGISTRY) {
    const matchedAlias = entry.aliases.find((alias) => aliasPattern(alias).test(boundedText));
    if (!matchedAlias) {
      continue;
    }
    matches.push({
      canonicalId: entry.canonicalId,
      canonicalName: entry.canonicalName,
      canonicalStatus: entry.canonicalStatus,
      effectiveFrom: entry.effectiveFrom,
      invalidatedFrom: entry.invalidatedFrom,
      matchedAlias,
      reviewMessage: entry.reviewMessage,
      statusAtScan: statusAtScan(entry, scanTimestamp),
      subjectArea: entry.subjectArea,
      supersededBy: entry.supersededBy,
      supersededFrom: entry.supersededFrom,
    });
  }

  return matches;
}

export function hasStaleLegalFrameworkReference(
  matches: readonly LegalFrameworkValidityMatch[],
) {
  return matches.some((match) =>
    match.statusAtScan === "invalidated" ||
    match.statusAtScan === "superseded" ||
    match.statusAtScan === "not_yet_effective"
  );
}
