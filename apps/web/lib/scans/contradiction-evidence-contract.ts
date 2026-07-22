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

function getRecordArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return [value as Record<string, unknown>];
    }
  }

  return [] as Record<string, unknown>[];
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
  assignCanonicalField("scriptHosts", ["script_hosts", "preconsent_tracker_script_hosts"]);
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
  assignCanonicalField("policyClaimCandidates", ["policy_claim_candidates", "policyClaimCandidate", "policy_claim_candidate"]);
  assignCanonicalField("runtimeBehaviorArtifacts", ["runtime_behavior_artifacts", "runtimeBehaviorArtifact", "runtime_behavior_artifact"]);
  assignCanonicalField("policyRuntimeBridgeCandidates", [
    "policy_runtime_bridge_candidates",
    "policyRuntimeBridgeCandidate",
    "policy_runtime_bridge_candidate"
  ]);
  assignCanonicalField("artifactType", ["artifact_type"]);
  assignCanonicalField("timestampMs", ["timestamp_ms"]);
  assignCanonicalField("cmpVisibleMs", ["cmp_visible_ms"]);
  assignCanonicalField("consentActionObserved", ["consent_action_observed"]);
  assignCanonicalField("sourceArtifactRef", ["source_artifact_ref"]);
  assignCanonicalField("cookieName", ["cookie_name"]);
  assignCanonicalField("storageKey", ["storage_key"]);
  assignCanonicalField("snippetHash", ["snippet_hash"]);
  assignCanonicalField("documentType", ["document_type"]);
  assignCanonicalField("sectionPath", ["section_path"]);
  assignCanonicalField("headingPath", ["heading_path"]);
  assignCanonicalField("charStart", ["char_start"]);
  assignCanonicalField("charEnd", ["char_end"]);
  assignCanonicalField("extractedBy", ["extracted_by"]);
  assignCanonicalField("extractionVersion", ["extraction_version"]);
  assignCanonicalField("supportsPromotionCandidate", ["supports_promotion_candidate"]);

  return normalized;
}

export type PolicyBehaviorConflictClaimType =
  | "gpc_honored"
  | "cookie_preferences_available"
  | "targeted_advertising_disclosure"
  | "third_party_advertising_disclosure"
  | "tracking_technologies_disclosure"
  | "privacy_choice_or_opt_out_disclosure"
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
  | "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice"
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
  provenance: ContradictionBridgeProvenance;
};

export type ContradictionEvidenceSufficiency = {
  policyAnchorPresent: boolean;
  runtimeAnchorPresent: boolean;
  conflictBridgePresent: boolean;
  promotionEligible: boolean;
  reviewStatus: ContradictionEvidenceStatus;
};

