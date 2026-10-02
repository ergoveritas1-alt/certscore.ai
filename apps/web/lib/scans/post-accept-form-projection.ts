import { postAcceptReportProjectionSchema } from '@certscore/contracts';
import { isAfterActionReportEligible, retainedConsentAssessment } from './after-action-report-eligibility';
import type { CollectionSurfaceTableRow } from '../../components/scans/collection-surfaces-table';

/** Inventory evidence only: never contributes findings, control states or scoring. */
export function projectPostAcceptForms(value: unknown): { rows: CollectionSurfaceTableRow[]; limited: boolean } {
  const empty = { rows: [], limited: false };
  if (!value || typeof value !== 'object' || !isAfterActionReportEligible(retainedConsentAssessment(value), 'accept')) return empty;
  const root = value as Record<string, unknown>;
  const runtime = (root.runtimeArtifacts ?? root) as Record<string, unknown>;
  const parsed = postAcceptReportProjectionSchema.safeParse(runtime.postAcceptEvidenceProjection ?? runtime.post_accept_evidence_projection);
  if (!parsed.success || !parsed.data.formCapture) return empty;
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
