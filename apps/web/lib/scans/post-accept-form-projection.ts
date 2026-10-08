import { projectConsentControlReport } from "./consent-control-report";
import { postAcceptReportProjectionSchema, projectPostAcceptFormInventory } from '@certscore/contracts';
import { isAfterActionReportEligible, retainedConsentAssessment } from './after-action-report-eligibility';
import type { CollectionSurfaceTableRow } from './collection-surface-table-row';

/** Inventory evidence only: never contributes findings, control states or scoring. */
export function projectPostAcceptForms(value: unknown): { rows: CollectionSurfaceTableRow[]; limited: boolean } {
  const empty = { rows: [], limited: false };
  if (!value || typeof value !== 'object' || !isAfterActionReportEligible(retainedConsentAssessment(value), 'accept')) return empty;
  const root = value as Record<string, unknown>;
  const runtime = (root.runtimeArtifacts ?? root) as Record<string, unknown>;
  const parsed = postAcceptReportProjectionSchema.safeParse(runtime.postAcceptEvidenceProjection ?? runtime.post_accept_evidence_projection);
  if (!parsed.success) return empty;
  const images = parsed.data.formSnapshotCapture;
  if (images) {
    const scanId = projectConsentControlReport(retainedConsentAssessment(value))?.scanId;
    if (!scanId) return empty;
    const displayedInventory = projectPostAcceptFormInventory(images);
    if (!displayedInventory) return empty;
    return { limited: false, rows: displayedInventory.forms.map(form => {
      const laterSnapshot = images.contractVersion === "certscore.post_accept_form_snapshots.v6"
        ? images.postCaptureSnapshots.snapshots.find(snapshot=>snapshot.formRef===form.formRef) : undefined;
      const snapshot = images.snapshots.find(snapshot => snapshot.formRef === form.formRef) ?? laterSnapshot;
      return { id: `after_accept:${images.sessionId}:${form.formRef}`, form,
        capturedAt: snapshot?.capturedAt ?? "", capturePhase: "after_accept" as const,
        captureProvenance: {packetSha256: parsed.data.packetSha256!, sessionId: images.sessionId,
          frameRef:"main", documentToken:images.documentIdentity.token, exactTargetSha256:images.exactTargetSha256,
          actionDispatchedAtMs:images.actionDispatchedAtMs,
          capturedAtMs:laterSnapshot && images.contractVersion === "certscore.post_accept_form_snapshots.v6"
            ? images.postCaptureSnapshots.capturedAtMs : snapshot ? images.capturedAtMs : (images.contractVersion === "certscore.post_accept_form_snapshots.v5" || images.contractVersion === "certscore.post_accept_form_snapshots.v6")
            ? images.postCaptureInventory.capturedAtMs : images.capturedAtMs},
        snapshot: snapshot?.status === "available" ? {status:"available" as const,
          url:`/api/scans/${scanId}/form-snapshot?formRef=${encodeURIComponent(`after_accept:${form.formRef}`)}`} :
          {status:snapshot?.status ?? "unavailable" as const,reason:snapshot?.reason},
      };
    }) };
  }
  if (!parsed.data.formCapture) return empty;
  const capture = parsed.data.formCapture;
  return { limited: capture.status === 'limited', rows: capture.frames.flatMap(frame => frame.forms.map(form => ({
    id: `after_accept:${capture.sessionId}:${form.formRef}`, form,
    // Individual offsets are retained in the packet; completedAt is not a capture timestamp.
    capturedAt: '', capturePhase: 'after_accept_click' as const,
    captureLimited: capture.status === 'limited',
    captureProvenance: {packetSha256: parsed.data.packetSha256!, sessionId:capture.sessionId,
      frameRef:frame.frameRef, documentToken:frame.documentToken, exactTargetSha256:capture.exactTargetSha256,
      actionDispatchedAtMs:capture.actionDispatchedAtMs,capturedAtMs:frame.capturedAtMs},
    snapshot: { status: 'unavailable' as const, reason: 'structured_capture_only' },
  }))) };
}
