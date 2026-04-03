import {
  getSanitizedNetworkEvidenceRequestUrls,
  getSanitizedNetworkEvidenceVendors
} from "./sanitized-network-evidence";

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getStringArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(record?.[key])) {
      return uniqueStrings(record[key] as string[]);
    }
  }

  return [] as string[];
}

function getFirstString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof record?.[key] === "string") {
      const value = String(record[key]).trim();
      if (value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

function getFirstNumber(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof record?.[key] === "number" && Number.isFinite(record[key])) {
      return record[key] as number;
    }
  }

  return null;
}

function getFirstBoolean(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof record?.[key] === "boolean") {
      return record[key] as boolean;
    }
  }

  return null;
}

function getNestedRecord(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (record?.[key] && typeof record[key] === "object" && !Array.isArray(record[key])) {
      return record[key] as Record<string, unknown>;
    }
  }

  return null;
}

function normalizeContradictionEvidenceRecord(
  record: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!record) {
    return {};
  }

  const normalized: Record<string, unknown> = { ...record };
  const assignCanonicalField = (canonicalKey: string, legacyKeys: string[]) => {
    if (normalized[canonicalKey] !== undefined) {
      return;
    }

    for (const legacyKey of legacyKeys) {
      if (record[legacyKey] !== undefined) {
        normalized[canonicalKey] = record[legacyKey];
        return;
      }
    }
  };

  assignCanonicalField("claimType", ["claim_type", "policyClaimType", "policy_claim_type"]);
  assignCanonicalField("normalizedClaim", ["normalized_claim"]);
  assignCanonicalField("policySnippet", ["policy_snippet"]);
  assignCanonicalField("policySnippets", ["policy_snippets"]);
  assignCanonicalField("supportingSignals", ["supporting_signals"]);
  assignCanonicalField("observationType", ["observation_type", "runtimeObservationType", "runtime_observation_type"]);
  assignCanonicalField("runtimeSummary", ["runtime_summary", "observedBehavior", "observed_behavior"]);
  assignCanonicalField("runtimeEvidenceArtifacts", ["runtime_evidence_artifacts", "runtimeEvidence", "runtime_evidence"]);
  assignCanonicalField("phase", ["runtimePhase", "runtime_phase", "consentPhase", "consent_phase"]);
  assignCanonicalField("contradictionBasis", ["contradiction_basis", "conflictBasis", "conflict_basis", "mismatchReason", "mismatch_reason"]);
  assignCanonicalField("sourceUrl", ["source_url"]);
  assignCanonicalField("policySourceUrl", ["policy_source_url", "pageUrl", "page_url"]);
  assignCanonicalField("policySummaryShort", ["policy_summary_short", "policySummary", "policy_summary"]);
  assignCanonicalField("runtimeVendors", ["runtime_vendors"]);
  assignCanonicalField("relatedVendors", ["related_vendors"]);
  assignCanonicalField("sourceUrls", ["source_urls"]);
  assignCanonicalField("requestUrls", ["request_urls", "runtimeEvidenceUrls"]);
  assignCanonicalField("cookieNames", ["cookie_names"]);
  assignCanonicalField("storageArtifacts", ["storage_artifacts", "localStorageKeys", "sessionStorageKeys"]);
  assignCanonicalField("confidence", ["policyConfidence", "policy_confidence", "runtimeConfidence", "runtime_confidence"]);
  assignCanonicalField("extractionStatus", ["extraction_status", "policyExtractionStatus", "policy_extraction_status"]);
  assignCanonicalField("conflictType", ["conflict_type"]);
  assignCanonicalField("bridgeReasoning", ["bridge_reasoning", "reasoning", "explanation"]);
  assignCanonicalField("supportsPromotion", ["supports_promotion"]);
  assignCanonicalField("reviewStatus", ["review_status", "status"]);
  assignCanonicalField("policyAnchorPresent", ["policy_anchor_present"]);
  assignCanonicalField("runtimeAnchorPresent", ["runtime_anchor_present"]);
  assignCanonicalField("conflictBridgePresent", ["conflict_bridge_present"]);
  assignCanonicalField("promotionEligible", ["promotion_eligible"]);

  return normalized;
}

