import type { CanonicalEvidenceBundle, DomSnapshotArtifact } from "./index";
import { classifyRuntimeErrorPage } from "./runtime-error-page";

export const RUNTIME_VISIT_REJECTION_REASONS = [
  "runtime_no_go", "runtime_coverage_unavailable", "runtime_lane_unavailable",
  "runtime_navigation_unverified", "invalid_final_url", "runtime_snapshot_unavailable",
  "runtime_document_unverified", "runtime_content_unavailable", "runtime_document_conflict",
  "runtime_error_page",
] as const;
export type RuntimeVisitRejectionReason = typeof RUNTIME_VISIT_REJECTION_REASONS[number];
type RuntimeVisitAssessment = { status: "usable"; snapshot: DomSnapshotArtifact } |
  { status: "unavailable"; reasonCode: RuntimeVisitRejectionReason };

/** The original runtime visit used by usable_starting_page_score.v1. Callers
 * must verify the source bundle first and explicitly select lane-owned DOM. */
export function getUsableRuntimeVisitSnapshot(
  bundle: CanonicalEvidenceBundle,
  snapshots: readonly DomSnapshotArtifact[],
  finalUrl?: string,
): DomSnapshotArtifact | undefined {
  const assessment = assessRuntimeVisitSnapshot(bundle, snapshots, finalUrl);
  return assessment.status === "usable" ? assessment.snapshot : undefined;
}

/** The same eligibility decision supplies bounded failure diagnostics. It never
 * borrows another session or changes the retained bundle. */
export function assessRuntimeVisitSnapshot(
  bundle: CanonicalEvidenceBundle,
  snapshots: readonly DomSnapshotArtifact[],
  finalUrl?: string,
): RuntimeVisitAssessment {
  const unavailable = (reasonCode: RuntimeVisitRejectionReason): RuntimeVisitAssessment => ({ status: "unavailable", reasonCode });
  const lane = bundle.scanLaneRuns?.find(row => row.laneId === "runtime_evidence");
  const assessments = [bundle.scanEvidenceLaneAssessment, bundle.scan_evidence_lane_assessment].filter(Boolean);
  if (bundle.scanNoGoAssessment?.decision === "no_go" || bundle.scan_no_go_assessment?.decision === "no_go" ||
      assessments.some(row => row!.outcome === "no_go" || row!.lanes.homepageRuntime === "unusable")) return unavailable("runtime_no_go");
  if (!["usable", "limited_partial"].includes(bundle.runtimeCoverage?.coverageStatus ?? "") || bundle.runtimeCoverage?.silentEmpty)
    return unavailable("runtime_coverage_unavailable");
  if (!lane || !["success", "degraded"].includes(lane.executionOutcome) ||
      lane.accessOutcome !== "representative_page" || lane.challengeDetected) return unavailable("runtime_lane_unavailable");
  if (lane.executionOutcome === "degraded" && !lane.navigationAttempts?.some(attempt =>
    attempt.outcome === "success" && typeof attempt.httpStatus === "number" &&
    attempt.httpStatus >= 200 && attempt.httpStatus < 300)) return unavailable("runtime_navigation_unverified");
  const documentUrl = (value: string) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : null;
    } catch { return null; }
  };
  const expected = finalUrl === undefined ? undefined : documentUrl(finalUrl);
  if (expected === null) return unavailable("invalid_final_url");
  const snapshot = [...snapshots].sort((a, b) => b.capturedAtMs - a.capturedAtMs)[0];
  if (!snapshot) return unavailable("runtime_snapshot_unavailable");
  if (!Number.isFinite(snapshot.capturedAtMs) || snapshot.capturedAtMs < 0 ||
      !documentUrl(snapshot.url) || (expected !== undefined && documentUrl(snapshot.url) !== expected) ||
      snapshot.documentIdentity?.source !== "cdp_loader_id" || !snapshot.documentIdentity.token ||
      !snapshot.artifactId || !snapshot.path) return unavailable("runtime_document_unverified");
  if (!(snapshot.textExcerpt?.trim() || snapshot.siteMetadata?.title?.trim())) return unavailable("runtime_content_unavailable");
  const token = snapshot.documentIdentity.token;
  if (snapshots.some(other => other.capturedAtMs === snapshot.capturedAtMs &&
      (other.url !== snapshot.url || other.documentIdentity?.token !== token))) return unavailable("runtime_document_conflict");
  if (classifyRuntimeErrorPage(snapshot.textExcerpt)) return unavailable("runtime_error_page");
  return { status: "usable", snapshot };
}
