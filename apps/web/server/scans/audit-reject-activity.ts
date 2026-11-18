import { postRefusalReportProjectionSchema } from "@certscore/contracts";
import {
  AUDIT_REJECT_ACTIVITY_RESULTS,
  auditRejectActivityV2Schema,
  type AuditRejectActivityV2,
} from "../../../../packages/certscore-contracts/src/audit-reject-activity";
import { retainedCurrentRejectPresence } from "../../lib/scans/reject-presence-evidence";

/** Private audit evidence from the verified Reject projection. */
export function buildAuditRejectActivity(scanId: string, value: unknown): AuditRejectActivityV2 | undefined {
  const parsed = postRefusalReportProjectionSchema.safeParse(value);
  if (!parsed.success) return;
  const projection = parsed.data;
  const { actionControlProof: proof, afterActionCapture: capture, execution, packetSha256, sourceIdentity } = projection;
  if (!packetSha256 || !execution?.clickCompleted) return;
  const receipt = (result: AuditRejectActivityV2[3]) =>
    auditRejectActivityV2Schema.safeParse([2, scanId, packetSha256, result]).data;
  if (sourceIdentity?.scanId !== scanId || !proof?.authorizedTargetSha256 ||
      proof.authorizedTargetSha256 !== sourceIdentity.targetSha256 || !proof.frameIdentitySha256) {
    return receipt("source_unbound");
  }
  const presence = retainedCurrentRejectPresence(projection);
  if (!presence || (capture && (capture.activationStatus !== "completed" || capture.stopReason !== "window_elapsed"))) {
    return receipt("capture_unavailable");
  }
  const scoring = projection.scoringEvidence!;
  const requests = new Set(presence.requestIds);
  const request = scoring.requests.some(row => requests.has(row.requestId) && row.method?.toUpperCase() !== "OPTIONS");
  const writes = presence.confirmed
    ? scoring.storageWrites.filter(row => row.evidenceSource === "instrumented_write")
    : capture!.storageWrites;
  const write = writes.some(row => row.nonEssential && row.observedAtMs > presence.start && row.observedAtMs <= presence.end);
  const kindIndex = Number(request) + 2 * Number(write) + 4 * Number(presence.cookies.length > 0);
  return receipt(AUDIT_REJECT_ACTIVITY_RESULTS[kindIndex] ?? "classification_unavailable");
}
