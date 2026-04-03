import {
  getReportUnifiedFinding,
  getReportUnifiedFindingByAlias,
  getReportUnifiedFindingForSignal,
  getReportUnifiedFindingForValidationRule,
  type ReportSignalSource
} from "@website-signal-risk-scanner/shared";
import {
  hasConcreteReplayArtifact,
  hasConcreteSensitivePayloadArtifact
} from "./promotion-evidence-contracts";

import type { ReviewFindingSeverity } from "./canonical-review-finding";
import { deriveConcernPolicy } from "./concern-policy";
import type { FetchQuality } from "./signal-fallback-evidence";
import type { ScanValidationFinding } from "./validation-review-linking";

export type NormalizedConcernOriginType =
  | "snapshot_signal"
  | "compatibility_signal"
  | "policy_enrichment"
  | "policy_review_queue"
  | "validation_rule";

export type NormalizedConcernEvidenceStrengthFlag =
  | "direct_runtime"
  | "policy_text"
  | "page_attributed"
  | "structured_validation"
  | "concrete_payload"
  | "key_page_discovery"
  | "fallback_only";

export type NormalizedConcernPageScope = "domain" | "page" | "multi_page" | "policy_page";
export type NormalizedConcernPolicyPageType =
  | "privacy_policy"
  | "cookie_policy"
  | "terms_of_service"
  | "accessibility_statement"
  | "contact_page"
  | "unknown_policy"
  | "non_policy"
  | null;

export type NormalizedConcernPromotionEligibility = "eligible" | "internal_only" | "blocked";

export type NormalizedConcernExternalSurfacingEligibility = "eligible" | "audit_only" | "suppress";

export type NormalizedConcernAssertionLevel = "weak" | "moderate" | "strong";

export type NormalizedConcernNegativeEvidenceFlag =
  | "no_consent_surface_observed"
  | "no_consent_actionable_choice_observed"
  | "no_direct_runtime_replay_artifact_observed"
  | "no_direct_runtime_retargeting_artifact_observed"
  | "blocked_or_interstitial_evidence_observed"
  | "positive_surface_content_unverified"
  | "policy_rights_language_observed"
  | "policy_target_retrievable"
  | "policy_target_parsing_incomplete"
  | "missing_behavior_side_evidence"
  | "missing_policy_side_evidence"
  | "missing_contradiction_mapping"
  | "missing_explicit_contradiction_basis"
  | "missing_specific_policy_anchor"
  | "missing_specific_runtime_anchor"
  | "unsupported_contradiction_mapping"
  | "policy_semantic_review_incomplete"
  | "runtime_tracking_review_incomplete"
  | "possible_policy_runtime_mismatch"
  | "insufficient_evidence_for_policy_behavior_conflict"
  | "model_suspicion_without_structured_support"
  | "missing_concrete_preconsent_artifact"
  | "missing_preconsent_sequence_evidence"
  | "missing_concrete_sensitive_payload"
  | "missing_third_party_tracking_artifact";

export type NormalizedConcernEvidenceBundle = {
  counts: Record<string, number>;
  entities: Record<string, string[]>;
  fetchQuality: FetchQuality | null;
  flags: string[];
  pageUrls: string[];
  policyIsPrimarySource: boolean | null;
  policyPageType: NormalizedConcernPolicyPageType;
  policySnippets: string[];
  rawEvidence: Record<string, unknown> | null;
  runtimeArtifacts: string[];
  sourceUrls: string[];
};

export type NormalizedConcern = {
  allowedNarrativeTier: NormalizedConcernAssertionLevel;
  categoryId?: string;
  canonicalConcernKey: string;
  description: string;
  evidenceBundle: NormalizedConcernEvidenceBundle;
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[];
  externalSurfacingEligibility: NormalizedConcernExternalSurfacingEligibility;
  linkedValidationFinding?: ScanValidationFinding | null;
  linkedValidationRuleKeys?: string[];
  negativeEvidenceFlags: NormalizedConcernNegativeEvidenceFlag[];
  observedValue: string | null;
  originKey: string;
  originType: NormalizedConcernOriginType;
  pageScope: NormalizedConcernPageScope;
  policyIsPrimarySource: boolean | null;
  policyPageType: NormalizedConcernPolicyPageType;
  promotionEligibility: NormalizedConcernPromotionEligibility;
  severity: ReviewFindingSeverity;
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalSource;
  sourceType: "issue" | "signal" | "validation";
  suggestedUnifiedFindingId?: string;
  title: string;
};

export type ReviewFindingCandidateInput = {
  categoryId?: string;
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  severity: ReviewFindingSeverity;
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalSource;
  sourceType: "issue" | "signal";
  title: string;
};

export type ConcernBackedUnifiedFindingCandidate = ReviewFindingCandidateInput & {
  normalizedConcern: NormalizedConcern;
};

