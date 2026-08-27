import type {
  PostRefusalLaneOutcome,
  PostRefusalReportProjection,
} from "@certscore/contracts";

/**
 * Maps the verified, bounded WS01 Reject observation into the canonical WC01
 * runtime evidence shape consumed by normalized concerns and checklist policy.
 * This mapper is deliberately presentation-free: it cannot create a finding.
 */
export function buildPostRefusalRuntimeProjection(
  projection: PostRefusalReportProjection | null,
  laneOutcome?: PostRefusalLaneOutcome | null,
) {
  const coverageProjection = laneOutcome
    ? {
        completedAt: laneOutcome.completedAt,
        evidenceJoined: laneOutcome.evidenceJoined,
        limitationCode: laneOutcome.limitationCode ?? null,
        maxTailWaitMs: laneOutcome.maxTailWaitMs,
        status: laneOutcome.status === "joined"
          ? "complete"
          : laneOutcome.status === "not_applicable"
            ? "not_applicable"
            : "limited",
      }
    : null;
  if (!projection) {
    if (!coverageProjection) return {};
    if (coverageProjection.status === "not_applicable") {
      return {
        postRefusalObservationCoverage: coverageProjection,
        post_refusal_observation_coverage: coverageProjection,
      };
    }
    const limitationMessage = coverageProjection.limitationCode === "reject_path_timeout"
      ? "Reject Path did not complete within the six-second post-primary allowance."
      : "Reject Path worker failed before verified evidence could be joined.";
    const unavailableReductionEvidence = {
      concretePostRejectNonEssentialDetailsRetained: false,
      postRejectNonEssentialActivityRetained: false,
      postRejectNonEssentialRequestCount: 0,
      postRejectNonEssentialRequests: [],
      postRejectRequestRecordsObserved: false,
      postRejectWindowAvailable: false,
      preConsentStorageNotCleared: false,
      preConsentStorageNotClearedCount: 0,
      preConsentStorageNotClearedItems: [],
      productionProjectable: false,
      reductionEvaluationStatus: "not_testable",
      refusalSignalContradictsAction: false,
      rejectInteractionConfirmed: false,
      rejectInteractionFailureClass: coverageProjection.limitationCode,
      rejectInteractionFailureReason: limitationMessage,
    };
    return {
      postRefusalObservationCoverage: coverageProjection,
      post_refusal_observation_coverage: coverageProjection,
      postRejectTrackingReductionEvidence: unavailableReductionEvidence,
      post_reject_tracking_reduction_evidence: unavailableReductionEvidence,
    };
  }
  const confirmed = projection.productionProjectable &&
    projection.registrationStatus === "confirmed" &&
    projection.refusalExercised;
  const activityRows = confirmed
    ? projection.postRefusalActivity.map((row) => ({
        activityType: row.activityType,
        category: row.category ?? "unknown",
        consentState: row.consentState,
        ...(row.hostname ? { hostname: row.hostname } : {}),
        msAfterReject: row.msAfterReject,
        nonEssential: true,
        nonEssentialReason: "canonical_post_refusal_classification",
        ...(row.requestId ? { requestId: row.requestId } : {}),
        ...(row.storageName
          ? row.storageType === "cookie"
            ? { cookieName: row.storageName }
            : { storageKey: row.storageName }
          : {}),
        ...(row.url ? { url: row.url } : {}),
        ...(row.vendor ? { vendor: row.vendor } : {}),
      }))
    : [];
  const persistedStorage = confirmed
    ? projection.preConsentStorageNotCleared
        .filter((row) => row.exactIdentityVerified && row.sameValueHashVerified)
        .map((row) => ({
          category: row.category ?? "unknown",
          exactIdentityVerified: true,
          name: row.name,
          nonEssential: true,
          sameValueHashVerified: true,
          storageType: row.storageType,
          ...(row.vendor ? { vendor: row.vendor } : {}),
        }))
    : [];
  const activeFailureObserved = activityRows.length > 0 || projection.contradictionObserved;
  const persistenceOnly = persistedStorage.length > 0 && !activeFailureObserved;
  const reductionEvidence = {
    concretePostRejectNonEssentialDetailsRetained: activityRows.length > 0,
    postRejectNonEssentialActivityRetained: activityRows.length > 0,
    postRejectNonEssentialRequestCount: activityRows.length,
    postRejectNonEssentialRequests: activityRows,
    postRejectRequestRecordsObserved: confirmed,
    postRejectWindowAvailable: confirmed,
    observationWindowMs: confirmed ? projection.observationWindowMs : null,
    preConsentStorageNotCleared: persistedStorage.length > 0,
    preConsentStorageNotClearedCount: persistedStorage.length,
    preConsentStorageNotClearedItems: persistedStorage,
    productionProjectable: projection.productionProjectable,
    reductionEvaluationStatus: confirmed
      ? activeFailureObserved || persistenceOnly
        ? "not_reduced"
        : "no_post_reject_non_essential_observed"
      : "not_testable",
    refusalSignalContradictsAction: confirmed && projection.contradictionObserved,
    rejectInteractionConfirmed: confirmed,
    reportProjectionContractVersion: projection.contractVersion,
    resolverMethod: projection.resolverMethod,
    scoreEffect: persistenceOnly ? "none" : "canonical_post_refusal_policy",
    storagePresenceDoesNotEstablishActiveUse: persistedStorage.length > 0,
    ...(projection.packetSha256 ? { sourcePacketSha256: projection.packetSha256 } : {}),
  };
  return {
    ...(coverageProjection
      ? {
          postRefusalObservationCoverage: coverageProjection,
          post_refusal_observation_coverage: coverageProjection,
        }
      : {}),
    postRefusalEvidenceProjection: projection,
    post_refusal_evidence_projection: projection,
    postRejectTrackingReductionEvidence: reductionEvidence,
    post_reject_tracking_reduction_evidence: reductionEvidence,
  };
}
