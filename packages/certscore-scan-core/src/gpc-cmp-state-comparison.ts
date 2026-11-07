import { createHash } from "node:crypto";
import { gpcCmpStateComparisonSchema, type CanonicalEvidenceBundle, type GpcOptOutObservation } from "@certscore/contracts";
import { buildGpcImpactAssessment, readVerifiedGpcImpactSource, type GpcImpactSource } from "./gpc-impact-assessment.js";
import { evaluateGpcObservationSession } from "./gpc-observation-completion.js";
import { retainedFinalDocumentRequest } from "./gpc-response-assessment.js";
import { gpcDocumentHash } from "./gpc-signal-capture.js";
import { hasRetainedCmpApexWwwBinding } from "./gpc-cmp-document-binding.js";

/** Original already-loaded worker bytes only, at the existing merge barrier. */
export function buildGpcCmpStateComparison(input: { scanId: string; targetUrl: string; baseline?: GpcImpactSource; gpc?: GpcImpactSource }) {
  const baseline = readVerifiedGpcImpactSource(input.baseline), gpc = readVerifiedGpcImpactSource(input.gpc);
  if (!baseline || !gpc || !baseline.region || !gpc.region) return undefined;
  const documentHash = (url: string) => { try { return gpcDocumentHash(url); } catch { return undefined; } };
  const exactDocument = (b: CanonicalEvidenceBundle) => Boolean(b.gpcImpactCapture?.document &&
    documentHash(b.normalizedUrl) === b.gpcImpactCapture.document.urlSha256);
  // Historical v1 keeps full-context eligibility. A separately versioned v2
  // can describe main-document state without claiming worker/frame delivery.
  if ([baseline, gpc].some(b => b.gpcImpactCapture?.localRetention || b.gpcImpactCapture?.adaptiveObservation ||
    b.gpcImpactCapture?.requestLedger?.policyVersion === "gpc_compact_requests.local.v2" ||
    b.gpcImpactCapture?.windows.some(w => w.durationMs > 5000) ||
    b.scanLaneRuns[0]?.executionOutcome !== "success" || b.scanLaneRuns[0]?.challengeDetected)) return undefined;
  const fullContext = [baseline, gpc].every(b => {
    const p = b.gpcSignalObservation;
    return exactDocument(b) && p && p.workerCount === 0 && p.limitationKeys.length === 0 && p.frameCount > 0 &&
      p.frameCount === p.frames.length && p.frames.every(f => f.navigatorValue === p.expectedEnabled);
  });
  // Incomplete full-context retention does not invalidate independently verified
  // main-document ledger windows. The scoped assessment below must still verify
  // those windows; historical full-context eligibility remains unchanged.
  if (fullContext && [baseline, gpc].some(b => b.gpcImpactCapture?.retentionStatus === "incomplete")) return undefined;
  // One derivation, with explicit scope chosen from retained signal coverage.
  // Do not fall back merely because full-context request/provenance proof fails.
  const impact = buildGpcImpactAssessment({...input, pageHttpOnly: !fullContext});
  if (impact.status !== "measured" || fullContext && !impact.cmpComparison?.comparable) return undefined;
  if (baseline.normalizedUrl !== gpc.normalizedUrl || baseline.url !== gpc.url) return undefined;
  if (!documentHash(input.targetUrl) || documentHash(input.targetUrl) !== documentHash(baseline.normalizedUrl)) return undefined;
  // Redirected pairs use only the scoped v2 interpretation. Never weaken the
  // original-target check or infer equivalence from the final hostname alone.
  if ([baseline, gpc].some(b => !exactDocument(b) && !hasRetainedCmpApexWwwBinding(b))) return undefined;
  const session = gpc.gpcObservationSession;
  const completion = evaluateGpcObservationSession({ scanId: input.scanId, bundle: gpc, session,
    sourceBound: Boolean(gpc.gpcPrototypeSessionBinding), evidenceRefs: [] });
  if (!completion.completed || !completion.sourceVerified || !completion.documentBound || !completion.semanticProbe.complete ||
    completion.semanticProbe.terminalStatus !== "observed" || (fullContext && !completion.delivery.fullContextVerified) || !session?.mainDocument) return undefined;
  const snapshot = (b: CanonicalEvidenceBundle, semantic: GpcOptOutObservation | null | undefined, enabled: boolean) => {
    const c = b.gpcImpactCapture!, d = c.document!;
    // Baseline semantic capture and signal readback are independently anchored
    // by the original impact document/loader token. Only the GPC producer owns
    // the separately hashed observation session and its shared capture ID.
    const binding = enabled ? b.gpcSignalObservation?.prototypeCaptureBinding : semantic?.captureBinding;
    const request = retainedFinalDocumentRequest(b, b.gpcSignalObservation ?? null);
    if (!request?.requestHeaders || (enabled ? request.requestHeaders.secGpc !== "1" : request.requestHeaders.secGpc !== undefined)) return undefined;
    const state = semantic?.usca ?? semantic?.usnat;
    if (!semantic || !state || semantic.gppStatus !== "observed" || semantic.limitationKeys.length ||
      state.cmpStatus !== "loaded" || state.signalStatus !== "ready" || state.saleNotice !== 1 || state.sharingNotice !== 1 ||
      ![1, 2].includes(state.saleOptOut) || ![1, 2].includes(state.sharingOptOut) ||
      semantic.scanId !== input.scanId || semantic.navigatorGpc !== enabled || !binding ||
      !semantic.captureBinding || enabled && semantic.captureBinding.captureId !== binding.captureId || semantic.captureBinding?.documentToken !== d.token ||
      binding.documentToken !== d.token || semantic.documentUrlSha256 !== d.urlSha256 ||
      semantic.documentStartedAtMs > d.committedAtMs ||
      semantic.capturedAtMs < d.committedAtMs || semantic.capturedAtMs > Date.parse(b.completedAt) - Date.parse(b.startedAt) ||
      semantic.stateSha256 !== createHash("sha256").update(JSON.stringify(state)).digest("hex")) return undefined;
    return { state, facts: { sale: state.saleOptOut === 1 ? "opted_out" : "not_opted_out",
      sharing: state.sharingOptOut === 1 ? "opted_out" : "not_opted_out",
      received: state.gpc === true ? "received" : state.gpc === false ? "not_received" : "unknown",
      observedAfterDocumentCommitMs: semantic.capturedAtMs - d.committedAtMs } };
  };
  if (session.mainDocument.documentToken !== gpc.gpcImpactCapture?.document?.token ||
    session.mainDocument.documentUrlSha256 !== gpc.gpcImpactCapture?.document?.urlSha256 ||
    session.mainDocument.committedAtMs !== gpc.gpcImpactCapture?.document?.committedAtMs) return undefined;
  const b = snapshot(baseline, baseline.gpcImpactSemanticObservation, false), g = snapshot(gpc, session.semanticObservation, true);
  if (!b || !g || b.state.sectionId !== g.state.sectionId || b.state.sectionVersion !== g.state.sectionVersion) return undefined;
  const parsed = gpcCmpStateComparisonSchema.safeParse({ contractVersion: fullContext ? "certscore.gpc-cmp-state-comparison.v1" : "certscore.gpc-cmp-state-comparison.v2",
    ...(!fullContext ? {scope: "main_document"} : {}), scanId: input.scanId,
    sourceHashes: impact.sourceHashes, sectionId: b.state.sectionId, sectionVersion: b.state.sectionVersion,
    baseline: b.facts, gpc: g.facts, scoreEffect: "none", causedByGpc: "not_established", legalInterpretation: "not_assessed" });
  return parsed.success ? parsed.data : undefined;
}
