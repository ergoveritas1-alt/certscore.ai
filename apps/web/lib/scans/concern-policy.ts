import type {
  NormalizedConcern,
  NormalizedConcernAssertionLevel,
  NormalizedConcernEvidenceStrengthFlag,
  NormalizedConcernExternalSurfacingEligibility,
  NormalizedConcernNegativeEvidenceFlag,
  NormalizedConcernPolicyPageType,
  NormalizedConcernPromotionEligibility
} from "./normalized-concerns";
import {
  evaluateFinancialJudgeInput,
  getFinancialValidationEvidenceBundle,
  isFinancialValidationFindingId
} from "./financial-validation-contract";
import { getStoredFinancialJudgeOutput } from "./financial-judge-contract";
import {
  evaluateConcreteRuntimeContract,
  evaluatePolicyBehaviorConflictContract,
  evaluateStrongEvidenceContract,
  hasConcretePreconsentArtifact,
  hasConcreteReplayArtifact,
  hasConcreteRetargetingArtifact,
  hasConcreteSensitivePayloadArtifact,
  hasPreconsentSequenceEvidence,
  hasStrongRightsFrictionArtifact
} from "./promotion-evidence-contracts";
import {
  hasConcreteSanitizedNetworkEvidence
} from "./sanitized-network-evidence";
import {
  derivePolicyPageTypeFromEvidence,
  derivePolicyPrimarySourceFromEvidence
} from "./policy-evidence-metadata";

const ACCESSIBILITY_PAGE_ATTRIBUTION_IDS = new Set([
  "wcag_issue_summary",
  "accessibility_risk_score",
  "contrast_failures",
  "form_label_issues",
  "critical_form_completion_barrier",
  "link_name_issues",
  "keyboard_navigation_issues",
  "keyboard_only_task_completion_blocked",
  "focus_indicator_issues",
  "landmark_issues",
  "aria_issues",
  "accessibility_claim_mismatch"
]);

const DOMAIN_LEVEL_SENSITIVE_CONTEXT_IDS = new Set([
  "minors_or_age_gated_collection_context"
]);

const DOMAIN_LEVEL_CHILDREN_DISCLOSURE_IDS = new Set([
  "children_privacy_context_without_supporting_disclosure"
]);

const COVERAGE_GAP_SURFACE_MISSING_IDS = new Set([
  "privacy_policy_missing_surface",
  "terms_missing_surface",
  "cookie_policy_missing_surface",
  "accessibility_statement_missing_surface",
  "contact_page_missing_surface"
]);

const BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN =
  /unable to authorize your request|access denied|verify you are human|captcha|bot challenge|request blocked|security check|temporarily unavailable|forbidden|we(?:'|’)re sorry, but we were unable to authorize your request/i;

function hasTruthyArrayValue(value: unknown) {
  return Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function getCanonicalStringEvidence(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  for (const key of keys) {
    const value = evidence?.[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function getBooleanEvidence(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  for (const key of keys) {
    if (evidence?.[key] === true) {
      return true;
    }
    if (evidence?.[key] === false) {
      return false;
    }
  }

  return null;
}

function getFirstString(evidence: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof evidence?.[key] === "string") {
      const value = String(evidence[key]).trim();
      if (value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

function getStringArrayValues(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  const values: string[] = [];

  for (const key of keys) {
    const value = evidence?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      values.push(value.trim());
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const entry of value) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        values.push(entry.trim());
      }
    }
  }

  return [...new Set(values)];
}

function getPolicySignalString(
  evidence: Record<string, unknown> | null | undefined,
  key: string
) {
  return getCanonicalStringEvidence(evidence, [key]);
}

function getPolicySignalNumber(
  evidence: Record<string, unknown> | null | undefined,
  key: string
) {
  return getNumberEvidence(evidence, [key]);
}

function getPolicySignalStringArray(
  evidence: Record<string, unknown> | null | undefined,
  key: string
) {
  return getStringArrayValues(evidence, [key]);
}

function getFetchQuality(rawEvidence: Record<string, unknown> | null | undefined) {
  const value =
    typeof rawEvidence?.normalizedConcernFetchQuality === "string"
      ? rawEvidence.normalizedConcernFetchQuality
      : typeof rawEvidence?.fetchQuality === "string"
        ? rawEvidence.fetchQuality
        : typeof rawEvidence?.fetch_quality === "string"
          ? rawEvidence.fetch_quality
          : null;

  return value === "verified_content" ||
    value === "thin_content" ||
    value === "blocked_interstitial" ||
    value === "unreachable"
    ? value
    : null;
}

function getEvidenceTextCandidates(rawEvidence: Record<string, unknown> | null | undefined) {
  return getStringArrayValues(rawEvidence, [
    "claim",
    "description",
    "matchedSnippet",
    "observedBehavior",
    "policySnippet",
    "policySnippets",
    "policySummary",
    "policySummaryShort",
    "policy_summary",
    "policy_summary_short",
    "runtimeSummary",
    "snippet",
    "snippets",
    "sourceEvidence",
    "sourceTitle",
    "supportingSignals",
    "summary",
    "title"
  ]);
}

function getEvidenceUrlCandidates(rawEvidence: Record<string, unknown> | null | undefined) {
  return getStringArrayValues(rawEvidence, [
    "attemptedUrls",
    "evidenceUrls",
    "pageUrl",
    "pageUrls",
    "preconsent_tracker_evidence_urls",
    "requestUrls",
    "runtimeEvidenceUrls",
    "sourceUrl",
    "sourceUrls"
  ]).filter((value) => /^https?:\/\//i.test(value));
}

function hasBlockedOrInterstitialEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getFetchQuality(rawEvidence) === "blocked_interstitial" ||
    getEvidenceTextCandidates(rawEvidence).some((value) => BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN.test(value))
  );
}

function hasPolicySideEvidence(
  rawEvidence: Record<string, unknown> | null | undefined,
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[]
) {
  return (
    evidenceStrengthFlags.includes("policy_text") ||
    getEvidenceTextCandidates(rawEvidence).some((value) => typeof value === "string" && value.trim().length > 0)
  );
}

function hasBehaviorSideEvidence(
  rawEvidence: Record<string, unknown> | null | undefined,
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[]
) {
  return (
    evidenceStrengthFlags.includes("direct_runtime") ||
    evidenceStrengthFlags.includes("concrete_payload") ||
    hasTruthyArrayValue(rawEvidence?.runtimeEvidence) ||
    hasTruthyArrayValue(rawEvidence?.runtimeEvidenceArtifacts) ||
    hasTruthyArrayValue(rawEvidence?.runtime_evidence_artifacts)
  );
}

function hasHumanFacingUrl(rawEvidence: Record<string, unknown> | null | undefined) {
  return getEvidenceUrlCandidates(rawEvidence).some((value) => /^https?:\/\//i.test(value));
}

function isReadablePositiveSurfaceSnippet(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length < 8 || BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN.test(trimmed)) {
    return false;
  }

  const wordCount = trimmed.split(/\s+/).length;
  const looksLikeBrandOnly =
    trimmed.length <= 40 &&
    wordCount <= 4 &&
    /^[A-Z][A-Za-z&'.-]*(?:\s+[A-Z][A-Za-z&'.-]*)*$/.test(trimmed) &&
    !/privacy|terms|conditions|cookie|contact|support|help|rights|choices|accessibility/i.test(trimmed);
  return !looksLikeBrandOnly;
}

function hasMeaningfulReviewerSnippet(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length < 12 || BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN.test(trimmed)) {
    return false;
  }

  return !/^(detected|observed|this signal is worth reviewer attention)\b/i.test(trimmed);
}

function isContactLikeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return /contact|help|support|feedback|chat|customer-service/i.test(parsed.pathname);
  } catch {
    return /contact|help|support|feedback|chat|customer-service/i.test(value);
  }
}

function isCookieLikeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return /cookie|privacy|legal|your-privacy-choices/i.test(parsed.pathname);
  } catch {
    return /cookie|privacy|legal|your-privacy-choices/i.test(value);
  }
}

function isTermsLikeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return /terms|conditions|tos/i.test(parsed.pathname);
  } catch {
    return /terms|conditions|tos/i.test(value);
  }
}

function hasPacketBackedSurfaceEvidence(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  if (!rawEvidence) {
    return false;
  }

  const expectedFindingId = concern.suggestedUnifiedFindingId ?? "";
  return (
    rawEvidence.familyPacketVerified === true ||
    rawEvidence.familyPacketFindingId === expectedFindingId ||
    rawEvidence.familyPacketFamilyId !== undefined
  );
}

function getPositiveInfrastructureEvidenceGrade(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const fetchQuality = getFetchQuality(rawEvidence);
  if (!rawEvidence || fetchQuality === "unreachable") {
    return "weak" as const;
  }

  const blockedOrInterstitialEvidence = hasBlockedOrInterstitialEvidence(rawEvidence);
  const urls = getEvidenceUrlCandidates(rawEvidence);
  const snippets = getEvidenceTextCandidates(rawEvidence).filter(isReadablePositiveSurfaceSnippet);
  const haystack = `${urls.join(" ")} ${snippets.join(" ")}`.toLowerCase();
  const hasPacketBacking = hasPacketBackedSurfaceEvidence(concern, rawEvidence);
  const humanFacingUrlCount = urls.filter((value) => /^https?:\/\//i.test(value)).length;
  const verifiedBySnippet = snippets.length > 0 && humanFacingUrlCount > 0;

  if (concern.suggestedUnifiedFindingId === "accessibility_support_path_present") {
    if (
      rawEvidence.accessibilityContactMethodPresent === true ||
      (hasPacketBacking &&
        humanFacingUrlCount >= 1 &&
        snippets.some((value) => /accessibility|accommodation|caption|assistive/i.test(value))) ||
      (!blockedOrInterstitialEvidence &&
        fetchQuality !== "thin_content" &&
        verifiedBySnippet &&
        /accessibility|accommodation|caption|assistive/i.test(haystack))
    ) {
      return "verified" as const;
    }

    return "weak" as const;
  }

  if (!blockedOrInterstitialEvidence && fetchQuality !== "thin_content" && verifiedBySnippet) {
    switch (concern.suggestedUnifiedFindingId) {
      case "contact_support_path_present":
      case "operator_contact_path_present":
        return snippets.some((value) => /contact|help|support|feedback|chat|branch|call/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "cookie_policy_present":
        return snippets.some((value) => /cookie|privacy choices|privacy settings|manage cookies/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "privacy_policy_present":
        return snippets.some((value) => /privacy|security statement|privacy statement|privacy notice|privacy policy/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "terms_of_service_present":
        return snippets.some((value) => /terms|conditions|terms of use|terms of sale|arbitration|tos/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "targeted_advertising_choices_present":
        return snippets.some((value) => /do not sell|opt out|privacy choices|ad choices|targeted advertising/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "affiliate_disclosure_present":
        return snippets.some((value) => /affiliate|commission|we may earn|paid link|qualifying purchases?/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "privacy_rights_path_present":
        return (
          getPolicyRightsSignals(rawEvidence).length > 0 ||
          snippets.some((value) =>
            /privacy rights|rights center|delete request|access request|request access|access to|deletion|data request/i.test(value)
          )
        )
          ? "verified" as const
          : "weak" as const;
      default:
        return snippets.some((value) => value.trim().length >= 8) ? "verified" as const : "weak" as const;
    }
  }

  switch (concern.suggestedUnifiedFindingId) {
    case "contact_support_path_present":
    case "operator_contact_path_present": {
      const corroboratingContactUrls = urls.filter(isContactLikeUrl).length;
      return hasPacketBacking && corroboratingContactUrls >= 2 ? "corroborated" as const : "weak" as const;
    }
    case "privacy_policy_present":
      return hasPacketBacking &&
        snippets.some((value) => /privacy|security statement|privacy statement|privacy notice|privacy policy/i.test(value)) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    case "terms_of_service_present":
      return hasPacketBacking &&
        snippets.some((value) => /terms|conditions|terms of use|terms of sale|arbitration/i.test(value)) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    case "cookie_policy_present": {
      return hasPacketBacking &&
        snippets.some((value) => /cookie|privacy choices|privacy settings|manage cookies/i.test(value)) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    }
    case "accessibility_support_path_present":
      return hasPacketBacking &&
        humanFacingUrlCount >= 1 &&
        snippets.some((value) => /accessibility|accommodation|caption|assistive/i.test(value))
        ? "corroborated" as const
        : "weak" as const;
    case "privacy_rights_path_present":
      return hasPacketBacking &&
        (getPolicyRightsSignals(rawEvidence).length > 0 ||
          snippets.some((value) => /privacy rights|rights center|delete request|access request|data request/i.test(value))) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    case "targeted_advertising_choices_present":
      return hasPacketBacking &&
        snippets.some((value) => /do not sell|opt out|privacy choices|ad choices|targeted advertising/i.test(value)) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    case "affiliate_disclosure_present":
      return hasPacketBacking &&
        snippets.some((value) => /affiliate|commission|we may earn|paid link|qualifying purchases?/i.test(value)) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    case "privacy_contact_path_present":
    case "gpc_disclosure_present":
    case "tracking_technologies_disclosure_present":
    case "third_party_advertising_disclosure_present":
    case "targeted_advertising_disclosure_present":
    case "behavioral_analytics_disclosure_present":
    case "children_privacy_disclosure_present":
      return hasPacketBacking &&
        snippets.some(hasMeaningfulReviewerSnippet) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    default:
      return "weak" as const;
  }
}

function hasVerifiedPositiveInfrastructureEvidence(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  return getPositiveInfrastructureEvidenceGrade(concern, rawEvidence) === "verified";
}

export function hasStrongRightsFrictionEvidence(evidence: Record<string, unknown> | null | undefined) {
  return hasStrongRightsFrictionArtifact(evidence);
}

export function hasSensitivePayloadEvidence(evidence: Record<string, unknown> | null | undefined) {
  return hasConcreteSensitivePayloadArtifact(evidence);
}

export function hasConcreteSessionReplayEvidence(evidence: Record<string, unknown> | null | undefined) {
  return hasConcreteReplayArtifact(evidence);
}

export function hasConcreteRetargetingEvidence(evidence: Record<string, unknown> | null | undefined) {
  return hasConcreteRetargetingArtifact(evidence);
}

export function hasConcreteDsarEvidence(evidence: Record<string, unknown> | null | undefined) {
  if (!evidence) {
    return false;
  }

  const dsarMechanism = getPolicySignalString(evidence, "policyDsarMechanism");
  const policySemanticConfidence = getPolicySignalNumber(evidence, "policySemanticConfidence");
  const extractionStatus = getPolicyExtractionStatus(evidence);
  const policyRightsSignals = getPolicyRightsSignals(evidence);

  return (
    dsarMechanism === "absent" &&
    extractionStatus === "fetched" &&
    typeof policySemanticConfidence === "number" &&
    policySemanticConfidence >= 0.6 &&
    policyRightsSignals.length === 0
  );
}

function isReplayConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /session_replay|replay\/disclosure|undisclosed session replay|possible replay/.test(haystack);
}

export function concernRequiresDirectRuntime(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  return isReplayConcern(concern);
}

function isRightsFrictionConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /user_rights_friction|rights_fulfillment_friction|functional_misalignment|policy_runtime_functional_misalignment/.test(
    haystack
  );
}

function isHighSensitivityConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /high_sensitivity_data_collection|session_replay_on_sensitive_input_surface|sensitive_data_collection_with_third_party_tracking_present/.test(
    haystack
  );
}

function isSensitiveReplayConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "session_replay_on_sensitive_input_surface";
}

function isSensitiveThirdPartyTrackingConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "sensitive_data_collection_with_third_party_tracking_present";
}

function isDsarConcern(concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">) {
  if (concern.suggestedUnifiedFindingId === "privacy_rights_path_present") {
    return false;
  }

  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /dsar|privacy-rights|missing_dsar|no dsar mechanism/.test(haystack);
}

function isStructuredPolicyDisclosureGapConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return [
    "data_categories_disclosure_missing",
    "third_party_recipient_disclosure_missing",
    "purpose_of_use_disclosure_missing"
  ].includes(concern.suggestedUnifiedFindingId ?? "");
}

export function isPositiveInfrastructureConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return [
    "privacy_policy_present",
    "terms_of_service_present",
    "cookie_policy_present",
    "contact_support_path_present",
    "targeted_advertising_choices_present",
    "privacy_rights_path_present",
    "privacy_contact_path_present",
    "gpc_disclosure_present",
    "tracking_technologies_disclosure_present",
    "third_party_advertising_disclosure_present",
    "targeted_advertising_disclosure_present",
    "behavioral_analytics_disclosure_present",
    "children_privacy_disclosure_present",
    "affiliate_disclosure_present",
    "accessibility_support_path_present",
    "arbitration_clause_present"
  ].includes(concern.suggestedUnifiedFindingId ?? "");
}

function isPreconsentConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /preconsent|tracking_before_consent|trackers_before_consent/.test(haystack);
}

function isRetargetingConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /retargeting_pixel|retargeting pixel|retargeting_pixel_observed/.test(haystack);
}

function isContradictionConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  if (isSurfaceIntegrityConcern(concern) || isDisclosurePlacementConcern(concern)) {
    return false;
  }

  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /conflict|mismatch|contradiction|functional_misalignment|missing_technical_disclosure|session_replay_undisclosed/.test(
    haystack
  );
}

function isSurfaceIntegrityConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "surface_title_mismatch";
}

function isDisclosurePlacementConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "affiliate_disclosure_scope_limited";
}

function isLowConfidencePolicyExtractionConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "low_confidence_policy_extraction";
}

function isConsentSurfaceMissingConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "consent_surface_missing";
}

function isWeakCookieSecurityAttributesConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "weak_cookie_security_attributes";
}

function isAccessibilityRiskScoreConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "accessibility_risk_score";
}

function isBoundedKeyPageDiscoveryUnresolvedConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "bounded_key_page_discovery_unresolved";
}

function isCoverageGapSurfaceMissingConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return COVERAGE_GAP_SURFACE_MISSING_IDS.has(concern.suggestedUnifiedFindingId ?? "");
}

function isCoverageGapUnavailableConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return [
    "privacy_policy_unavailable",
    "terms_unavailable",
    "cookie_policy_unavailable",
    "accessibility_statement_unavailable",
    "contact_page_unavailable"
  ].includes(concern.suggestedUnifiedFindingId ?? "");
}

function isCanonicalPolicyPageType(value: NormalizedConcernPolicyPageType) {
  return value === "privacy_policy" || value === "cookie_policy" || value === "terms_of_service";
}

function normalizeConcernPolicyPageType(value: unknown): NormalizedConcernPolicyPageType {
  switch (value) {
    case "privacy_policy":
    case "cookie_policy":
    case "terms_of_service":
    case "accessibility_statement":
    case "contact_page":
    case "non_policy":
      return value;
    default:
      return null;
  }
}

function getConcernPolicyPrimarySource(
  concern: Pick<NormalizedConcern, "policyIsPrimarySource">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const explicit = derivePolicyPrimarySourceFromEvidence(rawEvidence);

  return explicit ?? concern.policyIsPrimarySource ?? null;
}

function getConcernPolicyPageType(
  concern: Pick<NormalizedConcern, "policyPageType">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const explicit = normalizeConcernPolicyPageType(derivePolicyPageTypeFromEvidence(rawEvidence));

  return explicit ?? concern.policyPageType ?? null;
}

function hasConcreteConsentSurfaceAbsenceEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const explicitNoSurface =
    rawEvidence.consentSurfaceObserved === false ||
    rawEvidence.consent_surface_observed === false ||
    rawEvidence.cookieBannerPresent === false ||
    rawEvidence.consentBannerPresent === false;
  const noMechanismDeclared =
    rawEvidence.consentMechanismType === "none" || rawEvidence.consent_mechanism_type === "none";
  const noCmpDeclared = rawEvidence.cmpVendorName === null || rawEvidence.cmp_vendor_name === null;
  const noInteractionModel =
    rawEvidence.consentInteractionModel === "none" || rawEvidence.consent_interaction_model === "none";

  const corroboratingSignals = [noMechanismDeclared, noCmpDeclared, noInteractionModel].filter(Boolean).length;
  return explicitNoSurface && corroboratingSignals >= 1;
}

function hasMeaningfulWeakCookieAttributeEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const summary =
    rawEvidence?.cookieAttributeSummary && typeof rawEvidence.cookieAttributeSummary === "object"
      ? (rawEvidence.cookieAttributeSummary as Record<string, unknown>)
      : rawEvidence ?? null;
  if (!summary) {
    return false;
  }

  const totalCookiesAnalyzed = getNumberEvidence(summary, ["totalCookiesAnalyzed", "total_cookies_analyzed"]) ?? 0;
  const missingSecureCount = getNumberEvidence(summary, ["missingSecureCount", "missing_secure_count"]) ?? 0;
  const missingHttpOnlyCount = getNumberEvidence(summary, ["missingHttpOnlyCount", "missing_http_only_count"]) ?? 0;
  const weakSameSiteCount = getNumberEvidence(summary, ["weakSameSiteCount", "weak_same_site_count"]) ?? 0;
  const thirdPartyWeakCount =
    getNumberEvidence(summary, ["thirdPartyWeakAttributeCount", "third_party_weak_attribute_count"]) ?? 0;

  const missingSecureNames = getStringArrayValues(summary, ["missingSecureCookieNames", "missing_secure_cookie_names"]);
  const weakSameSiteNames = getStringArrayValues(summary, ["weakSameSiteCookieNames", "weak_same_site_cookie_names"]);
  const thirdPartyWeakNames = getStringArrayValues(summary, [
    "thirdPartyWeakAttributeCookieNames",
    "third_party_weak_attribute_cookie_names"
  ]);

  if (thirdPartyWeakCount >= 1 || thirdPartyWeakNames.length >= 1 || weakSameSiteCount >= 1 || weakSameSiteNames.length >= 1) {
    return true;
  }

  if (missingSecureCount >= 2 || missingSecureNames.length >= 2) {
    return true;
  }

  return totalCookiesAnalyzed >= 3 && (missingSecureCount >= 1 || missingHttpOnlyCount >= 3);
}

function hasMeaningfulGpcIgnoredEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const trackerCountDelta = getNumberEvidence(rawEvidence, ["trackerCountDelta", "tracker_count_delta"]) ?? 0;
  const thirdPartyCookieCountDelta =
    getNumberEvidence(rawEvidence, ["thirdPartyCookieCountDelta", "third_party_cookie_count_delta"]) ?? 0;
  const hasMeaningfulDelta = trackerCountDelta !== 0 || thirdPartyCookieCountDelta !== 0;

  if (!hasMeaningfulDelta) {
    return false;
  }

  const hasReviewerVisibleSupport =
    hasSubstantivePageOrSnippetEvidence(rawEvidence) ||
    getBooleanEvidence(rawEvidence, ["gpcDisclosurePresent", "gpc_disclosure_present"]) === true ||
    getStringArrayValues(rawEvidence, ["policyMentions", "policy_mentions"]).some((value) =>
      /gpc|global privacy control|opt-?out preference/i.test(value)
    );

  return hasReviewerVisibleSupport;
}

function hasSubstantivePageOrSnippetEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getEvidenceUrlCandidates(rawEvidence).length > 0 ||
    getEvidenceTextCandidates(rawEvidence).some(hasMeaningfulReviewerSnippet)
  );
}

function isCommercialEvidenceConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return [
    "discount_claim_present",
    "original_price_comparison_present",
    "limited_time_pressure",
    "restrictive_termination_or_suspension_terms",
    "store_credit_only_remedy",
    "cancellation_method_disclosure_missing"
  ].includes(concern.suggestedUnifiedFindingId ?? "");
}

function hasRepresentativeAccessibilityExamples(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  if (!Array.isArray(rawEvidence.accessibilityRuleExamples) || rawEvidence.accessibilityRuleExamples.length === 0) {
    return false;
  }

  return rawEvidence.accessibilityRuleExamples.some((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    const pageUrl =
      typeof (entry as { pageUrl?: unknown }).pageUrl === "string"
        ? (entry as { pageUrl: string }).pageUrl
        : typeof (entry as { page_url?: unknown }).page_url === "string"
          ? (entry as { page_url: string }).page_url
          : null;
    const ruleId =
      typeof (entry as { ruleId?: unknown }).ruleId === "string"
        ? (entry as { ruleId: string }).ruleId
        : typeof (entry as { rule_id?: unknown }).rule_id === "string"
          ? (entry as { rule_id: string }).rule_id
          : null;
    const selector =
      typeof (entry as { selector?: unknown }).selector === "string"
        ? (entry as { selector: string }).selector
        : typeof (entry as { target?: unknown }).target === "string"
          ? (entry as { target: string }).target
          : null;
    const snippet =
      typeof (entry as { snippet?: unknown }).snippet === "string"
        ? (entry as { snippet: string }).snippet
        : typeof (entry as { message?: unknown }).message === "string"
          ? (entry as { message: string }).message
          : null;

    return Boolean(pageUrl && (ruleId || selector || snippet));
  });
}

function getNumberEvidence(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  for (const key of keys) {
    if (typeof evidence?.[key] === "number" && Number.isFinite(evidence[key] as number)) {
      return evidence[key] as number;
    }
  }

  return null;
}

function getCoverageGapPresenceValue(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const keyMap: Partial<Record<NonNullable<typeof concern.suggestedUnifiedFindingId>, string[]>> = {
    accessibility_statement_missing_surface: ["accessibilityStatementPresent", "accessibility_statement_present"],
    contact_page_missing_surface: ["contactPagePresent", "contact_page_present"],
    cookie_policy_missing_surface: ["cookiePolicyPresent", "cookie_policy_present"],
    privacy_policy_missing_surface: ["privacyPolicyPresent", "privacy_policy_present"],
    terms_missing_surface: ["termsOfServicePresent", "terms_of_service_present"]
  };

  const keys = concern.suggestedUnifiedFindingId ? keyMap[concern.suggestedUnifiedFindingId] : null;
  return keys ? getBooleanEvidence(rawEvidence, keys) : null;
}

function hasStrongCoverageGapSurfaceMissingEvidence(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">,
  input: {
    evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[];
    rawEvidence: Record<string, unknown> | null | undefined;
  }
) {
  const presenceValue = getCoverageGapPresenceValue(concern, input.rawEvidence);
  const attemptedUrls = Array.isArray(input.rawEvidence?.keyPageAttemptedUrls)
    ? input.rawEvidence.keyPageAttemptedUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : Array.isArray(input.rawEvidence?.attemptedUrls)
      ? input.rawEvidence.attemptedUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  const attemptCount =
    getNumberEvidence(input.rawEvidence, ["keyPageAttemptCount", "key_page_attempt_count"]) ?? attemptedUrls.length;
  const representativeSampleCount =
    getNumberEvidence(input.rawEvidence, [
      "representativePageCount",
      "representative_page_count",
      "sitewideSurfaceSampleCount",
      "sitewide_surface_sample_count",
      "surfaceAbsentAcrossTemplatesCount",
      "surface_absent_across_templates_count"
    ]) ?? 0;
  const explicitAbsenceConfirmation =
    getBooleanEvidence(input.rawEvidence, [
      "surfaceMissingConfirmed",
      "surface_missing_confirmed",
      "navSurfaceAbsentConfirmed",
      "nav_surface_absent_confirmed",
      "legalNavSurfaceAbsentConfirmed",
      "legal_nav_surface_absent_confirmed",
      "footerSurfaceAbsentConfirmed",
      "footer_surface_absent_confirmed",
      "headerSurfaceAbsentConfirmed",
      "header_surface_absent_confirmed",
      "sitewideSurfaceMissingConfirmed",
      "sitewide_surface_missing_confirmed"
    ]) === true;
  const hasConcreteReviewerEvidence =
    input.evidenceStrengthFlags.includes("page_attributed") ||
    attemptedUrls.length > 0 ||
    (Array.isArray(input.rawEvidence?.sourceUrls) && input.rawEvidence.sourceUrls.length > 0) ||
    (Array.isArray(input.rawEvidence?.policySnippets) && input.rawEvidence.policySnippets.length > 0);

  if (presenceValue !== false && !explicitAbsenceConfirmation) {
    return false;
  }

  return (
    explicitAbsenceConfirmation ||
    representativeSampleCount >= 2 ||
    (attemptCount >= 2 && hasStableLinkedDiscoveryPath(input.rawEvidence)) ||
    (attemptCount >= 2 && attemptedUrls.length > 0) ||
    (presenceValue === false && hasConcreteReviewerEvidence)
  );
}

function hasExpectedLegalPageCoverage(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const pageCoverageCount = [
    getBooleanEvidence(rawEvidence, ["privacyPolicyPresent", "privacy_policy_present"]),
    getBooleanEvidence(rawEvidence, ["termsOfServicePresent", "terms_of_service_present"]),
    getBooleanEvidence(rawEvidence, ["contactPagePresent", "contact_page_present"]),
    getBooleanEvidence(rawEvidence, ["affiliateDisclosurePresent", "affiliate_disclosure_present"])
  ].filter((value) => value === true).length;

  return pageCoverageCount >= 3;
}

