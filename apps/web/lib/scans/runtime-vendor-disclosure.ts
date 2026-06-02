export const RUNTIME_VENDOR_DISCLOSURE_SUBTYPE = "runtime_vendor_not_disclosed" as const;

export const RUNTIME_VENDOR_DISCLOSURE_ALIASES = [
  "unlisted_third_party_domains",
  "undisclosed_third_party_domains",
  "runtime_vendor_not_disclosed",
  "third_party_domain_disclosure_gap",
  "privacy.runtime_vendor_not_disclosed",
  "privacy.third_party_domain_disclosure_gap",
  "privacy.cookie_runtime_disclosure_gap_detected"
] as const;

export type RuntimeVendorPolicySurfaceType =
  | "cookie_policy"
  | "privacy_policy"
  | "cmp_preference_center"
  | "privacy_choices"
  | "do_not_sell_or_share"
  | "other";

export type RuntimeVendorPolicySurface = {
  type: RuntimeVendorPolicySurfaceType;
  url?: string;
  snippet?: string;
  reached: boolean;
  retainedEvidenceRef?: string;
  searchedTerms?: string[];
  matchedVendorNames?: string[];
  unmatchedVendorNames?: string[];
};

export type RuntimeVendorDisclosureEvidence = {
  subtype: typeof RUNTIME_VENDOR_DISCLOSURE_SUBTYPE;
  observedRuntimeVendors: string[];
  observedRuntimeDomains: string[];
  unmatchedRuntimeVendors: string[];
  unmatchedRuntimeDomains: string[];
  policySurfacesSearched: RuntimeVendorPolicySurface[];
  cookiePolicyUrl?: string;
  privacyPolicyUrl?: string;
  matchedVendorDisclosureCount: number;
  unmatchedVendorDisclosureCount: number;
  mismatchRationale: string;
  coverageStatus: "usable" | "partial" | "blocked" | "unknown";
  evidenceConfidence: "strong" | "moderate" | "limited";
  directVsInferred: "direct" | "inferred" | "mixed";
  categories?: string[];
  parentFindingId?: "cookie_disclosure_gap" | "policy_behavior_conflict" | "policy_behavior_contradiction_detected";
};

export type RuntimeVendorDisclosureReview = {
  disposition: "eligible" | "audit_only" | "suppress";
  confidence: "strong" | "moderate" | "limited";
  directness: "direct" | "mixed" | "inferred";
  evidence: RuntimeVendorDisclosureEvidence[];
  parentFindingId: "cookie_disclosure_gap" | "policy_behavior_conflict";
  negativeEvidenceFlags: string[];
};

export type RuntimeVendorDisclosureSourceDocument = {
  canonical_url?: unknown;
  document_text?: unknown;
  document_type?: unknown;
  id?: unknown;
  source_status?: unknown;
  source_url?: unknown;
  title?: unknown;
};

export type RuntimeVendorDisclosureTrackerVendor = {
  scriptHost?: string | null;
  vendorCategory?: string | null;
  vendorName?: string | null;
};

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === "string") {
        try {
          return getRows(JSON.parse(entry));
        } catch {
          return [];
        }
      }
      const record = getRecord(entry);
      return record ? [record] : [];
    });
  }
  if (typeof value === "string") {
    try {
      return getRows(JSON.parse(value));
    } catch {
      return [];
    }
  }
  const record = getRecord(value);
  return record ? [record] : [];
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function getStringArray(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.flatMap((entry) => getString(entry) ?? []).filter(Boolean);
    }
  }
  return [];
}

function getNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function normalizeSurfaceType(value: unknown): RuntimeVendorPolicySurfaceType {
  const normalized = getString(value)?.toLowerCase().replace(/[\s-]+/g, "_") ?? "other";
  if (
    normalized === "cookie_policy" ||
    normalized === "privacy_policy" ||
    normalized === "cmp_preference_center" ||
    normalized === "privacy_choices" ||
    normalized === "do_not_sell_or_share"
  ) {
    return normalized;
  }
  return "other";
}

function normalizeCoverageStatus(value: unknown): RuntimeVendorDisclosureEvidence["coverageStatus"] {
  const normalized = getString(value)?.toLowerCase();
  if (normalized === "usable" || normalized === "partial" || normalized === "blocked" || normalized === "unknown") {
    return normalized;
  }
  return "unknown";
}

