import {isRejectPresencePolicy} from "./after-reject-scoring-contract";
import { retainedAfterRejectScoringAssessment, readAfterRejectScoringAssessment } from "./after-reject-scoring-policy";
import { postRefusalReportProjectionSchema } from "@certscore/contracts";
import { readChoicePathExecution } from "./choice-path-execution";
import { assessRejectClickTracking, readRejectClickTrackingAssessment } from "./reject-click-tracking-policy";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

/** Metadata only: preserve the capture belonging to an existing assessed review. */
export function retainedRejectClickCapture(assessmentValue: unknown, projectionValue: unknown) {
  const current=readAfterRejectScoringAssessment(assessmentValue);
  const assessment = current && isRejectPresencePolicy(current.policyVersion)?current:readRejectClickTrackingAssessment(assessmentValue);
  const projection = postRefusalReportProjectionSchema.safeParse(projectionValue);
  if (!assessment || !projection.success || !projection.data.afterActionCapture ||
    projection.data.packetSha256 !== assessment.sourcePacketSha256) return null;
  const checked = current && isRejectPresencePolicy(current.policyVersion)?retainedAfterRejectScoringAssessment({afterRejectScoringAssessment:current,postRefusalEvidenceProjection:projection.data}):assessRejectClickTracking(projection.data);
  if (!checked || JSON.stringify(checked) !== JSON.stringify(assessment)) return null;
  return {
    reportEvidenceProjectionPolicy: "retained_reject_click_capture.v1",
    afterActionCapture: projection.data.afterActionCapture,
    sourcePacketSha256: projection.data.packetSha256,
    execution: readChoicePathExecution(projection.data, "reject"),
    resolverMethod: projection.data.resolverMethod,
  };
}

/** Historical read compatibility. Never alter an assessment, finding or score. */
export function preserveRetainedRejectClickCapture(
  rows: GdprEprivacyCoverageChecklistItem[], projectionValue: unknown,
): GdprEprivacyCoverageChecklistItem[] {
  return rows.map(row => {
    if (row.id !== "post_reject_tracking_reduction" || row.status !== "Review signal") return row;
    const retained = row.criticalEvidence?.retainedEvidence;
    if (!retained || retained.afterActionCapture !== undefined) return row;
    const capture = retainedRejectClickCapture(retained.afterRejectScoringAssessment ?? retained.rejectClickTrackingAssessment, projectionValue);
    if (!capture) return row;
    return { ...row, criticalEvidence: { ...row.criticalEvidence,
      retainedEvidence: { ...retained, ...capture } } };
  });
}
