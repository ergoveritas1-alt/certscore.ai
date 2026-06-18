import {
  getReportUnifiedFinding,
  getReportUnifiedFindingByAlias,
  getReportUnifiedFindingForSignal,
  getReportUnifiedFindingForValidationRule,
  type ReportSignalSource
} from "@website-signal-risk-scanner/shared";
import {
  hasConcreteRtbCookieSyncEvidence,
  hasDirectSensitiveCollectionSurfaceArtifact,
  hasConcreteSensitiveThirdPartyTrackingArtifact,
  hasScanLevelSensitiveSessionReplayCoPresenceArtifact,
  hasSensitiveSessionReplaySurfaceCooccurrenceArtifact
} from "./promotion-evidence-contracts";
import {
  derivePolicyPageTypeFromEvidence,
  derivePolicyPrimarySourceFromEvidence
} from "./policy-evidence-metadata";
import {
  getContradictionEvidenceBundle,
  isSpecificPolicyBehaviorPolicySnippet
} from "./contradiction-evidence-contract";
import {
  hasBehaviorReproducedFocusManagementEvidence,
  hasDocumentMetadataAccessibilityExamples,
  inferSplitAccessibilityFindingIdFromEvidence
} from "./accessibility-evidence";
import {
  evaluateCookieRetentionReview,
  getCookieRetentionEvidence
} from "./cookie-retention-review";
import {
  getRuntimeVendorDisclosureEvidence,
  RUNTIME_VENDOR_DISCLOSURE_SUBTYPE
} from "./runtime-vendor-disclosure";
import {
  CONSENT_CONTROL_LIFECYCLE_SUBTYPE,
  evaluateConsentControlLifecycleEvidence,
  getConsentControlLifecycleEvidence
} from "./consent-control-lifecycle";
import {
  CONSENT_GOVERNANCE_DISCLOSURE_CONCERN_ID,
  getConsentGovernanceDisclosureEvidence
} from "./consent-governance-disclosure";
import {
  isRuntimeRequestEvidenceUrl,
  stripReportUrlAnnotation
} from "./report-facing-page-url";
import {
  evaluateChatVendorRequestUrlCoherence,
  evaluateControlPathVerificationCoherence,
  evaluatePolicySnippetContextCoherence,
  evaluateSessionReplayVendorRequestUrlCoherence
} from "./evidence-coherence";

import type { ReviewFindingSeverity } from "./canonical-review-finding";
import { deriveConcernPolicy } from "./concern-policy";
import type { FetchQuality } from "./signal-fallback-evidence";
import { normalizeScanValidationFinding, type ScanValidationFinding } from "./validation-review-linking";
const MAX_POLICY_SNIPPET_LENGTH = 600;

function truncatePolicySnippet(value: string): string {
  if (value.length <= MAX_POLICY_SNIPPET_LENGTH) {
    return value;
  }
  const slicePoint = value.lastIndexOf(" ", MAX_POLICY_SNIPPET_LENGTH);
  const endIndex = slicePoint > 0 ? slicePoint : MAX_POLICY_SNIPPET_LENGTH;
  return `${value.slice(0, endIndex).trimEnd()}...`;
}

