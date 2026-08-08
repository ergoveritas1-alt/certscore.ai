import { getDomain as getTldtsDomain, getHostname as getTldtsHostname } from "tldts";
import {
  isCanonicalIdSyncEndpoint,
  resolveCanonicalVendorLegalContext
} from "@certscore/vendor-resolver";
import {
  isKnownCmpInfrastructureHost,
  isKnownCmpVendorLabel
} from "../../../../packages/shared/src/known-cmps";
import { deriveCertScoreFindings } from "./derive-findings";
import { getHybridRuntimeEvidence } from "./hybrid-runtime-evidence";
import {
  buildRuntimeCookieInventory,
  getRuntimeCookieEvidenceIdentity,
  type RuntimeCookieEvidenceRow
} from "./runtime-cookie-evidence";
import {
  buildRuntimeCookiePriorityGroups,
  runtimeCookieConfidenceWeight,
  runtimeCookiePriorityWeight,
  type RuntimeCookieInventoryConfidence,
  type RuntimeCookieReviewPriority
} from "./runtime-cookie-priority";
import {
  findRuntimeEntityOwner,
  findRuntimeCanonicalEntityOwner,
  findRuntimeCookieOwner,
  findRuntimeRequestOwner,
  findRuntimeVendorLabelOwner,
  isLikelyCookieName,
  type RuntimeVendorAttributionEvidence
} from "./runtime-vendor-ownership";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";

export type ConsentReviewPriority = RuntimeCookieReviewPriority;
export type InventoryConfidence = RuntimeCookieInventoryConfidence;
export type InventoryMacroCategory = "Advertising" | "Analytics" | "Essential" | "Functional" | "Review";
export type InventoryEvidenceClassification = "Contextual" | "Essential" | "Non-essential" | "Review";
export type InventorySiteRelationship = "same_site" | "cross_site" | "mixed" | "unknown";
export type InventoryEntityRelationship = "same_entity" | "affiliated_entity" | "external_entity" | "mixed" | "unknown";

export type PreConsentDataFlow = {
  controllingEntity: {
    legalEntity: string | null;
    headquartersCountry: string | null;
  };
  endpoint: string;
  idSync: boolean;
  networkDestination: {
    ip: string | null;
    country: string | null;
    countryCode: string | null;
    asn: number | null;
    provider: string | null;
    label: "server location (may be CDN edge)";
  };
  transferMechanism: {
    mechanism: "adequacy_decision" | "dpf_certified" | "sccs_assumed_unverified" | "unknown";
    basis: string;
    verifiedAsOf: string;
  };
};

export type SanitizedRequestEvidenceRow = {
  cookieNamesSent: string[];
  essentiality: "non_essential" | "unknown";
  hostname: string | null;
  identifierParameterNames: string[];
  initiatorUrl: string | null;
  method: string | null;
  path: string | null;
  responseCookieNamesSet: string[];
  responseObserved: boolean;
  responseStorageAttempted: boolean;
  vendor: string | null;
};

export type TrackerInventoryRow = {
  attributionEvidence?: RuntimeVendorAttributionEvidence | null;
  category: string;
  confidence: number | null;
  cookieNames?: string[];
  domains: string[];
  firstSeenMs: number | null;
  label: string;
  observedVia: string[];
  party: "first_party" | "third_party" | "unknown" | "mixed";
  siteRelationship?: InventorySiteRelationship;
  entityRelationship?: InventoryEntityRelationship;
  preConsent: boolean;
  requestCount: number | null;
  regulatoryRelevance?: string[] | null;
  source: string;
  syncedIdentifiers?: string[];
  vendorDisplayCategory?: string | null;
};

export type CookieInventoryGroupRow = {
  attributionEvidence?: RuntimeVendorAttributionEvidence | null;
  confidence: InventoryConfidence;
  cookieDetails: RuntimeCookieEvidenceRow[];
  cookieNames: string[];
  domains: string[];
  firstSeenMs: number | null;
  macroCategory: InventoryMacroCategory;
  party: "first_party" | "third_party" | "unknown" | "mixed";
  siteRelationship: InventorySiteRelationship;
  entityRelationship: InventoryEntityRelationship;
  priority: ConsentReviewPriority;
  purpose: string;
  setByThirdPartyScript: boolean;
  syncedIdentifiers?: string[];
  timingEvidence?: RuntimeCookieEvidenceRow["timingEvidence"] | "mixed";
  vendor: string;
};

export type TrackerInventoryGroupRow = {
  attributionEvidence?: RuntimeVendorAttributionEvidence | null;
  confidence: InventoryConfidence;
  cookieNames: string[];
  domains: string[];
  firstSeenMs: number | null;
  macroCategory: InventoryMacroCategory;
  party: "first_party" | "third_party" | "unknown" | "mixed";
  siteRelationship: InventorySiteRelationship;
  entityRelationship: InventoryEntityRelationship;
  preConsent: boolean;
  rawProducts: string[];
  requestDetails?: SanitizedRequestEvidenceRow[];
  regulatoryRelevance: string[];
  attributionSignatures: string[];
  priority: ConsentReviewPriority;
  purpose: string;
  requestCount: number | null;
  syncedIdentifiers?: string[];
  vendor: string;
};

export type InventoryGroupRow = {
  attributionEvidence?: RuntimeVendorAttributionEvidence | null;
  attributionSignatures: string[];
  canonicalEntity: string | null;
  confidence: InventoryConfidence;
  cookieDetails: RuntimeCookieEvidenceRow[];
  dataFlows: PreConsentDataFlow[];
  cookieNames: string[];
  domains: string[];
  firstSeenMs: number | null;
  macroCategory: InventoryMacroCategory;
  observedRecordCount: number;
  party: "first_party" | "third_party" | "unknown" | "mixed";
  siteRelationship: InventorySiteRelationship;
  entityRelationship: InventoryEntityRelationship;
  preConsent: boolean;
  priority: ConsentReviewPriority;
  purpose: string;
  purposes: string[];
  rawProducts: string[];
  requestDetails?: SanitizedRequestEvidenceRow[];
  regulatoryRelevance: string[];
  requestCount: number | null;
  setByThirdPartyScript: boolean;
  syncedIdentifiers?: string[];
  timingEvidence?: RuntimeCookieEvidenceRow["timingEvidence"] | "mixed";
  type: "cookie" | "tracker";
  vendor: string;
};

export type RuntimeInventoryPresentationState =
  | { status: "retained"; message: null }
  | { status: "empty"; message: "No retained cookies or trackers were detected for this scan." }
  | { status: "insufficient_evidence"; message: "Cookie and tracker inventory was not available because retained runtime coverage was incomplete." }
  | { status: "pending"; message: "Cookie and tracker inventory is not yet available." };

export function deriveRuntimeInventoryPresentationState(input: {
  groupedRowCount: number;
  runtimeCoverageLimited: boolean;
  scanCompleted: boolean;
}): RuntimeInventoryPresentationState {
  if (input.groupedRowCount > 0) {
    return { status: "retained", message: null };
  }
  if (input.runtimeCoverageLimited) {
    return {
      status: "insufficient_evidence",
      message: "Cookie and tracker inventory was not available because retained runtime coverage was incomplete."
    };
  }
  if (input.scanCompleted) {
    return {
      status: "empty",
      message: "No retained cookies or trackers were detected for this scan."
    };
  }
  return {
    status: "pending",
    message: "Cookie and tracker inventory is not yet available."
  };
}

export function isTimedPreConsentInventoryRow(row: TrackerInventoryRow) {
  if ((row.cookieNames?.length ?? 0) > 0) {
    return true;
  }
  return row.preConsent === true && row.firstSeenMs !== null;
}

export function getInventoryGroupRowRenderKey(
  row: Pick<InventoryGroupRow, "type" | "vendor" | "purpose" | "cookieNames" | "domains" | "priority" | "party">,
  index: number
) {
  return JSON.stringify([
    row.type,
    row.vendor,
    row.purpose,
    [...row.cookieNames].sort(),
    [...row.domains].sort(),
    row.priority,
    row.party,
    index
  ]);
}

