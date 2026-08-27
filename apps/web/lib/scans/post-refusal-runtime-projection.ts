import type { PostRefusalReportProjection } from "@certscore/contracts";

/**
 * Maps the verified, bounded WS01 supplement into the canonical WC01 runtime
 * evidence shape consumed by normalized concerns and checklist policy. This
 * mapper is deliberately presentation-free: it cannot create a finding.
 */
export function buildPostRefusalRuntimeProjection(
  projection: PostRefusalReportProjection | null,
) {
  if (!projection) return {};
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
    ? projection.preConsentStorageNotCleared.map((row) => ({
        category: row.category ?? "unknown",
        name: row.name,
        nonEssential: true,
        storageType: row.storageType,
        ...(row.vendor ? { vendor: row.vendor } : {}),
      }))
    : [];
  const failureObserved = activityRows.length > 0 ||
    persistedStorage.length > 0 ||
    projection.contradictionObserved;
  const reductionEvidence = {
    concretePostRejectNonEssentialDetailsRetained: activityRows.length > 0,
    postRejectNonEssentialActivityRetained: activityRows.length > 0,
    postRejectNonEssentialRequestCount: activityRows.length,
    postRejectNonEssentialRequests: activityRows,
    postRejectRequestRecordsObserved: confirmed,
    postRejectWindowAvailable: confirmed,
    preConsentStorageNotCleared: persistedStorage.length > 0,
    preConsentStorageNotClearedCount: persistedStorage.length,
    preConsentStorageNotClearedItems: persistedStorage,
    productionProjectable: projection.productionProjectable,
    reductionEvaluationStatus: confirmed
      ? failureObserved ? "not_reduced" : "no_post_reject_non_essential_observed"
      : "not_testable",
    refusalSignalContradictsAction: confirmed && projection.contradictionObserved,
    rejectInteractionConfirmed: confirmed,
    reportProjectionContractVersion: projection.contractVersion,
    ...(projection.packetSha256 ? { sourcePacketSha256: projection.packetSha256 } : {}),
  };
  return {
    postRefusalEvidenceProjection: projection,
    post_refusal_evidence_projection: projection,
    postRejectTrackingReductionEvidence: reductionEvidence,
    post_reject_tracking_reduction_evidence: reductionEvidence,
  };
}
