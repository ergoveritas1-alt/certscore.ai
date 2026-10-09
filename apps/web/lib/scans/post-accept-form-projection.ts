import { projectConsentControlReport } from "./consent-control-report";
import { postAcceptReportProjectionSchema, reconcilePostAcceptFormInventory } from '@certscore/contracts';
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
  const capture = parsed.data.formCapture;
  const structuredRows: CollectionSurfaceTableRow[] = capture ? capture.frames.flatMap(frame => frame.forms.map(form => ({
    id: `after_accept:${capture.sessionId}:${form.formRef}`, form,
    capturedAt: '', capturePhase: 'after_accept_click' as const,
    captureLimited: capture.status === 'limited',
    captureProvenance: {packetSha256: parsed.data.packetSha256!, sessionId:capture.sessionId,
      frameRef:frame.frameRef, documentToken:frame.documentToken, exactTargetSha256:capture.exactTargetSha256,
      actionDispatchedAtMs:capture.actionDispatchedAtMs,capturedAtMs:frame.capturedAtMs},
    snapshot: { status: 'unavailable' as const, reason: 'structured_capture_only' },
  }))) : [];
  if (images) {
    const scanId = projectConsentControlReport(retainedConsentAssessment(value))?.scanId;
    if (!scanId) return empty;
    const reconciled = reconcilePostAcceptFormInventory(images,capture);
    if (!reconciled) return empty;
    const displayedInventory = reconciled.inventory;
    const imagedRows: CollectionSurfaceTableRow[] = displayedInventory.forms.map(form => {
      const laterSnapshot = images.contractVersion === "certscore.post_accept_form_snapshots.v6"
        ? images.postCaptureSnapshots.snapshots.find(snapshot=>snapshot.formRef===form.formRef) : undefined;
      const snapshot = images.snapshots.find(snapshot => snapshot.formRef === form.formRef) ?? laterSnapshot;
      return { id: `after_accept:${images.sessionId}:${form.formRef}`, form,
        capturedAt: snapshot?.capturedAt ?? "", capturePhase: "after_accept" as const,
        captureProvenance: {packetSha256: parsed.data.packetSha256!, sessionId: reconciled.structuredFrame ? capture!.sessionId : images.sessionId,
          frameRef:reconciled.structuredFrame?.frameRef ?? "main",
          documentToken:reconciled.structuredFrame?.documentBinding?.token ?? images.documentIdentity.token, exactTargetSha256:images.exactTargetSha256,
          actionDispatchedAtMs:images.actionDispatchedAtMs,
          capturedAtMs:reconciled.structuredFrame?.capturedAtMs ?? (laterSnapshot && images.contractVersion === "certscore.post_accept_form_snapshots.v6"
            ? images.postCaptureSnapshots.capturedAtMs : snapshot ? images.capturedAtMs : (images.contractVersion === "certscore.post_accept_form_snapshots.v5" || images.contractVersion === "certscore.post_accept_form_snapshots.v6")
            ? images.postCaptureInventory.capturedAtMs : images.capturedAtMs)},
        snapshot: snapshot?.status === "available" ? {status:"available" as const,
          url:`/api/scans/${scanId}/form-snapshot?formRef=${encodeURIComponent(`after_accept:${form.formRef}`)}`} :
          {status:snapshot?.status ?? "unavailable" as const,reason:snapshot?.reason},
      };
    });
    // Keep independently captured embedded forms and newly bound main forms.
    // Only the proven original main forms are deduplicated against image rows.
    return { limited: capture?.status === 'limited', rows: [...imagedRows,
      ...structuredRows.filter(row => row.captureProvenance?.frameRef !== 'accept_frame_0' ||
        reconciled.additionalFormRefs.includes(row.form.formRef))] };
  }
  if (!capture) return { rows: [], limited: parsed.data.interactionDiagnostics?.click.outcome === 'completed' };
  return { limited: capture.status === 'limited' || capture.version === 'post_accept_form_capture.v1', rows: structuredRows };
}