function normalizeEvidenceConfidence(value: unknown): RuntimeVendorDisclosureEvidence["evidenceConfidence"] {
  const normalized = getString(value)?.toLowerCase();
  if (normalized === "strong" || normalized === "moderate" || normalized === "limited") {
    return normalized;
  }
  return "limited";
}

function normalizeDirectness(value: unknown): RuntimeVendorDisclosureEvidence["directVsInferred"] {
  const normalized = getString(value)?.toLowerCase();
  if (normalized === "direct" || normalized === "mixed" || normalized === "inferred") {
    return normalized;
  }
  return "inferred";
}

function normalizeParentFindingId(value: unknown): RuntimeVendorDisclosureEvidence["parentFindingId"] {
  const normalized = getString(value);
  if (
    normalized === "cookie_disclosure_gap" ||
    normalized === "policy_behavior_conflict" ||
    normalized === "policy_behavior_contradiction_detected"
  ) {
    return normalized;
  }
  return undefined;
}

function getNestedRecord(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = getRecord(record?.[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function getRuntimeStringArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: string[] = [];
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      values.push(value.trim());
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim()) {
          values.push(entry.trim());
        }
      }
    }
  }
  return uniqueStrings(values);
}

function hostFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function vendorSearchTerms(vendor: string) {
  const normalized = vendor.trim();
  const lower = normalized.toLowerCase();
  const terms = [normalized];
  if (/google analytics/i.test(normalized)) {
    terms.push("google analytics", "google-analytics.com", "gtag", "_ga");
  }
  if (/google tag manager/i.test(normalized)) {
    terms.push("google tag manager", "googletagmanager.com", "gtm");
  }
  if (/microsoft clarity|clarity/i.test(normalized)) {
    terms.push("microsoft clarity", "clarity.ms", "clarity");
  }
  if (/meta|facebook/i.test(normalized)) {
    terms.push("meta pixel", "facebook pixel", "facebook.com", "connect.facebook.net");
  }
  if (/linkedin/i.test(normalized)) {
    terms.push("linkedin insight", "linkedin", "licdn.com");
  }
  if (/doubleclick/i.test(normalized)) {
    terms.push("doubleclick", "doubleclick.net");
  }
  if (lower.includes("/")) {
    terms.push(...lower.split("/").map((part) => part.trim()));
  }
  return uniqueStrings(terms);
}

function snippetAroundTerm(text: string, terms: string[]) {
  const lowerText = text.toLowerCase();
  for (const term of terms) {
    const normalized = term.toLowerCase();
    const index = lowerText.indexOf(normalized);
    if (index < 0) {
      continue;
    }
    const start = Math.max(0, index - 180);
    const end = Math.min(text.length, index + term.length + 240);
    return text.slice(start, end).replace(/\s+/g, " ").trim();
  }

  return text.slice(0, 420).replace(/\s+/g, " ").trim();
}

function documentSurfaceType(documentType: string | null, url: string | null): RuntimeVendorPolicySurfaceType {
  const haystack = `${documentType ?? ""} ${url ?? ""}`.toLowerCase();
  if (/cookie/.test(haystack)) {
    return "cookie_policy";
  }
  if (/privacy|legal|notice/.test(haystack)) {
    return "privacy_policy";
  }
  return "other";
}

function isReadyPolicyDocument(row: RuntimeVendorDisclosureSourceDocument) {
  const status = getString(row.source_status);
  const text = getString(row.document_text);
  if (!text || text.length < 200) {
    return false;
  }
  return !status || status === "ready";
}

function collectObservedRuntimeVendors(input: {
  runtimeArtifacts?: Record<string, unknown> | null;
  trackerVendors?: RuntimeVendorDisclosureTrackerVendor[];
}) {
  const hybrid = getNestedRecord(input.runtimeArtifacts, ["hybridRuntimeEvidence", "hybrid_runtime_evidence"]);
  const vendorSummary = getNestedRecord(hybrid, ["vendorSummary", "vendor_summary"]);
  return uniqueStrings([
    ...getRuntimeStringArray(vendorSummary, ["normalizedVendors", "normalized_vendors"]),
    ...getRuntimeStringArray(input.runtimeArtifacts, [
      "consent_baseline_tracker_vendor_names",
      "consent_post_reject_tracker_vendor_names",
      "consent_reject_persisted_tracker_vendor_names",
      "preconsent_tracker_vendors",
      "tracker_vendors"
    ]),
    ...(input.trackerVendors ?? []).map((vendor) => vendor.vendorName ?? null)
  ]).filter((vendor) => !/^(?:unknown|other|cdn|first party)$/i.test(vendor));
}