export type PolicyReviewConcernInput = {
  categoryId?: string;
  description: string;
  evidence: Record<string, unknown> | null | undefined;
  observedValue?: string | null;
  pageUrl?: string | null;
  reason: string;
  ruleKey: string;
  severity: ReviewFindingSeverity;
  title: string;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function normalizeTitleKey(title: string) {
  return title.trim().toLowerCase();
}

function addEntity(target: Record<string, string[]>, key: string, values: string[]) {
  const cleaned = uniqueStrings(values);
  if (cleaned.length === 0) {
    return;
  }

  target[key] = uniqueStrings([...(target[key] ?? []), ...cleaned]);
}

function getStringArrayEvidence(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getBooleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function getNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasConcretePayloadEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!Array.isArray(rawEvidence?.sensitivePayloadViolations) && !Array.isArray(rawEvidence?.sensitive_payload_violations)) {
    return false;
  }

  const rows = Array.isArray(rawEvidence?.sensitivePayloadViolations)
    ? rawEvidence.sensitivePayloadViolations
    : Array.isArray(rawEvidence?.sensitive_payload_violations)
      ? rawEvidence.sensitive_payload_violations
      : [];

  return rows.some(
    (row): boolean =>
      Boolean(row) &&
      typeof row === "object" &&
      (row as { evidenceStrength?: unknown }).evidenceStrength !== "detector_only"
  );
}

function hasThirdPartyTrackingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const directFlags = [
    rawEvidence.adNetworkGoogleAds === true,
    rawEvidence.ad_network_google_ads === true,
    rawEvidence.adNetworkMetaAds === true,
    rawEvidence.ad_network_meta_ads === true,
    rawEvidence.retargetingPixelDetected === true,
    rawEvidence.retargeting_pixel_detected === true,
    rawEvidence.retargetingPixelArtifactPresent === true,
    rawEvidence.retargeting_pixel_artifact_present === true,
    rawEvidence.sessionReplayToolDetected === true,
    rawEvidence.session_replay_tool_detected === true,
    rawEvidence.sessionReplayVendorArtifactPresent === true,
    rawEvidence.session_replay_vendor_artifact_present === true
  ];

  if (directFlags.some(Boolean)) {
    return true;
  }

  const entities = [
    ...(Array.isArray(rawEvidence.runtimeVendors) ? rawEvidence.runtimeVendors : []),
    ...(Array.isArray(rawEvidence.runtime_vendors) ? rawEvidence.runtime_vendors : []),
    ...(Array.isArray(rawEvidence.relatedVendors) ? rawEvidence.relatedVendors : []),
    ...(Array.isArray(rawEvidence.preconsent_tracker_vendors) ? rawEvidence.preconsent_tracker_vendors : []),
    ...(Array.isArray(rawEvidence.persisted_tracker_vendors) ? rawEvidence.persisted_tracker_vendors : [])
  ];

  return entities.some((value) => typeof value === "string" && value.trim().length > 0);
}

function getPolicyArrayValue(rawEvidence: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = rawEvidence?.[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function getPolicyBooleanValue(rawEvidence: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof rawEvidence?.[key] === "boolean") {
      return rawEvidence[key] as boolean;
    }
  }

  return null;
}

function getPolicyStringValue(rawEvidence: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof rawEvidence?.[key] === "string" && String(rawEvidence[key]).trim().length > 0) {
      return String(rawEvidence[key]).trim();
    }
  }

  return null;
}

function getPolicyNumberValue(rawEvidence: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof rawEvidence?.[key] === "number" && Number.isFinite(rawEvidence[key] as number)) {
      return rawEvidence[key] as number;
    }
  }

  return null;
}

function normalizePolicySemanticEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return null;
  }

  const normalized = { ...rawEvidence };

  const assignString = (canonicalKey: string, legacyKeys: string[]) => {
    if (typeof normalized[canonicalKey] === "string" && String(normalized[canonicalKey]).trim().length > 0) {
      return;
    }

    const value = getPolicyStringValue(rawEvidence, legacyKeys);
    if (value !== null) {
      normalized[canonicalKey] = value;
    }
  };

  const assignNumber = (canonicalKey: string, legacyKeys: string[]) => {
    if (typeof normalized[canonicalKey] === "number" && Number.isFinite(normalized[canonicalKey] as number)) {
      return;
    }

    const value = getPolicyNumberValue(rawEvidence, legacyKeys);
    if (value !== null) {
      normalized[canonicalKey] = value;
    }
  };

  const assignBoolean = (canonicalKey: string, legacyKeys: string[]) => {
    if (typeof normalized[canonicalKey] === "boolean") {
      return;
    }

    const value = getPolicyBooleanValue(rawEvidence, legacyKeys);
    if (value !== null) {
      normalized[canonicalKey] = value;
    }
  };

  const assignArray = (canonicalKey: string, legacyKeys: string[]) => {
    if (Array.isArray(normalized[canonicalKey])) {
      return;
    }

    const value = getPolicyArrayValue(rawEvidence, legacyKeys);
    if (Array.isArray(value)) {
      normalized[canonicalKey] = value;
    }
  };

  assignString("policyExtractionStatus", ["policyExtractionStatus", "policy_extraction_status"]);
  assignNumber("policySemanticConfidence", ["policySemanticConfidence", "policy_semantic_confidence"]);
  assignNumber("policyCoverageRatio", ["policyCoverageRatio", "policy_coverage_ratio"]);
  assignNumber("policySnippetCount", ["policySnippetCount", "policy_snippet_count"]);
  assignArray("policyRightsSignals", ["policyRightsSignals", "policy_rights_signals"]);
  assignArray("policyDataCategories", ["policyDataCategories", "policy_data_categories"]);
  assignBoolean("policySubprocessorsListed", ["policySubprocessorsListed", "policy_subprocessors_listed"]);
  assignBoolean("subscriptionCancellationPolicyPresent", [
    "subscriptionCancellationPolicyPresent",
    "subscription_cancellation_policy_present"
  ]);
  assignBoolean("cancellationTermsPresent", ["cancellationTermsPresent", "cancellation_terms_present"]);
  assignBoolean("policyCancellationOrRefundPresent", [
    "policyCancellationOrRefundPresent",
    "policy_cancellation_or_refund_present"
  ]);
  assignBoolean("accountClosureTermsPresent", ["accountClosureTermsPresent", "account_closure_terms_present"]);
  assignString("pageType", ["pageType", "page_type"]);
  assignString("pageUrl", ["pageUrl", "page_url"]);
  assignString("sourceUrl", ["sourceUrl", "source_url"]);
  assignBoolean("policyIsPrimarySource", [
    "policyIsPrimarySource",
    "policy_is_primary_source",
    "isPrimaryPolicy",
    "is_primary_policy",
    "isPrimaryPolicyEnrichment",
    "is_primary_policy_enrichment"
  ]);
  assignString("policySourceRole", ["policySourceRole", "policy_source_role"]);

  if (!normalized.policyFieldCoverage && rawEvidence.policy_field_coverage && typeof rawEvidence.policy_field_coverage === "object") {
    normalized.policyFieldCoverage = rawEvidence.policy_field_coverage;
  }

  return normalized;
}

