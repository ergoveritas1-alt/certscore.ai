import type { PolicySurfaceInspectionOutcome } from "@certscore/contracts";

export function isCompletePrivacyPolicyAbsence(inspection: PolicySurfaceInspectionOutcome) {
  return inspection.outcome === "no_privacy_policy_observed_complete_coverage" &&
    inspection.coverageStatus === "complete" &&
    inspection.linkDiscoveryCoverageStatus === "complete" &&
    inspection.documentRetrievalCoverageStatus !== "usable" &&
    inspection.inspectionCompleted &&
    !inspection.privacyPolicyObserved &&
    !inspection.observedSurfaceTypes.includes("privacy_policy") &&
    inspection.limitationKeys.length === 0;
}
