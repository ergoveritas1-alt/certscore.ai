export const RUNTIME_VENDOR_DISCLOSURE_SUBTYPE = "runtime_vendor_not_disclosed" as const;

export const RUNTIME_VENDOR_DISCLOSURE_ALIASES = [
  "unlisted_third_party_domains",
  "undisclosed_third_party_domains",
  "runtime_vendor_not_disclosed",
  "third_party_domain_disclosure_gap"
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

function parseSurface(row: Record<string, unknown>): RuntimeVendorPolicySurface | null {
  const reachedValue = row.reached;
  const reached = reachedValue === true || String(reachedValue).toLowerCase() === "true";
  const surface: RuntimeVendorPolicySurface = {
    type: normalizeSurfaceType(row.type ?? row.surfaceType ?? row.surface_type),
    reached
  };
  const url = getString(row.url ?? row.surfaceUrl ?? row.surface_url);
  const retainedEvidenceRef = getString(row.retainedEvidenceRef ?? row.retained_evidence_ref ?? row.evidenceRef ?? row.evidence_ref);
  const searchedTerms = getStringArray(row, ["searchedTerms", "searched_terms"]);
  const matchedVendorNames = getStringArray(row, ["matchedVendorNames", "matched_vendor_names"]);
  const unmatchedVendorNames = getStringArray(row, ["unmatchedVendorNames", "unmatched_vendor_names"]);
  if (url) {
    surface.url = url;
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
  if (!subtype && signalKey && !aliases.has(signalKey) && !/runtime_vendor_not_disclosed|third_party_domain_disclosure_gap/i.test(signalKey)) {
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
    if (row.observedRuntimeDomains.length === 0) {
      negativeEvidenceFlags.add("missing_runtime_anchor");
      return false;
    }
    if (row.unmatchedRuntimeVendors.length === 0 && row.unmatchedRuntimeDomains.length === 0) {
      negativeEvidenceFlags.add("missing_unmatched_runtime_vendor");
      return false;
    }
    if (!row.policySurfacesSearched.some((surface) => surface.reached)) {
      negativeEvidenceFlags.add("missing_policy_side_evidence");
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