type ReportVendorSurfaceProjectionInput = {
  rawThirdPartyDomains: string[];
  resolvedVendorNames: string[];
  topObservedEntities: Array<{ label: string; category: string; requestCount: number }>;
  unresolvedVendorHosts: string[];
  vendorCategoryCounts: Record<string, number>;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getRecordStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function getObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function getOptionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getOptionalNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizedEvidenceUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}

export function buildSanitizedRequestEvidenceRows(
  hybridRuntimeEvidence: Record<string, unknown> | null | undefined
): SanitizedRequestEvidenceRow[] {
  return getObjectArray(
    hybridRuntimeEvidence?.requestPurposeClassificationConfidence ??
    hybridRuntimeEvidence?.request_purpose_classification_confidence
  ).slice(0, 50).map((row) => ({
    cookieNamesSent: getRecordStringArray(row, "cookieNamesSent").slice(0, 24),
    essentiality: row.essentiality === "non_essential" ? "non_essential" : "unknown",
    hostname: normalizeInventoryHostname(getOptionalString(row, "hostname") ?? getOptionalString(row, "requestUrl")),
    identifierParameterNames: getRecordStringArray(row, "identifierParameterNames").slice(0, 24),
    initiatorUrl: sanitizedEvidenceUrl(getOptionalString(row, "initiatorUrl")),
    method: getOptionalString(row, "method"),
    path: getOptionalString(row, "pathSample"),
    responseCookieNamesSet: getRecordStringArray(row, "responseCookieNamesSet").slice(0, 24),
    responseObserved: row.responseObserved === true,
    responseStorageAttempted: row.responseStorageAttempted === true,
    vendor: getOptionalString(row, "vendor") ?? getOptionalString(row, "vendorName"),
  }));
}

export function buildPreConsentDataFlows(
  hybridRuntimeEvidence: Record<string, unknown> | null | undefined
): PreConsentDataFlow[] {
  const rows = getObjectArray(
    hybridRuntimeEvidence?.requestObservations ?? hybridRuntimeEvidence?.request_observations
  );
  const flowsByKey = new Map<string, PreConsentDataFlow>();
  for (const row of rows) {
    const endpoint = normalizeInventoryHostname(
      getOptionalString(row, "domain") ??
      getOptionalString(row, "hostname") ??
      getOptionalString(row, "requestUrl")
    );
    if (!endpoint) continue;
    const owner = findRuntimeRequestOwner(getOptionalString(row, "requestUrl") ?? endpoint) ??
      findRuntimeEntityOwner(endpoint);
    const legalContext = resolveCanonicalVendorLegalContext(owner?.entity);
    const destination = getRecord(row.networkDestination ?? row.network_destination);
    const ip = destination ? getOptionalString(destination, "ip") : null;
    const country = destination ? getOptionalString(destination, "country") : null;
    const countryCode = destination
      ? getOptionalString(destination, "countryCode") ??
        getOptionalString(destination, "country_code")
        ?? (/^[A-Z]{2}$/i.test(country ?? "") ? country : null)
      : null;
    const asn = destination ? getOptionalNumber(destination, "asn") : null;
    const provider = destination ? getOptionalString(destination, "provider") : null;
    const mechanism = legalContext?.transferMechanism ?? {
      basis: "No verified transfer-mechanism entry is available in the canonical vendor knowledge base.",
      mechanism: "unknown" as const,
      verifiedAsOf: "2026-07-23",
    };
    const flow: PreConsentDataFlow = {
      controllingEntity: {
        legalEntity: legalContext?.controllingEntity ?? owner?.entity ?? null,
        headquartersCountry: legalContext?.headquartersCountry ?? null,
      },
      endpoint,
      idSync: row.idSyncEndpoint === true || row.id_sync_endpoint === true || isCanonicalIdSyncEndpoint(endpoint),
      networkDestination: {
        ip,
        country,
        countryCode,
        asn,
        provider,
        label: "server location (may be CDN edge)",
      },
      transferMechanism: {
        basis: mechanism.basis,
        mechanism: mechanism.mechanism,
        verifiedAsOf: mechanism.verifiedAsOf,
      },
    };
    flowsByKey.set(`${endpoint}\u0000${ip ?? ""}`, flow);
  }
  return [...flowsByKey.values()];
}

function isCmpVendorDomain(value: string | null | undefined) {
  return isKnownCmpInfrastructureHost(value);
}

function isCmpOrFunctionalVendorLabel(value: string | null | undefined) {
  return isKnownCmpVendorLabel(value);
}

function isCmpVendorLabel(value: string | null | undefined) {
  return isKnownCmpVendorLabel(value);
}

export function isCmpOrFunctionalVendorDomain(value: string | null | undefined) {
  return isKnownCmpInfrastructureHost(value);
}

function isFunctionalButNotCmpVendorDomain(value: string | null | undefined) {
  return isCmpOrFunctionalVendorDomain(value) && !isCmpVendorDomain(value);
}

function isFunctionalButNotCmpVendorLabel(value: string | null | undefined) {
  return isCmpOrFunctionalVendorLabel(value) && !isCmpVendorLabel(value);
}

function canonicalExecVendorOwner(value: string) {
  return findRuntimeVendorLabelOwner(value) ??
    findRuntimeEntityOwner(value) ??
    findRuntimeCanonicalEntityOwner(value);
}

function canonicalizeExecTopObservedEntities(
  entities: ReportVendorSurfaceProjectionInput["topObservedEntities"]
) {
  const grouped = new Map<string, ReportVendorSurfaceProjectionInput["topObservedEntities"][number]>();
  for (const entity of entities) {
    const owner = canonicalExecVendorOwner(entity.label);
    const label = owner?.vendor ?? entity.label;
    const existing = grouped.get(label.toLowerCase());
    if (!existing) {
      grouped.set(label.toLowerCase(), {
        ...entity,
        label
      });
      continue;
    }
    grouped.set(label.toLowerCase(), {
      ...existing,
      requestCount: existing.requestCount + entity.requestCount
    });
  }
  return [...grouped.values()];
}

export function buildReportSurfaceVendorProjection(input: ReportVendorSurfaceProjectionInput) {
  const execSummaryResolvedVendorNames = uniqueStrings(
    input.resolvedVendorNames
      .filter((name) => !isFunctionalButNotCmpVendorLabel(name))
      .map((name) => canonicalExecVendorOwner(name)?.vendor ?? name)
  );
  const execSummaryThirdPartyDomains = uniqueStrings(input.rawThirdPartyDomains).filter((domain) => !isCmpOrFunctionalVendorDomain(domain));
  const execSummaryTopObservedEntities = canonicalizeExecTopObservedEntities(
    input.topObservedEntities.filter((entity) => (
      !isFunctionalButNotCmpVendorLabel(entity.label) &&
      !isFunctionalButNotCmpVendorDomain(entity.label)
    ))
  );
  const execSummaryUnresolvedVendorHosts = uniqueStrings(input.unresolvedVendorHosts).filter((host) => (
    !isCmpOrFunctionalVendorDomain(host) &&
    !canonicalExecVendorOwner(host)
  ));
  const execSummaryCmpCategoryCount = uniqueStrings([
    ...execSummaryResolvedVendorNames.filter(isCmpVendorLabel),
    ...execSummaryTopObservedEntities
      .filter((entity) => entity.category === "cmp" || isCmpVendorDomain(entity.label) || isCmpVendorLabel(entity.label))
      .map((entity) => entity.label)
  ]).length;

  return {
    execSummary: {
      resolvedVendorNames: execSummaryResolvedVendorNames,
      thirdPartyDomains: execSummaryThirdPartyDomains,
      topObservedEntities: execSummaryTopObservedEntities,
      unresolvedVendorHosts: execSummaryUnresolvedVendorHosts,
      vendorCategoryCounts: execSummaryCmpCategoryCount > 0
        ? {
            ...input.vendorCategoryCounts,
            cmp: Math.max(input.vendorCategoryCounts.cmp ?? 0, execSummaryCmpCategoryCount)
          }
        : input.vendorCategoryCounts
    },
    evidenceInventory: {
      resolvedVendorNames: input.resolvedVendorNames,
      thirdPartyDomains: uniqueStrings(input.rawThirdPartyDomains),
      topObservedEntities: input.topObservedEntities,
      unresolvedVendorHosts: uniqueStrings(input.unresolvedVendorHosts)
    }
  };
}

function normalizeInventoryLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function canonicalTrackerGroupLabel(value: string, purpose: string, domains: string[]) {
  const normalized = value.trim().toLowerCase();
  if (/^(x\/twitter|twitter pixel|twitter social widgets)$/.test(normalized)) {
    return "X/Twitter";
  }
  if (/clarity/.test(normalized) || (normalized === "microsoft" && /session replay/i.test(purpose)) || domains.some((domain) => /(?:^|\.)clarity\.ms$/i.test(domain))) {
    return "Microsoft Clarity";
  }
  if (/^jsdelivr(?: cdn)?$/.test(normalized)) {
    return "jsDelivr CDN";
  }
  if (/^cloudflare(?: bot management)?$/.test(normalized)) {
    return "Cloudflare Bot Management";
  }
  if (/^(?:google publisher tag|google ads \/ doubleclick|doubleclick|google ads)$/.test(normalized) && /advertising/i.test(purpose)) {
    return "Google Ads / DoubleClick";
  }
  if (/^inmobi(?: choice)?(?: cmp)?$/.test(normalized)) {
    return "InMobi Choice CMP";
  }
  return findRuntimeVendorLabelOwner(value)?.product ?? value;
}

function getNumberFromRecord(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function normalizeInventoryHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  if (!isDisplayHostnameCandidate(value)) {
    return null;
  }
  const hostname = getTldtsHostname(value.includes("://") ? value : `https://${value}`);
  const normalized = hostname?.replace(/^www\./, "").toLowerCase() ?? null;
  return isInventoryDisplayHostname(normalized) ? normalized : null;
}

export function inventoryRegistrableDomain(value: string | null | undefined) {
  const hostname = normalizeInventoryHostname(value);
  if (!hostname) {
    return null;
  }
  return getTldtsDomain(hostname, { allowPrivateDomains: true }) ?? hostname;
}

function isDisplayHostnameCandidate(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 &&
    !trimmed.startsWith(".") &&
    !trimmed.startsWith("_") &&
    !/\s/.test(trimmed);
}

export function isInventoryDisplayHostname(value: string | null | undefined) {
  if (!value) {
    return false;
  }
  return /^[a-z0-9](?:[a-z0-9-]*\.)+[a-z0-9-]{2,}$/i.test(value.trim());
}

function getStringArrayFromRecord(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) {
      return uniqueStrings(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0));
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return [value.trim()];
    }
  }
  return [];
}

function trackerMatchedHosts(tracker: ScanDetailResponse["trackerVendors"][number]) {
  const record = tracker as unknown as Record<string, unknown>;
  return uniqueStrings([
    tracker.scriptHost,
    typeof record.endpointHostname === "string" ? record.endpointHostname : null,
    typeof record.scriptHost === "string" ? record.scriptHost : null,
    ...getStringArrayFromRecord(record, ["matchedHostnames", "matched_hostnames", "matchedHosts", "matched_hosts"])
  ].map(normalizeInventoryHostname));
}

function trackerOwnedMatchedHosts(tracker: ScanDetailResponse["trackerVendors"][number]) {
  const labelOwner = findRuntimeVendorLabelOwner(tracker.vendorName);
  return trackerMatchedHosts(tracker).filter((hostname) => {
    const domainOwner = findRuntimeEntityOwner(hostname);
    return !labelOwner || !domainOwner || labelOwner.entity === domainOwner.entity;
  });
}

function trackerHasConcreteVendorAnchor(tracker: ScanDetailResponse["trackerVendors"][number]) {
  const record = tracker as unknown as Record<string, unknown>;
  const labelOwner = findRuntimeVendorLabelOwner(tracker.vendorName);
  if (!labelOwner) {
    return true;
  }
  const domains = trackerMatchedHosts(tracker);
  if (domains.some((domain) => findRuntimeEntityOwner(domain)?.entity === labelOwner.entity)) {
    return true;
  }
  const matchedUrls = getStringArrayFromRecord(record, [
    "matchedUrls",
    "matched_urls",
    "requestUrls",
    "request_urls",
    "evidenceUrls",
    "evidence_urls"
  ]);
  if (matchedUrls.some((url) => findRuntimeRequestOwner(url)?.entity === labelOwner.entity)) {
    return true;
  }
  const cookieNames = getStringArrayFromRecord(record, ["matchedCookieNames", "matched_cookie_names", "cookieNames", "cookie_names"]);
  if (cookieNames.some((cookieName) =>
    (domains.length > 0 ? domains : [null]).some((domain) =>
      findRuntimeCookieOwner(cookieName, domain)?.entity === labelOwner.entity
    )
  )) {
    return true;
  }
  const signatures = getStringArrayFromRecord(record, ["attributionSignatures", "attribution_signatures", "basis"]);
  return signatures.some((signature) =>
    !/^canonical_(?:product|vendor)_label$/i.test(signature) &&
    !/^(?:resolver|vendor_resolver)$/i.test(signature)
  ) && (matchedUrls.length > 0 || cookieNames.length > 0 || domains.length > 0);
}

function sanitizeInventoryDomains(values: Array<string | null | undefined>) {
  return uniqueStrings(values.map((value) => {
    const host = normalizeInventoryHostname(value);
    return host && !isLikelyCookieName(host) ? host : null;
  }));
}

export function buildBrowserExtensionRequestInventoryRows(
  hybridRuntimeEvidence: Record<string, unknown> | null | undefined
): TrackerInventoryRow[] {
  return getObjectArray(
    hybridRuntimeEvidence?.browserExtensionRequestInventory ?? hybridRuntimeEvidence?.browser_extension_request_inventory
  ).flatMap((row) => {
    const hostname = normalizeInventoryHostname(getOptionalString(row, "hostname"));
    if (!hostname) {
      return [];
    }
    const vendor = getOptionalString(row, "product") ?? getOptionalString(row, "vendor") ?? hostname;
    const category = getOptionalString(row, "category") ?? "unresolved_host";
    const confidence = getOptionalNumber(row, "confidence");
    const firstSeenMs = getOptionalNumber(row, "firstSeenMs");
    const requestCount = getOptionalNumber(row, "requestCount");
    const regulatoryRelevance = getStringArrayFromRecord(row, ["regulatoryRelevance", "regulatory_relevance"]);

    return [{
      attributionEvidence: null,
      category,
      confidence,
      cookieNames: [],
      domains: [hostname],
      firstSeenMs,
      label: vendor,
      observedVia: ["request"],
      party: "third_party" as const,
      siteRelationship: "cross_site" as const,
      entityRelationship: "unknown" as const,
      preConsent: row.preConsent === true,
      requestCount,
      regulatoryRelevance,
      source: "browser_extension_bx01",
      syncedIdentifiers: [],
      vendorDisplayCategory: null
    }];
  });
}

function isSyncedVendorInference(vendorName: string, ownerVendor: string) {
  const normalizedVendorName = vendorName.trim().toLowerCase();
  const normalizedOwnerVendor = ownerVendor.trim().toLowerCase();
  return Boolean(normalizedVendorName && normalizedVendorName !== normalizedOwnerVendor &&
    !(normalizedOwnerVendor === "google" && /^google\b/.test(normalizedVendorName)));
}

function resolveTrackerIdentity(input: { category: string | null | undefined; domains: string[]; source: string | null | undefined; vendorName: string }) {
  const owner = input.domains.map(findRuntimeEntityOwner).find((candidate) => candidate !== null);
  const labelOwner = owner ? null : findRuntimeVendorLabelOwner(input.vendorName);
  const resolvedOwner = owner ?? labelOwner;
  if (!resolvedOwner) {
    return {
      attributionEvidence: null,
      category: input.category || "tracker",
      confidence: null,
      label: input.vendorName,
      regulatoryRelevance: [] as string[],
      syncedIdentifiers: [] as string[],
      vendorDisplayCategory: null
    };
  }
  const shouldUseDomainOwner = owner && (isSyncedVendorInference(input.vendorName, owner.vendor) || input.vendorName === input.domains[0] || input.source === "id_sync");
  return {
    attributionEvidence: resolvedOwner.attributionEvidence,
    category: resolvedOwner.category ?? input.category ?? "tracker",
    confidence: resolvedOwner.confidence,
    label: labelOwner ? labelOwner.product : shouldUseDomainOwner ? resolvedOwner.vendor : input.vendorName,
    regulatoryRelevance: resolvedOwner.regulatoryRelevance,
    syncedIdentifiers: shouldUseDomainOwner && isSyncedVendorInference(input.vendorName, resolvedOwner.vendor) ? [input.vendorName] : [],
    vendorDisplayCategory: labelOwner ? labelOwner.vendorDisplayCategory : null
  };
}

