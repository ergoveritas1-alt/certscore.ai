import { createHash } from "node:crypto";
import { gpcCookieReadBindingSchema, type GpcCookieReadBinding, type GpcObservationSession, type GpcImpactCapture,
  type GpcSignalObservation, type CookieSnapshot, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { sameDocumentCaptureBinding, type DocumentCaptureBinding } from "./document-bound-capture.js";
import { gpcDocumentHash } from "./gpc-signal-capture.js";

type Context = { scanId: string; targetUrl: string; captureId?: string; session?: GpcObservationSession;
  impact?: GpcImpactCapture; signal?: GpcSignalObservation };
function matches(b: GpcCookieReadBinding, snapshot: Pick<CookieSnapshot, "artifactId" | "capturedAtMs" | "consentStateAtTime">, ctx: Context) {
  const s = ctx.session, d = s?.mainDocument, impact = ctx.impact, p = ctx.signal, f = s?.finalization, semantic = s?.semanticObservation;
  if (!s || s.contractVersion !== "certscore.gpc-observation-session.v2" || s.terminal !== "completed" || s.limitationKeys.length ||
    !f?.documentUnchanged || f.requestedGeneration !== f.terminalGeneration || f.readbackCompletedAtMs === null || f.invalidationReasons?.length ||
    s.scanId !== ctx.scanId || b.scanId !== ctx.scanId || b.captureId !== ctx.captureId || b.captureId !== s.captureId ||
    snapshot.artifactId !== b.snapshotArtifactId || snapshot.consentStateAtTime !== "pre_consent" || snapshot.capturedAtMs < b.completedAtMs || snapshot.capturedAtMs > s.captureEndedAtMs ||
    !d || d.secGpc !== "1" || d.requestUrlSha256 !== d.documentUrlSha256 || b.documentToken !== d.documentToken || b.documentUrlSha256 !== d.documentUrlSha256 ||
    semantic?.captureBinding?.captureId !== b.captureId || semantic.captureBinding.documentToken !== b.documentToken || semantic.captureBinding.documentIdentitySource !== "cdp_loader_id" ||
    semantic.documentUrlSha256 !== b.documentUrlSha256 || semantic.navigatorGpc !== true || semantic.capturedAtMs < b.completedAtMs || semantic.capturedAtMs > s.captureEndedAtMs ||
    b.documentCommittedAtMs !== d.committedAtMs || b.startedAtMs < d.committedAtMs || b.completedAtMs > s.captureEndedAtMs ||
    !impact?.expectedEnabled || impact.limitationKeys.length || impact.readbackDocumentToken !== b.documentToken ||
    impact.document?.token !== b.documentToken || impact.document.urlSha256 !== b.documentUrlSha256 || impact.document.secGpc !== "1" ||
    impact.document.committedAtMs !== b.documentCommittedAtMs || !p?.expectedEnabled || p.documentUrlSha256 !== b.documentUrlSha256 ||
    p.prototypeCaptureBinding?.captureId !== b.captureId || p.prototypeCaptureBinding.documentToken !== b.documentToken ||
    p.capturedAtMs < b.documentCommittedAtMs || p.capturedAtMs > b.startedAtMs || p.capturedAtMs > impact.capturedAtMs ||
    p.frames.filter(frame => frame.mainFrame).length !== 1 || !p.frames.some(frame => frame.mainFrame && frame.documentUrlSha256 === b.documentUrlSha256 && frame.navigatorValue === true) ||
    p.limitationKeys.some(key => ["document_changed_during_readback", "prototype_document_identity_unverified"].includes(key))) return false;
  try { return b.targetUrlSha256 === gpcDocumentHash(ctx.targetUrl); } catch { return false; }
}

/** Stamp the single cookie read already performed. No browser/SDK call, wait,
 * new clock read, cookie value or additional inventory enters this proof. */
export function buildGpcCookieReadBinding(input: Context & { enabled: boolean; succeeded: boolean; aborted: boolean;
  before: DocumentCaptureBinding; after: DocumentCaptureBinding; startedAtMs: number; completedAtMs: number;
  snapshot: Pick<CookieSnapshot, "artifactId" | "capturedAtMs" | "consentStateAtTime"> }): GpcCookieReadBinding | undefined {
  if (!input.enabled || !input.succeeded || input.aborted || !input.captureId || !input.session?.mainDocument ||
    input.before.documentIdentity?.source !== "cdp_loader_id" || !sameDocumentCaptureBinding(input.before, input.after)) return;
  try {
    const parsed = gpcCookieReadBindingSchema.safeParse({ contractVersion: "certscore.gpc-cookie-read-binding.v1", scope: "gpc_browser_context_point_in_time",
      scanId: input.scanId, captureId: input.captureId, snapshotArtifactId: input.snapshot.artifactId,
      documentToken: input.before.documentIdentity.token, targetUrlSha256: gpcDocumentHash(input.targetUrl), documentUrlSha256: gpcDocumentHash(input.before.url),
      documentCommittedAtMs: input.session.mainDocument.committedAtMs, startedAtMs: input.startedAtMs, completedAtMs: input.completedAtMs,
      inventoryCompleteness: "not_assessed", matchedRequestHorizon: "not_established" });
    return parsed.success && matches(parsed.data, input.snapshot, input) ? parsed.data : undefined;
  } catch { return; }
}

/** Only for an already size/SHA/schema-verified isolated original worker bundle.
 * Its inline session bytes are available and are checked against the original
 * producer binding. No artifact retrieval or historical reconstruction. */
export function readOriginalGpcCookieReadBinding(bundle: CanonicalEvidenceBundle, snapshot: CookieSnapshot): GpcCookieReadBinding | undefined {
  const parsed = gpcCookieReadBindingSchema.safeParse(snapshot.gpcReadBinding), s = bundle.gpcObservationSession, root = bundle.gpcPrototypeSessionBinding;
  if (!parsed.success || !s || !root || bundle.scanLaneRuns.length !== 1 || bundle.scanLaneRuns[0]?.laneId !== "gpc_observation" ||
    bundle.scanLaneRuns[0].region !== bundle.region || root.sessionSha256 !== createHash("sha256").update(JSON.stringify(s)).digest("hex") ||
    root.documentToken !== parsed.data.documentToken || root.documentUrlSha256 !== parsed.data.documentUrlSha256 ||
    snapshot.capturedAtMs > Date.parse(bundle.completedAt) - Date.parse(bundle.startedAt)) return;
  return matches(parsed.data, snapshot, { scanId: bundle.scanId, targetUrl: bundle.url, captureId: root.captureId,
    session: s, impact: bundle.gpcImpactCapture, signal: bundle.gpcSignalObservation }) ? parsed.data : undefined;
}