export type PolicyBehaviorConflictClaimType =
  | "gpc_honored"
  | "no_sale_share_without_opt_out_or_consent"
  | "no_marketing_tracking_before_consent"
  | "only_necessary_cookies_before_choice"
  | "tracking_disabled_after_reject"
  | "no_third_party_advertising_tracking"
  | "no_data_sharing_with_advertisers";

export type PolicyBehaviorRuntimeObservationType =
  | "marketing_vendor_fired_pre_consent"
  | "analytics_vendor_fired_pre_consent"
  | "tracking_persisted_after_reject"
  | "gpc_signal_not_honored"
  | "adtech_cookie_set_under_opt_out"
  | "cross_site_ad_request_observed"
  | "sale_share_like_behavior_observed";

export type PolicyBehaviorConflictType =
  | "declared_opt_out_honored_but_tracking_persisted_under_opt_out"
  | "declared_no_marketing_before_consent_but_marketing_vendor_fired_pre_consent"
  | "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired"
  | "declared_no_sale_share_but_sale_share_like_behavior_observed"
  | "declared_tracking_disabled_after_reject_but_tracking_persisted_after_reject"
  | "declared_no_third_party_advertising_tracking_but_ad_request_observed"
  | "declared_no_advertiser_data_sharing_but_adtech_share_behavior_observed";

export type RuntimeObservationPhase =
  | "pre_consent"
  | "post_consent"
  | "after_reject"
  | "gpc_enabled"
  | "gpc_disabled"
  | "unknown";

export type ContradictionEvidenceStatus =
  | "complete"
  | "policy_semantic_review_incomplete"
  | "runtime_tracking_review_incomplete"
  | "possible_policy_runtime_mismatch"
  | "insufficient_evidence_for_policy_behavior_conflict";

export type ContradictionPolicyAnchor = {
  claimType: PolicyBehaviorConflictClaimType | null;
  sourceUrl: string | null;
  snippet: string | null;
  normalizedClaim: string | null;
  confidence: number | null;
  extractionStatus: string | null;
};

export type ContradictionRuntimeAnchor = {
  observationType: PolicyBehaviorRuntimeObservationType | null;
  phase: RuntimeObservationPhase;
  sourceUrl: string | null;
  vendors: string[];
  requests: string[];
  cookies: string[];
  storageArtifacts: string[];
  confidence: number | null;
};

export type ContradictionConflictBridge = {
  conflictType: PolicyBehaviorConflictType | null;
  reasoning: string | null;
  supportsPromotion: boolean;
};

export type ContradictionEvidenceSufficiency = {
  policyAnchorPresent: boolean;
  runtimeAnchorPresent: boolean;
  conflictBridgePresent: boolean;
  promotionEligible: boolean;
  reviewStatus: ContradictionEvidenceStatus;
};

export type ContradictionEvidenceBundle = {
  claim: string | null;
  contradictionBasis: string | null;
  explicitPolicySnippet: string | null;
  policySnippet: string | null;
  policySourceUrl: string | null;
  policySummaryShort: string | null;
  relatedVendors: string[];
  runtimeEvidenceArtifacts: string[];
  runtimeSummary: string | null;
  runtimeVendors: string[];
  sourceUrls: string[];
  supportingSignals: string[];
  policyAnchor: ContradictionPolicyAnchor;
  runtimeAnchor: ContradictionRuntimeAnchor;
  conflictBridge: ContradictionConflictBridge;
  evidenceSufficiency: ContradictionEvidenceSufficiency;
};

const POLICY_BEHAVIOR_CONFLICT_MAP: Record<
  PolicyBehaviorConflictClaimType,
  Partial<Record<PolicyBehaviorRuntimeObservationType, PolicyBehaviorConflictType>>