export function buildTrackerInventoryRows(input: {
  domains: string[];
  firstPartyDomain?: string | null;
  preConsentVendors: string[];
  resolvedVendors: string[];
  sessionReplayVendors: string[];
  trackerVendors: Array<ScanDetailResponse["trackerVendors"][number] & { observedVia?: string[] | null; regulatoryRelevance?: string[] | null; vendorDisplayCategory?: string | null }>;
  topObservedEntities: Array<{ label: string; category: string; requestCount: number }>;
  unresolvedHosts: string[];
}) {
  const rows = new Map<string, TrackerInventoryRow>();
  const firstPartyRegistrableDomain = inventoryRegistrableDomain(input.firstPartyDomain);
  const resolvedTrackerHosts = new Set(
    input.trackerVendors.filter(trackerHasConcreteVendorAnchor).flatMap(trackerMatchedHosts)
  );
  const isSameSiteHost = (value: string) => {
    const hostDomain = inventoryRegistrableDomain(value);
    return Boolean(firstPartyRegistrableDomain && hostDomain === firstPartyRegistrableDomain);
  };
  const isCoveredByResolvedVendorHost = (value: string) => {
    const host = normalizeInventoryHostname(value);
    return Boolean(host && resolvedTrackerHosts.has(host));
  };
  const getTrackerParty = (domains: string[]): TrackerInventoryRow["party"] => {
    if (domains.length === 0) {
      return "unknown";
    }
    const firstPartyCount = domains.filter(isSameSiteHost).length;
    if (firstPartyCount === domains.length) {
      return "first_party";
    }
    if (firstPartyCount > 0) {
      return "mixed";
    }
    return "third_party";
  };
  const addRow = (row: TrackerInventoryRow) => {
    const key = `${row.label.toLowerCase()}\u0000${row.category.toLowerCase()}\u0000${row.domains.join("|") || "no-domain"}`;
    const existing = rows.get(key);
    if (!existing) {
      rows.set(key, row);
      return;
    }
    rows.set(key, {
      ...existing,
      confidence: Math.max(existing.confidence ?? 0, row.confidence ?? 0) || existing.confidence || row.confidence,
      cookieNames: uniqueStrings([...(existing.cookieNames ?? []), ...(row.cookieNames ?? [])]),
      domains: uniqueStrings([...existing.domains, ...row.domains]),
      firstSeenMs:
        existing.firstSeenMs !== null && row.firstSeenMs !== null
          ? Math.min(existing.firstSeenMs, row.firstSeenMs)
          : existing.firstSeenMs ?? row.firstSeenMs,
      observedVia: uniqueStrings([...existing.observedVia, ...row.observedVia]),
      party: mergePartyValues(existing.party, row.party),
      siteRelationship: mergePartyValues(existing.siteRelationship ?? "unknown", row.siteRelationship ?? "unknown"),
      entityRelationship: mergePartyValues(existing.entityRelationship ?? "unknown", row.entityRelationship ?? "unknown"),
      preConsent: existing.preConsent || row.preConsent,
      regulatoryRelevance: uniqueStrings([...(existing.regulatoryRelevance ?? []), ...(row.regulatoryRelevance ?? [])]),
      requestCount: Math.max(existing.requestCount ?? 0, row.requestCount ?? 0) || existing.requestCount || row.requestCount,
      source: existing.source === row.source ? existing.source : "multiple",
      syncedIdentifiers: uniqueStrings([...(existing.syncedIdentifiers ?? []), ...(row.syncedIdentifiers ?? [])])
    });
  };

  for (const entity of input.topObservedEntities) {
    const entityHost = normalizeInventoryHostname(entity.label);
    if (!entityHost || isSameSiteHost(entityHost) || isCoveredByResolvedVendorHost(entityHost)) {
      continue;
    }
    // A concrete hostname is evidence in its own right even when a summary-domain
    // list omitted it. Preserve the literal host so PSL party classification and
    // raw-host audit rows do not degrade to an unexplained label.
    const domains = sanitizeInventoryDomains([entityHost]);
    const identity = resolveTrackerIdentity({ category: entity.category || "tracker", domains, source: "runtime requests", vendorName: entity.label });
    addRow({
      attributionEvidence: identity.attributionEvidence,
      category: identity.category,
      confidence: identity.confidence,
      cookieNames: [],
      domains,
      firstSeenMs: null,
      label: identity.label,
      observedVia: ["request"],
      party: getTrackerParty(domains),
      siteRelationship: siteRelationshipForDomains(domains, input.firstPartyDomain),
      entityRelationship: entityRelationshipForDomains(domains, input.firstPartyDomain),
      preConsent: input.preConsentVendors.includes(entity.label),
      requestCount: entity.requestCount,
      regulatoryRelevance: identity.regulatoryRelevance,
      source: "runtime requests",
      syncedIdentifiers: identity.syncedIdentifiers,
      vendorDisplayCategory: identity.vendorDisplayCategory
    });
  }
  for (const tracker of input.trackerVendors) {
    if (!trackerHasConcreteVendorAnchor(tracker)) {
      continue;
    }
    const record = tracker as unknown as Record<string, unknown>;
    const observedVia = tracker.observedVia && tracker.observedVia.length > 0
      ? uniqueStrings(tracker.observedVia)
      : getStringArrayFromRecord(record, ["observedVia", "observed_via"]);
    // Keep the raw tracker artifact intact, but do not project a hostname beside a
    // named vendor when both have strong, conflicting canonical owners. This is
    // especially important for security cookies written on another product's host.
    const matchedDomains = sanitizeInventoryDomains(trackerOwnedMatchedHosts(tracker));
    const matchedCookieNames = getStringArrayFromRecord(record, [
      "matchedCookieNames",
      "matched_cookie_names",
      "cookieNames",
      "cookie_names"
    ]);
    const identity = resolveTrackerIdentity({ category: tracker.vendorCategory || "tracker", domains: matchedDomains, source: tracker.detectionSource, vendorName: tracker.vendorName });
    addRow({
      attributionEvidence: identity.attributionEvidence,
      category: identity.category,
      confidence: identity.confidence ?? (typeof tracker.confidence === "number" && Number.isFinite(tracker.confidence) ? tracker.confidence : null),
      cookieNames: matchedCookieNames,
      domains: matchedDomains,
      firstSeenMs: getNumberFromRecord(record, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms"]),
      label: identity.label,
      observedVia: observedVia.length > 0 ? observedVia : ["request"],
      party: getTrackerParty(matchedDomains),
      siteRelationship: siteRelationshipForDomains(matchedDomains, input.firstPartyDomain),
      entityRelationship: entityRelationshipForDomains(matchedDomains, input.firstPartyDomain),
      preConsent: tracker.beforeConsent === true || input.preConsentVendors.includes(tracker.vendorName) || input.preConsentVendors.includes(identity.label),
      regulatoryRelevance: uniqueStrings([
        ...(tracker.regulatoryRelevance ?? getStringArrayFromRecord(record, ["regulatoryRelevance", "regulatory_relevance"])),
        ...identity.regulatoryRelevance
      ]),
      requestCount: null,
      source: tracker.detectionSource || "tracker inventory",
      syncedIdentifiers: identity.syncedIdentifiers,
      vendorDisplayCategory: tracker.vendorDisplayCategory ?? (typeof record.vendorDisplayCategory === "string" ? record.vendorDisplayCategory : identity.vendorDisplayCategory)
    });
  }
  for (const vendor of input.resolvedVendors) {
    const identity = resolveTrackerIdentity({
      category: input.sessionReplayVendors.includes(vendor) ? "session_replay" : "unknown",
      domains: [],
      source: "vendor resolver",
      vendorName: vendor
    });
    const vendorOwner = findRuntimeVendorLabelOwner(vendor);
    const hasOwnedFirstPartyEntityObservation = Boolean(vendorOwner && input.topObservedEntities.some((entity) => {
      const hostname = normalizeInventoryHostname(entity.label);
      return Boolean(
        hostname &&
        isSameSiteHost(hostname) &&
        findRuntimeCanonicalEntityOwner(hostname)?.entity === vendorOwner.entity
      );
    }));
    const hasConcreteObservedRow = [...rows.values()].some((row) =>
      (
        row.label.toLowerCase() === vendor.toLowerCase() ||
        row.label.toLowerCase() === identity.label.toLowerCase() ||
        Boolean(vendorOwner && findRuntimeVendorLabelOwner(row.label)?.entity === vendorOwner.entity)
      ) &&
      (
        row.domains.length > 0 ||
        row.observedVia.some((value) => !/^(resolver|vendor resolver)$/i.test(value))
      )
    ) || hasOwnedFirstPartyEntityObservation;
    if (hasConcreteObservedRow) {
      continue;
    }
    addRow({
      attributionEvidence: identity.attributionEvidence,
      category: identity.category,
      confidence: identity.confidence,
      cookieNames: [],
      domains: [],
      firstSeenMs: null,
      label: identity.label,
      observedVia: ["resolver"],
      party: "unknown",
      siteRelationship: "unknown",
      entityRelationship: "unknown",
      preConsent: input.preConsentVendors.includes(vendor),
      requestCount: null,
      regulatoryRelevance: identity.regulatoryRelevance,
      source: "vendor resolver",
      syncedIdentifiers: identity.syncedIdentifiers,
      vendorDisplayCategory: identity.vendorDisplayCategory
    });
  }
  for (const host of input.unresolvedHosts) {
    const unresolvedHost = normalizeInventoryHostname(host);
    if (!unresolvedHost || isSameSiteHost(unresolvedHost) || isCoveredByResolvedVendorHost(unresolvedHost)) {
      continue;
    }
    const domains = sanitizeInventoryDomains([unresolvedHost]);
    const identity = resolveTrackerIdentity({ category: "unresolved_host", domains, source: "host inventory", vendorName: unresolvedHost });
    addRow({
      attributionEvidence: identity.attributionEvidence,
      category: identity.category,
      confidence: identity.confidence,
      cookieNames: [],
      domains,
      firstSeenMs: null,
      label: identity.label,
      observedVia: ["host"],
      party: getTrackerParty(domains),
      siteRelationship: siteRelationshipForDomains(domains, input.firstPartyDomain),
      entityRelationship: entityRelationshipForDomains(domains, input.firstPartyDomain),
      preConsent: false,
      requestCount: null,
      regulatoryRelevance: identity.regulatoryRelevance,
      source: "host inventory",
      syncedIdentifiers: identity.syncedIdentifiers,
      vendorDisplayCategory: identity.vendorDisplayCategory
    });
  }

  return [...rows.values()].sort((left, right) => {
    const requestDelta = (right.requestCount ?? 0) - (left.requestCount ?? 0);
    return requestDelta !== 0 ? requestDelta : left.label.localeCompare(right.label);
  });
}

export function getInventoryCategoryLabel(
  vendorLabel: string,
  fallbackCategory: string | null | undefined,
  regulatoryRelevance?: readonly string[] | null
) {
  const relevance = (regulatoryRelevance ?? []).join(" ").toLowerCase();
  if (/\badvertising_library\b/.test(relevance)) {
    return "Advertising library";
  }
  if (/\bconfiguration_connection\b/.test(relevance)) {
    return "Analytics configuration";
  }
  if (/\baudience_measurement\b/.test(relevance)) {
    return "Audience measurement";
  }
  if (/\badvertising_measurement\b|\bad_measurement\b/.test(relevance)) {
    return "Advertising measurement";
  }
  if (fallbackCategory && /^[A-Z][A-Za-z /&-]+$/.test(fallbackCategory) && fallbackCategory !== "Unknown") {
    return fallbackCategory;
  }
  if (fallbackCategory && /^vendor$/i.test(fallbackCategory)) {
    return "Unknown";
  }

  const label = vendorLabel.toLowerCase();
  if (/google sign.?in|accounts\.google|gsi\/client/.test(label)) {
    return "Authentication";
  }
  if (/stripe/.test(label)) {
    return "Payment processors";
  }
  if (/cloudflare bot management|cf_chl|cf_clearance|__cf_bm|cloudflare/.test(label)) {
    return "Security";
  }
  if (/doubleclick floodlight|floodlight|fls\.doubleclick/.test(label)) {
    return "Advertising";
  }
  if (/google adsense|adsbygoogle|pagead2/.test(label)) {
    return "Advertising";
  }
  if (/google publisher tag|googletag|gpt\.js|securepubads/.test(label)) {
    return "Advertising";
  }
  if (/integral ad science|ias/.test(label)) {
    return "Advertising";
  }
  if (/assets\.adobedtm\.com|adobe experience platform launch|adobe launch|adobe dtm/.test(label)) {
    return "Tag management";
  }
  if (/jsdelivr|cdn\.jsdelivr\.net/.test(label)) {
    return "CDN";
  }
  if (/cookieyes|cookielawinfo|viewed_cookie_policy/.test(label)) {
    return "Consent management";
  }
  if (/onetrust|(?:^|\.)cookielaw\.org|optanon/.test(label)) {
    return "Cookie compliance";
  }
  if (/optimizely/.test(label)) {
    return "A/B Testing";
  }
  if (/piano|tinypass/.test(label)) {
    return "Personalisation";
  }
  if (/cxense/.test(label)) {
    return "Personalisation";
  }
  if (/quantcast/.test(label)) {
    return "Analytics";
  }
  if (/gemius/.test(label)) return "Audience measurement";
  if (/ad alliance/.test(label)) return "Advertising";
  if (/green.?video/.test(label)) return "Embedded content";
  if (/sourcepoint|privacy-mgmt/.test(label)) return "Cookie compliance";
  return normalizeInventoryLabel(fallbackCategory || "unknown");
}

function normalizeInventoryPurpose(value: string | null | undefined) {
  return (value ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function getInventoryPurposeTokens(values: Array<string | null | undefined>) {
  return new Set(
    values
      .flatMap((value) => (value ?? "").split(/[,;|/]+/))
      .map((value) => normalizeInventoryPurpose(value))
      .filter((value) => value !== "unknown"),
  );
}

export function deriveInventoryMacroCategory(input: {
  priority?: ConsentReviewPriority | null;
  purpose?: string | null;
  vendor?: string | null;
}): InventoryMacroCategory {
  const purpose = normalizeInventoryPurpose(input.purpose);
  const vendor = (input.vendor ?? "").toLowerCase();

  if (/^(advertising|advertising_measurement|retargeting|fingerprinting|marketing_automation)$/.test(purpose)) {
    return "Advertising";
  }
  if (/^(analytics|audience_measurement|session_replay|performance_monitoring|telemetry|diagnostics|telemetry_diagnostics|a_b_testing|experimentation)$/.test(purpose)) {
    return "Analytics";
  }
  if (/^(security|necessary|payment|payment_processors|authentication|cookie_compliance|consent|consent_management)$/.test(purpose)) {
    return "Essential";
  }
  if (/^(tag_management|tag_manager|functional|customer_support|personalization|personalisation|embedded_content|embedded_media)$/.test(purpose)) {
    return "Functional";
  }
  if (/^(cdn|cdn_static)$/.test(purpose)) {
    return /instagram|vimeo|maps|font|sportradar|trustmary|iterate|medallia|piano|usable|jw player/.test(vendor)
      ? "Functional"
      : "Essential";
  }
  if (input.priority === "high") {
    return "Advertising";
  }
  return "Review";
}

export function classifyInventoryEvidence(
  row: Pick<InventoryGroupRow, "macroCategory" | "priority" | "purpose" | "purposes">
): InventoryEvidenceClassification {
  if (row.priority === "high" || row.priority === "medium") {
    return "Non-essential";
  }
  if (row.priority === "review_needed" || row.macroCategory === "Review") {
    return "Review";
  }

  const purposeTokens = getInventoryPurposeTokens([row.purpose, ...row.purposes]);
  if (
    purposeTokens.has("cookie_compliance") ||
    purposeTokens.has("consent") ||
    purposeTokens.has("consent_management")
  ) {
    return "Contextual";
  }

  // A functional-looking category does not prove the observed activity was
  // necessary in this page context. Payment, authentication, CDN, and generic
  // functional activity remain contextual without an explicit necessity basis.
  if (purposeTokens.has("necessary") || purposeTokens.has("security")) {
    return "Essential";
  }

  return "Contextual";
}

export function getTrackerConsentReviewPriority(row: TrackerInventoryRow): ConsentReviewPriority {
  const purposeLabels = [
    getInventoryCategoryLabel(row.label, row.vendorDisplayCategory ?? row.category, row.regulatoryRelevance),
    row.vendorDisplayCategory,
    row.category,
    ...(row.regulatoryRelevance ?? [])
  ];
  const purposeTokens = getInventoryPurposeTokens(purposeLabels);
  const confidence = getTrackerInventoryConfidence(row);
  const normalizedLabel = row.label.toLowerCase();
  const isLinkedInAdsPixel =
    /linkedin ads pixel/.test(normalizedLabel) ||
    row.domains.some((domain) => /^px\.ads\.linkedin\.com$/i.test(domain.trim()));

  if (isLinkedInAdsPixel) {
    return row.preConsent ? "high" : "review_needed";
  }
  const hasHighRiskPurpose = [
    "advertising",
    "advertising_measurement",
    "ad_measurement",
    "retargeting",
    "audience_measurement",
    "session_replay",
    "fingerprinting"
  ].some((purpose) => purposeTokens.has(purpose));
  if (hasHighRiskPurpose) {
    return row.preConsent ? "high" : "medium";
  }
  const hasMediumRiskPurpose = [
    "analytics",
    "experimentation",
    "personalization",
    "personalisation",
    "a_b_testing",
    "embedded_content",
    "tag_management",
    "tag_manager",
    "marketing_automation"
  ].some((purpose) => purposeTokens.has(purpose));
  if ((purposeTokens.has("personalization") || purposeTokens.has("personalisation")) && confidence === "low") {
    return "review_needed";
  }
  if (hasMediumRiskPurpose) {
    return row.preConsent ? "medium" : "contextual";
  }
  const hasContextualPurpose = [
    "security",
    "payment",
    "payment_processors",
    "authentication",
    "cookie_compliance",
    "consent",
    "consent_management",
    "performance_monitoring",
    "telemetry",
    "diagnostics",
    "telemetry_diagnostics"
  ].some((purpose) => purposeTokens.has(purpose));
  if (hasContextualPurpose) {
    return "contextual";
  }
  if (["cdn_static", "cdn", "functional", "publisher_infrastructure"].some((purpose) => purposeTokens.has(purpose))) {
    return "contextual";
  }
  if (row.category === "unknown" || row.category === "unresolved_host" || row.domains.length === 0) {
    return "review_needed";
  }
  return "review_needed";
}

export function getTrackerInventoryConfidence(row: TrackerInventoryRow): InventoryConfidence {
  const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : null;
  if (confidence !== null) {
    if (confidence >= 0.9) {
      return "high";
    }
    if (confidence >= 0.7) {
      return "medium";
    }
    return "low";
  }
  if (row.domains.length > 0 && row.category !== "unknown" && row.category !== "unresolved_host") {
    return "medium";
  }
  return "low";
}

function formatTrackerParty(row: TrackerInventoryRow) {
  if (row.party === "first_party") {
    return "first_party" as const;
  }
  if (row.party === "mixed") {
    return "mixed";
  }
  if (row.party === "third_party") {
    return "third_party" as const;
  }
  return row.preConsent ? "third_party" as const : "unknown" as const;
}

function priorityWeight(priority: ConsentReviewPriority) {
  return runtimeCookiePriorityWeight(priority);
}

function confidenceWeight(confidence: InventoryConfidence) {
  return runtimeCookieConfidenceWeight(confidence);
}

export function compareInventoryPriorityRows(
  left: { confidence: InventoryConfidence; firstSeenMs: number | null; priority: ConsentReviewPriority; requestCount?: number | null; vendor: string },
  right: { confidence: InventoryConfidence; firstSeenMs: number | null; priority: ConsentReviewPriority; requestCount?: number | null; vendor: string }
) {
  const priorityDelta = priorityWeight(right.priority) - priorityWeight(left.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  if (left.firstSeenMs !== null || right.firstSeenMs !== null) {
    if (left.firstSeenMs === null) {
      return 1;
    }
    if (right.firstSeenMs === null) {
      return -1;
    }
    const firstSeenDelta = left.firstSeenMs - right.firstSeenMs;
    if (firstSeenDelta !== 0) {
      return firstSeenDelta;
    }
  }
  const confidenceDelta = confidenceWeight(right.confidence) - confidenceWeight(left.confidence);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }
  const requestDelta = (right.requestCount ?? 0) - (left.requestCount ?? 0);
  if (requestDelta !== 0) {
    return requestDelta;
  }
  return left.vendor.localeCompare(right.vendor);
}

function siteRelationshipForDomains(
  domains: string[],
  firstPartyDomain: string | null | undefined
): InventorySiteRelationship {
  const targetSite = inventoryRegistrableDomain(firstPartyDomain);
  if (!targetSite || domains.length === 0) return "unknown";
  const relationships = domains.map((domain) =>
    inventoryRegistrableDomain(domain) === targetSite ? "same_site" as const : "cross_site" as const
  );
  return relationships.every((value) => value === relationships[0]) ? relationships[0] ?? "unknown" : "mixed";
}

function entityRelationshipForDomains(
  domains: string[],
  firstPartyDomain: string | null | undefined
): InventoryEntityRelationship {
  const targetOwner = findRuntimeCanonicalEntityOwner(firstPartyDomain);
  if (!targetOwner || domains.length === 0) return "unknown";
  const relationships = domains.map((domain) => {
    const owner = findRuntimeCanonicalEntityOwner(domain);
    if (!owner) return "unknown" as const;
    return owner.entity === targetOwner.entity ? "same_entity" as const : "external_entity" as const;
  });
  if (relationships.some((value) => value === "unknown")) return "unknown";
  return relationships.every((value) => value === relationships[0]) ? relationships[0] ?? "unknown" : "mixed";
}

function legacyPartyFromSiteRelationship(
  relationship: InventorySiteRelationship
): TrackerInventoryRow["party"] {
  if (relationship === "same_site") return "first_party";
  if (relationship === "cross_site") return "third_party";
  return relationship;
}

function mergePartyValues<T extends string>(left: T, right: T): T | "mixed" {
  return left === right ? left : "mixed";
}

export function formatGroupedParty(value: CookieInventoryGroupRow["party"] | TrackerInventoryGroupRow["party"]) {
  if (value === "first_party") {
    return "1st";
  }
  if (value === "third_party") {
    return "3rd";
  }
  if (value === "mixed") {
    return "Mixed";
  }
  return value;
}

export function buildCookieInventoryGroupRows(rows: RuntimeCookieEvidenceRow[], options: { firstPartyDomain?: string | null } = {}) {
  return buildRuntimeCookiePriorityGroups(rows, options).map((row) => {
    const siteRelationship = siteRelationshipForDomains(row.domains, options.firstPartyDomain);
    return {
      ...row,
      entityRelationship: entityRelationshipForDomains(row.domains, options.firstPartyDomain),
      macroCategory: deriveInventoryMacroCategory({
        priority: row.priority,
        purpose: row.purpose,
        vendor: row.vendor
      }),
      party: legacyPartyFromSiteRelationship(siteRelationship),
      siteRelationship,
    };
  });
}

export function buildTrackerInventoryGroupRows(rows: TrackerInventoryRow[]) {
  const grouped = new Map<string, TrackerInventoryGroupRow>();
  for (const row of rows) {
    const purpose = getInventoryCategoryLabel(row.label, row.vendorDisplayCategory ?? row.category, row.regulatoryRelevance);
    const priority = getTrackerConsentReviewPriority(row);
    const canonicalLabel = canonicalTrackerGroupLabel(row.label, purpose, row.domains);
    const key = `${canonicalLabel.toLowerCase()}\u0000${purpose.toLowerCase()}`;
    const candidate: TrackerInventoryGroupRow = {
      attributionEvidence: row.attributionEvidence ?? null,
      confidence: getTrackerInventoryConfidence(row),
      cookieNames: row.cookieNames ?? [],
      domains: row.domains,
      firstSeenMs: row.firstSeenMs,
      macroCategory: deriveInventoryMacroCategory({
        priority,
        purpose,
        vendor: row.label
      }),
      entityRelationship: row.entityRelationship ?? "unknown",
      party: formatTrackerParty(row),
      siteRelationship: row.siteRelationship ?? (
        row.party === "first_party" ? "same_site" : row.party === "third_party" ? "cross_site" : row.party
      ),
      preConsent: row.preConsent,
      rawProducts: [row.label],
      regulatoryRelevance: row.regulatoryRelevance ?? [],
      attributionSignatures: row.attributionEvidence?.signatureId ? [row.attributionEvidence.signatureId] : [],
      priority,
      purpose,
      requestCount: row.requestCount,
      syncedIdentifiers: row.syncedIdentifiers,
      vendor: canonicalLabel
    };
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, candidate);
      continue;
    }
    grouped.set(key, {
      ...existing,
      confidence: confidenceWeight(candidate.confidence) > confidenceWeight(existing.confidence) ? candidate.confidence : existing.confidence,
      cookieNames: uniqueStrings([...existing.cookieNames, ...candidate.cookieNames]),
      domains: uniqueStrings([...existing.domains, ...candidate.domains]),
      firstSeenMs:
        existing.firstSeenMs !== null && candidate.firstSeenMs !== null
          ? Math.min(existing.firstSeenMs, candidate.firstSeenMs)
          : existing.firstSeenMs ?? candidate.firstSeenMs,
      party: mergePartyValues(existing.party, candidate.party),
      siteRelationship: mergePartyValues(existing.siteRelationship, candidate.siteRelationship),
      entityRelationship: mergePartyValues(existing.entityRelationship, candidate.entityRelationship),
      preConsent: existing.preConsent || candidate.preConsent,
      rawProducts: uniqueStrings([...existing.rawProducts, ...candidate.rawProducts]),
      regulatoryRelevance: uniqueStrings([...existing.regulatoryRelevance, ...candidate.regulatoryRelevance]),
      attributionSignatures: uniqueStrings([...existing.attributionSignatures, ...candidate.attributionSignatures]),
      priority: priorityWeight(candidate.priority) > priorityWeight(existing.priority) ? candidate.priority : existing.priority,
      requestCount: Math.max(existing.requestCount ?? 0, candidate.requestCount ?? 0) || existing.requestCount || candidate.requestCount,
      syncedIdentifiers: uniqueStrings([...(existing.syncedIdentifiers ?? []), ...(candidate.syncedIdentifiers ?? [])])
    });
  }
  return [...grouped.values()].sort(compareInventoryPriorityRows);
}

export function suppressUnsupportedCmpAliasRows(rows: TrackerInventoryRow[]) {
  const isCmpRow = (row: TrackerInventoryRow) =>
    /^(?:cmp|consent|consent_management|cookie_compliance)$/i.test(normalizeInventoryPurpose(row.category)) ||
    /\bcmp\b|choice|consent management|cookie compliance/i.test(row.label);
  const concreteCmpRows = rows.filter((row) =>
    isCmpRow(row) &&
    row.domains.length > 0 &&
    row.observedVia.some((source) => !/^(?:resolver|vendor resolver)$/i.test(source))
  );
  if (concreteCmpRows.length === 0) {
    return rows;
  }
  const concreteCmpLabels = new Set(concreteCmpRows.map((row) =>
    canonicalTrackerGroupLabel(row.label, getInventoryCategoryLabel(row.label, row.category, row.regulatoryRelevance), row.domains)
  ));
  return rows.filter((row) => {
    if (!isCmpRow(row) || row.domains.length > 0) {
      return true;
    }
    const canonicalLabel = canonicalTrackerGroupLabel(
      row.label,
      getInventoryCategoryLabel(row.label, row.category, row.regulatoryRelevance),
      row.domains
    );
    return concreteCmpLabels.has(canonicalLabel);
  });
}

export function buildRuntimeInventoryGroupRows(input: {
  cookieRows: RuntimeCookieEvidenceRow[];
  dataFlows?: PreConsentDataFlow[];
  firstPartyDomain?: string | null;
  requestRows?: SanitizedRequestEvidenceRow[];
  trackerRows: TrackerInventoryRow[];
}) {
  const groupedCookieRows = buildCookieInventoryGroupRows(input.cookieRows, { firstPartyDomain: input.firstPartyDomain });
  const groupedTrackerRows = buildTrackerInventoryGroupRows(input.trackerRows);
  const canonicalCookieNames = new Set(
    input.cookieRows.map((row) => row.cookieName.trim().toLowerCase())
  );
  const candidates: InventoryGroupRow[] = [
    ...groupedCookieRows.map((row): InventoryGroupRow => {
      const owner = row.cookieDetails
        .map((detail) => findRuntimeCookieOwner(detail.cookieName, detail.domain))
        .find((candidate) => candidate !== null) ??
        findRuntimeVendorLabelOwner(row.vendor) ??
        row.domains.map(findRuntimeEntityOwner).find((candidate) => candidate !== null);
      return {
        ...row,
        attributionSignatures: row.attributionEvidence?.signatureId ? [row.attributionEvidence.signatureId] : [],
        canonicalEntity: owner?.entity ?? null,
        dataFlows: (input.dataFlows ?? []).filter((flow) =>
          flow.controllingEntity.legalEntity && flow.controllingEntity.legalEntity === owner?.entity
        ),
        observedRecordCount: row.cookieDetails.length,
        preConsent: row.cookieDetails.some((detail) => detail.observedBeforeConsent === true),
        purposes: [row.purpose],
        rawProducts: [owner?.product ?? row.vendor],
        requestDetails: (input.requestRows ?? []).filter((request) =>
          request.vendor === row.vendor || Boolean(owner?.entity && findRuntimeVendorLabelOwner(request.vendor)?.entity === owner.entity)
        ),
        regulatoryRelevance: owner?.regulatoryRelevance ?? [],
        requestCount: null,
        type: "cookie",
        vendor: owner?.vendor ?? row.vendor,
      };
    }),
    ...groupedTrackerRows.map((row): InventoryGroupRow => {
      const owner = findRuntimeVendorLabelOwner(row.vendor) ??
        row.domains.map(findRuntimeEntityOwner).find((candidate) => candidate !== null);
      return {
        ...row,
        canonicalEntity: owner?.entity ?? null,
        cookieDetails: [],
        cookieNames: row.cookieNames.filter((name) => !canonicalCookieNames.has(name.trim().toLowerCase())),
        dataFlows: (input.dataFlows ?? []).filter((flow) =>
          flow.controllingEntity.legalEntity && flow.controllingEntity.legalEntity === owner?.entity ||
          row.domains.includes(flow.endpoint)
        ),
        observedRecordCount: row.requestCount ?? 1,
        purposes: [row.purpose],
        rawProducts: [owner?.product ?? row.rawProducts[0] ?? row.vendor],
        requestDetails: (input.requestRows ?? []).filter((request) =>
          request.vendor === row.vendor ||
          row.domains.includes(request.hostname ?? "") ||
          Boolean(owner?.entity && findRuntimeVendorLabelOwner(request.vendor)?.entity === owner.entity)
        ),
        setByThirdPartyScript: false,
        type: "tracker",
        vendor: owner?.vendor ?? row.vendor,
      };
    }),
  ];
  const compatibleRows = new Map<string, InventoryGroupRow>();
  for (const candidate of candidates) {
    const productIdentity = candidate.rawProducts
      .map((product) => product.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join("|") || candidate.vendor.toLowerCase();
    const key = JSON.stringify([
      candidate.canonicalEntity?.toLowerCase() ?? null,
      productIdentity,
      candidate.macroCategory,
      normalizeInventoryPurpose(candidate.purpose),
    ]);
    const existing = compatibleRows.get(key);
    if (!existing) {
      compatibleRows.set(key, candidate);
      continue;
    }
    const priority = priorityWeight(candidate.priority) > priorityWeight(existing.priority)
      ? candidate.priority
      : existing.priority;
    const purposes = uniqueStrings([...existing.purposes, ...candidate.purposes]);
    compatibleRows.set(key, {
      ...existing,
      attributionSignatures: uniqueStrings([...existing.attributionSignatures, ...candidate.attributionSignatures]),
      confidence: confidenceWeight(candidate.confidence) > confidenceWeight(existing.confidence)
        ? candidate.confidence
        : existing.confidence,
      cookieDetails: [...existing.cookieDetails, ...candidate.cookieDetails].filter((detail, index, all) =>
        all.findIndex((item) => getRuntimeCookieEvidenceIdentity(item) === getRuntimeCookieEvidenceIdentity(detail)) === index
      ),
      dataFlows: [...existing.dataFlows, ...candidate.dataFlows].filter((flow, index, all) =>
        all.findIndex((item) => `${item.endpoint}\u0000${item.networkDestination.ip ?? ""}` === `${flow.endpoint}\u0000${flow.networkDestination.ip ?? ""}`) === index
      ),
      cookieNames: uniqueStrings([...existing.cookieNames, ...candidate.cookieNames]),
      domains: uniqueStrings([...existing.domains, ...candidate.domains]),
      firstSeenMs: existing.firstSeenMs !== null && candidate.firstSeenMs !== null
        ? Math.min(existing.firstSeenMs, candidate.firstSeenMs)
        : existing.firstSeenMs ?? candidate.firstSeenMs,
      macroCategory: deriveInventoryMacroCategory({
        priority,
        purpose: purposes.length === 1 ? purposes[0] : candidate.macroCategory === "Advertising" || existing.macroCategory === "Advertising"
          ? "advertising"
          : purposes[0],
        vendor: existing.vendor,
      }),
      observedRecordCount: existing.observedRecordCount + candidate.observedRecordCount,
      party: mergePartyValues(existing.party, candidate.party),
      siteRelationship: mergePartyValues(existing.siteRelationship, candidate.siteRelationship),
      entityRelationship: mergePartyValues(existing.entityRelationship, candidate.entityRelationship),
      preConsent: existing.preConsent || candidate.preConsent,
      priority,
      purpose: purposes.length === 1 ? purposes[0] ?? "Review" : "Multiple purposes",
      purposes,
      rawProducts: uniqueStrings([...existing.rawProducts, ...candidate.rawProducts]),
      requestDetails: [...(existing.requestDetails ?? []), ...(candidate.requestDetails ?? [])].filter((detail, index, all) =>
        all.findIndex((item) => JSON.stringify(item) === JSON.stringify(detail)) === index
      ),
      regulatoryRelevance: uniqueStrings([...existing.regulatoryRelevance, ...candidate.regulatoryRelevance]),
      requestCount: (existing.requestCount ?? 0) + (candidate.requestCount ?? 0) || null,
      setByThirdPartyScript: existing.setByThirdPartyScript || candidate.setByThirdPartyScript,
      syncedIdentifiers: uniqueStrings([...(existing.syncedIdentifiers ?? []), ...(candidate.syncedIdentifiers ?? [])]),
      timingEvidence: existing.timingEvidence === candidate.timingEvidence ? existing.timingEvidence : "mixed",
      type: existing.type === "tracker" || candidate.type === "tracker" ? "tracker" : "cookie",
    });
  }
  return [...compatibleRows.values()].sort(compareInventoryPriorityRows);
}

/**
 * Preserve one display row for each retained cookie and tracker observation.
 * The grouped projection remains available for summary cards and charts; this
 * projection is intentionally row-level so the inventory table does not hide
 * individual cookie names or tracker observations behind vendor aggregation.
 */
export function buildRuntimeInventoryUngroupedRows(input: {
  cookieRows: RuntimeCookieEvidenceRow[];
  dataFlows?: PreConsentDataFlow[];
  firstPartyDomain?: string | null;
  requestRows?: SanitizedRequestEvidenceRow[];
  trackerRows: TrackerInventoryRow[];
}) {
  const cookieRows = input.cookieRows.flatMap((cookieRow) =>
    buildRuntimeInventoryGroupRows({
      cookieRows: [cookieRow],
      dataFlows: input.dataFlows,
      firstPartyDomain: input.firstPartyDomain,
      requestRows: input.requestRows,
      trackerRows: []
    })
  ).filter((row) => row.type === "cookie");
  const trackerRows = input.trackerRows.flatMap((trackerRow) =>
    buildRuntimeInventoryGroupRows({
      cookieRows: input.cookieRows,
      dataFlows: input.dataFlows,
      firstPartyDomain: input.firstPartyDomain,
      requestRows: input.requestRows,
      trackerRows: [trackerRow]
    })
  ).filter((row) => row.type === "tracker");
  return [...cookieRows, ...trackerRows].sort(compareInventoryPriorityRows);
}

export function buildRuntimeInventoryProjectionFromScan(scanRecord: ScanDetailResponse) {
  const runtimeArtifacts = scanRecord.runtimeArtifacts;
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(runtimeArtifacts);
  const hybridVendorSummary = getRecord(hybridRuntimeEvidence?.vendorSummary ?? hybridRuntimeEvidence?.vendor_summary);
  const certScoreSummary = deriveCertScoreFindings(scanRecord);
  const vendorSurfaceProjection = buildReportSurfaceVendorProjection({
    rawThirdPartyDomains: getRecordStringArray(hybridVendorSummary, "rawThirdPartyDomains"),
    resolvedVendorNames: certScoreSummary.resolvedVendorNames,
    topObservedEntities: certScoreSummary.topObservedEntities,
    unresolvedVendorHosts: certScoreSummary.unresolvedVendorHosts,
    vendorCategoryCounts: certScoreSummary.vendorCategoryCounts
  });
  const cookieRows = buildRuntimeCookieInventory({
    hybridRuntimeEvidence,
    runtimeArtifacts
  }).rows;
  const canonicalTrackerRows = suppressUnsupportedCmpAliasRows(buildTrackerInventoryRows({
    domains: vendorSurfaceProjection.evidenceInventory.thirdPartyDomains,
    firstPartyDomain: scanRecord.scan.domainHostname ?? certScoreSummary.requestedHost,
    preConsentVendors: certScoreSummary.preConsentVendorNames,
    resolvedVendors: vendorSurfaceProjection.evidenceInventory.resolvedVendorNames,
    sessionReplayVendors: certScoreSummary.sessionReplayVendorNames,
    trackerVendors: scanRecord.trackerVendors,
    topObservedEntities: vendorSurfaceProjection.evidenceInventory.topObservedEntities,
    unresolvedHosts: vendorSurfaceProjection.evidenceInventory.unresolvedVendorHosts
  }));
  const browserExtensionRequestRows = buildBrowserExtensionRequestInventoryRows(hybridRuntimeEvidence);
  const trackerRows = (browserExtensionRequestRows.length > 0 ? browserExtensionRequestRows : canonicalTrackerRows)
    .filter(isTimedPreConsentInventoryRow);
  const dataFlows = buildPreConsentDataFlows(hybridRuntimeEvidence);
  const requestRows = buildSanitizedRequestEvidenceRows(hybridRuntimeEvidence);

  return {
    cookieRows,
    dataFlows,
    requestRows,
    trackerRows,
    groupedRows: buildRuntimeInventoryGroupRows({
      cookieRows,
      dataFlows,
      firstPartyDomain: scanRecord.scan.domainHostname ?? certScoreSummary.requestedHost,
      requestRows,
      trackerRows
    }),
    ungroupedRows: buildRuntimeInventoryUngroupedRows({
      cookieRows,
      dataFlows,
      firstPartyDomain: scanRecord.scan.domainHostname ?? certScoreSummary.requestedHost,
      requestRows,
      trackerRows
    })
  };
}