function getPolicyFieldCoverage(rawEvidence: Record<string, unknown> | null | undefined) {
  const value =
    rawEvidence?.policyFieldCoverage && typeof rawEvidence.policyFieldCoverage === "object"
      ? rawEvidence.policyFieldCoverage
      : null;

  return value as Record<string, { confidence?: unknown; found?: unknown; snippetHash?: unknown }> | null;
}

function hasStructuredPolicySupport(rawEvidence: Record<string, unknown> | null | undefined) {
  const extractionStatus = getPolicyStringValue(rawEvidence, ["policyExtractionStatus"]);
  const semanticConfidence = getPolicyNumberValue(rawEvidence, ["policySemanticConfidence"]);
  const coverageRatio = getPolicyNumberValue(rawEvidence, ["policyCoverageRatio"]);
  const snippetCount = getPolicyNumberValue(rawEvidence, ["policySnippetCount"]);

  return (
    extractionStatus === "fetched" &&
    typeof semanticConfidence === "number" &&
    semanticConfidence >= 0.6 &&
    ((typeof coverageRatio === "number" && coverageRatio >= 0.35) ||
      (typeof snippetCount === "number" && snippetCount >= 1))
  );
}

function getFieldCoverageState(
  rawEvidence: Record<string, unknown> | null | undefined,
  pattern: RegExp
) {
  const coverage = getPolicyFieldCoverage(rawEvidence);
  if (!coverage) {
    return null;
  }

  const entries = Object.entries(coverage).filter(([key]) => pattern.test(key));
  if (entries.length === 0) {
    return null;
  }

  const foundValues = entries.map(([, value]) => value?.found).filter((value) => typeof value === "boolean") as boolean[];
  if (foundValues.length === 0) {
    return null;
  }

  return foundValues.some(Boolean);
}