> = {
  gpc_honored: {
    gpc_signal_not_honored: "declared_opt_out_honored_but_tracking_persisted_under_opt_out"
  },
  no_sale_share_without_opt_out_or_consent: {
    sale_share_like_behavior_observed: "declared_no_sale_share_but_sale_share_like_behavior_observed"
  },
  no_marketing_tracking_before_consent: {
    marketing_vendor_fired_pre_consent: "declared_no_marketing_before_consent_but_marketing_vendor_fired_pre_consent"
  },
  only_necessary_cookies_before_choice: {
    marketing_vendor_fired_pre_consent: "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired",
    analytics_vendor_fired_pre_consent: "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired",
    adtech_cookie_set_under_opt_out: "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired"
  },
  tracking_disabled_after_reject: {
    tracking_persisted_after_reject: "declared_tracking_disabled_after_reject_but_tracking_persisted_after_reject"
  },
  no_third_party_advertising_tracking: {
    cross_site_ad_request_observed: "declared_no_third_party_advertising_tracking_but_ad_request_observed"
  },
  no_data_sharing_with_advertisers: {
    sale_share_like_behavior_observed: "declared_no_advertiser_data_sharing_but_adtech_share_behavior_observed"
  }
};

function normalizeClaimType(value: string | null): PolicyBehaviorConflictClaimType | null {
  switch (value) {
    case "gpc_honored":
    case "no_sale_share_without_opt_out_or_consent":
    case "no_marketing_tracking_before_consent":
    case "only_necessary_cookies_before_choice":
    case "tracking_disabled_after_reject":
    case "no_third_party_advertising_tracking":
    case "no_data_sharing_with_advertisers":
      return value;
    default:
      return null;
  }
}

function normalizeRuntimeObservationType(value: string | null): PolicyBehaviorRuntimeObservationType | null {
  switch (value) {
    case "marketing_vendor_fired_pre_consent":
    case "analytics_vendor_fired_pre_consent":
    case "tracking_persisted_after_reject":
    case "gpc_signal_not_honored":
    case "adtech_cookie_set_under_opt_out":
    case "cross_site_ad_request_observed":
    case "sale_share_like_behavior_observed":
      return value;
    default:
      return null;
  }
}

function normalizeConflictType(value: string | null): PolicyBehaviorConflictType | null {
  switch (value) {
    case "declared_opt_out_honored_but_tracking_persisted_under_opt_out":
    case "declared_no_marketing_before_consent_but_marketing_vendor_fired_pre_consent":
    case "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired":
    case "declared_no_sale_share_but_sale_share_like_behavior_observed":
    case "declared_tracking_disabled_after_reject_but_tracking_persisted_after_reject":
    case "declared_no_third_party_advertising_tracking_but_ad_request_observed":
    case "declared_no_advertiser_data_sharing_but_adtech_share_behavior_observed":
      return value;
    default:
      return null;
  }
}

function normalizePhase(value: string | null): RuntimeObservationPhase {
  switch (value) {
    case "pre_consent":
    case "post_consent":
    case "after_reject":
    case "gpc_enabled":
    case "gpc_disabled":
      return value;
    default:
      return "unknown";
  }
}

function normalizeEvidenceStatus(value: string | null): ContradictionEvidenceStatus | null {
  switch (value) {
    case "complete":
    case "policy_semantic_review_incomplete":
    case "runtime_tracking_review_incomplete":
    case "possible_policy_runtime_mismatch":
    case "insufficient_evidence_for_policy_behavior_conflict":
      return value;
    default:
      return null;
  }
}

function inferClaimType(source: Record<string, unknown> | null | undefined): PolicyBehaviorConflictClaimType | null {
  const normalizedSource = normalizeContradictionEvidenceRecord(source);
  const explicit = normalizeClaimType(
    getFirstString(normalizedSource, ["claimType"])
  );
  if (explicit) {
    return explicit;
  }

  const haystack = [
    getFirstString(normalizedSource, ["normalizedClaim", "claim"]),
    getFirstString(normalizedSource, ["policySnippet"]),
    ...getStringArray(normalizedSource, ["policySnippets"]),
    ...getStringArray(normalizedSource, ["supportingSignals"])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/gpc|global privacy control|opt-out preference signal/.test(haystack) && /honor|honoured|honored/.test(haystack)) {
    return "gpc_honored";
  }
  if (/only necessary|strictly necessary|essential cookies? only/.test(haystack) && /before consent|before choice|until consent/.test(haystack)) {
    return "only_necessary_cookies_before_choice";
  }
  if (/marketing/.test(haystack) && /before consent|until consent|without consent|absent opt-?in/.test(haystack)) {
    return "no_marketing_tracking_before_consent";
  }
  if (/after reject|after refusal|declin/.test(haystack) && /tracking disabled|tracking stop|disabled/.test(haystack)) {
    return "tracking_disabled_after_reject";
  }
  if (/do not sell|do not share|sale\/share|sell or share/.test(haystack)) {
    return "no_sale_share_without_opt_out_or_consent";
  }
  if (/third-?party advertising tracking|advertising tracking/.test(haystack) && /no|not|disable/.test(haystack)) {
    return "no_third_party_advertising_tracking";
  }
  if (/advertiser/.test(haystack) && /not share|no share|do not share/.test(haystack)) {
    return "no_data_sharing_with_advertisers";
  }

  return null;
}

