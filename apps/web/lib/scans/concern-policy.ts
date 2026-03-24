import type {
  NormalizedConcern,
  NormalizedConcernEvidenceStrengthFlag,
  NormalizedConcernExternalSurfacingEligibility,
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

function hasTruthyArrayValue(value: unknown) {
  return Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
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
    hasTruthyArrayValue(evidence.runtimeEvidence) ||
    hasTruthyArrayValue(evidence.relatedVendors) ||
    hasTruthyArrayValue(evidence.runtimeVendors) ||
    hasTruthyArrayValue(evidence.sessionReplayRuntimeVendors) ||
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

function needsConcretePageAttribution(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  const findingId = concern.suggestedUnifiedFindingId;
  if (!findingId) {
    return false;
  }

  return ACCESSIBILITY_PAGE_ATTRIBUTION_IDS.has(findingId);
}

export function deriveConcernPolicy(input: {
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "originKey" | "originType" | "suggestedUnifiedFindingId" | "title">;
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[];
  rawEvidence?: Record<string, unknown> | null;
}): {
  externalSurfacingEligibility: NormalizedConcernExternalSurfacingEligibility;
  promotionEligibility: NormalizedConcernPromotionEligibility;
} {
  const hasDirectRuntime = input.evidenceStrengthFlags.includes("direct_runtime");
  const hasPageAttribution = input.evidenceStrengthFlags.includes("page_attributed");
  const hasKeyPageDiscovery = input.evidenceStrengthFlags.includes("key_page_discovery");

  if (isReplayConcern(input.concern)) {
    if (input.concern.originType === "policy_review_queue") {
      return {
        externalSurfacingEligibility: "audit_only",
        promotionEligibility: "internal_only"
      };
    }

    if (!hasDirectRuntime) {
      return {
        externalSurfacingEligibility: "audit_only",
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
      externalSurfacingEligibility: "suppress",
      promotionEligibility: "blocked"
    };
  }

  if (
    isHighSensitivityConcern(input.concern) &&
    input.concern.originType !== "validation_rule" &&
    !hasSensitivePayloadEvidence(input.rawEvidence)
  ) {
    return {
      externalSurfacingEligibility: "suppress",
      promotionEligibility: "blocked"
    };
  }

  if (isDsarConcern(input.concern)) {
    const extractionStatus = getPolicyExtractionStatus(input.rawEvidence);
    const rightsSignals = getPolicyRightsSignals(input.rawEvidence);

    if (extractionStatus !== null && extractionStatus !== "fetched") {
      return {
        externalSurfacingEligibility: "suppress",
        promotionEligibility: "blocked"
      };
    }

    if (rightsSignals.length > 0) {
      return {
        externalSurfacingEligibility: "suppress",
        promotionEligibility: "blocked"
      };
    }

    if (input.concern.originType !== "validation_rule" && !hasConcreteDsarEvidence(input.rawEvidence)) {
      return {
        externalSurfacingEligibility: "suppress",
        promotionEligibility: "blocked"
      };
    }
  }

  if (needsConcretePageAttribution(input.concern) && !hasDirectRuntime && !hasPageAttribution && !hasKeyPageDiscovery) {
    return {
      externalSurfacingEligibility: "audit_only",
      promotionEligibility: "internal_only"
    };
  }

  return {
    externalSurfacingEligibility: "eligible",
    promotionEligibility: "eligible"
  };
}
