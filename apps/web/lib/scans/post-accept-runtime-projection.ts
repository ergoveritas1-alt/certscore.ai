import type {
  PostAcceptLaneOutcome,
  PostAcceptReportProjection,
} from "@certscore/contracts";

/**
 * Maps verified post-Accept evidence into the canonical runtime-artifact
 * boundary. This remains presentation-free and deliberately score-neutral.
 */
export function buildPostAcceptRuntimeProjection(
  projection: PostAcceptReportProjection | null,
  laneOutcome?: PostAcceptLaneOutcome | null,
) {
  const observationTruncated = projection?.limitations.some((limitation) =>
    limitation === "observation_window_aborted_after_confirmed_acceptance" ||
    limitation.startsWith("observer_result_budget_exhausted")
  ) === true;
  const coverageProjection = laneOutcome
    ? {
        completedAt: laneOutcome.completedAt,
        evidenceJoined: laneOutcome.evidenceJoined,
        limitationCode: laneOutcome.limitationCode ??
          (observationTruncated ? "accept_observation_window_truncated" : null),
        maxTailWaitMs: laneOutcome.maxTailWaitMs,
        status: laneOutcome.status === "joined"
          ? observationTruncated ? "limited" : "complete"
          : laneOutcome.status === "not_applicable"
            ? "not_applicable"
            : "limited",
      }
    : null;
  if (!projection) {
    return coverageProjection
      ? {
          postAcceptObservationCoverage: coverageProjection,
          post_accept_observation_coverage: coverageProjection,
        }
      : {};
  }
  const confirmed = projection.productionProjectable &&
    projection.registrationStatus === "confirmed" &&
    projection.acceptanceExercised;
  const activityRows = confirmed
    ? projection.postAcceptActivity.map((row) => ({
        activityType: row.activityType,
        category: row.category ?? "unknown",
        consentState: row.consentState,
        ...(row.hostname ? { hostname: row.hostname } : {}),
        msAfterAccept: row.msAfterAccept,
        nonEssential: true,
        ...(row.requestId ? { requestId: row.requestId } : {}),
        ...(row.storageIdentityHash ? { storageIdentityHash: row.storageIdentityHash } : {}),
        ...(row.storageName ? { storageName: row.storageName } : {}),
        ...(row.storageType ? { storageType: row.storageType } : {}),
        ...(row.url ? { url: row.url } : {}),
        ...(row.vendor ? { vendor: row.vendor } : {}),
      }))
    : [];
  const behaviorProjection = {
    acceptanceInteractionConfirmed: confirmed,
    acceptanceSignalContradictsAction: confirmed && projection.contradictionObserved,
    observationWindowMs: confirmed ? projection.observationWindowMs : null,
    postAcceptActivity: activityRows,
    postAcceptNonEssentialActivityRetained: activityRows.length > 0,
    productionProjectable: projection.productionProjectable,
    reportProjectionContractVersion: projection.contractVersion,
    resolverMethod: projection.resolverMethod,
    scoreEffect: "none" as const,
    ...(projection.packetSha256 ? { sourcePacketSha256: projection.packetSha256 } : {}),
  };
  return {
    ...(coverageProjection
      ? {
          postAcceptObservationCoverage: coverageProjection,
          post_accept_observation_coverage: coverageProjection,
        }
      : {}),
    postAcceptEvidenceProjection: projection,
    post_accept_evidence_projection: projection,
    postAcceptBehaviorEvidence: behaviorProjection,
    post_accept_behavior_evidence: behaviorProjection,
  };
}