function collectObservedRuntimeDomains(input: {
  runtimeArtifacts?: Record<string, unknown> | null;
  trackerVendors?: RuntimeVendorDisclosureTrackerVendor[];
  vendors: string[];
}) {
  const hybrid = getNestedRecord(input.runtimeArtifacts, ["hybridRuntimeEvidence", "hybrid_runtime_evidence"]);
  const vendorSummary = getNestedRecord(hybrid, ["vendorSummary", "vendor_summary"]);
  const evidenceUrls = getRuntimeStringArray(input.runtimeArtifacts, [
    "consent_baseline_tracker_evidence_urls",
    "consent_post_reject_tracker_evidence_urls",
    "consent_post_accept_tracker_evidence_urls"
  ]);
  const vendorTerms = input.vendors.flatMap(vendorSearchTerms).map((term) => term.toLowerCase());
  const evidenceHosts = evidenceUrls
    .map(hostFromUrl)
    .filter((host): host is string => Boolean(host))
    .filter((host) => vendorTerms.some((term) => host.includes(term.replace(/[^a-z0-9.]/g, "")) || term.includes(host)));

  return uniqueStrings([
    ...evidenceHosts,
    ...(input.trackerVendors ?? []).map((vendor) => vendor.scriptHost ?? null),
    ...getRuntimeStringArray(vendorSummary, ["rawThirdPartyDomains", "raw_third_party_domains"])
      .filter((domain) => vendorTerms.some((term) => domain.toLowerCase().includes(term.replace(/[^a-z0-9.]/g, ""))))
  ]);
}

export function deriveRuntimeVendorDisclosureEvidenceFromRetainedSources(input: {
  documentSources?: RuntimeVendorDisclosureSourceDocument[];
  runtimeArtifacts?: Record<string, unknown> | null;
  trackerVendors?: RuntimeVendorDisclosureTrackerVendor[];
}): RuntimeVendorDisclosureEvidence[] {
  if (getRuntimeVendorDisclosureEvidence(input.runtimeArtifacts).length > 0) {
    return [];
  }

  const vendors = collectObservedRuntimeVendors(input);
  const documents = (input.documentSources ?? []).filter(isReadyPolicyDocument);
  if (vendors.length === 0 || documents.length === 0) {
    return [];
  }

  const vendorTerms = new Map(vendors.map((vendor) => [vendor, vendorSearchTerms(vendor)]));
  const matchedVendors = new Set<string>();
  const surfaces: RuntimeVendorPolicySurface[] = documents.slice(0, 6).map((document) => {
    const text = getString(document.document_text) ?? "";
    const url = getString(document.canonical_url) ?? getString(document.source_url) ?? undefined;
    const matchedVendorNames: string[] = [];
    const unmatchedVendorNames: string[] = [];
    for (const vendor of vendors) {
      const terms = vendorTerms.get(vendor) ?? [vendor];
      const matched = terms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
      if (matched) {
        matchedVendors.add(vendor);
        matchedVendorNames.push(vendor);
      } else {
        unmatchedVendorNames.push(vendor);
      }
    }
    const searchedTerms = uniqueStrings([...vendorTerms.values()].flat());
    const snippetTerms = matchedVendorNames.length > 0
      ? matchedVendorNames.flatMap((vendor) => vendorTerms.get(vendor) ?? [vendor])
      : ["third party", "cookie", "traffic", "analytics", "web traffic"];
    return {
      matchedVendorNames,
      reached: true,
      retainedEvidenceRef: getString(document.id) ? `scan_document_sources:${getString(document.id)}` : undefined,
      searchedTerms,
      snippet: snippetAroundTerm(text, snippetTerms),
      type: documentSurfaceType(getString(document.document_type), url ?? null),
      unmatchedVendorNames,
      url
    };
  });
  const unmatchedVendors = vendors.filter((vendor) => !matchedVendors.has(vendor));
  if (unmatchedVendors.length === 0) {
    return [];
  }

  const observedDomains = collectObservedRuntimeDomains({
    runtimeArtifacts: input.runtimeArtifacts,
    trackerVendors: input.trackerVendors,
    vendors
  });
  const categories = uniqueStrings((input.trackerVendors ?? []).map((vendor) => vendor.vendorCategory ?? null));
  const firstPrivacyUrl = surfaces.find((surface) => surface.type === "privacy_policy" && surface.url)?.url;
  const firstCookieUrl = surfaces.find((surface) => surface.type === "cookie_policy" && surface.url)?.url;

  return [
    {
      categories,
      cookiePolicyUrl: firstCookieUrl,
      coverageStatus: "usable",
      directVsInferred: "direct",
      evidenceConfidence: "moderate",
      matchedVendorDisclosureCount: matchedVendors.size,
      mismatchRationale:
        `Observed runtime vendors (${unmatchedVendors.slice(0, 5).join(", ")}) were not clearly matched by name or known domain alias in retained policy disclosure surfaces.`,
      observedRuntimeDomains: observedDomains,
      observedRuntimeVendors: vendors,
      parentFindingId: "policy_behavior_contradiction_detected",
      policySurfacesSearched: surfaces,
      privacyPolicyUrl: firstPrivacyUrl,
      subtype: RUNTIME_VENDOR_DISCLOSURE_SUBTYPE,
      unmatchedRuntimeDomains: observedDomains.filter((domain) =>
        unmatchedVendors.some((vendor) => vendorSearchTerms(vendor).some((term) => domain.toLowerCase().includes(term.toLowerCase().replace(/[^a-z0-9.]/g, ""))))
      ),
      unmatchedRuntimeVendors: unmatchedVendors,
      unmatchedVendorDisclosureCount: unmatchedVendors.length
    }
  ];
}

