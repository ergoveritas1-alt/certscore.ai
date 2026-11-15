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
  if (!assessment || !projection.success ||
    projection.data.packetSha256 !== assessment.sourcePacketSha256) return null;
  // Confirmed legacy sessions can retain a registered observation without the
  // newer click-capture envelope. Preserve their own clock and execution too.
  const registered = projection.data.registrationStatus === "confirmed" &&
    projection.data.refusalExercised && projection.data.registeredObservationCompletion;
  if (!projection.data.afterActionCapture && !registered) return null;
  const checked = current && isRejectPresencePolicy(current.policyVersion)?retainedAfterRejectScoringAssessment({afterRejectScoringAssessment:current,postRefusalEvidenceProjection:projection.data}):assessRejectClickTracking(projection.data);
  if (!checked || JSON.stringify(checked) !== JSON.stringify(assessment)) return null;
  return {
    reportEvidenceProjectionPolicy: "retained_reject_click_capture.v1",
    ...(projection.data.afterActionCapture ? { afterActionCapture: projection.data.afterActionCapture } : {}),
    observationWindowMs: projection.data.observationWindowMs,
    ...(registered ? { registeredObservationCompletion: registered } : {}),
    ...(projection.data.retainedActionTiming ? { retainedActionTiming: projection.data.retainedActionTiming } : {}),
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
    if (row.id !== "post_reject_tracking_reduction") return row;
    const retained = row.criticalEvidence?.retainedEvidence;
    if (!retained) return row;
    if (row.status === "Review signal" && retained.afterActionCapture === undefined) {
      const capture = retainedRejectClickCapture(retained.afterRejectScoringAssessment ?? retained.rejectClickTrackingAssessment, projectionValue);
      if (capture) return { ...row, criticalEvidence: { ...row.criticalEvidence,
        retainedEvidence: { ...retained, ...capture } } };
    }
    if ((row.status !== "Gap observed" && row.status !== "Review signal") ||
      retained.registeredObservationCompletion !== undefined || retained.rejectInteractionConfirmed !== true) return row;

    // Older confirmed checklist rows retain the assessment hash but omit timing.
    // Read the completion from that same packet without rerunning the assessment.
    const assessment = readAfterRejectScoringAssessment(retained.afterRejectScoringAssessment);
    const projection = postRefusalReportProjectionSchema.safeParse(projectionValue);
    if (!assessment?.sourcePacketSha256 || assessment.registration !== "confirmed" || !projection.success ||
      projection.data.packetSha256 !== assessment.sourcePacketSha256 ||
      !projection.data.registeredObservationCompletion || !readChoicePathExecution(projection.data, "reject")?.consentConfirmed) return row;
    return { ...row, criticalEvidence: { ...row.criticalEvidence,
      retainedEvidence: { ...retained, registeredObservationCompletion: projection.data.registeredObservationCompletion } } };
  });
}
