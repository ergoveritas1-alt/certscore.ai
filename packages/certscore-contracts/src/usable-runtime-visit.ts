import type { CanonicalEvidenceBundle, DomSnapshotArtifact } from "./index";

/** The original runtime visit used by usable_starting_page_score.v1. Callers
 * must verify the source bundle first and explicitly select lane-owned DOM. */
export function getUsableRuntimeVisitSnapshot(
  bundle: CanonicalEvidenceBundle,
  snapshots: readonly DomSnapshotArtifact[],
  finalUrl?: string,
): DomSnapshotArtifact | undefined {
  const lane = bundle.scanLaneRuns?.find(row => row.laneId === "runtime_evidence");
  const assessments = [bundle.scanEvidenceLaneAssessment, bundle.scan_evidence_lane_assessment].filter(Boolean);
  if (bundle.scanNoGoAssessment?.decision === "no_go" || bundle.scan_no_go_assessment?.decision === "no_go" ||
      assessments.some(row => row!.outcome === "no_go" || row!.lanes.homepageRuntime === "unusable") ||
      !["usable", "limited_partial"].includes(bundle.runtimeCoverage?.coverageStatus ?? "") || bundle.runtimeCoverage?.silentEmpty ||
      !lane || !["success", "degraded"].includes(lane.executionOutcome) ||
      lane.accessOutcome !== "representative_page" || lane.challengeDetected) return undefined;
  if (lane.executionOutcome === "degraded" && !lane.navigationAttempts?.some(attempt =>
    attempt.outcome === "success" && typeof attempt.httpStatus === "number" &&
    attempt.httpStatus >= 200 && attempt.httpStatus < 300)) return undefined;
  const documentUrl = (value: string) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : null;
    } catch { return null; }
  };
  const expected = finalUrl === undefined ? undefined : documentUrl(finalUrl);
  if (expected === null) return undefined;
  const snapshot = [...snapshots].sort((a, b) => b.capturedAtMs - a.capturedAtMs)[0];
  if (!snapshot || !Number.isFinite(snapshot.capturedAtMs) || snapshot.capturedAtMs < 0 ||
      !documentUrl(snapshot.url) || (expected !== undefined && documentUrl(snapshot.url) !== expected) ||
      snapshot.documentIdentity?.source !== "cdp_loader_id" || !snapshot.documentIdentity.token ||
      !snapshot.artifactId || !snapshot.path || !(snapshot.textExcerpt?.trim() || snapshot.siteMetadata?.title?.trim())) return undefined;
  const token = snapshot.documentIdentity.token;
  if (snapshots.some(other => other.capturedAtMs === snapshot.capturedAtMs &&
      (other.url !== snapshot.url || other.documentIdentity?.token !== token))) return undefined;
  return snapshot;
}
