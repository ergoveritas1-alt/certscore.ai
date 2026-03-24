import type {
  NormalizedConcern,
  NormalizedConcernAssertionLevel,
  NormalizedConcernEvidenceStrengthFlag,
  NormalizedConcernExternalSurfacingEligibility,
  NormalizedConcernNegativeEvidenceFlag,
  NormalizedConcernPromotionEligibility
} from "./normalized-concerns";

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

  return (
    evidence.consentRedirectOrAuthRequired === true ||
    blockerType !== null ||
    blockerUrl !== null ||
    (typeof frictionDelta === "number" && frictionDelta > 0) ||
    (typeof optInClicks === "number" && typeof optOutClicks === "number" && optOutClicks > optInClicks)
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

  return /user_rights_friction|functional_misalignment|policy_runtime_functional_misalignment/.test(haystack);
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
  return (
    evidenceStrengthFlags.includes("direct_runtime") ||
    evidenceStrengthFlags.includes("concrete_payload") ||
    hasTruthyArrayValue(rawEvidence?.runtimeEvidence) ||
    hasTruthyArrayValue(rawEvidence?.runtimeEvidenceArtifacts) ||
    hasTruthyArrayValue(rawEvidence?.runtime_evidence_artifacts)
  );
}

function hasPolicySideEvidence(
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[],
  rawEvidence: Record<string, unknown> | null | undefined
) {
  return (
    evidenceStrengthFlags.includes("policy_text") ||
    typeof rawEvidence?.claim === "string" ||
    typeof rawEvidence?.policySummary === "string" ||
    typeof rawEvidence?.policySummaryShort === "string" ||
    typeof rawEvidence?.policy_summary_short === "string"
  );
}

function hasContradictionMappingEvidence(
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[],
  rawEvidence: Record<string, unknown> | null | undefined
) {
  return (
    evidenceStrengthFlags.includes("structured_validation") ||
    typeof rawEvidence?.claim === "string" ||
    hasTruthyArrayValue(rawEvidence?.supportingSignals)
  );
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
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "originKey" | "originType" | "suggestedUnifiedFindingId" | "title">;
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

  if (isContradictionConcern(input.concern)) {
    const hasBehaviorEvidence = hasBehaviorSideEvidence(input.evidenceStrengthFlags, input.rawEvidence);
    const hasPolicyEvidence = hasPolicySideEvidence(input.evidenceStrengthFlags, input.rawEvidence);
    const hasMappingEvidence = hasContradictionMappingEvidence(input.evidenceStrengthFlags, input.rawEvidence);

    if (!hasBehaviorEvidence) {
      negativeEvidenceFlags.add("missing_behavior_side_evidence");
    }
    if (!hasPolicyEvidence) {
      negativeEvidenceFlags.add("missing_policy_side_evidence");
    }
    if (!hasMappingEvidence) {
      negativeEvidenceFlags.add("missing_contradiction_mapping");
    }

    if (!hasBehaviorEvidence || !hasPolicyEvidence || !hasMappingEvidence) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }
  }

  if (concernRequiresPageAttribution(input.concern) && !hasDirectRuntime && !hasPageAttribution && !hasKeyPageDiscovery) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (isPreconsentConcern(input.concern)) {
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