function hasStableLinkedDiscoveryPath(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const discoverySource =
    typeof rawEvidence.keyPageDiscoverySource === "string"
      ? rawEvidence.keyPageDiscoverySource
      : typeof rawEvidence.key_page_discovery_source === "string"
        ? rawEvidence.key_page_discovery_source
        : null;

  return ["footer_link", "header_link", "body_link", "legal_hub", "second_hop_legal_hub"].includes(discoverySource ?? "");
}

function isGuessedOnlyDiscovery(rawEvidence: Record<string, unknown> | null | undefined) {
  return rawEvidence?.keyPageGuessedOnly === true || rawEvidence?.key_page_guessed_only === true;
}

function getPolicyExtractionStatus(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPolicySignalString(rawEvidence, "policyExtractionStatus");
}

function getPolicySemanticConfidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPolicySignalNumber(rawEvidence, "policySemanticConfidence");
}

function getPolicyCoverageRatio(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPolicySignalNumber(rawEvidence, "policyCoverageRatio");
}

function getPolicySnippetCount(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPolicySignalNumber(rawEvidence, "policySnippetCount");
}

function hasStrongStructuredPolicyDisclosureGapEvidence(
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const extractionStatus = getPolicyExtractionStatus(rawEvidence);
  const semanticConfidence = getPolicySemanticConfidence(rawEvidence);
  const coverageRatio = getPolicyCoverageRatio(rawEvidence);
  const snippetCount = getPolicySnippetCount(rawEvidence);

  return (
    extractionStatus === "fetched" &&
    typeof semanticConfidence === "number" &&
    semanticConfidence >= 0.6 &&
    ((typeof coverageRatio === "number" && coverageRatio >= 0.35) ||
      (typeof snippetCount === "number" && snippetCount >= 1))
  );
}

function getPolicyRightsSignals(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPolicySignalStringArray(rawEvidence, "policyRightsSignals");
}

export function concernRequiresPageAttribution(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  const findingId = concern.suggestedUnifiedFindingId;
  if (!findingId) {
    return false;
  }

  return ACCESSIBILITY_PAGE_ATTRIBUTION_IDS.has(findingId);
}

export function isDomainLevelSensitiveContextFinding(unifiedFindingId: string) {
  return DOMAIN_LEVEL_SENSITIVE_CONTEXT_IDS.has(unifiedFindingId);
}

export function isDomainLevelChildrenDisclosureFinding(unifiedFindingId: string) {
  return DOMAIN_LEVEL_CHILDREN_DISCLOSURE_IDS.has(unifiedFindingId);
}

export function packetNeedsPageAttribution(input: {
  family: string | undefined;
  unifiedFindingId: string;
}) {
  return (
    (input.family === "consent_tracking" &&
      !["gpc_signal_not_honored", "weak_cookie_security_attributes", "consent_mechanism_absent", "consent_surface_missing"].includes(input.unifiedFindingId)) ||
    input.family === "contradiction" ||
    (input.family === "sensitive_data" &&
      !isDomainLevelSensitiveContextFinding(input.unifiedFindingId) &&
      !isDomainLevelChildrenDisclosureFinding(input.unifiedFindingId))
  );
}

