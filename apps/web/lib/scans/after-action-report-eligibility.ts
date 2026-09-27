import { projectConsentControlReport } from "./consent-control-report";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** The canonical first-layer assessment controls After Accept/Reject visibility.
 * Independent action evidence remains retained but cannot promote an unknown or
 * absent passive control into a reportable After Action path. */
export function isAfterActionReportEligible(assessment: unknown, action: "accept" | "reject"): boolean {
  return projectConsentControlReport(assessment)?.controls[action] === "observed";
}

export function retainedConsentAssessment(value: unknown): unknown {
  const root = record(value);
  const snapshot = record(root?.snapshot);
  const runtime = record(root?.runtimeArtifacts) ?? root;
  const hybrid = record(runtime?.hybridRuntimeEvidence) ?? record(runtime?.hybrid_runtime_evidence);
  return snapshot?.consentControlAssessment ?? snapshot?.consent_control_assessment ??
    runtime?.consentControlAssessment ?? runtime?.consent_control_assessment ??
    hybrid?.consentControlAssessment ?? hybrid?.consent_control_assessment;
}
