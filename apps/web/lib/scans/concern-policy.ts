import type {
  NormalizedConcern,
  NormalizedConcernAssertionLevel,
  NormalizedConcernEvidenceStrengthFlag,
  NormalizedConcernExternalSurfacingEligibility,
  NormalizedConcernNegativeEvidenceFlag,
  NormalizedConcernPolicyPageType,
  NormalizedConcernPromotionEligibility
} from "./normalized-concerns";
import { getContradictionEvidenceBundle } from "./contradiction-evidence-contract";
import {
  evaluateFinancialJudgeInput,
  getFinancialValidationEvidenceBundle,
  isFinancialValidationFindingId
} from "./financial-validation-contract";
import { getStoredFinancialJudgeOutput } from "./financial-judge-contract";

const ACCESSIBILITY_PAGE_ATTRIBUTION_IDS = new Set([
  "wcag_issue_summary",
  "accessibility_risk_score",
  "contrast_failures",
  "form_label_issues",
  "link_name_issues",
  "keyboard_navigation_issues",
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

function hasVerifiedPositiveInfrastructureEvidence(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const fetchQuality = getFetchQuality(rawEvidence);
  if (!rawEvidence || fetchQuality === "blocked_interstitial" || fetchQuality === "unreachable" || hasBlockedOrInterstitialEvidence(rawEvidence)) {
    return false;
  }

  const urls = getEvidenceUrlCandidates(rawEvidence);
  const snippets = getEvidenceTextCandidates(rawEvidence);
  if (concern.suggestedUnifiedFindingId === "accessibility_support_path_present") {
    const accessibilityHaystack = `${urls.join(" ")} ${snippets.join(" ")}`.toLowerCase();
    return (
      rawEvidence.accessibilityContactMethodPresent === true ||
      (fetchQuality !== "thin_content" && urls.length > 0 && snippets.length > 0 && /accessibility|accommodation|caption|assistive/i.test(accessibilityHaystack))
    );
  }

  if (fetchQuality === "thin_content" || urls.length === 0 || snippets.length === 0) {
    return false;
  }

  const haystack = `${urls.join(" ")} ${snippets.join(" ")}`.toLowerCase();

  switch (concern.suggestedUnifiedFindingId) {
    case "contact_support_path_present":
    case "operator_contact_path_present":
      return /contact|help|support|feedback|chat|branch|call/i.test(haystack);
    case "cookie_policy_present":
      return /cookie|privacy choices|privacy settings|manage cookies/i.test(haystack);
    case "privacy_policy_present":
      return /privacy/i.test(haystack);
    case "terms_of_service_present":
      return /terms|conditions|tos/i.test(haystack);
    case "accessibility_support_path_present":
      return /accessibility|accommodation|caption|assistive/i.test(haystack);
    case "targeted_advertising_choices_present":
      return /do not sell|opt out|privacy choices|ad choices|targeted advertising/i.test(haystack);
    case "privacy_rights_path_present":
      return (
        Array.isArray(rawEvidence.policyRightsSignals) && rawEvidence.policyRightsSignals.length > 0
      ) || /privacy rights|rights center|delete request|access request|request access|access to|deletion|data request/i.test(haystack);
    default:
      return snippets.some((value) => value.trim().length >= 8);
  }
}

function hasConcretePreconsentArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const vendors = getStringArrayValues(rawEvidence, [
    "preconsent_tracker_vendors",
    "relatedVendors",
    "runtimeVendors",
    "runtime_vendors"
  ]);
  const urls = getStringArrayValues(rawEvidence, [
    "preconsent_tracker_evidence_urls",
    "requestUrls",
    "runtimeEvidenceUrls"
  ]).filter((value) => /^https?:\/\//i.test(value));

  return vendors.length > 0 || urls.length > 0;
}

function hasPreconsentSequenceEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const hasExplicitTimingSignal =
    rawEvidence.preconsentTrackingDetected === true ||
    rawEvidence.preconsent_tracking_detected === true ||
    rawEvidence.trackingBeforeConsentDetected === true ||
    rawEvidence.tracking_before_consent_detected === true;
  const hasConsentTimingContext =
    getBooleanEvidence(rawEvidence, [
      "consentSurfaceObserved",
      "consent_surface_observed",
      "consentBannerPresent",
      "cookieBannerPresent"
    ]) === true &&
    getBooleanEvidence(rawEvidence, [
      "consentActionableChoiceObserved",
      "consent_actionable_choice_observed",
      "consentRejectInteractionSucceeded",
      "consentAcceptInteractionSucceeded"
    ]) === true;
  const supportingSignals = getStringArrayValues(rawEvidence, ["supportingSignals"]);

  return (
    hasExplicitTimingSignal ||
    hasConsentTimingContext ||
    supportingSignals.some((value) => /pre-?consent|before consent|trackers?_before_consent/i.test(value))
  );
}

export function hasStrongRightsFrictionEvidence(evidence: Record<string, unknown> | null | undefined) {
  if (!evidence) {
    return false;
  }

  const optInClicks =
    typeof evidence.consentOptInClicks === "number"
      ? evidence.consentOptInClicks
      : typeof evidence.consent_accept_click_count === "number"
        ? evidence.consent_accept_click_count
        : null;
  const optOutClicks =
    typeof evidence.consentOptOutClicks === "number"
      ? evidence.consentOptOutClicks
      : typeof evidence.consent_reject_click_count === "number"
        ? evidence.consent_reject_click_count
        : null;
  const frictionDelta = typeof evidence.consentFrictionDelta === "number" ? evidence.consentFrictionDelta : null;
  const blockerType = typeof evidence.consentBlockerType === "string" ? evidence.consentBlockerType : null;
  const blockerUrl = typeof evidence.consentBlockerUrl === "string" ? evidence.consentBlockerUrl : null;
  const blockerSnippet =
    typeof evidence.consentBlockerTextSnippet === "string" ? evidence.consentBlockerTextSnippet.trim() : null;
  const evidencePassCount =
    typeof evidence.consentEvidencePassCount === "number" ? evidence.consentEvidencePassCount : null;
  const policyRightsSignals = Array.isArray(evidence.policyRightsSignals)
    ? evidence.policyRightsSignals
    : Array.isArray(evidence.policy_rights_signals)
      ? evidence.policy_rights_signals
      : [];

  const redirectGate = evidence.consentRedirectOrAuthRequired === true;
  const blockerPresent = blockerType !== null || blockerUrl !== null;
  const repeatedDeadEnd =
    typeof frictionDelta === "number" &&
    frictionDelta >= 2 &&
    typeof optOutClicks === "number" &&
    optOutClicks >= 2;
  const blockerBackedByEvidence =
    blockerPresent &&
    typeof evidencePassCount === "number" &&
    evidencePassCount >= 2 &&
    blockerSnippet !== null &&
    blockerSnippet.length >= 40;
  const redirectBackedByEvidence =
    redirectGate &&
    typeof evidencePassCount === "number" &&
    evidencePassCount >= 2 &&
    (blockerPresent || (typeof blockerSnippet === "string" && blockerSnippet.length >= 40));
  const asymmetricClicksWithoutRightsPath =
    typeof optInClicks === "number" &&
    typeof optOutClicks === "number" &&
    optOutClicks > optInClicks &&
    policyRightsSignals.length === 0;

  return (
    redirectBackedByEvidence ||
    blockerBackedByEvidence ||
    repeatedDeadEnd ||
    asymmetricClicksWithoutRightsPath
  );
}

export function hasSensitivePayloadEvidence(evidence: Record<string, unknown> | null | undefined) {
  if (!evidence) {
    return false;
  }

  const directViolations = Array.isArray(evidence.sensitivePayloadViolations)
    ? evidence.sensitivePayloadViolations
    : Array.isArray(evidence.sensitive_payload_violations)
      ? evidence.sensitive_payload_violations
      : [];

  return directViolations.some(
    (entry) =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as { requestUrl?: unknown }).requestUrl === "string" &&
      ((entry as { requestUrl?: string }).requestUrl?.length ?? 0) > 0
  );
}

