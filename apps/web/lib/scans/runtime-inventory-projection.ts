import { getDomain as getTldtsDomain, getHostname as getTldtsHostname } from "tldts";
import {
  isKnownCmpInfrastructureHost,
  isKnownCmpVendorLabel
} from "../../../../packages/shared/src/known-cmps";
import { deriveCertScoreFindings } from "./derive-findings";
import { getHybridRuntimeEvidence } from "./hybrid-runtime-evidence";
import { buildRuntimeCookieInventory, type RuntimeCookieEvidenceRow } from "./runtime-cookie-evidence";
import {
  buildRuntimeCookiePriorityGroups,
  runtimeCookieConfidenceWeight,
  runtimeCookiePriorityWeight,
  type RuntimeCookieInventoryConfidence,
  type RuntimeCookieReviewPriority
} from "./runtime-cookie-priority";
import {
  findRuntimeEntityOwner,
  hostsShareRuntimeEntity,
  isLikelyCookieName,
  type RuntimeVendorAttributionEvidence
} from "./runtime-vendor-ownership";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";

export type ConsentReviewPriority = RuntimeCookieReviewPriority;
export type InventoryConfidence = RuntimeCookieInventoryConfidence;
export type InventoryMacroCategory = "Advertising" | "Analytics" | "Essential" | "Functional" | "Unknown";

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
  cookieNames: string[];
  domains: string[];
  firstSeenMs: number | null;
  macroCategory: InventoryMacroCategory;
  party: "first_party" | "third_party" | "unknown" | "mixed";
  priority: ConsentReviewPriority;
  purpose: string;
  syncedIdentifiers?: string[];
  vendor: string;
};

export type TrackerInventoryGroupRow = {
  attributionEvidence?: RuntimeVendorAttributionEvidence | null;
  confidence: InventoryConfidence;
  cookieNames: string[];
  domains: string[];
  firstSeenMs: number | null;
  macroCategory: InventoryMacroCategory;
  party: "3rd" | "—" | "mixed";
  priority: ConsentReviewPriority;
  purpose: string;
  requestCount: number | null;
  syncedIdentifiers?: string[];
  vendor: string;
};

export type InventoryGroupRow =
  | (CookieInventoryGroupRow & { type: "cookie" })
  | (TrackerInventoryGroupRow & { type: "tracker" });

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