export function deriveConcernPolicy(input: {
  concern: Pick<
    NormalizedConcern,
    | "canonicalConcernKey"
    | "originKey"
    | "originType"
    | "policyIsPrimarySource"
    | "policyPageType"
    | "suggestedUnifiedFindingId"
    | "title"
  >;
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[];
  rawEvidence?: Record<string, unknown> | null;
}): {
  allowedNarrativeTier: NormalizedConcernAssertionLevel;
  externalSurfacingEligibility: NormalizedConcernExternalSurfacingEligibility;
  negativeEvidenceFlags: NormalizedConcernNegativeEvidenceFlag[];
  promotionEligibility: NormalizedConcernPromotionEligibility;
} {
  const hasDirectRuntime = input.evidenceStrengthFlags.includes("direct_runtime");
  const hasPageAttribution = input.evidenceStrengthFlags.includes("page_attributed");
  const hasKeyPageDiscovery = input.evidenceStrengthFlags.includes("key_page_discovery");
  const negativeEvidenceFlags = new Set<NormalizedConcernNegativeEvidenceFlag>();
  const consentSurfaceObserved = getBooleanEvidence(input.rawEvidence, [
    "consentSurfaceObserved",
    "consent_surface_observed",
    "cookieBannerPresent",
    "consentBannerPresent"
  ]);
  const consentActionableChoiceObserved = getBooleanEvidence(input.rawEvidence, [
    "consentActionableChoiceObserved",
    "consent_actionable_choice_observed",
    "consentRejectInteractionSucceeded",
    "consentAcceptInteractionSucceeded"
  ]);

  if (consentSurfaceObserved === false) {
    negativeEvidenceFlags.add("no_consent_surface_observed");
  }
  if (consentActionableChoiceObserved === false) {
    negativeEvidenceFlags.add("no_consent_actionable_choice_observed");
  }

  if (isLowConfidencePolicyExtractionConcern(input.concern)) {
    const policyPageType = getConcernPolicyPageType(input.concern, input.rawEvidence);
    const isPrimaryPolicySource = getConcernPolicyPrimarySource(input.concern, input.rawEvidence);

    if (!isCanonicalPolicyPageType(policyPageType) || isPrimaryPolicySource !== true) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }
  }

  if (concernRequiresDirectRuntime(input.concern)) {
    const contractDecision = evaluateConcreteRuntimeContract({
      hasConcreteArtifact: hasConcreteSessionReplayEvidence(input.rawEvidence) || hasDirectRuntime,
      missingFlag: "no_direct_runtime_replay_artifact_observed",
      originType: input.concern.originType,
      rawEvidence: input.rawEvidence
    });

    if (
      input.concern.originType === "policy_review_queue" ||
      (contractDecision && contractDecision.promotionEligibility !== "eligible")
    ) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [
          ...negativeEvidenceFlags,
          ...(contractDecision?.negativeEvidenceFlags ?? (hasDirectRuntime ? [] : ["no_direct_runtime_replay_artifact_observed"]))
        ] as NormalizedConcernNegativeEvidenceFlag[],
        promotionEligibility: "internal_only"
      };
    }
  }

  if (
    isRightsFrictionConcern(input.concern) &&
    input.concern.originType !== "validation_rule"
  ) {
    const contractDecision = evaluateStrongEvidenceContract({
      blockedFlag: "possible_policy_runtime_mismatch",
      meetsThreshold: hasStrongRightsFrictionEvidence(input.rawEvidence),
      missingFlag: "runtime_tracking_review_incomplete",
      originType: input.concern.originType
    });

    if (contractDecision) {
      return {
        ...contractDecision,
        negativeEvidenceFlags: [...negativeEvidenceFlags, ...contractDecision.negativeEvidenceFlags] as NormalizedConcernNegativeEvidenceFlag[]
      };
    }
  }

  if (
    isHighSensitivityConcern(input.concern) &&
    !isSensitiveReplayConcern(input.concern) &&
    !isSensitiveThirdPartyTrackingConcern(input.concern) &&
    input.concern.originType !== "validation_rule"
  ) {
    const contractDecision = evaluateStrongEvidenceContract({
      blockedFlag: "runtime_tracking_review_incomplete",
      meetsThreshold: hasSensitivePayloadEvidence(input.rawEvidence),
      missingFlag: "missing_specific_runtime_anchor",
      originType: input.concern.originType
    });

    if (contractDecision) {
      return {
        ...contractDecision,
        negativeEvidenceFlags: [...negativeEvidenceFlags, ...contractDecision.negativeEvidenceFlags] as NormalizedConcernNegativeEvidenceFlag[]
      };
    }
  }

  if (
    isSensitiveReplayConcern(input.concern) &&
    !hasConcreteSensitivePayloadArtifact(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_concrete_sensitive_payload"],
      promotionEligibility: "internal_only"
    };
  }

  if (isSensitiveThirdPartyTrackingConcern(input.concern)) {
    if (!hasConcreteSensitivePayloadArtifact(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_concrete_sensitive_payload"],
        promotionEligibility: "internal_only"
      };
    }

    if (
      !hasConcreteRetargetingArtifact(input.rawEvidence) &&
      !hasConcreteReplayArtifact(input.rawEvidence) &&
      !hasConcreteSanitizedNetworkEvidence(input.rawEvidence)
    ) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_third_party_tracking_artifact"],
        promotionEligibility: "internal_only"
      };
    }
  }

  if (isDsarConcern(input.concern)) {
    const extractionStatus = getPolicyExtractionStatus(input.rawEvidence);
    const rightsSignals = getPolicyRightsSignals(input.rawEvidence);

    if (rightsSignals.length > 0) {
      negativeEvidenceFlags.add("policy_rights_language_observed");
    }
    if (extractionStatus === "fetched") {
      negativeEvidenceFlags.add("policy_target_retrievable");
    }
    if (extractionStatus !== null && extractionStatus !== "fetched") {
      negativeEvidenceFlags.add("policy_target_parsing_incomplete");
    }

    if (extractionStatus !== null && extractionStatus !== "fetched") {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }

    if (rightsSignals.length > 0) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }

    if (input.concern.originType !== "validation_rule" && !hasConcreteDsarEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }
  }

  if (isStructuredPolicyDisclosureGapConcern(input.concern)) {
    const extractionStatus = getPolicyExtractionStatus(input.rawEvidence);

    if (extractionStatus !== "fetched") {
      if (extractionStatus !== null) {
        negativeEvidenceFlags.add("policy_target_parsing_incomplete");
      }

      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }

    if (!hasStrongStructuredPolicyDisclosureGapEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isRetargetingConcern(input.concern)) {
    const contractDecision = evaluateConcreteRuntimeContract({
      hasConcreteArtifact: hasConcreteRetargetingEvidence(input.rawEvidence),
      missingFlag: "no_direct_runtime_retargeting_artifact_observed",
      originType: input.concern.originType,
      rawEvidence: input.rawEvidence
    });

    if (contractDecision && contractDecision.promotionEligibility !== "eligible") {
      return {
        ...contractDecision,
        negativeEvidenceFlags: [...negativeEvidenceFlags, ...contractDecision.negativeEvidenceFlags] as NormalizedConcernNegativeEvidenceFlag[]
      };
    }

    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isContradictionConcern(input.concern)) {
    if (input.concern.suggestedUnifiedFindingId === "policy_behavior_conflict") {
      const contractDecision = evaluatePolicyBehaviorConflictContract(input.rawEvidence);
      if (contractDecision) {
        return {
          ...contractDecision,
          negativeEvidenceFlags: [...negativeEvidenceFlags, ...contractDecision.negativeEvidenceFlags] as NormalizedConcernNegativeEvidenceFlag[]
        };
      }
    }

    const hasPolicyEvidence = hasPolicySideEvidence(input.rawEvidence, input.evidenceStrengthFlags);
    const hasBehaviorEvidence = hasBehaviorSideEvidence(input.rawEvidence, input.evidenceStrengthFlags);

    if (!hasPolicyEvidence) {
      negativeEvidenceFlags.add("missing_policy_side_evidence");
    }
    if (!hasBehaviorEvidence) {
      negativeEvidenceFlags.add("missing_behavior_side_evidence");
    }

    if (!hasBehaviorEvidence || !hasPolicyEvidence) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }
  }

  if (isConsentSurfaceMissingConcern(input.concern) && !hasConcreteConsentSurfaceAbsenceEvidence(input.rawEvidence)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isWeakCookieSecurityAttributesConcern(input.concern) &&
    !hasMeaningfulWeakCookieAttributeEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    input.concern.suggestedUnifiedFindingId === "gpc_signal_not_honored" &&
    !hasMeaningfulGpcIgnoredEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isCommercialEvidenceConcern(input.concern) &&
    input.concern.originType !== "validation_rule" &&
    !hasDirectRuntime &&
    !hasPageAttribution &&
    !hasSubstantivePageOrSnippetEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (isSurfaceIntegrityConcern(input.concern)) {
    if (!hasPageAttribution || !hasSubstantivePageOrSnippetEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isDisclosurePlacementConcern(input.concern)) {
    if (!hasPageAttribution || !hasSubstantivePageOrSnippetEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (
    isDomainLevelSensitiveContextFinding(input.concern.suggestedUnifiedFindingId ?? "") &&
    !hasSubstantivePageOrSnippetEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isAccessibilityRiskScoreConcern(input.concern) &&
    !hasRepresentativeAccessibilityExamples(input.rawEvidence) &&
    input.concern.originType !== "validation_rule"
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isCoverageGapSurfaceMissingConcern(input.concern) &&
    !hasStrongCoverageGapSurfaceMissingEvidence(input.concern, {
      evidenceStrengthFlags: input.evidenceStrengthFlags,
      rawEvidence: input.rawEvidence
    })
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isCoverageGapUnavailableConcern(input.concern) &&
    isGuessedOnlyDiscovery(input.rawEvidence) &&
    !hasStableLinkedDiscoveryPath(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isBoundedKeyPageDiscoveryUnresolvedConcern(input.concern) &&
    hasStableLinkedDiscoveryPath(input.rawEvidence) &&
    hasExpectedLegalPageCoverage(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "suppress",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "blocked"
    };
  }

  if (isBoundedKeyPageDiscoveryUnresolvedConcern(input.concern)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (isFinancialValidationFindingId(input.concern.suggestedUnifiedFindingId)) {
    const inferredFinancialPageClassification =
      input.concern.suggestedUnifiedFindingId === "legal_entity_name_present" ||
      input.concern.suggestedUnifiedFindingId === "operator_contact_path_present"
        ? "identity_or_contact"
        : input.concern.suggestedUnifiedFindingId === "fee_disclosure_present"
          ? "pricing_or_fees"
          : input.concern.suggestedUnifiedFindingId === "investment_risk_disclosure_present" ||
              input.concern.suggestedUnifiedFindingId === "past_performance_disclaimer_present"
            ? "disclosure_or_legal"
            : "financial_offer";
    const evidence = getFinancialValidationEvidenceBundle({
      ...(input.rawEvidence ?? {}),
      pageClassification: inferredFinancialPageClassification
    });

    if (!evidence) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    const judge =
      getStoredFinancialJudgeOutput(input.rawEvidence) ??
      evaluateFinancialJudgeInput({
        candidateFindingId: input.concern.suggestedUnifiedFindingId,
        evidence,
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        scanContext: {
          domain: getFirstString(input.rawEvidence, ["domain", "hostname", "host"]),
          pageType: getFirstString(input.rawEvidence, ["pageType", "page_type"])
        }
      });

    if (judge.verdict === "suppress") {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }

    if (judge.verdict === "keep_audit_only") {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (concernRequiresPageAttribution(input.concern) && !hasDirectRuntime && !hasPageAttribution && !hasKeyPageDiscovery) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (isPositiveInfrastructureConcern(input.concern)) {
    const policyPageType = getConcernPolicyPageType(input.concern, input.rawEvidence);
    const blockedOrInterstitialEvidence = hasBlockedOrInterstitialEvidence(input.rawEvidence);
    const positiveInfrastructureEvidenceGrade = getPositiveInfrastructureEvidenceGrade(input.concern, input.rawEvidence);
    const hasVerifiedContentEvidence = positiveInfrastructureEvidenceGrade === "verified";
    const hasCorroboratedSurfaceEvidence = positiveInfrastructureEvidenceGrade === "corroborated";

    if (input.concern.originType === "policy_enrichment" && policyPageType === "non_policy") {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    if (blockedOrInterstitialEvidence && !hasCorroboratedSurfaceEvidence) {
      negativeEvidenceFlags.add("blocked_or_interstitial_evidence_observed");
    }
    if (!hasVerifiedContentEvidence && !hasCorroboratedSurfaceEvidence) {
      negativeEvidenceFlags.add("positive_surface_content_unverified");
    }

    if (!hasVerifiedContentEvidence && !hasCorroboratedSurfaceEvidence) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: hasVerifiedContentEvidence || hasCorroboratedSurfaceEvidence ? "moderate" : "weak",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isPreconsentConcern(input.concern)) {
    if (input.concern.originType !== "validation_rule") {
      if (!hasConcretePreconsentArtifact(input.rawEvidence)) {
        negativeEvidenceFlags.add("missing_concrete_preconsent_artifact");
      }
      if (!hasPreconsentSequenceEvidence(input.rawEvidence)) {
        negativeEvidenceFlags.add("missing_preconsent_sequence_evidence");
      }

      if (
        negativeEvidenceFlags.has("missing_concrete_preconsent_artifact") ||
        negativeEvidenceFlags.has("missing_preconsent_sequence_evidence")
      ) {
        return {
          allowedNarrativeTier: "weak",
          externalSurfacingEligibility: "audit_only",
          negativeEvidenceFlags: [...negativeEvidenceFlags],
          promotionEligibility: "internal_only"
        };
      }
    }

    const hasStrongConsentTimingEvidence = consentSurfaceObserved === true && consentActionableChoiceObserved === true;

    return {
      allowedNarrativeTier: hasStrongConsentTimingEvidence ? "strong" : "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isDsarConcern(input.concern)) {
    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isReplayConcern(input.concern)) {
    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isContradictionConcern(input.concern)) {
    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  return {
    allowedNarrativeTier: "strong",
    externalSurfacingEligibility: "eligible",
    negativeEvidenceFlags: [...negativeEvidenceFlags],
    promotionEligibility: "eligible"
  };
}