function parseSurface(row: Record<string, unknown>): RuntimeVendorPolicySurface | null {
  const reachedValue = row.reached;
  const reached = reachedValue === true || String(reachedValue).toLowerCase() === "true";
  const surface: RuntimeVendorPolicySurface = {
    type: normalizeSurfaceType(row.type ?? row.surfaceType ?? row.surface_type),
    reached
  };
  const url = getString(row.url ?? row.surfaceUrl ?? row.surface_url);
  const snippet = getString(row.snippet ?? row.policySnippet ?? row.policy_snippet ?? row.retainedSnippet ?? row.retained_snippet);
  const retainedEvidenceRef = getString(row.retainedEvidenceRef ?? row.retained_evidence_ref ?? row.evidenceRef ?? row.evidence_ref);
  const searchedTerms = getStringArray(row, ["searchedTerms", "searched_terms"]);
  const matchedVendorNames = getStringArray(row, ["matchedVendorNames", "matched_vendor_names"]);
  const unmatchedVendorNames = getStringArray(row, ["unmatchedVendorNames", "unmatched_vendor_names"]);
  if (url) {
    surface.url = url;
  }
  if (snippet) {
    surface.snippet = snippet;
  }
  if (retainedEvidenceRef) {
    surface.retainedEvidenceRef = retainedEvidenceRef;
  }
  if (searchedTerms.length > 0) {
    surface.searchedTerms = searchedTerms;
  }
  if (matchedVendorNames.length > 0) {
    surface.matchedVendorNames = matchedVendorNames;
  }
  if (unmatchedVendorNames.length > 0) {
    surface.unmatchedVendorNames = unmatchedVendorNames;
  }
  return surface;
}