function inferObservationType(source: Record<string, unknown> | null | undefined): PolicyBehaviorRuntimeObservationType | null {
  const normalizedSource = normalizeContradictionEvidenceRecord(source);
  const explicit = normalizeRuntimeObservationType(
    getFirstString(normalizedSource, ["observationType"])
  );
  if (explicit) {
    return explicit;
  }

  const haystack = [
    getFirstString(normalizedSource, ["runtimeSummary"]),
    ...getStringArray(normalizedSource, ["runtimeEvidenceArtifacts"]),
    ...getStringArray(normalizedSource, ["supportingSignals"])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/gpc/.test(haystack) && /ignored|not honored|not honoured|continued/.test(haystack)) {
    return "gpc_signal_not_honored";
  }
  if (/marketing|adtech|advertis/.test(haystack) && /pre-?consent|before consent/.test(haystack)) {
    return "marketing_vendor_fired_pre_consent";
  }
  if (/analytics/.test(haystack) && /pre-?consent|before consent/.test(haystack)) {
    return "analytics_vendor_fired_pre_consent";
  }
  if (/after reject|after refusal|reject/.test(haystack) && /persist|continued|still|tracking/.test(haystack)) {
    return "tracking_persisted_after_reject";
  }
  if (/cookie/.test(haystack) && /opt-?out/.test(haystack)) {
    return "adtech_cookie_set_under_opt_out";
  }
  if (/cross-?site|doubleclick|googlesyndication|facebook|ad request/.test(haystack)) {
    return "cross_site_ad_request_observed";
  }
  if (/sale|share/.test(haystack) && /behavior|observed|adtech/.test(haystack)) {
    return "sale_share_like_behavior_observed";
  }

  return null;
}

function inferPhase(source: Record<string, unknown> | null | undefined): RuntimeObservationPhase {
  const normalizedSource = normalizeContradictionEvidenceRecord(source);
  const explicit = normalizePhase(
    getFirstString(normalizedSource, ["phase"])
  );
  if (explicit !== "unknown") {
    return explicit;
  }

  const haystack = [
    getFirstString(normalizedSource, ["runtimeSummary"]),
    ...getStringArray(normalizedSource, ["runtimeEvidenceArtifacts"]),
    ...getStringArray(normalizedSource, ["supportingSignals"])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/gpc enabled|with gpc/.test(haystack)) {
    return "gpc_enabled";
  }
  if (/gpc disabled|without gpc/.test(haystack)) {
    return "gpc_disabled";
  }
  if (/after reject|after refusal|reject/.test(haystack)) {
    return "after_reject";
  }
  if (/pre-?consent|before consent/.test(haystack)) {
    return "pre_consent";
  }
  if (/post-?consent|after consent/.test(haystack)) {
    return "post_consent";
  }

  return "unknown";
}

export function getAllowedConflictType(
  claimType: PolicyBehaviorConflictClaimType | null,
  observationType: PolicyBehaviorRuntimeObservationType | null
) {
  if (!claimType || !observationType) {
    return null;
  }

  return POLICY_BEHAVIOR_CONFLICT_MAP[claimType]?.[observationType] ?? null;
}