function isBlockedOrInterstitialCaliforniaChoiceText(value: string | null | undefined) {
  if (!value) {
    return false;
  }
  return /\b(?:blocked|access denied|security solution|confirm you are human|verify you are human|challenge page|captcha|email the site owner|waf|bot detection)\b/i.test(value) ||
    /(?:^|[/?&#_-])(?:blocked|captcha|challenge|interstitial|access-denied|access_denied|verify-human|confirm-human)(?:$|[/?&#=_-])/i.test(value);
}

function isCpraSaleShareChoiceCandidate(input: {
  label: string | null;
  url: string | null;
  selectionBasis: string | null;
  contextualText?: string[];
}) {
  const haystack = `${input.label ?? ""} ${input.url ?? ""} ${input.selectionBasis ?? ""} ${(input.contextualText ?? []).join(" ")}`;
  if (isBlockedOrInterstitialCaliforniaChoiceText(haystack)) {
    return false;
  }
  if (/\bdo not sell(?: or share)?|do not share|sell or share|sale\/share|ccpa|cpra|california privacy|limit the use of my sensitive/i.test(haystack)) {
    return true;
  }
  if (/\b(?:ad choices|privacy choices|your privacy choices|opt[- ]?out|targeted advertising|interest[- ]based ads?|cross[- ]context behavioral)\b/i.test(haystack)) {
    return /\b(?:ad choices|targeted advertising|interest[- ]based ads?|cross[- ]context behavioral|sale|share|sell|ccpa|cpra|california)\b/i.test(haystack);
  }
  return false;
}

export type NormalizedConcernOriginType =
  | "snapshot_signal"
  | "compatibility_signal"
  | "runtime_artifact"
  | "policy_enrichment"
  | "document_semantic"
  | "section_review"
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
  | "missing_policy_runtime_alignment_bridge"
  | "missing_explicit_contradiction_basis"
  | "missing_contradiction_bridge"
  | "missing_bridge_provenance"
  | "missing_specific_policy_anchor"
  | "missing_specific_runtime_anchor"
  | "missing_runtime_anchor"
  | "missing_runtime_request_url_evidence"
  | "missing_privacy_specific_contact_channel"
  | "unsupported_contradiction_mapping"
  | "unsupported_policy_runtime_mapping"
  | "weak_policy_anchor"
  | "boilerplate_policy_anchor"
  | "policy_semantic_review_incomplete"
  | "runtime_tracking_review_incomplete"
  | "possible_policy_runtime_mismatch"
  | "policy_runtime_alignment_review_signal"
  | "insufficient_evidence_for_policy_behavior_conflict"
  | "model_suspicion_without_structured_support"
  | "producer_claim_failed_revalidation"
  | "missing_specific_runtime_artifact"
  | "missing_concrete_preconsent_artifact"
  | "missing_preconsent_sequence_evidence"
  | "missing_cookie_duration"
  | "missing_runtime_vendor_disclosure_evidence"
  | "missing_unmatched_runtime_vendor"
  | "missing_consent_control_lifecycle_evidence"
  | "missing_consent_governance_disclosure_evidence"
  | "missing_consent_governance_relevance_trigger"
  | "missing_consent_governance_gap_signal"
  | "missing_consent_governance_coverage_anchor"
  | "consent_governance_absence_only"
  | "strictly_necessary_storage_only"
  | "tag_manager_only_without_consent_context"
  | "consent_revisit_control_observed"
  | "incomplete_consent_control_lifecycle_coverage"
  | "missing_consent_tracking_context"
  | "prior_consent_state_may_hide_control"
  | "shallow_consent_control_search_scope"
  | "missing_post_reject_timing_evidence"
  | "post_choice_flow_deferred_from_core"
  | "ccpa_cpra_deferred_from_core"
  | "missing_concrete_sensitive_payload"
  | "missing_third_party_tracking_artifact"
  | "runtime_cookie_inventory_ignored_only"
  | "ordinary_cookie_banner_only"
  | "missing_material_scan_blocking_overlay"
  | "missing_consent_specific_blocking_evidence"
  | "missing_concrete_dark_pattern_child_finding"
  | "consent_surface_not_present"
  | "privacy_choice_surface_only"
  | "prior_consent_or_suppressed_banner_suspected"
  | "consent_surface_unstable_or_not_evaluable"
  | "reject_present_first_layer"
  | "reject_absent_first_layer"
  | "missing_privacy_choice_control_search_scope"
  | "clear_pricing_terms_context_observed"
  | "missing_representative_accessibility_examples"
  | "document_metadata_rule_not_top_finding_eligible"
  | "accessibility_examples_below_promotion_threshold";

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

function getNestedStringEvidence(value: unknown): string[] {
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap(getNestedStringEvidence);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(getNestedStringEvidence);
  }
  return [];
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getPlainRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function compactJsonRows(rows: Array<Record<string, unknown>>, limit = 12) {
  return rows.flatMap((entry) => {
    try {
      return [JSON.stringify(entry)];
    } catch {
      return [];
    }
  }).slice(0, limit);
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

  if (hasConcreteSensitiveThirdPartyTrackingArtifact(rawEvidence)) {
    return true;
  }

  return false;
}

function hasRetainedSessionReplayRuntimeArtifactForSpecialization(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }
  if (rawEvidence.session_replay_runtime_detected === true || rawEvidence.sessionReplayRuntimeDetected === true) {
    return true;
  }
  if (rawEvidence.session_replay_vendor_artifact_present === true || rawEvidence.sessionReplayVendorArtifactPresent === true) {
    return true;
  }
  const runtimeValues = [
    ...getStringArrayEvidence(rawEvidence.session_replay_runtime_artifacts),
    ...getStringArrayEvidence(rawEvidence.sessionReplayRuntimeArtifacts),
    ...getStringArrayEvidence(rawEvidence.session_replay_runtime_vendors),
    ...getStringArrayEvidence(rawEvidence.sessionReplayRuntimeVendors),
    ...getStringArrayEvidence(rawEvidence.runtimeVendors)
  ].join(" ");
  return /fullstory|hotjar|clarity|contentsquare|mouseflow|smartlook|logrocket|sessioncam|quantummetric|glassbox|session[_ -]?replay/i.test(runtimeValues);
}

function hasSensitiveSessionReplayCorrelationLabel(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPlainRecordArray(rawEvidence?.sensitivePayloadViolations)
    .some((row) => getStringValue(row.evidenceSource ?? row.evidence_source) === "sensitive_field_session_replay_correlation");
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
  assignString("policyDsarMechanism", ["policyDsarMechanism", "policy_dsar_mechanism"]);
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

  const keyboardIssueCount =
    getNumberValue(rawEvidence?.wcagKeyboardNavigationIssueCount) ??
    getNumberValue(rawEvidence?.wcag_keyboard_navigation_issue_count);
  if (
    typeof keyboardIssueCount === "number" &&
    keyboardIssueCount >= 3 &&
    (input.signalKey?.startsWith("accessibility.") || /keyboard|accessibility|wcag/i.test(title))
  ) {
    return "keyboard_only_task_completion_blocked";
  }

  const formLabelIssueCount =
    getNumberValue(rawEvidence?.wcagFormLabelErrorCount) ??
    getNumberValue(rawEvidence?.wcag_form_label_error_count);
  if (
    typeof formLabelIssueCount === "number" &&
    formLabelIssueCount >= 3 &&
    (input.signalKey?.startsWith("accessibility.") || /form|label|accessibility|wcag/i.test(title))
  ) {
    return "critical_form_completion_barrier";
  }

  if (hasBehaviorReproducedFocusManagementEvidence(rawEvidence)) {
    return "focus_management_issue";
  }

  if (
    hasDocumentMetadataAccessibilityExamples(rawEvidence) &&
    (currentId === "accessibility_risk_score" ||
      currentId === "wcag_issue_summary" ||
      currentId === "form_label_issues" ||
      currentId === "link_name_issues" ||
      currentId === "aria_issues" ||
      input.signalKey?.startsWith("accessibility.") ||
      /accessibility|axe|wcag|semantic|label|language|document title|document-title|html-has-lang/i.test(title))
  ) {
    return "semantic_labeling_accessibility_issue";
  }

  const splitAccessibilityFindingId = inferSplitAccessibilityFindingIdFromEvidence(rawEvidence);
  if (
    splitAccessibilityFindingId &&
    (currentId === "accessibility_risk_score" ||
      currentId === "form_label_issues" ||
      currentId === "link_name_issues" ||
      currentId === "keyboard_navigation_issues" ||
      currentId === "focus_indicator_issues" ||
      currentId === "aria_issues" ||
      input.signalKey?.startsWith("accessibility.") ||
      /accessibility|axe|wcag|contrast|keyboard|label|aria|alt text|alternative text/.test(title))
  ) {
    return splitAccessibilityFindingId;
  }

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

  const runtimeRequestUrlsForSpecialization = uniqueStrings([
    ...getStringArrayEvidence(rawEvidence?.runtimeRequestUrls),
    ...getStringArrayEvidence(rawEvidence?.runtime_request_urls),
    ...getStringArrayEvidence(rawEvidence?.sourceUrls).filter(isRuntimeRequestEvidenceUrl),
    ...getStringArrayEvidence(rawEvidence?.source_urls).filter(isRuntimeRequestEvidenceUrl),
    ...getStringArrayEvidence(rawEvidence?.requestUrls),
    ...getStringArrayEvidence(rawEvidence?.request_urls),
    ...getPlainRecordArray(rawEvidence?.sensitivePayloadViolations)
      .flatMap((row) => getStringValue(row.requestUrl ?? row.request_url) ?? [])
  ]).map(stripReportUrlAnnotation);
  const specializationEvidence =
    runtimeRequestUrlsForSpecialization.length > 0
      ? {
          ...(rawEvidence ?? {}),
          runtimeRequestUrls: runtimeRequestUrlsForSpecialization
        }
      : rawEvidence;
  const hasSensitiveSurface = hasDirectSensitiveCollectionSurfaceArtifact(specializationEvidence);
  if (
    hasSensitiveSurface &&
    (input.signalKey === "commerce.high_sensitivity_data_collection_detected" ||
      input.signalKey === "commerce.form_collects_health_information" ||
      input.signalKey === "commerce.form_collects_financial_information" ||
      input.signalKey === "commerce.form_collects_government_id" ||
      input.signalKey === "commerce.form_collects_geolocation" ||
      input.signalKey === "commerce.form_collects_ssn")
  ) {
    if (
      hasSensitiveSessionReplaySurfaceCooccurrenceArtifact(specializationEvidence) ||
      hasSensitiveSessionReplayCorrelationLabel(specializationEvidence)
    ) {
      return "possible_session_replay_on_sensitive_input_surface";
    }

    if (
      hasScanLevelSensitiveSessionReplayCoPresenceArtifact(specializationEvidence) ||
      (
        rawEvidence?.signalKey === undefined &&
        hasRetainedSessionReplayRuntimeArtifactForSpecialization(specializationEvidence)
      )
    ) {
      return "session_replay_present_with_sensitive_surfaces_observed";
    }

    if (hasThirdPartyTrackingEvidence(specializationEvidence)) {
      return "sensitive_data_collection_with_third_party_tracking_present";
    }

    return "sensitive_collection_surface_observed";
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

  if ((!currentId || currentId === "low_confidence_policy_extraction") && hasStructuredPolicySupport(rawEvidence)) {
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
      rawEvidence: null as Record<string, unknown> | null,
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
  const cookieRetentionEvidence = getCookieRetentionEvidence(rawEvidence);
  const runtimeVendorDisclosureEvidence = getRuntimeVendorDisclosureEvidence(rawEvidence);
  const consentControlLifecycleEvidence = getConsentControlLifecycleEvidence(rawEvidence);
  const consentControlLifecycleReview = evaluateConsentControlLifecycleEvidence(rawEvidence);
  const consentGovernanceDisclosureEvidence = getConsentGovernanceDisclosureEvidence(rawEvidence);
  const addPageUrl = (value: string | null | undefined) => {
    if (!value) {
      return;
    }
    const normalizedValue = stripReportUrlAnnotation(value);
    if (/^https?:\/\//i.test(normalizedValue) && !isRuntimeRequestEvidenceUrl(normalizedValue)) {
      pageUrls.add(normalizedValue);
    }
  };
  const addSourceUrl = (value: string | null | undefined) => {
    if (!value) {
      return;
    }
    const normalizedValue = stripReportUrlAnnotation(value);
    if (!/^https?:\/\//i.test(normalizedValue)) {
      return;
    }
    if (isRuntimeRequestEvidenceUrl(normalizedValue)) {
      addEntity(entities, "runtimeRequestUrls", [normalizedValue]);
      return;
    }
    sourceUrls.add(normalizedValue);
  };
  for (const artifact of getStringArrayEvidence(rawEvidence.runtimeEvidenceArtifacts ?? rawEvidence.runtime_evidence_artifacts)) {
    runtimeArtifacts.add(artifact);
  }

  for (const cookie of cookieRetentionEvidence) {
    addPageUrl(cookie.pageUrl);
    addEntity(entities, "cookieRetentionEvidence", [JSON.stringify(cookie)]);
    addEntity(entities, "runtime_cookie_names", [cookie.name]);
    addEntity(entities, "runtime_cookie_categories", [cookie.classification ?? cookie.category]);
    addEntity(entities, "runtimeCookieDomains", [cookie.domain]);
    if (cookie.vendor) {
      addEntity(entities, "runtimeVendors", [cookie.vendor]);
    }
    if (cookie.sourceRequestUrl) {
      addSourceUrl(cookie.sourceRequestUrl);
      addEntity(entities, "runtimeRequestUrls", [cookie.sourceRequestUrl]);
    }
    runtimeArtifacts.add(
      `${cookie.name} on ${cookie.domain} was observed on ${cookie.pageUrl} with an expiry around ${Math.round(cookie.durationDays ?? 0)} days (${cookie.classification ?? cookie.category}).`
    );
  }
  if (cookieRetentionEvidence.length > 0) {
    counts.cookieRetentionEvidenceCount = cookieRetentionEvidence.length;
  }
  for (const evidence of runtimeVendorDisclosureEvidence) {
    addEntity(entities, "findingSubtype", [RUNTIME_VENDOR_DISCLOSURE_SUBTYPE]);
    addEntity(entities, "runtimeVendorDisclosureEvidence", [JSON.stringify(evidence)]);
    addEntity(entities, "observedRuntimeVendors", evidence.observedRuntimeVendors);
    addEntity(entities, "observedRuntimeDomains", evidence.observedRuntimeDomains);
    addEntity(entities, "runtimeVendors", evidence.observedRuntimeVendors);
    addEntity(entities, "runtimeDomains", evidence.observedRuntimeDomains);
    addEntity(entities, "unmatchedRuntimeVendors", evidence.unmatchedRuntimeVendors);
    addEntity(entities, "unmatchedRuntimeDomains", evidence.unmatchedRuntimeDomains);
    addEntity(entities, "policySurfacesSearched", evidence.policySurfacesSearched.map((surface) => JSON.stringify(surface)));
    addEntity(entities, "mismatchRationale", [evidence.mismatchRationale]);
    addEntity(entities, "runtimeVendorCategories", evidence.categories ?? []);
    if (evidence.cookiePolicyUrl) {
      addSourceUrl(evidence.cookiePolicyUrl);
      addEntity(entities, "policySourceUrl", [evidence.cookiePolicyUrl]);
    }
    if (evidence.privacyPolicyUrl) {
      addSourceUrl(evidence.privacyPolicyUrl);
      addEntity(entities, "policySourceUrl", [evidence.privacyPolicyUrl]);
    }
    for (const surface of evidence.policySurfacesSearched) {
      if (surface.url) {
        addSourceUrl(surface.url);
      }
    }
    if (evidence.mismatchRationale) {
      policySnippets.add(truncatePolicySnippet(evidence.mismatchRationale));
    }
    const unmatchedEntryCount = Math.max(evidence.unmatchedRuntimeVendors.length, evidence.unmatchedRuntimeDomains.length);
    if (unmatchedEntryCount > 0 && evidence.mismatchRationale.trim().length > 0) {
      runtimeArtifacts.add(
        `Disclosure alignment note: ${unmatchedEntryCount} observed runtime vendor/domain entr${unmatchedEntryCount === 1 ? "y was" : "ies were"} not clearly reflected in retained disclosure evidence.`
      );
    }
    counts.matchedVendorDisclosureCount = (counts.matchedVendorDisclosureCount ?? 0) + evidence.matchedVendorDisclosureCount;
    counts.unmatchedVendorDisclosureCount = (counts.unmatchedVendorDisclosureCount ?? 0) + evidence.unmatchedVendorDisclosureCount;
  }
  if (runtimeVendorDisclosureEvidence.length > 0) {
    counts.runtimeVendorDisclosureEvidenceCount = runtimeVendorDisclosureEvidence.length;
    flags.add(RUNTIME_VENDOR_DISCLOSURE_SUBTYPE);
  }

  if (consentControlLifecycleEvidence) {
    addEntity(entities, "consentControlLifecycleEvidence", [JSON.stringify(consentControlLifecycleEvidence)]);
    addEntity(entities, "consentControlPagesChecked", consentControlLifecycleEvidence.pagesChecked);
    addEntity(entities, "consentControlsSearched", consentControlLifecycleEvidence.controlsSearched);
    addEntity(entities, "consentFooterLinksInspected", consentControlLifecycleEvidence.footerLinksInspected);
    for (const pageUrl of consentControlLifecycleEvidence.pagesChecked) {
      addPageUrl(pageUrl);
    }
    addEntity(
      entities,
      "consentObservedReopenControls",
      (consentControlLifecycleEvidence.observedControls ?? [])
        .map((control) => typeof control.text === "string" ? control.text : null)
        .filter((value): value is string => Boolean(value))
    );
    addEntity(entities, "consentControlCoverageStatus", [consentControlLifecycleEvidence.coverageStatus]);
  }

  if (consentControlLifecycleEvidence && consentControlLifecycleReview.disposition === "eligible") {
    addEntity(entities, "findingSubtype", [CONSENT_CONTROL_LIFECYCLE_SUBTYPE, "consent_control_not_reopenable"]);
    counts.consentControlPagesChecked = consentControlLifecycleEvidence.pagesChecked.length;
    counts.consentControlsSearched = consentControlLifecycleEvidence.controlsSearched.length;
    counts.consentFooterLinksInspected = consentControlLifecycleEvidence.footerLinksInspected.length;
    flags.add(CONSENT_CONTROL_LIFECYCLE_SUBTYPE);
    runtimeArtifacts.add(
      "No obvious cookie preferences, privacy settings, or consent-preference reopen control was observed on the scanned public pages."
    );
  }

  if (consentGovernanceDisclosureEvidence) {
    addEntity(entities, "findingSubtype", [CONSENT_GOVERNANCE_DISCLOSURE_CONCERN_ID]);
    addEntity(entities, "consentGovernanceDisclosureEvidence", [JSON.stringify(consentGovernanceDisclosureEvidence)]);
    addEntity(entities, "observedConsentVendors", consentGovernanceDisclosureEvidence.supportingAnchors.observedConsentVendors ?? []);
    addEntity(entities, "observedTrackingVendors", consentGovernanceDisclosureEvidence.supportingAnchors.observedTrackingVendors ?? []);
    addEntity(entities, "consentGovernancePolicyUrls", consentGovernanceDisclosureEvidence.supportingAnchors.policyUrls ?? []);
    addEntity(entities, "consentGovernanceCookiePolicyUrls", consentGovernanceDisclosureEvidence.supportingAnchors.cookiePolicyUrls ?? []);
    addEntity(entities, "consentGovernancePreferenceCenterUrls", consentGovernanceDisclosureEvidence.supportingAnchors.preferenceCenterUrls ?? []);
    for (const url of [
      ...(consentGovernanceDisclosureEvidence.supportingAnchors.policyUrls ?? []),
      ...(consentGovernanceDisclosureEvidence.supportingAnchors.cookiePolicyUrls ?? []),
      ...(consentGovernanceDisclosureEvidence.supportingAnchors.preferenceCenterUrls ?? [])
    ]) {
      addSourceUrl(url);
    }
    for (const anchor of consentGovernanceDisclosureEvidence.supportingAnchors.textAnchors ?? []) {
      addSourceUrl(anchor.url);
      if (anchor.snippet) {
        policySnippets.add(truncatePolicySnippet(anchor.snippet));
      }
    }
    counts.consentGovernancePolicySurfaceCount = [
      ...(consentGovernanceDisclosureEvidence.supportingAnchors.policyUrls ?? []),
      ...(consentGovernanceDisclosureEvidence.supportingAnchors.cookiePolicyUrls ?? []),
      ...(consentGovernanceDisclosureEvidence.supportingAnchors.preferenceCenterUrls ?? [])
    ].length;
    flags.add(CONSENT_GOVERNANCE_DISCLOSURE_CONCERN_ID);
    runtimeArtifacts.add(
      "Consent governance disclosure note: retained public materials did not clearly explain how users can revisit, change, withdraw, retain, renew, expire, or understand consent choices."
    );
  }

  const policyClaimCandidates = getPlainRecordArray(rawEvidence.policyClaimCandidates ?? rawEvidence.policy_claim_candidates);
  const runtimeBehaviorArtifacts = getPlainRecordArray(rawEvidence.runtimeBehaviorArtifacts ?? rawEvidence.runtime_behavior_artifacts);
  const policyRuntimeBridgeCandidates = getPlainRecordArray(
    rawEvidence.policyRuntimeBridgeCandidates ?? rawEvidence.policy_runtime_bridge_candidates
  );

  if (policyClaimCandidates.length > 0) {
    addEntity(entities, "policyClaimCandidates", compactJsonRows(policyClaimCandidates, 12));
    addEntity(
      entities,
      "policyClaimTypes",
      policyClaimCandidates.flatMap((claim) => getStringValue(claim.claimType ?? claim.claim_type) ?? [])
    );
    for (const claim of policyClaimCandidates) {
      const sourceUrl = getStringValue(claim.sourceUrl ?? claim.source_url);
      const snippet = getStringValue(claim.snippet);
      if (sourceUrl) {
        addSourceUrl(sourceUrl);
        addEntity(entities, "policySourceUrl", [sourceUrl]);
      }
      if (snippet) {
        policySnippets.add(truncatePolicySnippet(snippet));
      }
    }
    counts.policyClaimCandidateCount = policyClaimCandidates.length;
  }

  if (runtimeBehaviorArtifacts.length > 0) {
    addEntity(entities, "runtimeBehaviorArtifacts", compactJsonRows(runtimeBehaviorArtifacts, 12));
    addEntity(
      entities,
      "runtimeVendors",
      runtimeBehaviorArtifacts.flatMap((artifact) => getStringValue(artifact.vendor) ?? [])
    );
    addEntity(
      entities,
      "runtimeDomains",
      runtimeBehaviorArtifacts.flatMap((artifact) => getStringValue(artifact.host ?? artifact.hostname ?? artifact.domain) ?? [])
    );
    for (const artifact of runtimeBehaviorArtifacts) {
      const url = getStringValue(artifact.url ?? artifact.requestUrl ?? artifact.request_url);
      const host = getStringValue(artifact.host ?? artifact.hostname ?? artifact.domain);
      const vendor = getStringValue(artifact.vendor);
      const artifactType = getStringValue(artifact.artifactType ?? artifact.artifact_type);
      const cookieName = getStringValue(artifact.cookieName ?? artifact.cookie_name);
      const storageKey = getStringValue(artifact.storageKey ?? artifact.storage_key);
      if (url) {
        addSourceUrl(url);
        addEntity(entities, "runtimeRequestUrls", [url]);
      }
      if (host || vendor || url || cookieName || storageKey) {
        runtimeArtifacts.add(
          [
            artifactType ? `Runtime ${artifactType}` : "Runtime artifact",
            vendor ? `for ${vendor}` : null,
            host ? `on ${host}` : null,
            cookieName ? `cookie ${cookieName}` : null,
            storageKey ? `storage ${storageKey}` : null,
            url ? `(${stripReportUrlAnnotation(url)})` : null
          ].filter(Boolean).join(" ")
        );
      }
    }
    counts.runtimeBehaviorArtifactCount = runtimeBehaviorArtifacts.length;
  }

  if (policyRuntimeBridgeCandidates.length > 0) {
    addEntity(entities, "policyRuntimeBridgeCandidates", compactJsonRows(policyRuntimeBridgeCandidates, 12));
    addEntity(
      entities,
      "policyRuntimeBridgeRuleIds",
      policyRuntimeBridgeCandidates.flatMap((bridge) => getStringValue(bridge.bridgeRuleId ?? bridge.bridge_rule_id) ?? [])
    );
    const hasAlignmentReviewBridge = policyRuntimeBridgeCandidates.some((bridge) => {
      const mappingType = getStringValue(bridge.mappingType ?? bridge.mapping_type);
      const supportsPromotionCandidate = getBooleanValue(bridge.supportsPromotionCandidate ?? bridge.supports_promotion_candidate);
      return mappingType === "deterministic_policy_runtime_review_mapping" && supportsPromotionCandidate === true;
    });
    if (hasAlignmentReviewBridge) {
      flags.add("policy_runtime_alignment_review_signal");
      runtimeArtifacts.add("Policy/runtime alignment review bridge retained between policy disclosure text and concrete runtime behavior.");
    }
    counts.policyRuntimeBridgeCandidateCount = policyRuntimeBridgeCandidates.length;
  }

  const preSubmitTextCaptureRows = [
    ...(
      Array.isArray(rawEvidence.preSubmitTextCaptureEvidence)
        ? rawEvidence.preSubmitTextCaptureEvidence
        : Array.isArray(rawEvidence.pre_submit_text_capture_evidence)
          ? rawEvidence.pre_submit_text_capture_evidence
          : []
    ),
    ...(
      Array.isArray(rawEvidence.signalValue) &&
      rawEvidence.signalKey === "privacy.pre_submit_text_capture_detected"
        ? rawEvidence.signalValue
        : []
    )
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
  for (const row of preSubmitTextCaptureRows) {
    const pageUrl = getStringValue(row.pageUrl ?? row.page_url);
    const requestDomain = getStringValue(row.requestDomain ?? row.request_domain);
    const requestUrl = getStringValue(row.requestUrl ?? row.request_url);
    const destinationClassification = getStringValue(row.destinationClassification ?? row.destination_classification);
    const matchType = getStringValue(row.matchType ?? row.match_type);
    if (pageUrl) {
      addPageUrl(pageUrl);
    }
    addEntity(entities, "preSubmitTextCaptureRequestDomains", requestDomain ? [requestDomain] : []);
    addEntity(entities, "preSubmitTextCaptureClassifications", destinationClassification ? [destinationClassification] : []);
    if (requestDomain && destinationClassification && matchType) {
      runtimeArtifacts.add(
        `Pre-submit probe observed ${matchType} sentinel in ${destinationClassification} request to ${requestDomain}${requestUrl ? ` (${requestUrl})` : ""}.`
      );
    }
  }
  if (preSubmitTextCaptureRows.length > 0) {
    counts.preSubmitTextCaptureEvidenceCount = preSubmitTextCaptureRows.length;
  }

  if (Array.isArray(rawEvidence.accessibilityRuleExamples)) {
    for (const entry of rawEvidence.accessibilityRuleExamples) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const example = entry as Record<string, unknown>;
      const pageUrl = getStringValue(example.pageUrl ?? example.page_url);
      const ruleCode = getStringValue(example.ruleCode ?? example.rule_code);
      const ruleGroup = getStringValue(example.ruleGroup ?? example.rule_group);
      const help = getStringValue(example.help ?? example.label);
      const impact = getStringValue(example.impact ?? example.axeImpact ?? example.axe_impact);
      const severity = getStringValue(example.severity);
      const nodeCount = getNumberValue(example.nodeCount ?? example.node_count ?? example.affectedNodeCount ?? example.affected_node_count);
      const selectors = [
        ...getStringArrayEvidence(example.representativeSelectors),
        ...getStringArrayEvidence(example.representative_selectors)
      ];
      const representativeNodes = [
        ...getPlainRecordArray(example.representativeNodes),
        ...getPlainRecordArray(example.representative_nodes)
      ];

      if (pageUrl) {
        addPageUrl(pageUrl);
      }
      addEntity(entities, "accessibilityRuleCodes", ruleCode ? [ruleCode] : []);
      addEntity(entities, "accessibilityRuleGroups", ruleGroup ? [ruleGroup] : []);
      addEntity(entities, "accessibilitySelectors", selectors.slice(0, 3));
      addEntity(entities, "accessibilityImpacts", impact ? [impact] : []);
      addEntity(entities, "accessibilitySeverities", severity ? [severity] : []);
      if (typeof nodeCount === "number") {
        counts.accessibilityExampleNodeCount = (counts.accessibilityExampleNodeCount ?? 0) + nodeCount;
      }
      if (pageUrl && ruleCode) {
        addEntity(entities, "accessibilityAxeEvidence", [
          JSON.stringify({
            description: getStringValue(example.description),
            failureSummaries: representativeNodes
              .flatMap((node) => getStringValue(node.failureSummary ?? node.failure_summary) ?? [])
              .slice(0, 3),
            help,
            helpUrl: getStringValue(example.helpUrl ?? example.help_url),
            impact,
            nodeCount,
            pageUrl,
            representativeNodes: representativeNodes.slice(0, 3),
            representativeSelectors: selectors.slice(0, 3),
            ruleId: ruleCode,
            severity
          })
        ]);
      }
      if (pageUrl && ruleCode && ruleGroup && selectors[0] && typeof nodeCount === "number" && impact && severity && help) {
        runtimeArtifacts.add(
          `Axe example: ${ruleCode}/${ruleGroup} on ${pageUrl}; selector ${selectors[0]}; nodes ${nodeCount}; impact ${impact}; severity ${severity}; help: ${help}.`
        );
      }
    }
  }

  for (const [key, value] of Object.entries(rawEvidence)) {
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value.trim())) {
        if (/pageurl|page_url/i.test(key)) {
          addPageUrl(value);
        } else {
          addSourceUrl(value);
        }
      } else if (/crossBorderDisclosureGapBasis|cross_border_disclosure_gap_basis/i.test(key)) {
        addEntity(entities, "crossBorderDisclosureGapBasis", [value]);
      } else if (/policyDsarMechanism|policy_dsar_mechanism/i.test(key)) {
        addEntity(entities, "policyDsarMechanism", [value]);
      } else if (/claim|policy|disclosure|summary|snippet|description|rationale/i.test(key)) {
        policySnippets.add(truncatePolicySnippet(value));
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

    if (/policy.*snippets?|evidence_snippets/i.test(key)) {
      for (const entry of getNestedStringEvidence(value).slice(0, 12)) {
        policySnippets.add(truncatePolicySnippet(entry));
      }
      continue;
    }

    if (/crossBorderDisclosureGapBasis|cross_border_disclosure_gap_basis/i.test(key) && Array.isArray(value)) {
      addEntity(entities, "crossBorderDisclosureGapBasis", getStringArrayEvidence(value));
      continue;
    }

    if (/rtbCookieSyncObservations|rtb_cookie_sync_observations|rtb_cookie_sync_evidence/i.test(key) && Array.isArray(value)) {
      const compactRows = compactJsonRows(getPlainRecordArray(value));
      addEntity(entities, "rtbCookieSyncEvidence", compactRows.slice(0, 12));
      runtimeArtifacts.add(`${compactRows.length} compact RTB cookie-sync request observation${compactRows.length === 1 ? "" : "s"} retained.`);
      continue;
    }

    if (/endpointJurisdictionEvidence|endpoint_jurisdiction_evidence|crossBorderEndpointEvidence|cross_border_endpoint_evidence/i.test(key) && Array.isArray(value)) {
      const rows = getPlainRecordArray(value);
      const compactRows = compactJsonRows(rows, 20);
      addEntity(entities, "endpointJurisdictionEvidence", compactRows);
      addEntity(
        entities,
        "endpointTransferReviewHosts",
        rows.flatMap((row) => getStringValue(row.host) ?? [])
      );
      addEntity(
        entities,
        "endpointTransferReviewCountries",
        rows.flatMap((row) => getStringValue(row.inferredCountryCode ?? row.inferred_country_code) ?? [])
      );
      addEntity(
        entities,
        "endpointTransferReviewRegions",
        rows.flatMap((row) => getStringValue(row.inferredRegion ?? row.inferred_region) ?? [])
      );
      addEntity(
        entities,
        "endpointTransferReviewVendors",
        rows.flatMap((row) => getStringValue(row.matchedVendorName ?? row.matched_vendor_name) ?? [])
      );
      if (compactRows.length > 0) {
        runtimeArtifacts.add(`${compactRows.length} endpoint jurisdiction evidence row${compactRows.length === 1 ? "" : "s"} retained for transfer review.`);
      }
      continue;
    }

    if (/runtimeHostInventory|runtime_host_inventory|runtimeHostInventoryContext/i.test(key) && Array.isArray(value)) {
      const rows = getPlainRecordArray(value).slice(0, 20);
      const compactRows = compactJsonRows(rows, 20);
      addEntity(entities, "runtimeHostInventory", compactRows);
      addEntity(
        entities,
        "runtimeHostInventoryHosts",
        rows.flatMap((row) => getStringValue(row.host) ?? [])
      );
      addEntity(
        entities,
        "runtimeHostInventoryVendors",
        rows.flatMap((row) => getStringValue(row.matchedVendorName ?? row.matched_vendor_name) ?? [])
      );
      if (compactRows.length > 0) {
        runtimeArtifacts.add(`${compactRows.length} compact runtime host inventor${compactRows.length === 1 ? "y row" : "y rows"} retained as context.`);
      }
      continue;
    }

    if (/fingerprint(?:ing)?RuntimeEvidence|fingerprint(?:ing)?_runtime_evidence/i.test(key) && Array.isArray(value)) {
      const rows = getPlainRecordArray(value);
      const compactRows = compactJsonRows(rows);
      addEntity(entities, "fingerprintingRuntimeEvidence", compactRows);
      addEntity(
        entities,
        "fingerprintingCallSites",
        rows.flatMap((row) => getStringArrayEvidence(row.callSites ?? row.call_sites))
      );
      addEntity(
        entities,
        "fingerprintingRequestHosts",
        rows.flatMap((row) => getStringValue(row.host) ?? [])
      );
      addEntity(
        entities,
        "fingerprintingScriptUrls",
        rows.flatMap((row) => getStringValue(row.initiatorUrl ?? row.initiator_url ?? row.scriptUrl ?? row.script_url) ?? [])
      );
      if (compactRows.length > 0) {
        runtimeArtifacts.add(`${compactRows.length} fingerprinting runtime evidence artifact${compactRows.length === 1 ? "" : "s"} retained.`);
      }
      continue;
    }

    if (/fingerprintSummary|fingerprint_summary/i.test(key) && value && typeof value === "object" && !Array.isArray(value)) {
      const summary = value as Record<string, unknown>;
      const tier = getNumberValue(summary.tier);
      const confidence = getStringValue(summary.confidence);
      const summaryText = getStringValue(summary.summary);
      const reasons = getStringArrayEvidence(summary.reasons);
      const categoryNames = uniqueStrings([
        ...getPlainRecordArray(summary.attributeCategories ?? summary.attribute_categories)
        .map((entry) => getStringValue(entry.name))
          .filter((entry): entry is string => Boolean(entry)),
        ...getStringArrayEvidence(summary.attributeCategories),
        ...getStringArrayEvidence(summary.attribute_categories),
        ...getStringArrayEvidence(summary.fingerprintingSignals),
        ...getStringArrayEvidence(summary.fingerprinting_signals),
        ...getStringArrayEvidence(summary.highEntropySignals),
        ...getStringArrayEvidence(summary.high_entropy_signals)
      ]);
      addEntity(entities, "fingerprintAttributeCategories", categoryNames);
      addEntity(entities, "fingerprintingSignals", categoryNames);
      addEntity(entities, "fingerprintingSummaryReasons", reasons.slice(0, 6));
      if (typeof tier === "number") {
        counts.fingerprintTier = tier;
      }
      const identifierLikeRequestCount = getNumberValue(summary.identifierLikeRequestCount ?? summary.identifier_like_request_count);
      const deviceDataLikeRequestCount = getNumberValue(summary.deviceDataLikeRequestCount ?? summary.device_data_like_request_count);
      if (typeof identifierLikeRequestCount === "number") {
        counts.identifierLikeRequestCount = identifierLikeRequestCount;
      }
      if (typeof deviceDataLikeRequestCount === "number") {
        counts.deviceDataLikeRequestCount = deviceDataLikeRequestCount;
      }
      if (confidence) {
        addEntity(entities, "fingerprintConfidence", [confidence]);
      }
      if (summaryText) {
        runtimeArtifacts.add(`Fingerprint summary: ${summaryText}`);
      }
      if (typeof tier === "number" || categoryNames.length > 0 || reasons.length > 0) {
        runtimeArtifacts.add(
          `Fingerprint summary retained${typeof tier === "number" ? ` at tier ${tier}` : ""}${categoryNames.length > 0 ? ` for ${categoryNames.slice(0, 5).join(", ")}` : ""}.`
        );
      }
      continue;
    }

    const stringValues = getStringArrayEvidence(value);
    if (stringValues.length === 0) {
      continue;
    }

    if (/fingerprintAttributeCategories|fingerprint_attribute_categories|fingerprintingSignals|fingerprinting_signals|highEntropySignals|high_entropy_signals/i.test(key)) {
      addEntity(entities, "fingerprintAttributeCategories", stringValues);
      addEntity(entities, "fingerprintingSignals", stringValues);
      runtimeArtifacts.add(`${key}: ${stringValues.slice(0, 5).join(", ")}`);
      continue;
    }

    if (/fingerprintArtifactRefs|fingerprint_artifact_refs/i.test(key)) {
      addEntity(entities, "fingerprintArtifactRefs", stringValues);
      for (const entry of stringValues) {
        runtimeArtifacts.add(entry);
      }
      continue;
    }

    if (/evidenceFlags|supportingSignals|financialEvidenceFlags|signalKeys/i.test(key)) {
      const financialFlags = stringValues.filter((entry) => /^(?:financial|commercial|entity|regulatory)\./.test(entry));
      if (financialFlags.length > 0) {
        for (const entry of financialFlags) {
          flags.add(entry);
        }
        continue;
      }
    }

    if (stringValues.some((entry) => /^https?:\/\//i.test(entry.trim()))) {
      for (const entry of stringValues) {
        if (/pageurl|page_url/i.test(key)) {
          addPageUrl(entry);
        } else {
          addSourceUrl(entry);
        }
      }
      continue;
    }

    if (/runtime_vendors?|sessionReplayRuntimeVendors|relatedVendors/i.test(key)) {
      addEntity(entities, key, stringValues);
      continue;
    }

    if (/videoTitleSnippets|video_title_snippets|videoPageUrls|video_page_urls|metaPixelPayloadFieldHints|meta_pixel_payload_field_hints|metaPixelRuntimePhases|meta_pixel_runtime_phases/i.test(key)) {
      addEntity(entities, key, stringValues);
      continue;
    }

    if (/runtime|request|network|artifact/i.test(key)) {
      for (const entry of stringValues) {
        runtimeArtifacts.add(entry);
      }
      continue;
    }

    if (/operator_relationship|policyRightsSignals|rights_signals?|policyBoilerplateSignals|policyPositiveSnippetKeys|policy_positive_snippet_keys/i.test(key)) {
      addEntity(entities, key, stringValues);
      continue;
    }

    if (/^signalValue$/i.test(key)) {
      continue;
    }

    if (/mergedSignalSources/i.test(key)) {
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
    rawEvidence,
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
  const normalizedCandidateEvidence = (candidateEvidence ?? []).filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
  );

  return {
    counts: { ...left.counts, ...right.counts },
    entities: { ...left.entities, ...right.entities },
    fetchQuality: normalizeFetchQuality(left.fetchQuality ?? right.fetchQuality),
    flags: uniqueStrings([...left.flags, ...right.flags]),
    pageUrls: uniqueStrings([
      ...left.pageUrls,
      ...right.pageUrls,
      ...normalizedCandidateEvidence.filter((entry) => /^https?:\/\//i.test(entry.trim()))
    ]),
    policyIsPrimarySource: left.policyIsPrimarySource ?? right.policyIsPrimarySource,
    policyPageType: left.policyPageType ?? right.policyPageType,
    policySnippets: uniqueStrings([
      ...left.policySnippets,
      ...right.policySnippets,
      ...normalizedCandidateEvidence.filter((entry) => !/^https?:\/\//i.test(entry.trim())).slice(0, 3)
    ]),
    rawEvidence:
      left.rawEvidence || right.rawEvidence
        ? {
            ...(left.rawEvidence ?? {}),
            ...(right.rawEvidence ?? {})
          }
        : null,
    runtimeArtifacts: uniqueStrings([...left.runtimeArtifacts, ...right.runtimeArtifacts]),
    sourceUrls: uniqueStrings([...left.sourceUrls, ...right.sourceUrls])
  };
}

function getRecordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mergeRawEvidenceWithConcernBundle(
  rawEvidence: Record<string, unknown>,
  bundle: NormalizedConcernEvidenceBundle
) {
  const existingEntities = getRecordValue(rawEvidence.entities);
  const runtimeRequestUrls = uniqueStrings([
    ...getStringArrayEvidence(existingEntities.runtimeRequestUrls),
    ...getStringArrayEvidence(rawEvidence.runtimeRequestUrls),
    ...getStringArrayEvidence(rawEvidence.requestUrls),
    ...getStringArrayEvidence(rawEvidence.preconsent_tracker_evidence_urls),
    ...getStringArrayEvidence(rawEvidence.sourceUrls).filter(isRuntimeRequestEvidenceUrl),
    ...bundle.sourceUrls.filter(isRuntimeRequestEvidenceUrl)
  ]).map(stripReportUrlAnnotation);
  const sourceUrls = uniqueStrings([...getStringArrayEvidence(rawEvidence.sourceUrls), ...bundle.sourceUrls])
    .map(stripReportUrlAnnotation)
    .filter((url) => /^https?:\/\//i.test(url) && !isRuntimeRequestEvidenceUrl(url));
  const pageUrls = uniqueStrings([...getStringArrayEvidence(rawEvidence.pageUrls), ...bundle.pageUrls])
    .map(stripReportUrlAnnotation)
    .filter((url) => /^https?:\/\//i.test(url) && !isRuntimeRequestEvidenceUrl(url));

  return {
    ...rawEvidence,
    ...(Object.keys(bundle.entities).length > 0 || Object.keys(existingEntities).length > 0 || runtimeRequestUrls.length > 0
      ? { entities: { ...existingEntities, ...bundle.entities, ...(runtimeRequestUrls.length > 0 ? { runtimeRequestUrls } : {}) } }
      : {}),
    ...(pageUrls.length > 0 ? { pageUrls } : {}),
    ...(sourceUrls.length > 0 ? { sourceUrls } : {})
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
  const explicitType = normalizePolicyPageType(derivePolicyPageTypeFromEvidence(input.rawEvidence));

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
  const explicit = derivePolicyPrimarySourceFromEvidence(rawEvidence);

  if (explicit !== null) {
    return explicit;
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
    if (candidate.signalSource === "policy_enrichment_signal" || candidate.signalSource === "document_semantic_signal") {
      return candidate.signalSource === "document_semantic_signal" ? "document_semantic" : "policy_enrichment";
    }
    return "compatibility_signal";
  }

  if (candidate.linkedValidationFinding?.findingSource === "policy_review_queue") {
    return "policy_review_queue";
  }

  if (candidate.linkedValidationFinding) {
    return "validation_rule";
  }

  if (
    candidate.fallbackEvidence?.sectionReviewIssue === true ||
    candidate.fallbackEvidence?.section_review_issue === true
  ) {
    return "section_review";
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
    const signalMatch =
      getReportUnifiedFindingForSignal(input.signalSource, input.signalKey) ??
      (input.signalSource === "policy_enrichment_signal"
        ? getReportUnifiedFindingForSignal("document_semantic_signal", input.signalKey)
        : null);
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
    const validationRuleKey = normalizeScanValidationFinding(input.linkedValidationFinding)?.ruleKey ?? null;
    const validationMatch = validationRuleKey ? getReportUnifiedFindingForValidationRule(validationRuleKey) : null;
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
  if (hasConcreteRtbCookieSyncEvidence(input.rawEvidence)) {
    flags.add("direct_runtime");
  }
  if (evaluateCookieRetentionReview(input.rawEvidence).evidence.length > 0) {
    flags.add("direct_runtime");
  }
  if (hasSensitiveSessionReplaySurfaceCooccurrenceArtifact(input.rawEvidence)) {
    flags.add("direct_runtime");
  }
  if (hasSensitiveSessionReplayCorrelationLabel(input.rawEvidence)) {
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


import type { ScanDomainContext } from "./scan-domain-context";

function buildConcernFromSharedInput(input: {
  categoryId?: string;
  description: string;
  domainContext?: ScanDomainContext;
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
  const normalizedRawEvidence = normalizePolicySemanticEvidence(input.rawEvidence ?? null) ?? {};

  // Inject domain-level classification into rawEvidence so deriveConcernPolicy
  // can access it regardless of which code path created the concern.
  if (input.domainContext?.domainIndustryPrimary) {
    normalizedRawEvidence.domainIndustryPrimary = input.domainContext.domainIndustryPrimary;
  }
  if (input.domainContext?.investorOrSecuritiesPromotion !== null && input.domainContext?.investorOrSecuritiesPromotion !== undefined) {
    normalizedRawEvidence.investorOrSecuritiesPromotion = input.domainContext.investorOrSecuritiesPromotion;
  }
  const fallbackBundle = extractEvidenceFromRaw(normalizedRawEvidence);
  const validationBundle = extractEvidenceFromValidationFinding(input.linkedValidationFinding ?? null);
  const mergedEvidenceBundle = mergeConcernEvidenceBundles(fallbackBundle, validationBundle, input.evidence);
  const policyRawEvidence = mergeRawEvidenceWithConcernBundle(normalizedRawEvidence, mergedEvidenceBundle);
  const evidenceBundle = {
    ...mergedEvidenceBundle,
    rawEvidence: policyRawEvidence
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
    rawEvidence: policyRawEvidence
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
    rawEvidence: policyRawEvidence
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

export function normalizeConcernFromReviewFindingCandidate(
  candidate: ReviewFindingCandidateInput,
  domainContext?: ScanDomainContext
): NormalizedConcern {
  const originType = deriveOriginTypeFromCandidate(candidate);
  const linkedValidationFinding = candidate.linkedValidationFinding
    ? normalizeScanValidationFinding(candidate.linkedValidationFinding)
    : null;
  const originKey =
    candidate.sourceType === "signal" && candidate.signalKey
      ? candidate.signalKey
      : linkedValidationFinding?.ruleKey ?? normalizeTitleKey(candidate.title);

  return buildConcernFromSharedInput({
    categoryId: candidate.categoryId,
    description: candidate.description,
    domainContext,
    evidence: candidate.evidence,
    linkedValidationFinding,
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

export function normalizeConcernFromValidationFinding(
  finding: ScanValidationFinding | Record<string, unknown>,
  domainContext?: ScanDomainContext
): NormalizedConcern {
  const normalizedFinding = normalizeScanValidationFinding(finding);
  const fallbackTitle = typeof finding.title === "string" && finding.title.trim().length > 0 ? finding.title : "Validation finding";
  const ruleKey = normalizedFinding?.ruleKey ?? normalizeTitleKey(fallbackTitle);
  const title = normalizedFinding?.title ?? fallbackTitle;
  const description = normalizedFinding?.description ?? title;
  return buildConcernFromSharedInput({
    description,
    domainContext,
    evidence: [],
    linkedValidationFinding: normalizedFinding,
    observedValue: null,
    originKey: ruleKey,
    originType: "validation_rule",
    rawEvidence: normalizedFinding?.evidence ?? null,
    severity:
      normalizedFinding?.severity === "high" || normalizedFinding?.severity === "medium" || normalizedFinding?.severity === "low"
        ? normalizedFinding.severity
        : "medium",
    sourceType: "validation",
    title
  });
}

export function normalizeConcernFromPolicyReviewQueue(
  input: PolicyReviewConcernInput,
  domainContext?: ScanDomainContext
): NormalizedConcern {
  const rawEvidence = {
    ...(input.evidence ?? {}),
    pageUrl: input.pageUrl ?? null,
    policy_review_reason: input.reason
  };

  return buildConcernFromSharedInput({
    categoryId: input.categoryId,
    description: input.description,
    domainContext,
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

type FinancialCompanionDefinition = {
  description: string;
  id: string;
  severity: ReviewFindingSeverity;
  title: string;
};

const FINANCIAL_COMPANION_DEFINITIONS: Record<string, FinancialCompanionDefinition> = {};

function getFinancialConcernFlags(concern: NormalizedConcern) {
  return new Set(
    [
      ...concern.evidenceBundle.flags,
      ...getStringArrayEvidence(concern.evidenceBundle.rawEvidence?.evidenceFlags),
      ...getStringArrayEvidence(concern.evidenceBundle.rawEvidence?.financialEvidenceFlags),
      ...getStringArrayEvidence(concern.evidenceBundle.rawEvidence?.supportingSignals),
      getStringValue(concern.evidenceBundle.rawEvidence?.signalKey),
      concern.signalKey
    ].filter((value): value is string => Boolean(value))
  );
}

function hasAnyFlag(flags: Set<string>, values: string[]) {
  return values.some((value) => flags.has(value));
}

function hasAggregateFinancialFlagEvidence(concern: NormalizedConcern) {
  return [
    ...getStringArrayEvidence(concern.evidenceBundle.rawEvidence?.evidenceFlags),
    ...getStringArrayEvidence(concern.evidenceBundle.rawEvidence?.financialEvidenceFlags)
  ].some((flag) => /^(?:financial|commercial|entity)\./.test(flag));
}

const FINANCIAL_REGISTRATION_DISCLOSURE_PATTERN =
  /\b(?:NFA\s*(?:member\s*)?(?:ID|registration|number)|CFTC\s+registration|registered\s+(?:CTA|CPO|FCM)|commodity trading advisor|commodity pool operator|SEC\s+(?:RIA|registered investment adviser|registered investment advisor)|Form\s+ADV|CRD\s*(?:number|#)|FCA\s+(?:registration|reference)\s*(?:number|no\.?)|FRN\s*\d|ASIC\s+(?:AFS|license|licence|registration)|AFSL\s*\d|FSCA\s+(?:FSP|registration)|FSP\s*(?:number|no\.?)|MAS\s+(?:regulated|license|licence|registration))\b/i;

function hasConcreteRegistrationDisclosureEvidence(concern: NormalizedConcern) {
  const registrationEvidenceText = uniqueStrings([
    ...concern.evidenceBundle.policySnippets,
    ...getNestedStringEvidence(concern.evidenceBundle.rawEvidence)
  ]).join(" ");

  return FINANCIAL_REGISTRATION_DISCLOSURE_PATTERN.test(registrationEvidenceText);
}

function deriveFinancialCompanionFindingIds(concern: NormalizedConcern) {
  void concern;
  return [];
}

function expandFinancialCompanionConcerns(concern: NormalizedConcern): NormalizedConcern[] {
  const companionIds = deriveFinancialCompanionFindingIds(concern);
  if (companionIds.length === 0) {
    return [concern];
  }

  const flags = [...getFinancialConcernFlags(concern)];
  const companions = companionIds.flatMap((id) => {
    const definition = FINANCIAL_COMPANION_DEFINITIONS[id];
    const unifiedFinding = getReportUnifiedFinding(id);
    if (!definition || !unifiedFinding) {
      return [];
    }

    return buildConcernFromSharedInput({
      categoryId: concern.categoryId,
      description: definition.description,
      evidence: uniqueStrings([...concern.evidenceBundle.pageUrls, ...concern.evidenceBundle.sourceUrls]),
      linkedValidationFinding: concern.linkedValidationFinding ?? null,
      observedValue: concern.observedValue,
      originKey: `${concern.originKey}#${id}`,
      originType: concern.originType,
      rawEvidence: {
        ...(concern.evidenceBundle.rawEvidence ?? {}),
        evidenceFlags: flags,
        financialEvidenceFlags: flags,
        sourceConcernKey: concern.canonicalConcernKey,
        unifiedFindingId: id
      },
      severity: definition.severity,
      signalKey: concern.signalKey,
      signalLabel: concern.signalLabel,
      signalSource: concern.signalSource,
      sourceType: concern.sourceType,
      title: definition.title
    });
  });

  return [concern, ...companions];
}

function normalizeMatchToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.]+/g, "");
}

function isTransferReviewEndpointEvidenceRow(row: Record<string, unknown>) {
  const transferReviewSignal = getBooleanValue(row.transferReviewSignal ?? row.transfer_review_signal);
  const firstPartyStatus = getStringValue(row.firstPartyStatus ?? row.first_party_status);
  const inferredRegion = getStringValue(row.inferredRegion ?? row.inferred_region);
  const inferredCountryCode = getStringValue(row.inferredCountryCode ?? row.inferred_country_code);
  const confidence = getStringValue(row.confidence);

  return (
    transferReviewSignal === true &&
    firstPartyStatus === "third_party" &&
    Boolean(inferredRegion || inferredCountryCode) &&
    (confidence === "medium" || confidence === "high" || confidence === "strong")
  );
}

function getEndpointJurisdictionEvidenceRowsFromConcern(concern: NormalizedConcern) {
  const rawEvidence = concern.evidenceBundle.rawEvidence;
  if (!rawEvidence) {
    return [];
  }
  const hybridRuntimeEvidence =
    rawEvidence.hybridRuntimeEvidence && typeof rawEvidence.hybridRuntimeEvidence === "object" && !Array.isArray(rawEvidence.hybridRuntimeEvidence)
      ? rawEvidence.hybridRuntimeEvidence as Record<string, unknown>
      : null;

  return [
    ...getPlainRecordArray(rawEvidence.endpointJurisdictionEvidence),
    ...getPlainRecordArray(rawEvidence.endpoint_jurisdiction_evidence),
    ...getPlainRecordArray(rawEvidence.crossBorderEndpointEvidence),
    ...getPlainRecordArray(rawEvidence.cross_border_endpoint_evidence),
    ...getPlainRecordArray(hybridRuntimeEvidence?.endpointJurisdictionEvidence),
    ...getPlainRecordArray(hybridRuntimeEvidence?.endpoint_jurisdiction_evidence),
    ...getPlainRecordArray(hybridRuntimeEvidence?.crossBorderEndpointEvidence),
    ...getPlainRecordArray(hybridRuntimeEvidence?.cross_border_endpoint_evidence)
  ].filter(isTransferReviewEndpointEvidenceRow);
}

function getEndpointMatchTokens(row: Record<string, unknown>) {
  const host = getStringValue(row.host);
  const etldPlusOne = getStringValue(row.etldPlusOne ?? row.etld_plus_one);
  const vendor = getStringValue(row.matchedVendorName ?? row.matched_vendor_name);
  return uniqueStrings([host, etldPlusOne, vendor]).map(normalizeMatchToken).filter(Boolean);
}

function getDisclosureMismatchTokens(row: ReturnType<typeof getRuntimeVendorDisclosureEvidence>[number]) {
  return uniqueStrings([
    ...row.unmatchedRuntimeVendors,
    ...row.unmatchedRuntimeDomains,
    ...row.observedRuntimeVendors,
    ...row.observedRuntimeDomains
  ]).map(normalizeMatchToken).filter(Boolean);
}

function tokensIntersect(left: string[], right: string[]) {
  return left.some((leftToken) =>
    right.some((rightToken) =>
      leftToken === rightToken ||
      leftToken.endsWith(`.${rightToken}`) ||
      rightToken.endsWith(`.${leftToken}`) ||
      (leftToken.length >= 4 && rightToken.includes(leftToken)) ||
      (rightToken.length >= 4 && leftToken.includes(rightToken))
    )
  );
}

function buildCrossBorderTransferDisclosureGapCompanions(concerns: NormalizedConcern[], domainContext?: ScanDomainContext) {
  const endpointRows = concerns.flatMap(getEndpointJurisdictionEvidenceRowsFromConcern);
  if (endpointRows.length === 0) {
    return [];
  }

  const disclosureRows = concerns.flatMap((concern) => getRuntimeVendorDisclosureEvidence(concern.evidenceBundle.rawEvidence));
  const eligiblePairs = endpointRows.flatMap((endpoint) => {
    const endpointTokens = getEndpointMatchTokens(endpoint);
    return disclosureRows
      .filter((disclosure) => {
        const reachedReviewableSurface = disclosure.policySurfacesSearched.some(
          (surface) => surface.reached && Boolean(surface.url) && Boolean(surface.snippet)
        );
        return (
          reachedReviewableSurface &&
          (disclosure.unmatchedRuntimeVendors.length > 0 || disclosure.unmatchedRuntimeDomains.length > 0) &&
          disclosure.unmatchedVendorDisclosureCount > 0 &&
          tokensIntersect(endpointTokens, getDisclosureMismatchTokens(disclosure))
        );
      })
      .map((disclosure) => ({ disclosure, endpoint }));
  });

  if (eligiblePairs.length === 0) {
    return [];
  }

  const endpointEvidence = eligiblePairs.map((pair) => pair.endpoint);
  const disclosureEvidence = eligiblePairs.map((pair) => pair.disclosure);
  const vendors = uniqueStrings(endpointEvidence.map((row) => getStringValue(row.matchedVendorName ?? row.matched_vendor_name)));
  const hosts = uniqueStrings(endpointEvidence.map((row) => getStringValue(row.host)));
  const regions = uniqueStrings(endpointEvidence.map((row) => getStringValue(row.inferredRegion ?? row.inferred_region)));
  const unmatchedVendors = uniqueStrings(disclosureEvidence.flatMap((row) => row.unmatchedRuntimeVendors));

  return [
    buildConcernFromSharedInput({
      categoryId: "data_handling_disclosures",
      description:
        "Transfer-relevant third-party endpoint evidence intersected with retained public disclosure-search evidence showing a matching runtime vendor or domain was not clearly disclosed.",
      domainContext,
      evidence: hosts,
      observedValue:
        `International-transfer disclosure alignment gap observed for ${uniqueStrings([...vendors, ...unmatchedVendors]).slice(0, 3).join(", ") || hosts.slice(0, 3).join(", ")}.`,
      originKey: "privacy.cross_border_endpoint_disclosure_gap",
      originType: "compatibility_signal",
      rawEvidence: {
        crossBorderDisclosureGapBasis: "transfer_endpoint_runtime_vendor_not_disclosed",
        endpointJurisdictionEvidence: endpointEvidence,
        endpointTransferReviewHosts: hosts,
        endpointTransferReviewRegions: regions,
        endpointTransferReviewVendors: vendors,
        runtime_vendor_disclosure_evidence: disclosureEvidence,
        runtimeVendorDisclosureEvidence: disclosureEvidence,
        supportingSignals: [
          "privacy.cross_border_endpoint_transfer_review_signal",
          "privacy.runtime_vendor_not_disclosed"
        ],
        transferDisclosureGapObserved: true,
        unifiedFindingId: "cross_border_vendor_disclosure_gap"
      },
      severity: "medium",
      signalKey: "privacy.cross_border_endpoint_disclosure_gap",
      signalLabel: "Cross-border vendor disclosure gap observed",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "Cross-border vendor disclosure gap observed"
    })
  ];
}

function getRuntimeRecord(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
  keys: string[]
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = runtimeArtifacts?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function getRuntimeBoolean(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function getRuntimeString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = getStringValue(record?.[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function getRuntimeStringArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const value = record?.[key];
    if (typeof value === "string") {
      return [value];
    }
    return getStringArrayEvidence(value);
  }));
}

function getRuntimeNumber(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = getNumberValue(record?.[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

const SCAN_NO_GO_CONFIDENCE_THRESHOLD = 0.9;

function getScanNoGoAssessment(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getRuntimeRecord(runtimeArtifacts, ["scanNoGoAssessment", "scan_no_go_assessment"]);
}

function getRuntimeCoverageSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getRuntimeRecord(runtimeArtifacts, [
    "runtimeCoverage",
    "runtime_coverage",
    "runtimeCoverageSummary",
    "runtime_coverage_summary"
  ]);
}

function getScanNoGoSignalKey(pageState: string | null) {
  return pageState === "captcha_or_challenge"
    ? "scan_quality.visual_access_challenge"
    : pageState === "access_blocked"
      ? "scan_quality.visual_access_blocked"
      : pageState === "auth_or_login_wall"
        ? "scan_quality.visual_auth_or_login_wall"
        : pageState === "maintenance_or_unavailable"
          ? "scan_quality.visual_maintenance_or_unavailable"
          : pageState === "blank_or_unusable"
            ? "scan_quality.visual_blank_or_unusable"
            : pageState === "wrong_site_or_soft_404"
              ? "scan_quality.visual_wrong_site_or_soft_404"
              : pageState === "parked_or_placeholder"
                ? "scan_quality.visual_parked_or_placeholder"
                : "scan_quality.visual_access_blocked";
}

function buildScanNoGoAssessmentConcerns(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
  domainContext?: ScanDomainContext
) {
  const assessment = getScanNoGoAssessment(runtimeArtifacts);
  const decision = getRuntimeString(assessment, ["decision"]);
  const scanNoGoConfidence = getRuntimeNumber(assessment, [
    "scanNoGoConfidence",
    "scan_no_go_confidence"
  ]);
  if (decision !== "no_go" || scanNoGoConfidence === null || scanNoGoConfidence < SCAN_NO_GO_CONFIDENCE_THRESHOLD) {
    return [];
  }

  const supportingSignals = getRuntimeRecord(assessment, ["supportingSignals", "supporting_signals"]);
  const visualPageState =
    getRuntimeString(supportingSignals, ["visualPageState", "visual_page_state"]) ??
    getRuntimeString(assessment, ["visualPageState", "visual_page_state"]);
  const signalKey = getScanNoGoSignalKey(visualPageState);
  const evidenceRefs = getRuntimeStringArray(assessment, ["evidenceRefs", "evidence_refs"]);
  const reasonCodes = getRuntimeStringArray(assessment, ["reasonCodes", "reason_codes"]);
  const corroboratorCodes = getRuntimeStringArray(assessment, ["corroboratorCodes", "corroborator_codes"]);
  const contradictorCodes = getRuntimeStringArray(assessment, ["contradictorCodes", "contradictor_codes"]);
  const description = [
    "WS01 retained a scan-level no-go assessment from observed runtime evidence.",
    corroboratorCodes.length > 0 ? `Corroborators: ${corroboratorCodes.join(", ")}.` : null
  ].filter((part): part is string => Boolean(part)).join(" ");

  return [
    buildConcernFromSharedInput({
      categoryId: "manual_review_triggers",
      description,
      domainContext,
      evidence: evidenceRefs,
      observedValue: decision,
      originKey: "scan_quality.scan_no_go_assessment.no_go",
      originType: "runtime_artifact",
      rawEvidence: {
        ...assessment,
        runtimeEvidenceArtifacts: evidenceRefs.length > 0
          ? evidenceRefs
          : ["scan_runtime_artifacts.scan_no_go_assessment"],
        scanNoGoConfidence,
        scanNoGoDecision: decision,
        scanNoGoReasonCodes: reasonCodes,
        scanNoGoCorroboratorCodes: corroboratorCodes,
        scanNoGoContradictorCodes: contradictorCodes,
        signalKey,
        unifiedFindingId: "scan_quality_visual_no_go"
      },
      severity: "high",
      signalKey,
      signalLabel: "Scan-level no-go assessment",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "Scan-level no-go assessment"
    })
  ];
}

function buildRuntimeCoverageLimitationConcerns(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
  domainContext?: ScanDomainContext
) {
  const runtimeCoverage = getRuntimeCoverageSummary(runtimeArtifacts);
  const coverageStatus = getRuntimeString(runtimeCoverage, ["coverageStatus", "coverage_status"]);
  if (coverageStatus !== "limited_none" && coverageStatus !== "limited_partial") {
    return [];
  }

  const observationCounts = getRuntimeRecord(runtimeCoverage, ["observationCounts", "observation_counts"]) ?? {};
  const limitationKeys = getRuntimeStringArray(runtimeCoverage, ["limitationKeys", "limitation_keys"]);
  const fallbackModesUsed = getRuntimeStringArray(runtimeCoverage, ["fallbackModesUsed", "fallback_modes_used"]);
  const notes = getRuntimeStringArray(runtimeCoverage, ["notes"]);
  const silentEmpty = getRuntimeBoolean(runtimeCoverage, ["silentEmpty", "silent_empty"]) === true;
  const evidence = uniqueStrings([
    ...limitationKeys.map((key) => `runtime coverage limitation: ${key}`),
    ...fallbackModesUsed.map((mode) => `runtime fallback used: ${mode}`),
    ...notes
  ]);
  const description =
    coverageStatus === "limited_none"
      ? "Scanner runtime coverage retained no usable runtime observation; absence of runtime tracking signals should not be treated as a clean result."
      : "Scanner runtime coverage retained only partial runtime observation; absence of runtime tracking signals requires review.";

  return [
    buildConcernFromSharedInput({
      categoryId: "manual_review_triggers",
      description,
      domainContext,
      evidence,
      observedValue: coverageStatus,
      originKey: `scan_quality.runtime_coverage.${coverageStatus}`,
      originType: "runtime_artifact",
      rawEvidence: {
        runtimeCoverage,
        runtimeCoverageStatus: coverageStatus,
        runtimeCoverageLimitationKeys: limitationKeys,
        runtimeCoverageFallbackModesUsed: fallbackModesUsed,
        runtimeCoverageObservationCounts: observationCounts,
        runtimeCoverageSilentEmpty: silentEmpty,
        runtimeEvidenceArtifacts: evidence.length > 0
          ? evidence
          : ["scan_runtime_artifacts.runtime_coverage"],
        signalKey: "scan_quality.runtime_coverage_limited"
      },
      severity: coverageStatus === "limited_none" ? "medium" : "low",
      signalKey: "scan_quality.runtime_coverage_limited",
      signalLabel: "Runtime coverage limited",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: coverageStatus === "limited_none"
        ? "Runtime coverage retained no usable observation"
        : "Runtime coverage was partial"
    })
  ];
}


export function buildNormalizedConcerns(input: {
  domainContext?: ScanDomainContext;
  reviewFindingCandidates: ReviewFindingCandidateInput[];
  runtimeArtifacts?: Record<string, unknown> | null;
  validationFindings: Array<ScanValidationFinding | Record<string, unknown>>;
}) {
  const concerns = [
    ...input.reviewFindingCandidates.map((candidate) =>
      normalizeConcernFromReviewFindingCandidate(candidate, input.domainContext)
    ),
    ...input.validationFindings.flatMap((finding) => {
      const normalizedFinding = normalizeScanValidationFinding(finding);
      return normalizedFinding ? [normalizeConcernFromValidationFinding(normalizedFinding, input.domainContext)] : [];
    }),
    ...buildScanNoGoAssessmentConcerns(input.runtimeArtifacts, input.domainContext),
    ...buildRuntimeCoverageLimitationConcerns(input.runtimeArtifacts, input.domainContext)
  ];

  return [
    ...concerns,
    ...buildCrossBorderTransferDisclosureGapCompanions(concerns, input.domainContext)
  ].flatMap(expandFinancialCompanionConcerns);
}

function isPolicyBehaviorMissingBridgeReviewConcern(concern: NormalizedConcern) {
  if (
    concern.suggestedUnifiedFindingId !== "policy_behavior_conflict" ||
    concern.promotionEligibility !== "internal_only" ||
    concern.externalSurfacingEligibility !== "audit_only" ||
    concern.originType !== "compatibility_signal"
  ) {
    return false;
  }

  const negativeFlags = new Set(concern.negativeEvidenceFlags);
  if (
    !negativeFlags.has("missing_bridge_provenance") ||
    negativeFlags.has("missing_policy_side_evidence") ||
    negativeFlags.has("missing_runtime_anchor") ||
    negativeFlags.has("missing_specific_runtime_artifact") ||
    negativeFlags.has("boilerplate_policy_anchor") ||
    negativeFlags.has("weak_policy_anchor")
  ) {
    return false;
  }

  const bundle = getContradictionEvidenceBundle(concern.evidenceBundle.rawEvidence);
  if (!bundle) {
    return false;
  }

  const policyAnchor = bundle.policyAnchor;
  const runtimeAnchor = bundle.runtimeAnchor;
  const concreteRuntimeAnchor =
    runtimeAnchor.requests.length > 0 ||
    runtimeAnchor.cookies.length > 0 ||
    runtimeAnchor.storageArtifacts.length > 0 ||
    bundle.runtimeEvidenceArtifacts.some((artifact) => /^https?:\/\//i.test(artifact) || /^(cookie|storage):/i.test(artifact));

  return (
    Boolean(policyAnchor.claimType) &&
    policyAnchor.extractionStatus === "fetched" &&
    typeof policyAnchor.confidence === "number" &&
    policyAnchor.confidence >= 0.55 &&
    Boolean(policyAnchor.sourceUrl) &&
    isSpecificPolicyBehaviorPolicySnippet(policyAnchor.snippet, policyAnchor.claimType) &&
    Boolean(runtimeAnchor.observationType) &&
    runtimeAnchor.phase !== "unknown" &&
    typeof runtimeAnchor.confidence === "number" &&
    runtimeAnchor.confidence >= 0.55 &&
    concreteRuntimeAnchor
  );
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
        concern.promotionEligibility !== "eligible" &&
        !isPolicyBehaviorMissingBridgeReviewConcern(concern)
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
