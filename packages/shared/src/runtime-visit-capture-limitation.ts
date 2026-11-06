import { scanNoGoAssessmentSchema, terminalLaneEvidenceSchema, type ScanNoGoAssessment } from "@certscore/contracts";
import { resolveScanNoGoPresentation } from "./scan-no-go-reasons";

export function isRuntimeVisitCaptureAssessment(value: unknown): boolean {
  const parsed = scanNoGoAssessmentSchema.safeParse(value);
  return parsed.success && parsed.data.decision === "no_go" &&
    parsed.data.supportingSignals.assessmentPolicy === "runtime_visit_capture_limitation.v1";
}

/** Operational disposition of a trusted scanner terminal result, never a finding
 * or a promotion of the diagnostic's internal-only lane evidence. */
export function projectRuntimeVisitCaptureLimitation(input: {
  scanId: string;
  status: string;
  error?: { code?: string };
  terminalLaneEvidence?: unknown;
}) {
  if (input.status !== "failed" || input.error?.code !== "original_runtime_visit_unavailable") return null;
  const parsed = terminalLaneEvidenceSchema.safeParse(input.terminalLaneEvidence);
  if (!parsed.success || parsed.data.scanId !== input.scanId) return null;
  const diagnostic = parsed.data.runtimeVisitEligibility;
  const source = parsed.data.lanes.find(lane => lane.lane === "runtime_evidence" && lane.status === "verified_retained")?.source;
  if (!diagnostic || !source) return null;
  // Bind the diagnostic to the retained original lane, not a sibling scan.
  let uri: URL;
  try { uri = new URL(source.uri); } catch { return null; }
  if (!uri.hostname || uri.username || uri.password || uri.port || uri.search || uri.hash ||
      !uri.pathname.endsWith(`/${input.scanId}/lanes/runtime_evidence/CanonicalEvidenceBundle.json`)) return null;
  const snapshot = diagnostic.selectedSnapshot;
  const reason = diagnostic.retainedNoGoReason ?? "runtime_capture_unverified";
  const assessment: ScanNoGoAssessment = {
    status: "available",
    version: "scan-no-go-assessment-v1",
    decision: "no_go",
    // Certainty about report eligibility, not about the website's condition.
    scanNoGoConfidence: 1,
    reasonCodes: [reason],
    corroboratorCodes: ["original_runtime_visit_unavailable"],
    contradictorCodes: [],
    supportingSignals: {
      assessmentPolicy: "runtime_visit_capture_limitation.v1",
      runtimeEligibilityReason: diagnostic.reasonCode,
      sourceLane: "runtime_evidence",
      sourceHash: source.sha256,
      snapshotCount: diagnostic.snapshotCount,
      ...(snapshot ? {
        capturedAtMs: snapshot.capturedAtMs,
        documentUrlSha256: snapshot.documentUrlSha256,
        cdpLoaderBound: snapshot.cdpLoaderBound,
        capturedTextObserved: snapshot.hasText,
        capturedTitleObserved: snapshot.hasTitle,
      } : {}),
    },
    evidenceRefs: ["terminalLaneEvidence.runtimeVisitEligibility", "terminalLaneEvidence.lanes.runtime_evidence"],
  };
  return { assessment, presentation: resolveScanNoGoPresentation(reason) };
}
