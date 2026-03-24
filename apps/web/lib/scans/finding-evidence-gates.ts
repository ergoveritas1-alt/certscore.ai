export function isRightsFrictionSignal(key: string) {
  return /privacy\.(policy_runtime_functional_misalignment_detected|user_rights_friction_score)/i.test(key);
}

export function isHighSensitivitySignal(key: string) {
  return /commerce\.high_sensitivity_data_collection_detected/i.test(key);
}

export function isSessionReplaySignal(key: string) {
  return /session_replay/i.test(key);
}

export function isDsarSignal(key: string) {
  return /missing_dsar|no_dsar_mechanism/i.test(key);
}

export function hasConcreteConsentEvidence(evidence: Record<string, unknown> | null | undefined) {
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
  const evidencePassCount = typeof evidence.consentEvidencePassCount === "number" ? evidence.consentEvidencePassCount : null;
  const runtimeEvidence = Array.isArray(evidence.runtimeEvidence) ? evidence.runtimeEvidence : [];
  const optInEvidenceLog = Array.isArray(evidence.consentOptInEvidenceLog) ? evidence.consentOptInEvidenceLog : [];
  const optOutEvidenceLog = Array.isArray(evidence.consentOptOutEvidenceLog) ? evidence.consentOptOutEvidenceLog : [];

  return (
    evidence.consentRedirectOrAuthRequired === true ||
    blockerType !== null ||
    blockerUrl !== null ||
    (typeof optInClicks === "number" && typeof optOutClicks === "number") ||
    (typeof frictionDelta === "number" && frictionDelta > 0) ||
    (typeof evidencePassCount === "number" && evidencePassCount > 0) ||
    runtimeEvidence.length > 0 ||
    optInEvidenceLog.length > 0 ||
    optOutEvidenceLog.length > 0
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

function hasTruthyArrayValue(value: unknown) {
  return Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
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

export function shouldSurfacePrimarySignalFinding(input: {
  fallbackEvidence: Record<string, unknown> | null | undefined;
  key: string;
  linkedValidationEvidence: Record<string, unknown> | null | undefined;
}) {
  if (isRightsFrictionSignal(input.key)) {
    return (
      hasStrongRightsFrictionEvidence(input.linkedValidationEvidence) ||
      hasStrongRightsFrictionEvidence(input.fallbackEvidence)
    );
  }

  if (isHighSensitivitySignal(input.key)) {
    return (
      hasSensitivePayloadEvidence(input.linkedValidationEvidence) || hasSensitivePayloadEvidence(input.fallbackEvidence)
    );
  }

  if (isSessionReplaySignal(input.key)) {
    return (
      hasConcreteSessionReplayEvidence(input.linkedValidationEvidence) ||
      hasConcreteSessionReplayEvidence(input.fallbackEvidence)
    );
  }

  if (isDsarSignal(input.key)) {
    return hasConcreteDsarEvidence(input.linkedValidationEvidence) || hasConcreteDsarEvidence(input.fallbackEvidence);
  }

  return true;
}