export function hasConcreteSessionReplayEvidence(evidence: Record<string, unknown> | null | undefined) {
  if (!evidence) {
    return false;
  }

  return (
    hasTruthyArrayValue(evidence.runtimeEvidenceArtifacts) ||
    hasTruthyArrayValue(evidence.session_replay_runtime_artifacts) ||
    hasTruthyArrayValue(evidence.runtimeEvidence) ||
    evidence.sessionReplayVendorArtifactPresent === true ||
    evidence.session_replay_vendor_artifact_present === true
  );
}

export function hasConcreteRetargetingEvidence(evidence: Record<string, unknown> | null | undefined) {
  if (!evidence) {
    return false;
  }

  return (
    hasTruthyArrayValue(evidence.runtimeEvidence) ||
    hasTruthyArrayValue(evidence.runtimeEvidenceArtifacts) ||
    hasTruthyArrayValue(evidence.runtime_evidence_artifacts) ||
    hasTruthyArrayValue(evidence.retargetingEvidenceUrls) ||
    hasTruthyArrayValue(evidence.retargeting_evidence_urls) ||
    hasTruthyArrayValue(evidence.runtimeEvidenceUrls) ||
    evidence.retargetingPixelArtifactPresent === true ||
    evidence.retargeting_pixel_artifact_present === true
  );
}