export function inferSpecializedUnifiedFindingId(input: {
  currentSuggestedId?: string;
  originType?: NormalizedConcernOriginType;
  rawEvidence?: Record<string, unknown> | null;
  signalKey?: string;
  title?: string;
}) {
  const rawEvidence = input.rawEvidence ?? null;
  const currentId = input.currentSuggestedId ?? null;
  const title = (input.title ?? "").toLowerCase();

  const attributedUrls = [
    ...getStringArrayEvidence(rawEvidence?.pageUrls),
    ...getStringArrayEvidence(rawEvidence?.sourceUrls),
    getStringValue(rawEvidence?.pageUrl),
    getStringValue(rawEvidence?.sourceUrl)
  ].filter((value): value is string => Boolean(value));
  const policySnippets = [
    ...getStringArrayEvidence(rawEvidence?.policySnippets),
    getStringValue(rawEvidence?.policySummaryShort)
  ].filter((value): value is string => Boolean(value));

  const keyboardIssueCount = getNumberValue(
    rawEvidence?.wcagKeyboardNavigationIssueCount ?? rawEvidence?.wcag_keyboard_navigation_issue_count
  );
  if (
    (currentId === "keyboard_navigation_issues" ||
      input.signalKey === "accessibility.wcag_keyboard_navigation_issue_count" ||
      /keyboard/.test(title)) &&
    typeof keyboardIssueCount === "number" &&
    keyboardIssueCount >= 2
  ) {
    return "keyboard_only_task_completion_blocked";
  }

  const formLabelIssueCount = getNumberValue(
    rawEvidence?.wcagFormLabelErrorCount ?? rawEvidence?.wcag_form_label_error_count
  );
  if (
    (currentId === "form_label_issues" ||
      input.signalKey === "accessibility.wcag_form_label_error_count" ||
      /form label/.test(title)) &&
    typeof formLabelIssueCount === "number" &&
    formLabelIssueCount >= 3
  ) {
    return "critical_form_completion_barrier";
  }

  const hasSensitivePayload = hasConcreteSensitivePayloadArtifact(rawEvidence);
  if (
    hasSensitivePayload &&
    (currentId === "high_sensitivity_data_collection" ||
      currentId === "health_information_collection" ||
      currentId === "financial_information_collection" ||
      currentId === "government_id_collection" ||
      currentId === "ssn_collection" ||
      input.signalKey === "commerce.high_sensitivity_data_collection_detected" ||
      input.signalKey === "commerce.form_collects_health_information" ||
      input.signalKey === "commerce.form_collects_financial_information" ||
      input.signalKey === "commerce.form_collects_government_id" ||
      input.signalKey === "commerce.form_collects_ssn")
  ) {
    if (hasConcreteReplayArtifact(rawEvidence)) {
      return "session_replay_on_sensitive_input_surface";
    }

    if (hasThirdPartyTrackingEvidence(rawEvidence)) {
      return "sensitive_data_collection_with_third_party_tracking_present";
    }
  }

  if (currentId === "account_exit_terms_missing") {
    const subscriptionCancellationPolicyPresent = getPolicyBooleanValue(rawEvidence, [
      "subscriptionCancellationPolicyPresent"
    ]);
    const cancellationTermsPresent = getPolicyBooleanValue(rawEvidence, [
      "cancellationTermsPresent"
    ]);
    const policyCancellationOrRefundPresent = getPolicyBooleanValue(rawEvidence, [
      "policyCancellationOrRefundPresent"
    ]);
    const accountClosureTermsPresent = getPolicyBooleanValue(rawEvidence, [
      "accountClosureTermsPresent"
    ]);

    if (
      (subscriptionCancellationPolicyPresent === false || policyCancellationOrRefundPresent === false) &&
      cancellationTermsPresent !== true &&
      accountClosureTermsPresent !== true
    ) {
      return "cancellation_method_disclosure_missing";
    }
  }

  if (!currentId && hasStructuredPolicySupport(rawEvidence)) {
    const policyDataCategories = getPolicyArrayValue(rawEvidence, [
      "policyDataCategories"
    ]);
    const policySubprocessorsListed = getPolicyBooleanValue(rawEvidence, [
      "policySubprocessorsListed"
    ]);
    const dataCategoriesCoverage = getFieldCoverageState(rawEvidence, /data[_-]?categor|category|categories/i);
    const purposeCoverage = getFieldCoverageState(rawEvidence, /purpose|processing[_-]?purpose|data[_-]?use|use[_-]?of[_-]?data/i);

    if (
      Array.isArray(policyDataCategories) &&
      policyDataCategories.length === 0 &&
      dataCategoriesCoverage !== true
    ) {
      return "data_categories_disclosure_missing";
    }

    if (policySubprocessorsListed === false) {
      return "third_party_recipient_disclosure_missing";
    }

    if (purposeCoverage === false) {
      return "purpose_of_use_disclosure_missing";
    }
  }

  if (currentId === "targeted_advertising_choices_present") {
    const isGuessedOnly = rawEvidence?.keyPageGuessedOnly === true || rawEvidence?.key_page_guessed_only === true;
    const hasExplicitControlUrl = attributedUrls.some((value) => {
      if (!/privacy-choices|privacy_choices|your-privacy-choices|do-not-sell|do-not-share|opt-?out|ad-choices|cookie/i.test(value)) {
        return false;
      }

      if (!isGuessedOnly) {
        return true;
      }

      return !/\/(?:legal\/)?cookies\/?$/i.test(value);
    });
    const hasExplicitControlSnippet = policySnippets.some((value) =>
      /privacy choices|your privacy choices|do not sell|do not share|ad choices|manage cookies|cookie settings|global privacy control|\bgpc\b/i.test(
        value
      )
    );
    const hasRightsLikeSnippet = policySnippets.some((value) =>
      /privacy rights|ccpa privacy rights|the right to access|the right to request|delete request|access request|correction request/i.test(
        value
      )
    );
    if (!hasExplicitControlUrl && isGuessedOnly && hasRightsLikeSnippet) {
      return "privacy_rights_path_present";
    }
  }

  return currentId ?? undefined;
}