function parseEvidenceRow(row: Record<string, unknown>): RuntimeVendorDisclosureEvidence | null {
  const subtype = getString(row.subtype ?? row.findingSubtype ?? row.finding_subtype ?? row.signalSubtype ?? row.signal_subtype);
  const aliases = new Set<string>(RUNTIME_VENDOR_DISCLOSURE_ALIASES);
  const signalKey = getString(row.signalKey ?? row.signal_key);
  const title = getString(row.title ?? row.label ?? row.findingId ?? row.finding_id);
  if (subtype && !aliases.has(subtype) && subtype !== RUNTIME_VENDOR_DISCLOSURE_SUBTYPE) {
    return null;
  }
  if (!subtype && signalKey && !aliases.has(signalKey) && !/runtime_vendor_not_disclosed|third_party_domain_disclosure_gap|cookie_runtime_disclosure_gap/i.test(signalKey)) {
    return null;
  }
  if (!subtype && !signalKey && title && !aliases.has(title)) {
    return null;
  }

  const observedRuntimeVendors = getStringArray(row, ["observedRuntimeVendors", "observed_runtime_vendors", "runtimeVendors", "runtime_vendors"]);
  const observedRuntimeDomains = getStringArray(row, ["observedRuntimeDomains", "observed_runtime_domains", "runtimeDomains", "runtime_domains", "thirdPartyDomains", "third_party_domains"]);
  const unmatchedRuntimeVendors = getStringArray(row, ["unmatchedRuntimeVendors", "unmatched_runtime_vendors", "unmatchedVendorNames", "unmatched_vendor_names"]);
  const unmatchedRuntimeDomains = getStringArray(row, ["unmatchedRuntimeDomains", "unmatched_runtime_domains", "unmatchedDomains", "unmatched_domains"]);
  const policySurfacesSearched = getRows(row.policySurfacesSearched ?? row.policy_surfaces_searched ?? row.policySurfaces ?? row.policy_surfaces)
    .map(parseSurface)
    .filter((surface): surface is RuntimeVendorPolicySurface => Boolean(surface));
  const mismatchRationale = getString(row.mismatchRationale ?? row.mismatch_rationale ?? row.mismatchExplanation ?? row.mismatch_explanation) ?? "";
  if (
    !subtype &&
    !signalKey &&
    !title &&
    observedRuntimeVendors.length === 0 &&
    observedRuntimeDomains.length === 0 &&
    unmatchedRuntimeVendors.length === 0 &&
    unmatchedRuntimeDomains.length === 0 &&
    policySurfacesSearched.length === 0 &&
    !mismatchRationale
  ) {
    return null;
  }
  const coverageStatus = normalizeCoverageStatus(row.coverageStatus ?? row.coverage_status);
  const evidenceConfidence = normalizeEvidenceConfidence(row.evidenceConfidence ?? row.evidence_confidence);
  const directVsInferred = normalizeDirectness(row.directVsInferred ?? row.direct_vs_inferred);
  const matchedVendorDisclosureCount = getNumber(row, ["matchedVendorDisclosureCount", "matched_vendor_disclosure_count"]) ?? 0;
  const unmatchedVendorDisclosureCount =
    getNumber(row, ["unmatchedVendorDisclosureCount", "unmatched_vendor_disclosure_count"]) ??
    Math.max(unmatchedRuntimeVendors.length, unmatchedRuntimeDomains.length);

  const evidence: RuntimeVendorDisclosureEvidence = {
    subtype: RUNTIME_VENDOR_DISCLOSURE_SUBTYPE,
    observedRuntimeDomains,
    observedRuntimeVendors,
    unmatchedRuntimeDomains,
    unmatchedRuntimeVendors,
    policySurfacesSearched,
    matchedVendorDisclosureCount,
    unmatchedVendorDisclosureCount,
    mismatchRationale,
    coverageStatus,
    evidenceConfidence,
    directVsInferred
  };
  const cookiePolicyUrl = getString(row.cookiePolicyUrl ?? row.cookie_policy_url);
  const privacyPolicyUrl = getString(row.privacyPolicyUrl ?? row.privacy_policy_url);
  const categories = getStringArray(row, ["categories", "runtimeVendorCategories", "runtime_vendor_categories"]);
  const parentFindingId = normalizeParentFindingId(row.parentFindingId ?? row.parent_finding_id);
  if (cookiePolicyUrl) {
    evidence.cookiePolicyUrl = cookiePolicyUrl;
  }
  if (privacyPolicyUrl) {
    evidence.privacyPolicyUrl = privacyPolicyUrl;
  }
  if (categories.length > 0) {
    evidence.categories = categories;
  }
  if (parentFindingId) {
    evidence.parentFindingId = parentFindingId;
  }
  return evidence;
}

export function getRuntimeVendorDisclosureEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return [];
  }
  const rows = [
    ...getRows(rawEvidence.runtimeVendorDisclosureEvidence),
    ...getRows(rawEvidence.runtime_vendor_disclosure_evidence),
    ...getRows(rawEvidence.vendorDisclosureMismatchEvidence),
    ...getRows(rawEvidence.vendor_disclosure_mismatch_evidence),
    ...getRows(rawEvidence.signalValue),
    ...getRows(rawEvidence)
  ];
  const unique = new Map<string, RuntimeVendorDisclosureEvidence>();
  for (const row of rows) {
    const parsed = parseEvidenceRow(row);
    if (!parsed) {
      continue;
    }
    const key = [
      parsed.parentFindingId ?? "",
      parsed.unmatchedRuntimeVendors.join("|").toLowerCase(),
      parsed.unmatchedRuntimeDomains.join("|").toLowerCase(),
      parsed.policySurfacesSearched.map((surface) => `${surface.type}:${surface.url ?? ""}`).join("|").toLowerCase()
    ].join("::");
    unique.set(key, parsed);
  }
  return [...unique.values()];
}