export function hasConcreteDsarEvidence(evidence: Record<string, unknown> | null | undefined) {
  if (!evidence) {
    return false;
  }

  const dsarMechanism =
    typeof evidence.policyDsarMechanism === "string"
      ? evidence.policyDsarMechanism
      : typeof evidence.policy_dsar_mechanism === "string"
        ? evidence.policy_dsar_mechanism
        : null;
  const policySemanticConfidence =
    typeof evidence.policySemanticConfidence === "number"
      ? evidence.policySemanticConfidence
      : typeof evidence.policy_semantic_confidence === "number"
        ? evidence.policy_semantic_confidence
        : null;
  const extractionStatus =
    typeof evidence.policyExtractionStatus === "string"
      ? evidence.policyExtractionStatus
      : typeof evidence.policy_extraction_status === "string"
        ? evidence.policy_extraction_status
        : null;
  const policyRightsSignals = Array.isArray(evidence.policyRightsSignals)
    ? evidence.policyRightsSignals
    : Array.isArray(evidence.policy_rights_signals)
      ? evidence.policy_rights_signals
      : [];

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

  return /high_sensitivity_data_collection/.test(haystack);
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

function isPositiveInfrastructureConcern(
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

function isCanonicalPolicyPageType(value: NormalizedConcernPolicyPageType) {
  return value === "privacy_policy" || value === "cookie_policy" || value === "terms_of_service";
}

function getConcernPolicyPrimarySource(
  concern: Pick<NormalizedConcern, "policyIsPrimarySource">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const explicit =
    typeof rawEvidence?.normalizedConcernPolicyIsPrimarySource === "boolean"
      ? rawEvidence.normalizedConcernPolicyIsPrimarySource
      : typeof rawEvidence?.policyIsPrimarySource === "boolean"
        ? rawEvidence.policyIsPrimarySource
        : typeof rawEvidence?.policy_is_primary_source === "boolean"
          ? rawEvidence.policy_is_primary_source
          : typeof rawEvidence?.isPrimaryPolicy === "boolean"
            ? rawEvidence.isPrimaryPolicy
            : typeof rawEvidence?.is_primary_policy === "boolean"
              ? rawEvidence.is_primary_policy
              : typeof rawEvidence?.isPrimaryPolicyEnrichment === "boolean"
                ? rawEvidence.isPrimaryPolicyEnrichment
                : typeof rawEvidence?.is_primary_policy_enrichment === "boolean"
                  ? rawEvidence.is_primary_policy_enrichment
                  : null;

  return explicit ?? concern.policyIsPrimarySource ?? null;
}

function getConcernPolicyPageType(
  concern: Pick<NormalizedConcern, "policyPageType">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const explicit =
    (typeof rawEvidence?.normalizedConcernPolicyPageType === "string"
      ? rawEvidence.normalizedConcernPolicyPageType
      : typeof rawEvidence?.policyPageType === "string"
        ? rawEvidence.policyPageType
        : typeof rawEvidence?.policy_page_type === "string"
          ? rawEvidence.policy_page_type
          : typeof rawEvidence?.pageType === "string"
            ? rawEvidence.pageType
            : typeof rawEvidence?.page_type === "string"
              ? rawEvidence.page_type
              : null) as NormalizedConcernPolicyPageType;

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
  if (!rawEvidence?.cookieAttributeSummary || typeof rawEvidence.cookieAttributeSummary !== "object") {
    return false;
  }

  const summary = rawEvidence.cookieAttributeSummary as Record<string, unknown>;
  const missingSecureCount = typeof summary.missingSecureCount === "number" ? summary.missingSecureCount : 0;
  const weakSameSiteCount = typeof summary.weakSameSiteCount === "number" ? summary.weakSameSiteCount : 0;
  const thirdPartyWeakCount =
    typeof summary.thirdPartyWeakAttributeCount === "number" ? summary.thirdPartyWeakAttributeCount : 0;

  const missingSecureNames = Array.isArray(summary.missingSecureCookieNames) ? summary.missingSecureCookieNames : [];
  const weakSameSiteNames = Array.isArray(summary.weakSameSiteCookieNames) ? summary.weakSameSiteCookieNames : [];
  const thirdPartyWeakNames = Array.isArray(summary.thirdPartyWeakAttributeCookieNames)
    ? summary.thirdPartyWeakAttributeCookieNames
    : [];

  return (
    missingSecureCount > 0 ||
    weakSameSiteCount > 0 ||
    thirdPartyWeakCount > 0 ||
    missingSecureNames.length > 0 ||
    weakSameSiteNames.length > 0 ||
    thirdPartyWeakNames.length > 0
  );
}

function hasRepresentativeAccessibilityExamples(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  return (
    Array.isArray(rawEvidence.accessibilityRuleExamples) && rawEvidence.accessibilityRuleExamples.length > 0
  );
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

function getPolicyExtractionStatus(rawEvidence: Record<string, unknown> | null | undefined) {
  return typeof rawEvidence?.policyExtractionStatus === "string"
    ? rawEvidence.policyExtractionStatus
    : typeof rawEvidence?.policy_extraction_status === "string"
      ? rawEvidence.policy_extraction_status
      : null;
}

function getPolicyRightsSignals(rawEvidence: Record<string, unknown> | null | undefined) {
  return Array.isArray(rawEvidence?.policyRightsSignals)
    ? rawEvidence.policyRightsSignals
    : Array.isArray(rawEvidence?.policy_rights_signals)
      ? rawEvidence.policy_rights_signals
      : [];
}

function hasBehaviorSideEvidence(
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[],
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const contradictionEvidence = getContradictionEvidenceBundle(rawEvidence);
  return (
    evidenceStrengthFlags.includes("direct_runtime") ||
    evidenceStrengthFlags.includes("concrete_payload") ||
    hasTruthyArrayValue(rawEvidence?.runtimeEvidence) ||
    hasTruthyArrayValue(rawEvidence?.runtimeEvidenceArtifacts) ||
    hasTruthyArrayValue(rawEvidence?.runtime_evidence_artifacts) ||
    (contradictionEvidence?.runtimeEvidenceArtifacts.length ?? 0) > 0
  );
}

function hasPolicySideEvidence(
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[],
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const contradictionEvidence = getContradictionEvidenceBundle(rawEvidence);
  return (
    evidenceStrengthFlags.includes("policy_text") ||
    typeof rawEvidence?.claim === "string" ||
    typeof rawEvidence?.policySummary === "string" ||
    typeof rawEvidence?.policySummaryShort === "string" ||
    typeof rawEvidence?.policy_summary_short === "string" ||
    Boolean(contradictionEvidence?.policySnippet) ||
    Boolean(contradictionEvidence?.claim)
  );
}

function hasContradictionMappingEvidence(
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[],
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const contradictionEvidence = getContradictionEvidenceBundle(rawEvidence);
  return (
    evidenceStrengthFlags.includes("structured_validation") ||
    typeof rawEvidence?.claim === "string" ||
    hasTruthyArrayValue(rawEvidence?.supportingSignals) ||
    (contradictionEvidence?.supportingSignals.length ?? 0) > 0
  );
}

function hasExplicitContradictionBasisEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const contradictionEvidence = getContradictionEvidenceBundle(rawEvidence);
  return Boolean(contradictionEvidence?.contradictionBasis);
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
    if (!hasDirectRuntime) {
      negativeEvidenceFlags.add("no_direct_runtime_replay_artifact_observed");
    }

    if (input.concern.originType === "policy_review_queue") {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    if (!hasDirectRuntime) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }
  }

  if (
    isRightsFrictionConcern(input.concern) &&
    input.concern.originType !== "validation_rule" &&
    !hasStrongRightsFrictionEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "suppress",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "blocked"
    };
  }

  if (
    isHighSensitivityConcern(input.concern) &&
    input.concern.originType !== "validation_rule" &&
    !hasSensitivePayloadEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "suppress",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "blocked"
    };
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

  if (isRetargetingConcern(input.concern)) {
    const hasConcreteRetargetingRuntime = hasConcreteRetargetingEvidence(input.rawEvidence);

    if (!hasConcreteRetargetingRuntime) {
      negativeEvidenceFlags.add("no_direct_runtime_retargeting_artifact_observed");
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "eligible"
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
    const hasBehaviorEvidence = hasBehaviorSideEvidence(input.evidenceStrengthFlags, input.rawEvidence);
    const hasPolicyEvidence = hasPolicySideEvidence(input.evidenceStrengthFlags, input.rawEvidence);
    const hasMappingEvidence = hasContradictionMappingEvidence(input.evidenceStrengthFlags, input.rawEvidence);
    const requiresExplicitBasis = input.concern.suggestedUnifiedFindingId === "policy_behavior_conflict";
    const hasExplicitBasis = !requiresExplicitBasis || hasExplicitContradictionBasisEvidence(input.rawEvidence);

    if (!hasBehaviorEvidence) {
      negativeEvidenceFlags.add("missing_behavior_side_evidence");
    }
    if (!hasPolicyEvidence) {
      negativeEvidenceFlags.add("missing_policy_side_evidence");
    }
    if (!hasMappingEvidence) {
      negativeEvidenceFlags.add("missing_contradiction_mapping");
    }
    if (!hasExplicitBasis) {
      negativeEvidenceFlags.add("missing_explicit_contradiction_basis");
    }

    if (!hasBehaviorEvidence || !hasPolicyEvidence || !hasMappingEvidence || !hasExplicitBasis) {
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
    const hasVerifiedContentEvidence = hasVerifiedPositiveInfrastructureEvidence(input.concern, input.rawEvidence);

    if (input.concern.originType === "policy_enrichment" && policyPageType === "non_policy") {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    if (blockedOrInterstitialEvidence) {
      negativeEvidenceFlags.add("blocked_or_interstitial_evidence_observed");
    }
    if (!hasVerifiedContentEvidence) {
      negativeEvidenceFlags.add("positive_surface_content_unverified");
    }

    if (blockedOrInterstitialEvidence || !hasVerifiedContentEvidence) {
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