export type ContradictionBridgeProvenance = {
  bridgeRuleId: string | null;
  generatedBy: string | null;
  mappingType: string | null;
  mappingVersion: string | null;
  policyAnchorRef: string | null;
  runtimeAnchorRef: string | null;
  sourceEvidenceIds: string[];
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

export type PolicyClaimCandidate = {
  id: string;
  claimType: PolicyBehaviorConflictClaimType;
  sourceUrl: string;
  documentType: string;
  extractionStatus: string;
  snippet: string;
  snippetHash: string;
  sectionPath: string | null;
  headingPath: string | null;
  charStart: number | null;
  charEnd: number | null;
  confidence: number;
  extractedBy: string;
  extractionVersion: string;
};

export type RuntimeBehaviorArtifact = {
  id: string;
  artifactType: "request" | "cookie" | "storage" | "vendor";
  phase: RuntimeObservationPhase | "post_accept" | "post_reject";
  url: string | null;
  host: string | null;
  vendor: string | null;
  cookieName: string | null;
  storageKey: string | null;
  timestampMs: number | null;
  cmpVisibleMs: number | null;
  consentActionObserved: boolean;
  confidence: number;
  sourceArtifactRef: string;
};

export type PolicyRuntimeBridgeCandidate = {
  id: string;
  bridgeRuleId: string;
  mappingVersion: string;
  policyAnchorRef: string;
  runtimeAnchorRef: string;
  sourceEvidenceIds: string[];
  mappingType: string;
  reasoning: string;
  generatedBy: string;
  confidence: number;
  supportsPromotionCandidate: boolean;
};

export type PolicyBehaviorContradictionEvidenceDecision = {
  eligible: boolean;
  negativeEvidenceFlags: string[];
};

const POLICY_BEHAVIOR_CONFLICT_MAP: Record<
  PolicyBehaviorConflictClaimType,
  Partial<Record<PolicyBehaviorRuntimeObservationType, PolicyBehaviorConflictType>>
> = {
  gpc_honored: {
    gpc_signal_not_honored: "declared_opt_out_honored_but_tracking_persisted_under_opt_out"
  },
  cookie_preferences_available: {
    marketing_vendor_fired_pre_consent: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
    analytics_vendor_fired_pre_consent: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
    adtech_cookie_set_under_opt_out: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice"
  },
  targeted_advertising_disclosure: {},
  third_party_advertising_disclosure: {},
  tracking_technologies_disclosure: {},
  privacy_choice_or_opt_out_disclosure: {},
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
    case "cookie_preferences_available":
    case "targeted_advertising_disclosure":
    case "third_party_advertising_disclosure":
    case "tracking_technologies_disclosure":
    case "privacy_choice_or_opt_out_disclosure":
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
    case "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice":
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

function getBridgeProvenance(source: Record<string, unknown> | null | undefined): ContradictionBridgeProvenance {
  const provenanceRecord = getNestedRecord(source, ["provenance", "bridgeProvenance", "bridge_provenance"]) ?? source;
  return {
    bridgeRuleId: getFirstString(provenanceRecord, ["bridgeRuleId", "bridge_rule_id"]),
    generatedBy: getFirstString(provenanceRecord, ["generatedBy", "generated_by"]),
    mappingType: getFirstString(provenanceRecord, ["mappingType", "mapping_type"]),
    mappingVersion: getFirstString(provenanceRecord, ["mappingVersion", "mapping_version"]),
    policyAnchorRef: getFirstString(provenanceRecord, ["policyAnchorRef", "policy_anchor_ref"]),
    runtimeAnchorRef: getFirstString(provenanceRecord, ["runtimeAnchorRef", "runtime_anchor_ref"]),
    sourceEvidenceIds: getStringArray(provenanceRecord, ["sourceEvidenceIds", "source_evidence_ids"])
  };
}

export function isSpecificPolicyBehaviorPolicySnippet(
  value: string | null | undefined,
  claimType: PolicyBehaviorConflictClaimType | null = null
) {
  const snippet = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (snippet.length < 32) {
    return false;
  }
  if (/insufficient policy content fetched|semantic review|error page|page not found/i.test(snippet)) {
    return false;
  }
  if (/^(?:privacy policy|cookie policy|terms of use|terms and conditions|legal|privacy center)$/i.test(snippet)) {
    return false;
  }
  if (
    /\bwe (?:and|&) our partners? (?:store|access|process)\b/i.test(snippet) &&
    /\b(?:agree|accept all|more options|manage (?:choices|preferences)|consent choices?)\b/i.test(snippet)
  ) {
    return false;
  }

  const lower = snippet.toLowerCase();
  const claimTerms =
    /(cookie|tracking|analytics|advertis(?:e|ing)|marketing|sale|share|consent|opt[- ]?out|preferences?|global privacy control|gpc|personal information|personal data|third part(?:y|ies)|data collection|collect(?:ed|ion)?|data use|use of data)/i;
  if (!claimTerms.test(lower)) {
    return false;
  }

  const navBoilerplateTokens = lower.match(/\b(?:privacy policy|terms of use|contact|login|resources|careers|home|about|platform|solutions|menu|table of contents|community guidelines)\b/g)?.length ?? 0;
  const claimVerb = /\b(?:collect|use|share|sell|disclose|store|process|track|consent|choose|control|disable|reject|opt[- ]?out|preference)\b/i.test(lower);
  const generallySpecific = claimVerb || navBoilerplateTokens <= 2;
  if (!generallySpecific) {
    return false;
  }

  switch (claimType) {
    case "cookie_preferences_available":
    case "privacy_choice_or_opt_out_disclosure":
    case "only_necessary_cookies_before_choice":
      return /\b(?:consent|choice|choose|settings?|preferences?|control|manage|reject|decline|opt[- ]?in|opt[- ]?out|disable|strictly necessary|essential cookies?)\b/i.test(lower);
    case "targeted_advertising_disclosure":
      return /\b(?:targeted|personalized|interest[- ]?based|cross[- ]context behavioral)\b/i.test(lower) && /\b(?:advertis(?:e|ing)|ads?|marketing|tracking|cookies?)\b/i.test(lower);
    case "third_party_advertising_disclosure":
      return /\b(?:third part(?:y|ies)|partners?|advertis(?:ers?|ing)|ad networks?|marketing partners?)\b/i.test(lower) && /\b(?:cookies?|pixels?|tags?|tracking|share|disclos|collect|receive|use)\b/i.test(lower);
    case "tracking_technologies_disclosure":
      return /\b(?:cookies?|pixels?|tags?|web beacons?|sdk|tracking technolog(?:y|ies)|similar technolog(?:y|ies))\b/i.test(lower) && /\b(?:advertis(?:e|ing)|analytics|measurement|tracking|personaliz|target)\b/i.test(lower);
    case "no_marketing_tracking_before_consent":
      return /\b(?:marketing|advertis(?:e|ing)|tracking)\b/i.test(lower) && /\b(?:consent|permission|opt[- ]?in|before|until|without)\b/i.test(lower);
    case "tracking_disabled_after_reject":
      return /\b(?:reject|decline|refuse|opt[- ]?out)\b/i.test(lower) && /\b(?:disable(?:d)?|stop|block|turn off|necessary cookies?)\b/i.test(lower);
    case "no_sale_share_without_opt_out_or_consent":
      return /\b(?:do not sell|do not share|sell or share|sale\/share|opt[- ]?out|consent)\b/i.test(lower);
    case "no_third_party_advertising_tracking":
      return /\b(?:third part(?:y|ies)|advertis(?:e|ing)|tracking)\b/i.test(lower) && /\b(?:no|not|disable|reject|opt[- ]?out|without consent)\b/i.test(lower);
    case "no_data_sharing_with_advertisers":
      return /\b(?:advertisers?|advertising partners?)\b/i.test(lower) && /\b(?:do not share|not share|no share|without consent|opt[- ]?out)\b/i.test(lower);
    case "gpc_honored":
      return /\b(?:global privacy control|gpc|opt[- ]?out preference signal)\b/i.test(lower) && /\b(?:honor|honour|respect|process|treat)\b/i.test(lower);
    default:
      return true;
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
  if (/\b(?:targeted|personalized|interest-?based|cross-?context behavioral)\b/.test(haystack) && /\b(?:advertis|ads?|marketing|tracking|cookies?)\b/.test(haystack)) {
    return "targeted_advertising_disclosure";
  }
  if (/\b(?:third part(?:y|ies)|partners?|advertisers?|ad networks?|marketing partners?)\b/.test(haystack) && /\b(?:cookies?|pixels?|tags?|tracking|share|disclos|collect|receive|use)\b/.test(haystack)) {
    return "third_party_advertising_disclosure";
  }
  if (/\b(?:cookies?|pixels?|tags?|web beacons?|sdk|tracking technolog(?:y|ies)|similar technolog(?:y|ies))\b/.test(haystack) && /\b(?:advertis|analytics|measurement|tracking|personaliz|target)\b/.test(haystack)) {
    return "tracking_technologies_disclosure";
  }
  if (/only necessary|strictly necessary|essential cookies? only/.test(haystack) && /before consent|before choice|until consent/.test(haystack)) {
    return "only_necessary_cookies_before_choice";
  }
  if (/(?:non-?essential|optional|analytics|advertising|marketing).{0,80}(?:consent|choice|permission|opt-?in)|(?:consent|choice|permission|opt-?in).{0,80}(?:non-?essential|optional|analytics|advertising|marketing)|(?:reject|decline|disable).{0,80}(?:analytics|advertising|marketing|non-?essential cookies?)/.test(haystack)) {
    return "only_necessary_cookies_before_choice";
  }
  if (/marketing/.test(haystack) && /before consent|until consent|without consent|absent opt-?in/.test(haystack)) {
    return "no_marketing_tracking_before_consent";
  }
  if (/(?:analytics|advertising|marketing|tracking).{0,80}(?:before|until|without).{0,40}(?:consent|choice|permission|opt-?in)|(?:consent|choice|permission|opt-?in).{0,80}(?:before).{0,40}(?:analytics|advertising|marketing|tracking)/.test(haystack)) {
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

  const artifactType = getFirstString(normalizedSource, ["artifactType"]);
  const phase = inferPhase(normalizedSource);
  const artifactHaystack = [
    artifactType,
    getFirstString(normalizedSource, ["url"]),
    getFirstString(normalizedSource, ["host"]),
    getFirstString(normalizedSource, ["vendor"]),
    getFirstString(normalizedSource, ["cookieName"]),
    getFirstString(normalizedSource, ["storageKey"])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (phase === "pre_consent" && /(analytics|google-analytics|stats|measurement)/.test(artifactHaystack)) {
    return "analytics_vendor_fired_pre_consent";
  }
  if (phase === "pre_consent" && /(request|vendor|cookie|doubleclick|ad|ads|marketing|pixel|tracker|rtb|sync|tag manager|gtm)/.test(artifactHaystack)) {
    return "marketing_vendor_fired_pre_consent";
  }
  if (phase === "after_reject" && /(request|vendor|cookie|storage|track|analytics|advertis|marketing|pixel)/.test(artifactHaystack)) {
    return "tracking_persisted_after_reject";
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

  const upstreamPhase = getFirstString(normalizedSource, ["phase"]);
  if (upstreamPhase === "post_reject") {
    return "after_reject";
  }
  if (upstreamPhase === "post_accept") {
    return "post_consent";
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
  const policyClaimCandidates = getRecordArray(source, ["policyClaimCandidates"]);
  const runtimeBehaviorArtifacts = getRecordArray(source, ["runtimeBehaviorArtifacts"]);
  const policyRuntimeBridgeCandidates = getRecordArray(source, ["policyRuntimeBridgeCandidates"]);
  const bridgeCandidate =
    policyRuntimeBridgeCandidates.find(
      (candidate) => getFirstBoolean(normalizeContradictionEvidenceRecord(candidate), ["supportsPromotionCandidate"]) === true
    ) ??
    policyRuntimeBridgeCandidates[0] ??
    null;
  const bridgePolicyAnchorRef = getFirstString(bridgeCandidate, ["policyAnchorRef"]);
  const bridgeRuntimeAnchorRef = getFirstString(bridgeCandidate, ["runtimeAnchorRef"]);
  const bridgeSourceEvidenceIds = getStringArray(bridgeCandidate, ["sourceEvidenceIds"]);
  const policyClaimCandidate =
    policyClaimCandidates.find((candidate) => getFirstString(candidate, ["id"]) === bridgePolicyAnchorRef) ??
    policyClaimCandidates[0] ??
    null;
  const runtimeBehaviorArtifact =
    runtimeBehaviorArtifacts.find((candidate) => getFirstString(candidate, ["id"]) === bridgeRuntimeAnchorRef) ??
    runtimeBehaviorArtifacts.find((candidate) => bridgeSourceEvidenceIds.includes(getFirstString(candidate, ["id"]) ?? "")) ??
    runtimeBehaviorArtifacts[0] ??
    null;
  const explicitConflictBridgeRecord = getNestedRecord(source, ["conflictBridge", "conflict_bridge"]);
  const explicitSufficiencyRecord = getNestedRecord(source, ["evidenceSufficiency", "evidence_sufficiency"]);
  const policyAnchorSource = normalizeContradictionEvidenceRecord(getNestedRecord(source, ["policyAnchor", "policy_anchor"]) ?? policyClaimCandidate ?? source);
  const runtimeAnchorSource = normalizeContradictionEvidenceRecord(getNestedRecord(source, ["runtimeAnchor", "runtime_anchor"]) ?? runtimeBehaviorArtifact ?? source);
  const conflictBridgeSource = normalizeContradictionEvidenceRecord(explicitConflictBridgeRecord ?? bridgeCandidate ?? source);
  const sufficiencySource = normalizeContradictionEvidenceRecord(explicitSufficiencyRecord ?? source);

  const claim = getFirstString(source, ["claim"]);
  const contradictionBasis = getFirstString(source, ["contradictionBasis"]);
  const explicitPolicySnippet =
    getFirstString(policyAnchorSource, ["snippet"]) ??
    getStringArray(source, ["policySnippets"])[0] ??
    getFirstString(source, ["policySnippet"]);
  const policySnippet =
    getFirstString(policyAnchorSource, ["snippet", "policySnippet"]) ??
    explicitPolicySnippet;
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
    getFirstString(runtimeAnchorSource, ["url"]),
    ...getStringArray(source, ["requestUrls"]),
    ...getStringArray(source, ["runtimeEvidenceUrls"]),
    ...getStringArray(source, ["preconsent_tracker_evidence_urls"]),
    ...getStringArray(source, ["consentBaselineTrackerEvidenceUrls"]),
    ...getSanitizedNetworkEvidenceRequestUrls(record, {
      runtimePhase: inferPhase(runtimeAnchorSource)
    })
  ]);
  const runtimeCookies = uniqueStrings([
    ...getStringArray(runtimeAnchorSource, ["cookies", "cookieNames"]),
    getFirstString(runtimeAnchorSource, ["cookieName"])
  ]);
  const storageArtifacts = uniqueStrings([
    ...getStringArray(runtimeAnchorSource, ["storageArtifacts"]),
    getFirstString(runtimeAnchorSource, ["storageKey"]),
    ...getStringArray(runtimeAnchorSource, ["scriptHosts"]).map((host) => `script_host:${host}`),
    ...getStringArray(source, ["preconsent_tracker_script_hosts"]).map((host) => `script_host:${host}`)
  ]);

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
      getFirstString(runtimeAnchorSource, ["vendor"]),
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
      getFirstBoolean(conflictBridgeSource, ["supportsPromotionCandidate"]) ??
      false,
    provenance: getBridgeProvenance(conflictBridgeSource)
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
    explicitConflictBridgeRecord &&
    conflictBridge.conflictType &&
      conflictBridge.reasoning &&
      conflictBridge.supportsPromotion &&
      inferredConflictType === conflictBridge.conflictType
  );
  const reviewStatus =
    normalizeEvidenceStatus(
      getFirstString(sufficiencySource, ["reviewStatus"])
    ) ??
    (explicitSufficiencyRecord && derivedPolicyAnchorPresent && derivedRuntimeAnchorPresent && derivedConflictBridgePresent
      ? "complete"
      : "insufficient_evidence_for_policy_behavior_conflict");
  const explicitPromotionEligible = getFirstBoolean(sufficiencySource, ["promotionEligible"]);

  const evidenceSufficiency: ContradictionEvidenceSufficiency = {
    policyAnchorPresent:
      getFirstBoolean(sufficiencySource, ["policyAnchorPresent"]) ?? derivedPolicyAnchorPresent,
    runtimeAnchorPresent:
      getFirstBoolean(sufficiencySource, ["runtimeAnchorPresent"]) ?? derivedRuntimeAnchorPresent,
    conflictBridgePresent:
      getFirstBoolean(sufficiencySource, ["conflictBridgePresent"]) ?? derivedConflictBridgePresent,
    promotionEligible:
      explicitPromotionEligible ??
      Boolean(explicitSufficiencyRecord && derivedPolicyAnchorPresent && derivedRuntimeAnchorPresent && derivedConflictBridgePresent),
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

export function evaluatePolicyBehaviorContradictionEvidence(
  record: Record<string, unknown> | null | undefined
): PolicyBehaviorContradictionEvidenceDecision {
  const bundle = getContradictionEvidenceBundle(record);
  const negativeEvidenceFlags = new Set<string>();

  if (!bundle) {
    return {
      eligible: false,
      negativeEvidenceFlags: [
        "missing_policy_side_evidence",
        "missing_runtime_anchor",
        "missing_contradiction_bridge",
        "insufficient_evidence_for_policy_behavior_conflict"
      ]
    };
  }

  const { policyAnchor, runtimeAnchor, conflictBridge } = bundle;
  const allowedConflictType = getAllowedConflictType(policyAnchor.claimType, runtimeAnchor.observationType);
  const policyConfidenceOk = typeof policyAnchor.confidence === "number" && policyAnchor.confidence >= 0.55;
  const runtimeConfidenceOk = typeof runtimeAnchor.confidence === "number" && runtimeAnchor.confidence >= 0.55;
  const runtimeArtifactPresent =
    runtimeAnchor.requests.length > 0 ||
    runtimeAnchor.vendors.length > 0 ||
    runtimeAnchor.cookies.length > 0 ||
    runtimeAnchor.storageArtifacts.length > 0 ||
    bundle.runtimeEvidenceArtifacts.length > 0 ||
    getSanitizedNetworkEvidenceRequestUrls(record).length > 0;
  const policyAnchorPresent = Boolean(
    policyAnchor.claimType &&
      policyAnchor.sourceUrl &&
      policyAnchor.snippet &&
      policyAnchor.extractionStatus === "fetched" &&
      policyConfidenceOk
  );
  const policySnippetSpecific = isSpecificPolicyBehaviorPolicySnippet(policyAnchor.snippet, policyAnchor.claimType);
  const runtimeAnchorPresent = Boolean(
    runtimeAnchor.observationType &&
      runtimeAnchor.phase !== "unknown" &&
      runtimeConfidenceOk &&
      runtimeArtifactPresent
  );
  const bridgeProvenancePresent = Boolean(
    conflictBridge.provenance.bridgeRuleId &&
      conflictBridge.provenance.generatedBy &&
      conflictBridge.provenance.mappingType &&
      conflictBridge.provenance.mappingVersion &&
      conflictBridge.provenance.policyAnchorRef &&
      conflictBridge.provenance.runtimeAnchorRef &&
      conflictBridge.provenance.sourceEvidenceIds.length > 0
  );
  const bridgePresent = Boolean(
    conflictBridge.conflictType &&
      allowedConflictType &&
      conflictBridge.conflictType === allowedConflictType &&
      conflictBridge.reasoning &&
      conflictBridge.supportsPromotion &&
      bridgeProvenancePresent
  );

  if (!policyAnchorPresent) {
    negativeEvidenceFlags.add("missing_policy_side_evidence");
  }
  if (policyAnchor.snippet && !policySnippetSpecific) {
    negativeEvidenceFlags.add(/insufficient policy content fetched|^(privacy policy|terms of use)$|we (?:and|&) our partners? (?:store|access|process).*(?:more options|agree|accept all)/i.test(policyAnchor.snippet.trim())
      ? "boilerplate_policy_anchor"
      : "weak_policy_anchor");
  }
  if (!runtimeAnchorPresent) {
    negativeEvidenceFlags.add("missing_runtime_anchor");
    negativeEvidenceFlags.add("missing_specific_runtime_artifact");
  }
  if (!allowedConflictType || !conflictBridge.conflictType || conflictBridge.conflictType !== allowedConflictType) {
    negativeEvidenceFlags.add("unsupported_policy_runtime_mapping");
  }
  if (!conflictBridge.reasoning || !conflictBridge.supportsPromotion) {
    negativeEvidenceFlags.add("missing_contradiction_bridge");
  }
  if (!bridgeProvenancePresent) {
    negativeEvidenceFlags.add("missing_bridge_provenance");
  }
  if (
    bundle.evidenceSufficiency.reviewStatus === "complete" ||
    bundle.evidenceSufficiency.promotionEligible === true ||
    conflictBridge.supportsPromotion
  ) {
    if (!policyAnchorPresent || !policySnippetSpecific || !runtimeAnchorPresent || !bridgePresent) {
      negativeEvidenceFlags.add("producer_claim_failed_revalidation");
    }
  }

  if (negativeEvidenceFlags.size > 0) {
    negativeEvidenceFlags.add("insufficient_evidence_for_policy_behavior_conflict");
  }

  return {
    eligible: negativeEvidenceFlags.size === 0,
    negativeEvidenceFlags: [...negativeEvidenceFlags]
  };
}

export function evaluatePolicyRuntimeAlignmentReviewEvidence(
  record: Record<string, unknown> | null | undefined
): PolicyBehaviorContradictionEvidenceDecision {
  const normalizedRecord = normalizeContradictionEvidenceRecord(record);
  const nested =
    normalizedRecord.contradictionEvidence && typeof normalizedRecord.contradictionEvidence === "object"
      ? normalizeContradictionEvidenceRecord(normalizedRecord.contradictionEvidence as Record<string, unknown>)
      : null;
  const source = nested ?? normalizedRecord;
  const policyClaimCandidates = getRecordArray(source, ["policyClaimCandidates"]);
  const runtimeBehaviorArtifacts = getRecordArray(source, ["runtimeBehaviorArtifacts"]);
  const bridgeCandidates = getRecordArray(source, ["policyRuntimeBridgeCandidates"]);
  const alignmentBridge = bridgeCandidates.find((candidate) => {
    const normalized = normalizeContradictionEvidenceRecord(candidate);
    return (
      getFirstString(normalized, ["mappingType"]) === "deterministic_policy_runtime_review_mapping" &&
      getFirstBoolean(normalized, ["supportsPromotionCandidate"]) === true
    );
  });
  const negativeEvidenceFlags = new Set<string>();

  if (!alignmentBridge) {
    return {
      eligible: false,
      negativeEvidenceFlags: [
        "missing_policy_runtime_alignment_bridge",
        "insufficient_evidence_for_policy_behavior_conflict"
      ]
    };
  }

  const bridge = normalizeContradictionEvidenceRecord(alignmentBridge);
  const policyAnchorRef = getFirstString(bridge, ["policyAnchorRef"]);
  const runtimeAnchorRef = getFirstString(bridge, ["runtimeAnchorRef"]);
  const policyAnchor = normalizeContradictionEvidenceRecord(
    policyClaimCandidates.find((candidate) => getFirstString(candidate, ["id"]) === policyAnchorRef) ?? null
  );
  const runtimeAnchor = normalizeContradictionEvidenceRecord(
    runtimeBehaviorArtifacts.find((candidate) => getFirstString(candidate, ["id"]) === runtimeAnchorRef) ?? null
  );
  const claimType = normalizeClaimType(getFirstString(policyAnchor, ["claimType"]));
  const policyConfidence = getFirstNumber(policyAnchor, ["confidence"]);
  const runtimeConfidence = getFirstNumber(runtimeAnchor, ["confidence"]);
  const artifactType = getFirstString(runtimeAnchor, ["artifactType"]);
  const concreteRuntimeAnchor = Boolean(
    getFirstString(runtimeAnchor, ["url"]) ||
      getFirstString(runtimeAnchor, ["cookieName"]) ||
      getFirstString(runtimeAnchor, ["storageKey"]) ||
      getFirstString(runtimeAnchor, ["host"])
  );
  const bridgeProvenancePresent = Boolean(
    getFirstString(bridge, ["bridgeRuleId"]) &&
      getFirstString(bridge, ["generatedBy"]) &&
      getFirstString(bridge, ["mappingType"]) &&
      getFirstString(bridge, ["mappingVersion"]) &&
      policyAnchorRef &&
      runtimeAnchorRef &&
      getStringArray(bridge, ["sourceEvidenceIds"]).length >= 2
  );
  const policyAnchorPresent = Boolean(
    claimType &&
      getFirstString(policyAnchor, ["sourceUrl"]) &&
      getFirstString(policyAnchor, ["snippet"]) &&
      getFirstString(policyAnchor, ["extractionStatus"]) === "fetched" &&
      typeof policyConfidence === "number" &&
      policyConfidence >= 0.55 &&
      isSpecificPolicyBehaviorPolicySnippet(getFirstString(policyAnchor, ["snippet"]), claimType)
  );
  const runtimeAnchorPresent = Boolean(
    artifactType &&
      artifactType !== "vendor" &&
      concreteRuntimeAnchor &&
      typeof runtimeConfidence === "number" &&
      runtimeConfidence >= 0.55
  );

  if (!policyAnchorPresent) {
    negativeEvidenceFlags.add("missing_policy_side_evidence");
    negativeEvidenceFlags.add("missing_specific_policy_anchor");
  }
  if (!runtimeAnchorPresent) {
    negativeEvidenceFlags.add("missing_behavior_side_evidence");
    negativeEvidenceFlags.add("missing_specific_runtime_artifact");
  }
  if (!bridgeProvenancePresent) {
    negativeEvidenceFlags.add("missing_bridge_provenance");
  }
  if (negativeEvidenceFlags.size > 0) {
    negativeEvidenceFlags.add("insufficient_evidence_for_policy_behavior_conflict");
  }

  return {
    eligible: negativeEvidenceFlags.size === 0,
    negativeEvidenceFlags: [...negativeEvidenceFlags]
  };
}
