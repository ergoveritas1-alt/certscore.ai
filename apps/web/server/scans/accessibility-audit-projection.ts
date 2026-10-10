import {
  accessibilityAuditObservationSchema, accessibilityAuditProjectionSchema,
  type AccessibilityAuditObservation, type CanonicalEvidenceBundle,
} from "@certscore/contracts";

/** Materialization consumes the original checksum-verified canonical bundle only. */
export function projectAccessibilityAudit(bundle: CanonicalEvidenceBundle, source: {
  verificationStatus?: string; sha256?: string;
} | undefined, documentUrl: string | null) {
  if (!bundle.accessibilityAudit) return null; // Preserve historical results.
  if (source?.verificationStatus !== "verified" || !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")) {
    throw new Error("Required accessibility evidence must be checksum-verified before publication.");
  }
  const result = accessibilityAuditObservationSchema.safeParse(bundle.accessibilityAudit);
  if (!result.success || result.data.scanId !== bundle.scanId) {
    throw new Error("Required accessibility evidence is malformed or belongs to another scan.");
  }
  let observation = result.data;
  const start = Date.parse(bundle.startedAt), end = Date.parse(bundle.completedAt);
  const snapshot = [...(bundle.runtimeMetadataSnapshots ?? bundle.domSnapshots ?? [])]
    .filter(row => row.consentStateAtTime === "pre_consent")
    .sort((left, right) => right.capturedAtMs - left.capturedAtMs)[0];
  const bound = observation.documentUrl === documentUrl && snapshot?.url === observation.documentUrl &&
    snapshot.documentIdentity?.token === observation.documentToken && Boolean(observation.documentToken) &&
    Number.isFinite(start) && Number.isFinite(end) &&
    Date.parse(observation.startedAt) >= start && Date.parse(observation.completedAt) <= end;
  // Failed/not-testable observations contain no evaluable results. Preserve
  // their actual coverage reason rather than inventing a binding failure.
  if (!bound && observation.status !== "failed" && observation.status !== "not_testable") {
    observation = { ...observation, status: "limited", rulesEvaluated: [], violations: [], reviewItems: [], limitations: ["evidence_binding_invalid"] };
  }
  return accessibilityAuditProjectionSchema.parse({
    contractVersion: "certscore.accessibility-audit-projection.v1", verificationStatus: "verified",
    sourceHash: source.sha256, evidenceRef: "CanonicalEvidenceBundle.json#accessibilityAudit", observation,
  });
}

export { accessibilityExamples } from "../../lib/scans/accessibility-audit-evidence";
