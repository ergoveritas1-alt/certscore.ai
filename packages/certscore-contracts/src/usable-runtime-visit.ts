import type { CanonicalEvidenceBundle, DomSnapshotArtifact } from "./index";
import { classifyRuntimeErrorPage } from "./runtime-error-page";

export const RUNTIME_VISIT_REJECTION_REASONS = [
  "runtime_no_go", "runtime_coverage_unavailable", "runtime_lane_unavailable",
  "runtime_navigation_unverified", "invalid_final_url", "runtime_snapshot_unavailable",
  "runtime_document_unverified", "runtime_content_unavailable", "runtime_document_conflict",
  "runtime_loading_placeholder", "runtime_error_page",
] as const;
export type RuntimeVisitRejectionReason = typeof RUNTIME_VISIT_REJECTION_REASONS[number];
type RuntimeVisitAssessment = { status: "usable"; snapshot: DomSnapshotArtifact } |
  { status: "unavailable"; reasonCode: RuntimeVisitRejectionReason };

/** A main-document response is usable only for the loader that captured the
 * text. A verified History API route may differ from its document request. */
export function boundRuntimeDocumentStatus(snapshot: DomSnapshotArtifact): number | undefined {
  const response = snapshot.runtimeDocumentCapture?.response;
  if (!response || snapshot.documentIdentity?.source !== "cdp_loader_id" ||
      snapshot.documentIdentity.token !== response.documentToken) return;
  try {
    const document = new URL(snapshot.url);
    // The verified producer compares the complete committed request URL with
    // the route before retaining its hash. Consumers do not need that raw URL.
    if (!["http:", "https:"].includes(document.protocol) || document.origin !== response.origin ||
        document.username || document.password) return;
    return response.status;
  } catch { return; }
}

/** Visual proof remains restricted to the existing positive assessment and
 * screenshot from the exact original runtime document. */
export function hasBoundRuntimeVisualContent(bundle: CanonicalEvidenceBundle, snapshot: DomSnapshotArtifact): boolean {
  const assessment = bundle.scanNoGoAssessment ?? bundle.scan_no_go_assessment;
  const duration = Date.parse(bundle.completedAt) - Date.parse(bundle.startedAt);
  return assessment?.decision === "continue_with_diagnostics" &&
    assessment.supportingSignals.visuallySubstantiveScreenshotObserved === true &&
    assessment.supportingSignals.visualNoGo === false &&
    assessment.supportingSignals.visualHardNoGoPageState === false &&
    bundle.screenshots.some(shot => shot.retentionStatus === "available" &&
      shot.url === snapshot.url && shot.documentIdentity?.source === "cdp_loader_id" &&
      shot.documentIdentity.token === snapshot.documentIdentity?.token &&
      shot.capturedAtMs >= snapshot.capturedAtMs && shot.capturedAtMs <= duration &&
      shot.captureMethod !== "primary_placeholder" && shot.captureMethod !== "fresh_context_placeholder");
}

function isRuntimeLoadingPlaceholder(text: string | undefined): boolean {
  return /^[^\p{L}\p{N}]{0,4}(?:loading|please wait|initializing|establishing (?:(?:a )?secure )?connection)\b[\s\S]{0,120}$/iu
    .test(text?.replace(/\s+/g, " ").trim() ?? "");
}

export function hasRepresentativeRuntimeText(snapshot: DomSnapshotArtifact): boolean {
  const text = snapshot.textExcerpt?.replace(/\s+/g, " ").trim() ?? "";
  if (classifyRuntimeErrorPage(snapshot.textExcerpt) || isRuntimeLoadingPlaceholder(text)) return false;
  if (snapshot.siteMetadata?.title?.trim() && /[\p{L}\p{N}]/u.test(text)) return true;
  return text.length >= 180 && text.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length >= 24;
}

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
  const snapshot = [...snapshots].sort((a, b) => b.capturedAtMs - a.capturedAtMs)[0];
  if (snapshot?.runtimeDocumentCapture && !lane?.challengeDetected && lane?.accessOutcome !== "access_denied") {
    if (snapshot.documentIdentity?.source !== "cdp_loader_id" || !snapshot.documentIdentity.token)
      return unavailable("runtime_document_unverified");
    if (classifyRuntimeErrorPage(snapshot.textExcerpt)) return unavailable("runtime_error_page");
    if (!hasRepresentativeRuntimeText(snapshot) && !hasBoundRuntimeVisualContent(bundle, snapshot))
      return unavailable(isRuntimeLoadingPlaceholder(snapshot.textExcerpt) ? "runtime_loading_placeholder" : "runtime_content_unavailable");
    const status = boundRuntimeDocumentStatus(snapshot);
    if (status === undefined || status < 200 || status >= 400) return unavailable("runtime_navigation_unverified");
  }
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
  if (!snapshot) return unavailable("runtime_snapshot_unavailable");
  if (!Number.isFinite(snapshot.capturedAtMs) || snapshot.capturedAtMs < 0 ||
      !documentUrl(snapshot.url) || (expected !== undefined && documentUrl(snapshot.url) !== expected) ||
      snapshot.documentIdentity?.source !== "cdp_loader_id" || !snapshot.documentIdentity.token ||
      !snapshot.artifactId || !snapshot.path) return unavailable("runtime_document_unverified");
  if (!snapshot.textExcerpt?.trim() && !hasBoundRuntimeVisualContent(bundle, snapshot)) return unavailable("runtime_content_unavailable");
  const token = snapshot.documentIdentity.token;
  if (snapshots.some(other => other.capturedAtMs === snapshot.capturedAtMs &&
      (other.url !== snapshot.url || other.documentIdentity?.token !== token))) return unavailable("runtime_document_conflict");
  if (classifyRuntimeErrorPage(snapshot.textExcerpt)) return unavailable("runtime_error_page");
  return { status: "usable", snapshot };
}