export function getContradictionEvidenceBundle(record: Record<string, unknown> | null | undefined): ContradictionEvidenceBundle | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const normalizedRecord = normalizeContradictionEvidenceRecord(record);
  const nested =
    normalizedRecord.contradictionEvidence && typeof normalizedRecord.contradictionEvidence === "object"
      ? normalizeContradictionEvidenceRecord(normalizedRecord.contradictionEvidence as Record<string, unknown>)
      : null;
  const source = nested ?? normalizedRecord;
  const policyAnchorSource = normalizeContradictionEvidenceRecord(getNestedRecord(source, ["policyAnchor", "policy_anchor"]) ?? source);
  const runtimeAnchorSource = normalizeContradictionEvidenceRecord(getNestedRecord(source, ["runtimeAnchor", "runtime_anchor"]) ?? source);
  const conflictBridgeSource = normalizeContradictionEvidenceRecord(getNestedRecord(source, ["conflictBridge", "conflict_bridge"]) ?? source);
  const sufficiencySource = normalizeContradictionEvidenceRecord(getNestedRecord(source, ["evidenceSufficiency", "evidence_sufficiency"]) ?? source);

  const claim = getFirstString(source, ["claim"]);
  const contradictionBasis = getFirstString(source, ["contradictionBasis"]);
  const explicitPolicySnippet =
    getFirstString(policyAnchorSource, ["snippet"]) ??
    getStringArray(source, ["policySnippets"])[0] ??
    getFirstString(source, ["policySnippet"]);
  const policySnippet =
    getFirstString(policyAnchorSource, ["snippet", "policySnippet"]) ??
    explicitPolicySnippet ??
    claim;
  const policySourceUrl =
    getFirstString(policyAnchorSource, ["sourceUrl"]) ??
    getFirstString(source, ["policySourceUrl", "sourceUrl"]);
  const policySummaryShort = getFirstString(source, ["policySummaryShort"]);
  const runtimeSummary = getFirstString(source, ["runtimeSummary"]);
  const runtimeEvidenceArtifacts = getStringArray(source, ["runtimeEvidenceArtifacts"]);
  const runtimeVendors = getStringArray(source, ["runtimeVendors"]);
  const relatedVendors = getStringArray(source, ["relatedVendors"]);
  const supportingSignals = getStringArray(source, ["supportingSignals"]);
  const sourceUrls = uniqueStrings([
    ...getStringArray(source, ["sourceUrls"]),
    policySourceUrl
  ]);

  const policyClaimType = inferClaimType(policyAnchorSource);
  const runtimeObservationType = inferObservationType(runtimeAnchorSource);
  const inferredConflictType = getAllowedConflictType(policyClaimType, runtimeObservationType);
  const runtimeRequests = uniqueStrings([
    ...getStringArray(runtimeAnchorSource, ["requests", "requestUrls"]),
    ...getStringArray(source, ["requestUrls"]),
    ...getSanitizedNetworkEvidenceRequestUrls(record, {
      runtimePhase: inferPhase(runtimeAnchorSource)
    })
  ]);
  const runtimeCookies = getStringArray(runtimeAnchorSource, ["cookies", "cookieNames"]);
  const storageArtifacts = getStringArray(runtimeAnchorSource, ["storageArtifacts"]);

  const policyAnchor: ContradictionPolicyAnchor = {
    claimType: policyClaimType,
    sourceUrl: getFirstString(policyAnchorSource, ["sourceUrl"]) ?? policySourceUrl,
    snippet: policySnippet,
    normalizedClaim:
      getFirstString(policyAnchorSource, ["normalizedClaim"]) ??
      claim ??
      policySnippet,
    confidence:
      getFirstNumber(policyAnchorSource, ["confidence"]) ??
      getFirstNumber(source, ["policySemanticConfidence"]),
    extractionStatus:
      getFirstString(policyAnchorSource, ["extractionStatus"]) ??
      getFirstString(source, ["policyExtractionStatus"])
  };

  const runtimeAnchor: ContradictionRuntimeAnchor = {
    observationType: runtimeObservationType,
    phase: inferPhase(runtimeAnchorSource),
    sourceUrl: getFirstString(runtimeAnchorSource, ["sourceUrl"]) ?? policySourceUrl,
    vendors: uniqueStrings([
      ...getStringArray(runtimeAnchorSource, ["vendors", "runtimeVendors"]),
      ...runtimeVendors,
      ...relatedVendors,
      ...getSanitizedNetworkEvidenceVendors(record, {
        runtimePhase: inferPhase(runtimeAnchorSource)
      })
    ]),
    requests: runtimeRequests,
    cookies: runtimeCookies,
    storageArtifacts,
    confidence: getFirstNumber(runtimeAnchorSource, ["confidence", "runtimeConfidence"])
  };

  const conflictBridge: ContradictionConflictBridge = {
    conflictType:
      normalizeConflictType(
        getFirstString(conflictBridgeSource, ["conflictType"])
      ) ?? inferredConflictType,
    reasoning:
      getFirstString(conflictBridgeSource, ["bridgeReasoning", "reasoning", "explanation"]) ??
      getFirstString(source, ["reasoning", "explanation"]),
    supportsPromotion:
      getFirstBoolean(conflictBridgeSource, ["supportsPromotion"]) ??
      Boolean(inferredConflictType)
  };

  const derivedPolicyAnchorPresent = Boolean(
    policyAnchor.claimType &&
      policyAnchor.sourceUrl &&
      policyAnchor.snippet &&
      policyAnchor.normalizedClaim
  );
  const derivedRuntimeAnchorPresent = Boolean(
    runtimeAnchor.observationType &&
      runtimeAnchor.phase !== "unknown" &&
      (runtimeAnchor.vendors.length > 0 ||
        runtimeAnchor.requests.length > 0 ||
        runtimeAnchor.cookies.length > 0 ||
        runtimeAnchor.storageArtifacts.length > 0 ||
        runtimeEvidenceArtifacts.length > 0)
  );
  const derivedConflictBridgePresent = Boolean(
    conflictBridge.conflictType &&
      conflictBridge.reasoning &&
      conflictBridge.supportsPromotion &&
      inferredConflictType === conflictBridge.conflictType
  );
  const reviewStatus =
    normalizeEvidenceStatus(
      getFirstString(sufficiencySource, ["reviewStatus"])
    ) ??
    (derivedPolicyAnchorPresent && derivedRuntimeAnchorPresent && derivedConflictBridgePresent
      ? "complete"
      : "insufficient_evidence_for_policy_behavior_conflict");

  const evidenceSufficiency: ContradictionEvidenceSufficiency = {
    policyAnchorPresent:
      getFirstBoolean(sufficiencySource, ["policyAnchorPresent"]) ?? derivedPolicyAnchorPresent,
    runtimeAnchorPresent:
      getFirstBoolean(sufficiencySource, ["runtimeAnchorPresent"]) ?? derivedRuntimeAnchorPresent,
    conflictBridgePresent:
      getFirstBoolean(sufficiencySource, ["conflictBridgePresent"]) ?? derivedConflictBridgePresent,
    promotionEligible:
      getFirstBoolean(sufficiencySource, ["promotionEligible"]) ??
      (derivedPolicyAnchorPresent && derivedRuntimeAnchorPresent && derivedConflictBridgePresent),
    reviewStatus
  };

  const hasContent =
    Boolean(claim) ||
    Boolean(contradictionBasis) ||
    Boolean(policySnippet) ||
    Boolean(policySourceUrl) ||
    Boolean(policySummaryShort) ||
    Boolean(runtimeSummary) ||
    runtimeEvidenceArtifacts.length > 0 ||
    runtimeVendors.length > 0 ||
    relatedVendors.length > 0 ||
    supportingSignals.length > 0 ||
    evidenceSufficiency.policyAnchorPresent ||
    evidenceSufficiency.runtimeAnchorPresent ||
    evidenceSufficiency.conflictBridgePresent;

  if (!hasContent) {
    return null;
  }

  return {
    claim,
    contradictionBasis,
    explicitPolicySnippet,
    policySnippet,
    policySourceUrl,
    policySummaryShort,
    relatedVendors,
    runtimeEvidenceArtifacts,
    runtimeSummary,
    runtimeVendors,
    sourceUrls,
    supportingSignals,
    policyAnchor,
    runtimeAnchor,
    conflictBridge,
    evidenceSufficiency
  };
}