function extractEvidenceFromRaw(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return {
      counts: {} as Record<string, number>,
      entities: {} as Record<string, string[]>,
      fetchQuality: null as FetchQuality | null,
      flags: [] as string[],
      pageUrls: [] as string[],
      policyIsPrimarySource: null,
      policyPageType: null as NormalizedConcernPolicyPageType,
      policySnippets: [] as string[],
      runtimeArtifacts: [] as string[],
      sourceUrls: [] as string[]
    };
  }

  const counts: Record<string, number> = {};
  const entities: Record<string, string[]> = {};
  const flags = new Set<string>();
  const pageUrls = new Set<string>();
  const sourceUrls = new Set<string>();
  const policySnippets = new Set<string>();
  const runtimeArtifacts = new Set<string>();

  for (const [key, value] of Object.entries(rawEvidence)) {
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value.trim())) {
        if (/pageurl|page_url/i.test(key)) {
          pageUrls.add(value);
        } else {
          sourceUrls.add(value);
        }
      } else if (/claim|policy|disclosure|summary|snippet|description|rationale/i.test(key)) {
        policySnippets.add(value);
      } else if (/runtime|request|network|artifact/i.test(key)) {
        runtimeArtifacts.add(value);
      }
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      if (/count|score|confidence|delta|attempt/i.test(key)) {
        counts[key] = value;
      }
      continue;
    }

    if (value === true) {
      flags.add(key);
      continue;
    }

    const stringValues = getStringArrayEvidence(value);
    if (stringValues.length === 0) {
      continue;
    }

    if (stringValues.some((entry) => /^https?:\/\//i.test(entry.trim()))) {
      for (const entry of stringValues) {
        if (/pageurl|page_url/i.test(key)) {
          pageUrls.add(entry);
        } else {
          sourceUrls.add(entry);
        }
      }
      continue;
    }

    if (/runtime_vendors?|sessionReplayRuntimeVendors|relatedVendors/i.test(key)) {
      addEntity(entities, key, stringValues);
      continue;
    }

    if (/runtime|request|network|artifact/i.test(key)) {
      for (const entry of stringValues) {
        runtimeArtifacts.add(entry);
      }
      continue;
    }

    if (/operator_relationship|policyRightsSignals|rights_signals?|policyBoilerplateSignals/i.test(key)) {
      addEntity(entities, key, stringValues);
      continue;
    }

    if (/^signalValue$/i.test(key)) {
      continue;
    }

    if (/vendor|cookie|selector|url|page|rule|entity/i.test(key)) {
      addEntity(entities, key, stringValues);
      continue;
    }

    for (const entry of stringValues.slice(0, 5)) {
      if (/policy|disclosure|summary|snippet/i.test(key)) {
        policySnippets.add(entry);
      } else {
        policySnippets.add(entry);
      }
    }
  }

  return {
    counts,
    entities,
    fetchQuality:
      rawEvidence.fetchQuality === "verified_content" ||
      rawEvidence.fetchQuality === "thin_content" ||
      rawEvidence.fetchQuality === "blocked_interstitial" ||
      rawEvidence.fetchQuality === "unreachable"
        ? rawEvidence.fetchQuality
        : rawEvidence.fetch_quality === "verified_content" ||
            rawEvidence.fetch_quality === "thin_content" ||
            rawEvidence.fetch_quality === "blocked_interstitial" ||
            rawEvidence.fetch_quality === "unreachable"
          ? rawEvidence.fetch_quality
          : null,
    flags: [...flags],
    pageUrls: [...pageUrls],
    policyIsPrimarySource: derivePolicyPrimarySource(rawEvidence),
    policyPageType: derivePolicyPageType({
      pageUrls: [...pageUrls],
      rawEvidence,
      sourceUrls: [...sourceUrls]
    }),
    policySnippets: [...policySnippets],
    runtimeArtifacts: [...runtimeArtifacts],
    sourceUrls: [...sourceUrls]
  };
}

function extractEvidenceFromValidationFinding(finding?: ScanValidationFinding | null) {
  return extractEvidenceFromRaw(finding?.evidence ?? null);
}

function normalizeFetchQuality(value: unknown): FetchQuality | null {
  return value === "verified_content" ||
    value === "thin_content" ||
    value === "blocked_interstitial" ||
    value === "unreachable"
    ? value
    : null;
}