export function buildReportSurfaceVendorProjection(input: ReportVendorSurfaceProjectionInput) {
  const execSummaryResolvedVendorNames = input.resolvedVendorNames.filter((name) => !isFunctionalButNotCmpVendorLabel(name));
  const execSummaryThirdPartyDomains = uniqueStrings(input.rawThirdPartyDomains).filter((domain) => !isCmpOrFunctionalVendorDomain(domain));
  const execSummaryTopObservedEntities = input.topObservedEntities.filter((entity) => (
    !isFunctionalButNotCmpVendorLabel(entity.label) &&
    !isFunctionalButNotCmpVendorDomain(entity.label)
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
      unresolvedVendorHosts: uniqueStrings(input.unresolvedVendorHosts).filter((host) => !isCmpOrFunctionalVendorDomain(host)),
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

function sanitizeInventoryDomains(values: Array<string | null | undefined>) {
  return uniqueStrings(values.map((value) => {
    const host = normalizeInventoryHostname(value);
    return host && !isLikelyCookieName(host) ? host : null;
  }));
}

function isSyncedVendorInference(vendorName: string, ownerVendor: string) {
  const normalizedVendorName = vendorName.trim().toLowerCase();
  const normalizedOwnerVendor = ownerVendor.trim().toLowerCase();
  return Boolean(normalizedVendorName && normalizedVendorName !== normalizedOwnerVendor &&
    !(normalizedOwnerVendor === "google" && /^google\b/.test(normalizedVendorName)));
}

function resolveTrackerIdentity(input: { category: string | null | undefined; domains: string[]; source: string | null | undefined; vendorName: string }) {
  const owner = input.domains.map(findRuntimeEntityOwner).find((candidate) => candidate !== null);
  if (!owner) {
    return { attributionEvidence: null, category: input.category || "tracker", confidence: null, label: input.vendorName, syncedIdentifiers: [] };
  }
  const shouldUseDomainOwner = isSyncedVendorInference(input.vendorName, owner.vendor) || input.vendorName === input.domains[0] || input.source === "id_sync";
  return {
    attributionEvidence: owner.attributionEvidence,
    category: owner.category ?? input.category ?? "tracker",
    confidence: 0.95,
    label: shouldUseDomainOwner ? owner.vendor : input.vendorName,
    syncedIdentifiers: shouldUseDomainOwner && isSyncedVendorInference(input.vendorName, owner.vendor) ? [input.vendorName] : []
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
    input.trackerVendors.flatMap(trackerMatchedHosts)
  );
  const isFirstPartyHost = (value: string) => {
    const hostDomain = inventoryRegistrableDomain(value);
    return Boolean((firstPartyRegistrableDomain && hostDomain === firstPartyRegistrableDomain) || hostsShareRuntimeEntity(value, input.firstPartyDomain));
  };
  const isCoveredByResolvedVendorHost = (value: string) => {
    const host = normalizeInventoryHostname(value);
    return Boolean(host && resolvedTrackerHosts.has(host));
  };
  const getTrackerParty = (domains: string[]): TrackerInventoryRow["party"] => {
    if (domains.length === 0) {
      return "unknown";
    }
    const firstPartyCount = domains.filter(isFirstPartyHost).length;
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
      preConsent: existing.preConsent || row.preConsent,
      regulatoryRelevance: uniqueStrings([...(existing.regulatoryRelevance ?? []), ...(row.regulatoryRelevance ?? [])]),
      requestCount: Math.max(existing.requestCount ?? 0, row.requestCount ?? 0) || existing.requestCount || row.requestCount,
      source: existing.source === row.source ? existing.source : "multiple",
      syncedIdentifiers: uniqueStrings([...(existing.syncedIdentifiers ?? []), ...(row.syncedIdentifiers ?? [])])
    });
  };

  for (const entity of input.topObservedEntities) {
    const entityHost = normalizeInventoryHostname(entity.label);
    if (!entityHost || isFirstPartyHost(entityHost) || isCoveredByResolvedVendorHost(entityHost)) {
      continue;
    }
    const domains = sanitizeInventoryDomains(input.domains.includes(entityHost) ? [entityHost] : []);
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
      preConsent: input.preConsentVendors.includes(entity.label),
      requestCount: entity.requestCount,
      source: "runtime requests",
      syncedIdentifiers: identity.syncedIdentifiers
    });
  }
  for (const tracker of input.trackerVendors) {
    const record = tracker as unknown as Record<string, unknown>;
    const observedVia = tracker.observedVia && tracker.observedVia.length > 0
      ? uniqueStrings(tracker.observedVia)
      : getStringArrayFromRecord(record, ["observedVia", "observed_via"]);
    const matchedDomains = sanitizeInventoryDomains(trackerMatchedHosts(tracker));
    const identity = resolveTrackerIdentity({ category: tracker.vendorCategory || "tracker", domains: matchedDomains, source: tracker.detectionSource, vendorName: tracker.vendorName });
    addRow({
      attributionEvidence: identity.attributionEvidence,
      category: identity.category,
      confidence: identity.confidence ?? (typeof tracker.confidence === "number" && Number.isFinite(tracker.confidence) ? tracker.confidence : null),
      cookieNames: [],
      domains: matchedDomains,
      firstSeenMs: getNumberFromRecord(record, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms"]),
      label: identity.label,
      observedVia: observedVia.length > 0 ? observedVia : ["request"],
      party: getTrackerParty(matchedDomains),
      preConsent: tracker.beforeConsent === true || input.preConsentVendors.includes(tracker.vendorName) || input.preConsentVendors.includes(identity.label),
      regulatoryRelevance: tracker.regulatoryRelevance ?? getStringArrayFromRecord(record, ["regulatoryRelevance", "regulatory_relevance"]),
      requestCount: null,
      source: tracker.detectionSource || "tracker inventory",
      syncedIdentifiers: identity.syncedIdentifiers,
      vendorDisplayCategory: tracker.vendorDisplayCategory ?? (typeof record.vendorDisplayCategory === "string" ? record.vendorDisplayCategory : null)
    });
  }
  for (const vendor of input.resolvedVendors) {
    const hasConcreteObservedRow = [...rows.values()].some((row) =>
      row.label.toLowerCase() === vendor.toLowerCase() &&
      (
        row.domains.length > 0 ||
        row.observedVia.some((value) => !/^(resolver|vendor resolver)$/i.test(value))
      )
    );
    if (hasConcreteObservedRow) {
      continue;
    }
    addRow({
      category: input.sessionReplayVendors.includes(vendor) ? "session_replay" : "unknown",
      confidence: null,
      cookieNames: [],
      domains: [],
      firstSeenMs: null,
      label: vendor,
      observedVia: ["resolver"],
      party: "unknown",
      preConsent: input.preConsentVendors.includes(vendor),
      requestCount: null,
      source: "vendor resolver"
    });
  }
  for (const host of input.unresolvedHosts) {
    const unresolvedHost = normalizeInventoryHostname(host);
    if (!unresolvedHost || isFirstPartyHost(unresolvedHost) || isCoveredByResolvedVendorHost(unresolvedHost)) {
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
      preConsent: false,
      requestCount: null,
      source: "host inventory",
      syncedIdentifiers: identity.syncedIdentifiers
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
  if (/onetrust|cookielaw|optanon/.test(label)) {
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

export function deriveInventoryMacroCategory(input: {
  priority?: ConsentReviewPriority | null;
  purpose?: string | null;
  vendor?: string | null;
}): InventoryMacroCategory {
  const purpose = normalizeInventoryPurpose(input.purpose);
  const vendor = (input.vendor ?? "").toLowerCase();

  if (/^(advertising|advertising_measurement|audience_measurement|retargeting|fingerprinting|marketing_automation)$/.test(purpose)) {
    return "Advertising";
  }
  if (/^(analytics|session_replay|performance_monitoring|telemetry|diagnostics|telemetry_diagnostics|a_b_testing|experimentation)$/.test(purpose)) {
    return "Analytics";
  }
  if (/^(security|necessary|payment|payment_processors|authentication|cookie_compliance|consent|consent_management)$/.test(purpose)) {
    return "Essential";
  }
  if (/^(tag_management|tag_manager|functional|customer_support|personalization|personalisation|embedded_content)$/.test(purpose)) {
    return "Functional";
  }
  if (/^(cdn|cdn_static)$/.test(purpose)) {
    return /instagram|vimeo|maps|font|sportradar|trustmary|iterate|medallia|piano|usable|jw player/.test(vendor)
      ? "Functional"
      : "Essential";
  }
  if (input.priority === "contextual") {
    return "Essential";
  }
  if (input.priority === "high") {
    return "Advertising";
  }
  if (input.priority === "medium") {
    return "Analytics";
  }
  return "Unknown";
}

export function getTrackerConsentReviewPriority(row: TrackerInventoryRow): ConsentReviewPriority {
  const purpose = normalizeInventoryPurpose(getInventoryCategoryLabel(row.label, row.vendorDisplayCategory ?? row.category, row.regulatoryRelevance));
  const confidence = getTrackerInventoryConfidence(row);
  const normalizedLabel = row.label.toLowerCase();
  const isLinkedInAdsPixel =
    /linkedin ads pixel/.test(normalizedLabel) ||
    row.domains.some((domain) => /^px\.ads\.linkedin\.com$/i.test(domain.trim()));

  if (isLinkedInAdsPixel) {
    return row.preConsent ? "high" : "review_needed";
  }
  if (/^(advertising|retargeting|audience_measurement|session_replay|fingerprinting)$/.test(purpose)) {
    return row.preConsent ? "high" : "medium";
  }
  if (/^(personalization|personalisation)$/.test(purpose) && confidence === "low") {
    return "review_needed";
  }
  if (/^(analytics|experimentation|personalization|personalisation|a_b_testing|embedded_content|tag_management|tag_manager|marketing_automation)$/.test(purpose)) {
    return row.preConsent ? "medium" : "contextual";
  }
  if (/^(security|payment|payment_processors|authentication|cookie_compliance|consent|consent_management|performance_monitoring|telemetry|diagnostics|telemetry_diagnostics)$/.test(purpose)) {
    return "contextual";
  }
  if (/^(cdn_static|cdn|functional|publisher_infrastructure)$/.test(purpose)) {
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
    return "—";
  }
  if (row.party === "mixed") {
    return "mixed";
  }
  if (row.party === "third_party") {
    return "3rd";
  }
  return row.preConsent ? "3rd" : "—";
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
  return buildRuntimeCookiePriorityGroups(rows, options).map((row) => ({
    ...row,
    macroCategory: deriveInventoryMacroCategory({
      priority: row.priority,
      purpose: row.purpose,
      vendor: row.vendor
    })
  }));
}

export function buildTrackerInventoryGroupRows(rows: TrackerInventoryRow[]) {
  const grouped = new Map<string, TrackerInventoryGroupRow>();
  for (const row of rows) {
    const purpose = getInventoryCategoryLabel(row.label, row.vendorDisplayCategory ?? row.category, row.regulatoryRelevance);
    const priority = getTrackerConsentReviewPriority(row);
    const key = `${row.label.toLowerCase()}\u0000${purpose.toLowerCase()}`;
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
      party: formatTrackerParty(row),
      priority,
      purpose,
      requestCount: row.requestCount,
      syncedIdentifiers: row.syncedIdentifiers,
      vendor: row.label
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
      priority: priorityWeight(candidate.priority) > priorityWeight(existing.priority) ? candidate.priority : existing.priority,
      requestCount: Math.max(existing.requestCount ?? 0, candidate.requestCount ?? 0) || existing.requestCount || candidate.requestCount,
      syncedIdentifiers: uniqueStrings([...(existing.syncedIdentifiers ?? []), ...(candidate.syncedIdentifiers ?? [])])
    });
  }
  return [...grouped.values()].sort(compareInventoryPriorityRows);
}

export function buildRuntimeInventoryGroupRows(input: {
  cookieRows: RuntimeCookieEvidenceRow[];
  firstPartyDomain?: string | null;
  trackerRows: TrackerInventoryRow[];
}) {
  const groupedCookieRows = buildCookieInventoryGroupRows(input.cookieRows, { firstPartyDomain: input.firstPartyDomain });
  const groupedTrackerRows = buildTrackerInventoryGroupRows(input.trackerRows);
  return [
    ...groupedCookieRows.map((row) => ({ ...row, type: "cookie" as const })),
    ...groupedTrackerRows.map((row) => ({ ...row, type: "tracker" as const }))
  ].sort(compareInventoryPriorityRows);
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
  const trackerRows = buildTrackerInventoryRows({
    domains: vendorSurfaceProjection.evidenceInventory.thirdPartyDomains,
    firstPartyDomain: scanRecord.scan.domainHostname ?? certScoreSummary.requestedHost,
    preConsentVendors: certScoreSummary.preConsentVendorNames,
    resolvedVendors: vendorSurfaceProjection.evidenceInventory.resolvedVendorNames,
    sessionReplayVendors: certScoreSummary.sessionReplayVendorNames,
    trackerVendors: scanRecord.trackerVendors,
    topObservedEntities: vendorSurfaceProjection.evidenceInventory.topObservedEntities,
    unresolvedHosts: vendorSurfaceProjection.evidenceInventory.unresolvedVendorHosts
  });

  return {
    cookieRows,
    trackerRows,
    groupedRows: buildRuntimeInventoryGroupRows({ cookieRows, firstPartyDomain: scanRecord.scan.domainHostname ?? certScoreSummary.requestedHost, trackerRows })
  };
}