export function evaluateRuntimeVendorDisclosureEvidence(
  rawEvidence: Record<string, unknown> | null | undefined,
  parentHint: "cookie_disclosure_gap" | "policy_behavior_conflict" = "cookie_disclosure_gap"
): RuntimeVendorDisclosureReview {
  const evidence = getRuntimeVendorDisclosureEvidence(rawEvidence);
  const matchingEvidence = evidence.filter((row) => {
    if (!row.parentFindingId) {
      return true;
    }
    if (parentHint === "policy_behavior_conflict") {
      return row.parentFindingId === "policy_behavior_conflict" || row.parentFindingId === "policy_behavior_contradiction_detected";
    }
    return row.parentFindingId === "cookie_disclosure_gap";
  });
  const negativeEvidenceFlags = new Set<string>();
  if (matchingEvidence.length === 0) {
    negativeEvidenceFlags.add("missing_runtime_vendor_disclosure_evidence");
  }
  const eligibleRows = matchingEvidence.filter((row) => {
    if (row.coverageStatus === "blocked") {
      negativeEvidenceFlags.add("blocked_or_interstitial_evidence_observed");
      return false;
    }
    if (row.observedRuntimeDomains.length === 0 && row.observedRuntimeVendors.length === 0) {
      negativeEvidenceFlags.add("missing_runtime_anchor");
      return false;
    }
    if (row.unmatchedRuntimeVendors.length === 0 && row.unmatchedRuntimeDomains.length === 0) {
      negativeEvidenceFlags.add("missing_unmatched_runtime_vendor");
      return false;
    }
    const reachedReviewableSurfaces = row.policySurfacesSearched.filter((surface) => surface.reached && surface.url && surface.snippet);
    if (reachedReviewableSurfaces.length === 0) {
      negativeEvidenceFlags.add("missing_policy_side_evidence");
      return false;
    }
    const hasDisclosureSearchResult = reachedReviewableSurfaces.some(
      (surface) =>
        (surface.searchedTerms?.length ?? 0) > 0 &&
        ((surface.matchedVendorNames?.length ?? 0) > 0 ||
          (surface.unmatchedVendorNames?.length ?? 0) > 0 ||
          row.matchedVendorDisclosureCount > 0 ||
          row.unmatchedVendorDisclosureCount > 0)
    );
    if (!hasDisclosureSearchResult) {
      negativeEvidenceFlags.add("missing_disclosure_match_search_result");
      return false;
    }
    const hasSurfaceUnmatchedResult = reachedReviewableSurfaces.some((surface) => (surface.unmatchedVendorNames?.length ?? 0) > 0);
    if (!hasSurfaceUnmatchedResult && row.unmatchedVendorDisclosureCount <= 0) {
      negativeEvidenceFlags.add("missing_unmatched_runtime_vendor");
      return false;
    }
    if (!row.mismatchRationale.trim()) {
      negativeEvidenceFlags.add("missing_contradiction_bridge");
      return false;
    }
    return true;
  });
  if (eligibleRows.length === 0) {
    return {
      confidence: "limited",
      directness: "inferred",
      disposition: matchingEvidence.length > 0 ? "audit_only" : "suppress",
      evidence: matchingEvidence,
      parentFindingId: parentHint,
      negativeEvidenceFlags: [...negativeEvidenceFlags]
    };
  }
  const confidence = eligibleRows.some((row) => row.evidenceConfidence === "strong")
    ? "strong"
    : eligibleRows.some((row) => row.evidenceConfidence === "moderate")
      ? "moderate"
      : "limited";
  const directness = eligibleRows.some((row) => row.directVsInferred === "direct")
    ? "direct"
    : eligibleRows.some((row) => row.directVsInferred === "mixed")
      ? "mixed"
      : "inferred";
  return {
    confidence,
    directness,
    disposition: confidence === "limited" || directness === "inferred" ? "audit_only" : "eligible",
    evidence: eligibleRows,
    parentFindingId: parentHint,
    negativeEvidenceFlags: [...negativeEvidenceFlags]
  };
}

export function runtimeVendorDisclosureHasPromotionCategory(evidence: RuntimeVendorDisclosureEvidence[]) {
  return evidence.some((row) => {
    const haystack = [
      ...(row.categories ?? []),
      ...row.unmatchedRuntimeVendors,
      ...row.unmatchedRuntimeDomains,
      row.mismatchRationale
    ].join(" ");
    return /advertising|analytics|identity|cookie[_ -]?sync|rtb|session[_ -]?replay|persistent|identifier-like|identifier_like|pre-consent|pre_consent|post-reject|post_reject|retargeting|marketing/i.test(haystack);
  });
}