function mergeConcernEvidenceBundles(
  left: ReturnType<typeof extractEvidenceFromRaw>,
  right: ReturnType<typeof extractEvidenceFromValidationFinding>,
  candidateEvidence?: string[]
): NormalizedConcernEvidenceBundle {
  return {
    counts: { ...left.counts, ...right.counts },
    entities: { ...left.entities, ...right.entities },
    fetchQuality: normalizeFetchQuality(left.fetchQuality ?? right.fetchQuality),
    flags: uniqueStrings([...left.flags, ...right.flags]),
    pageUrls: uniqueStrings([
      ...left.pageUrls,
      ...right.pageUrls,
      ...(candidateEvidence ?? []).filter((entry) => /^https?:\/\//i.test(entry.trim()))
    ]),
    policyIsPrimarySource: left.policyIsPrimarySource ?? right.policyIsPrimarySource,
    policyPageType: left.policyPageType ?? right.policyPageType,
    policySnippets: uniqueStrings([
      ...left.policySnippets,
      ...right.policySnippets,
      ...(candidateEvidence ?? []).filter((entry) => !/^https?:\/\//i.test(entry.trim())).slice(0, 3)
    ]),
    rawEvidence: left === right ? null : null,
    runtimeArtifacts: uniqueStrings([...left.runtimeArtifacts, ...right.runtimeArtifacts]),
    sourceUrls: uniqueStrings([...left.sourceUrls, ...right.sourceUrls])
  };
}

function isPolicyLikeUrl(url: string) {
  return derivePolicyPageTypeFromUrl(url) !== "non_policy";
}

function derivePolicyPageTypeFromUrl(url: string): Exclude<NormalizedConcernPolicyPageType, null> {
  const lowered = url.toLowerCase();
  let pathname = lowered;

  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = lowered;
  }

  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const pathSegments = normalizedPath.split("/").filter(Boolean);
  const leaf = pathSegments[pathSegments.length - 1] ?? "";
  const legalLeafPattern =
    /^(privacy|privacy-policy|privacy_notice|privacy-notice|cookie-policy|cookies|cookie-notice|cookie_notice|terms|terms-of-service|terms_of_service|tos|accessibility|accessibility-statement|accessibility_statement|contact|contact-us|contact_us)$/;

  if (pathSegments.length > 0 && !legalLeafPattern.test(leaf)) {
    return "non_policy";
  }

  if (/\/privacy(?:[-_/]policy|[-_/]notice)?$|^\/privacy(?:[-_/]policy|[-_/]notice)?$/i.test(normalizedPath)) {
    return "privacy_policy";
  }
  if (/\/(?:cookie-policy|cookie_notice|cookie-notice|cookies)$/.test(normalizedPath)) {
    return "cookie_policy";
  }
  if (/\/(?:terms|terms-of-service|terms_of_service|tos|conditions)$/.test(normalizedPath)) {
    return "terms_of_service";
  }
  if (/\/(?:accessibility|accessibility-statement|accessibility_statement)$/.test(normalizedPath)) {
    return "accessibility_statement";
  }
  if (/\/(?:contact|contact-us|contact_us)$/.test(normalizedPath)) {
    return "contact_page";
  }
  if (/\/(?:policy|notice|legal)$/.test(normalizedPath)) {
    return "unknown_policy";
  }
  return "non_policy";
}

function normalizePolicyPageType(value: unknown): NormalizedConcernPolicyPageType {
  const normalized = getStringValue(value)?.toLowerCase();
  switch (normalized) {
    case "privacy_policy":
    case "cookie_policy":
    case "terms_of_service":
    case "accessibility_statement":
    case "contact_page":
    case "unknown_policy":
    case "non_policy":
      return normalized;
    default:
      return null;
  }
}

function derivePolicyPageType(input: {
  pageUrls: string[];
  rawEvidence: Record<string, unknown>;
  sourceUrls: string[];
}): NormalizedConcernPolicyPageType {
  const explicitType =
    normalizePolicyPageType(input.rawEvidence.policyPageType) ??
    normalizePolicyPageType(input.rawEvidence.pageType) ??
    normalizePolicyPageType(input.rawEvidence.normalizedConcernPolicyPageType);

  if (explicitType) {
    return explicitType;
  }

  const urls = uniqueStrings([...input.pageUrls, ...input.sourceUrls]);
  if (urls.length === 0) {
    return null;
  }

  return derivePolicyPageTypeFromUrl(urls[0]!);
}

function derivePolicyPrimarySource(rawEvidence: Record<string, unknown>) {
  const explicit =
    getBooleanValue(rawEvidence.policyIsPrimarySource) ??
    getBooleanValue(rawEvidence.isPrimaryPolicy) ??
    getBooleanValue(rawEvidence.isPrimaryPolicyEnrichment);

  if (explicit !== null) {
    return explicit;
  }

  const sourceRole =
    getStringValue(rawEvidence.policySourceRole) ??
    getStringValue(rawEvidence.normalizedConcernPolicySourceRole);

  if (sourceRole === "primary_policy") {
    return true;
  }
  if (sourceRole === "secondary_policy" || sourceRole === "non_policy") {
    return false;
  }

  return null;
}

function derivePageScope(bundle: NormalizedConcernEvidenceBundle): NormalizedConcernPageScope {
  const urls = uniqueStrings([...bundle.pageUrls, ...bundle.sourceUrls]);
  if (urls.length === 0) {
    return "domain";
  }
  if (urls.length > 1) {
    return "multi_page";
  }
  return isPolicyLikeUrl(urls[0]!) ? "policy_page" : "page";
}

function deriveOriginTypeFromCandidate(candidate: ReviewFindingCandidateInput): NormalizedConcernOriginType {
  if (candidate.sourceType === "signal") {
    if (candidate.signalSource === "snapshot_signal") {
      return "snapshot_signal";
    }
    if (candidate.signalSource === "policy_enrichment_signal") {
      return "policy_enrichment";
    }
    return "compatibility_signal";
  }

  if (candidate.linkedValidationFinding?.findingSource === "policy_review_queue") {
    return "policy_review_queue";
  }

  if (candidate.linkedValidationFinding) {
    return "validation_rule";
  }

  return "compatibility_signal";
}

function resolveSuggestedUnifiedFindingId(input: {
  originType: NormalizedConcernOriginType;
  originKey: string;
  rawEvidence?: Record<string, unknown> | null;
  signalKey?: string;
  signalSource?: ReportSignalSource;
  title: string;
  linkedValidationFinding?: ScanValidationFinding | null;
}) {
  const explicitFindingId =
    typeof input.rawEvidence?.familyPacketFindingId === "string"
      ? input.rawEvidence.familyPacketFindingId
      : typeof input.rawEvidence?.unifiedFindingId === "string"
        ? input.rawEvidence.unifiedFindingId
        : null;
  if (explicitFindingId) {
    const explicitFinding = getReportUnifiedFinding(explicitFindingId);
    if (explicitFinding) {
      return inferSpecializedUnifiedFindingId({
        currentSuggestedId: explicitFinding.id,
        originType: input.originType,
        rawEvidence: input.rawEvidence,
        signalKey: input.signalKey,
        title: input.title
      });
    }
  }

  if (input.signalKey && input.signalSource) {
    const signalMatch = getReportUnifiedFindingForSignal(input.signalSource, input.signalKey);
    if (signalMatch) {
      return inferSpecializedUnifiedFindingId({
        currentSuggestedId: signalMatch.id,
        originType: input.originType,
        rawEvidence: input.rawEvidence,
        signalKey: input.signalKey,
        title: input.title
      });
    }
  }

  if (input.linkedValidationFinding) {
    const validationMatch = getReportUnifiedFindingForValidationRule(input.linkedValidationFinding.ruleKey);
    if (validationMatch) {
      return inferSpecializedUnifiedFindingId({
        currentSuggestedId: validationMatch.id,
        originType: input.originType,
        rawEvidence: input.rawEvidence,
        signalKey: input.signalKey,
        title: input.title
      });
    }
  }

  const originValidationMatch =
    input.originType === "validation_rule" || input.originType === "policy_review_queue"
      ? getReportUnifiedFindingForValidationRule(input.originKey)
      : null;
  if (originValidationMatch) {
    return inferSpecializedUnifiedFindingId({
      currentSuggestedId: originValidationMatch.id,
      originType: input.originType,
      rawEvidence: input.rawEvidence,
      signalKey: input.signalKey,
      title: input.title
    });
  }

  return inferSpecializedUnifiedFindingId({
    currentSuggestedId: getReportUnifiedFindingByAlias(input.title)?.id,
    originType: input.originType,
    rawEvidence: input.rawEvidence,
    signalKey: input.signalKey,
    title: input.title
  });
}

function deriveCanonicalConcernKey(input: {
  originKey: string;
  originType: NormalizedConcernOriginType;
  suggestedUnifiedFindingId?: string;
  title: string;
}) {
  return (
    input.suggestedUnifiedFindingId ??
    `${input.originType}:${input.originKey || normalizeTitleKey(input.title)}`
  );
}

function deriveEvidenceStrengthFlags(input: {
  bundle: NormalizedConcernEvidenceBundle;
  linkedValidationFinding?: ScanValidationFinding | null;
  originType: NormalizedConcernOriginType;
  rawEvidence?: Record<string, unknown> | null;
}) {
  const flags = new Set<NormalizedConcernEvidenceStrengthFlag>();

  if (input.bundle.runtimeArtifacts.length > 0) {
    flags.add("direct_runtime");
  }
  if (input.bundle.policySnippets.length > 0) {
    flags.add("policy_text");
  }
  if (input.bundle.pageUrls.length > 0 || input.bundle.sourceUrls.length > 0) {
    flags.add("page_attributed");
  }
  if (input.linkedValidationFinding || input.originType === "validation_rule") {
    flags.add("structured_validation");
  }
  if (hasConcretePayloadEvidence(input.rawEvidence)) {
    flags.add("concrete_payload");
  }
  if (
    Array.isArray(input.rawEvidence?.keyPageAttemptedUrls) ||
    typeof input.rawEvidence?.keyPageAttemptCount === "number" ||
    typeof input.rawEvidence?.keyPageDiscoverySource === "string" ||
    typeof input.rawEvidence?.keyPageStopReason === "string"
  ) {
    flags.add("key_page_discovery");
  }
  if (!input.linkedValidationFinding && input.originType !== "validation_rule") {
    flags.add("fallback_only");
  }

  return [...flags];
}


function buildConcernFromSharedInput(input: {
  categoryId?: string;
  description: string;
  evidence?: string[];
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  originKey: string;
  originType: NormalizedConcernOriginType;
  rawEvidence?: Record<string, unknown> | null;
  severity: ReviewFindingSeverity;
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalSource;
  sourceType: "issue" | "signal" | "validation";
  title: string;
}) {
  const normalizedRawEvidence = normalizePolicySemanticEvidence(input.rawEvidence ?? null);
  const fallbackBundle = extractEvidenceFromRaw(normalizedRawEvidence);
  const validationBundle = extractEvidenceFromValidationFinding(input.linkedValidationFinding ?? null);
  const evidenceBundle = {
    ...mergeConcernEvidenceBundles(fallbackBundle, validationBundle, input.evidence),
    rawEvidence: normalizedRawEvidence
  };
  const suggestedUnifiedFindingId = resolveSuggestedUnifiedFindingId({
    linkedValidationFinding: input.linkedValidationFinding,
    originKey: input.originKey,
    originType: input.originType,
    rawEvidence: normalizedRawEvidence,
    signalKey: input.signalKey,
    signalSource: input.signalSource,
    title: input.title
  });
  const canonicalConcernKey = deriveCanonicalConcernKey({
    originKey: input.originKey,
    originType: input.originType,
    suggestedUnifiedFindingId,
    title: input.title
  });
  const evidenceStrengthFlags = deriveEvidenceStrengthFlags({
    bundle: evidenceBundle,
    linkedValidationFinding: input.linkedValidationFinding,
    originType: input.originType,
    rawEvidence: normalizedRawEvidence
  });
  const eligibility = deriveConcernPolicy({
    concern: {
      canonicalConcernKey,
      originKey: input.originKey,
      originType: input.originType,
      policyIsPrimarySource: evidenceBundle.policyIsPrimarySource,
      policyPageType: evidenceBundle.policyPageType,
      suggestedUnifiedFindingId,
      title: input.title
    },
    evidenceStrengthFlags,
    rawEvidence: normalizedRawEvidence
  });

  return {
    allowedNarrativeTier: eligibility.allowedNarrativeTier,
    categoryId: input.categoryId,
    canonicalConcernKey,
    description: input.description,
    evidenceBundle,
    evidenceStrengthFlags,
    externalSurfacingEligibility: eligibility.externalSurfacingEligibility,
    linkedValidationFinding: input.linkedValidationFinding ?? null,
    negativeEvidenceFlags: eligibility.negativeEvidenceFlags,
    observedValue: input.observedValue,
    originKey: input.originKey,
    originType: input.originType,
    pageScope: derivePageScope(evidenceBundle),
    policyIsPrimarySource: evidenceBundle.policyIsPrimarySource,
    policyPageType: evidenceBundle.policyPageType,
    promotionEligibility: eligibility.promotionEligibility,
    severity: input.severity,
    signalKey: input.signalKey,
    signalLabel: input.signalLabel,
    signalSource: input.signalSource,
    sourceType: input.sourceType,
    suggestedUnifiedFindingId,
    title: input.title
  } satisfies NormalizedConcern;
}

export function normalizeConcernFromReviewFindingCandidate(candidate: ReviewFindingCandidateInput): NormalizedConcern {
  const originType = deriveOriginTypeFromCandidate(candidate);
  const originKey =
    candidate.sourceType === "signal" && candidate.signalKey
      ? candidate.signalKey
      : candidate.linkedValidationFinding?.ruleKey ?? normalizeTitleKey(candidate.title);

  return buildConcernFromSharedInput({
    categoryId: candidate.categoryId,
    description: candidate.description,
    evidence: candidate.evidence,
    linkedValidationFinding: candidate.linkedValidationFinding ?? null,
    observedValue: candidate.observedValue,
    originKey,
    originType,
    rawEvidence: candidate.fallbackEvidence ?? null,
    severity: candidate.severity,
    signalKey: candidate.signalKey,
    signalLabel: candidate.signalLabel,
    signalSource: candidate.signalSource,
    sourceType: candidate.sourceType,
    title: candidate.title
  });
}

export function normalizeConcernFromValidationFinding(finding: ScanValidationFinding): NormalizedConcern {
  return buildConcernFromSharedInput({
    description: finding.description ?? finding.title,
    evidence: [],
    linkedValidationFinding: finding,
    observedValue: null,
    originKey: finding.ruleKey,
    originType: "validation_rule",
    rawEvidence: finding.evidence ?? null,
    severity:
      finding.severity === "high" || finding.severity === "medium" || finding.severity === "low"
        ? finding.severity
        : "medium",
    sourceType: "validation",
    title: finding.title
  });
}

export function normalizeConcernFromPolicyReviewQueue(input: PolicyReviewConcernInput): NormalizedConcern {
  const rawEvidence = {
    ...(input.evidence ?? {}),
    pageUrl: input.pageUrl ?? null,
    policy_review_reason: input.reason
  };

  return buildConcernFromSharedInput({
    categoryId: input.categoryId,
    description: input.description,
    evidence: [],
    linkedValidationFinding: null,
    observedValue: input.observedValue ?? null,
    originKey: input.ruleKey,
    originType: "policy_review_queue",
    rawEvidence,
    severity: input.severity,
    sourceType: "issue",
    title: input.title
  });
}

export function buildNormalizedConcerns(input: {
  reviewFindingCandidates: ReviewFindingCandidateInput[];
  validationFindings: ScanValidationFinding[];
}) {
  return [
    ...input.reviewFindingCandidates.map((candidate) => normalizeConcernFromReviewFindingCandidate(candidate)),
    ...input.validationFindings.map((finding) => normalizeConcernFromValidationFinding(finding))
  ];
}

export function buildUnifiedFindingCandidatesFromConcerns(concerns: NormalizedConcern[]): ConcernBackedUnifiedFindingCandidate[] {
  return concerns
    .filter((concern) => {
      if (concern.promotionEligibility === "blocked") {
        return false;
      }

      // Generic policy/behavior conflicts should never assemble into a unified packet
      // unless the contradiction-grade concern gate already marked them promotion-eligible.
      if (
        concern.suggestedUnifiedFindingId === "policy_behavior_conflict" &&
        concern.promotionEligibility !== "eligible"
      ) {
        return false;
      }

      return true;
    })
    .map((concern) => ({
      categoryId: concern.categoryId,
      description: concern.description,
      evidence: [...concern.evidenceBundle.pageUrls, ...concern.evidenceBundle.sourceUrls],
      fallbackEvidence: {
        ...(concern.evidenceBundle.rawEvidence ?? {}),
        normalizedConcernAllowedNarrativeTier: concern.allowedNarrativeTier,
        normalizedConcernCanonicalKey: concern.canonicalConcernKey,
        normalizedConcernOriginType: concern.originType,
        normalizedConcernPageScope: concern.pageScope,
        normalizedConcernPolicyIsPrimarySource: concern.policyIsPrimarySource,
        normalizedConcernPolicyPageType: concern.policyPageType,
        normalizedConcernPromotionEligibility: concern.promotionEligibility,
        normalizedConcernExternalSurfacingEligibility: concern.externalSurfacingEligibility,
        normalizedConcernEvidenceStrengthFlags: concern.evidenceStrengthFlags,
        normalizedConcernFetchQuality: concern.evidenceBundle.fetchQuality,
        normalizedConcernNegativeEvidenceFlags: concern.negativeEvidenceFlags,
        runtimeEvidenceArtifacts: concern.evidenceBundle.runtimeArtifacts,
        policySnippets: concern.evidenceBundle.policySnippets,
        pageUrls: concern.evidenceBundle.pageUrls,
        sourceUrls: concern.evidenceBundle.sourceUrls,
        counts: concern.evidenceBundle.counts,
        entities: concern.evidenceBundle.entities,
        flags: concern.evidenceBundle.flags
      },
      linkedValidationFinding: concern.linkedValidationFinding ?? null,
      normalizedConcern: concern,
      observedValue: concern.observedValue,
      severity: concern.severity,
      signalKey: concern.signalKey,
      signalLabel: concern.signalLabel,
      signalSource: concern.signalSource,
      sourceType: concern.sourceType === "validation" ? "issue" : concern.sourceType,
      title: concern.title
    }));
}
