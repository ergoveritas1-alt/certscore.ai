import {
  hasConcreteDsarEvidence as hasConcreteDsarEvidenceFromConcern,
  hasConcreteSessionReplayEvidence as hasConcreteSessionReplayEvidenceFromConcern,
  isPositiveInfrastructureConcern,
  hasSensitivePayloadEvidence as hasSensitivePayloadEvidenceFromConcern,
  hasStrongRightsFrictionEvidence as hasStrongRightsFrictionEvidenceFromConcern
} from "./concern-policy";
import { normalizeConcernFromReviewFindingCandidate } from "./normalized-concerns";

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
  return hasStrongRightsFrictionEvidenceFromConcern(evidence);
}

export function hasSensitivePayloadEvidence(evidence: Record<string, unknown> | null | undefined) {
  return hasSensitivePayloadEvidenceFromConcern(evidence);
}

export function hasConcreteSessionReplayEvidence(evidence: Record<string, unknown> | null | undefined) {
  return hasConcreteSessionReplayEvidenceFromConcern(evidence);
}

export function hasConcreteDsarEvidence(evidence: Record<string, unknown> | null | undefined) {
  return hasConcreteDsarEvidenceFromConcern(evidence);
}

export function shouldSurfacePrimarySignalFinding(input: {
  fallbackEvidence: Record<string, unknown> | null | undefined;
  key: string;
  linkedValidationEvidence: Record<string, unknown> | null | undefined;
  signalSource?: "snapshot_signal" | "runtime_artifact_signal" | "policy_enrichment_signal" | "document_semantic_signal";
}) {
  const mergedEvidence = {
    ...(input.fallbackEvidence ?? {}),
    ...(input.linkedValidationEvidence ?? {})
  };
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: `Primary signal candidate for ${input.key}.`,
    fallbackEvidence: mergedEvidence,
    observedValue: null,
    severity: "medium",
    signalKey: input.key,
    signalLabel: input.key,
    signalSource: input.signalSource ?? "snapshot_signal",
    sourceType: "signal",
    title: input.key
  });

  if (
    concern.suggestedUnifiedFindingId === "bounded_key_page_discovery_unresolved" &&
    concern.externalSurfacingEligibility !== "suppress"
  ) {
    return true;
  }

  if (
    (input.signalSource === "policy_enrichment_signal" || input.signalSource === "document_semantic_signal") &&
    isPositiveInfrastructureConcern(concern) &&
    concern.externalSurfacingEligibility !== "suppress"
  ) {
    return true;
  }

  return (
    concern.promotionEligibility === "eligible" &&
    concern.externalSurfacingEligibility === "eligible"
  );
}
