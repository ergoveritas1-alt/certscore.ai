import { createHash } from "node:crypto";
import { gpcCmpStateComparisonSchema, type CanonicalEvidenceBundle, type GpcOptOutObservation, type GpcCmpPairBlocker, type GpcCmpStateComparison } from "@certscore/contracts";
import { buildGpcImpactAssessment, readVerifiedGpcImpactSource, type GpcImpactSource } from "./gpc-impact-assessment.js";
import { evaluateGpcObservationSession } from "./gpc-observation-completion.js";
import { retainedFinalDocumentRequest } from "./gpc-response-assessment.js";
import { gpcDocumentHash } from "./gpc-signal-capture.js";
import { hasRetainedCmpApexWwwBinding } from "./gpc-cmp-document-binding.js";

/** Original already-loaded worker bytes only, at the existing merge barrier. */
type PairInput = { scanId: string; targetUrl: string; baseline?: GpcImpactSource; gpc?: GpcImpactSource };
type PairResult = { pair: GpcCmpStateComparison; blocker?: never } | { pair?: never; blocker: GpcCmpPairBlocker };
const blocked = (blocker: GpcCmpPairBlocker): PairResult => ({ blocker });

export function buildGpcCmpStateComparison(input: PairInput) {
  return assessGpcCmpStateComparison(input).pair;
}

export function assessGpcCmpStateComparison(input: PairInput): PairResult {
  const baseline = readVerifiedGpcImpactSource(input.baseline), gpc = readVerifiedGpcImpactSource(input.gpc);
  if (!baseline || !gpc || !baseline.region || baseline.region !== gpc.region ||
    baseline.scanId !== input.scanId || gpc.scanId !== input.scanId ||
    !baseline.scanLaneRuns.some(l => l.laneId === "runtime_evidence") ||
    !gpc.scanLaneRuns.some(l => l.laneId === "gpc_observation")) return blocked("worker_source_unverified");
  const documentHash = (url: string) => { try { return gpcDocumentHash(url); } catch { return undefined; } };
  const exactDocument = (b: CanonicalEvidenceBundle) => Boolean(b.gpcImpactCapture?.document &&
    documentHash(b.normalizedUrl) === b.gpcImpactCapture.document.urlSha256);
  // Historical v1 keeps full-context eligibility. A separately versioned v2
  // can describe main-document state without claiming worker/frame delivery.
  if ([baseline, gpc].some(b => b.gpcImpactCapture?.localRetention || b.gpcImpactCapture?.adaptiveObservation ||
    b.gpcImpactCapture?.requestLedger?.policyVersion === "gpc_compact_requests.local.v2" ||
    b.gpcImpactCapture?.windows.some(w => w.durationMs > 5000) ||
    b.scanLaneRuns[0]?.executionOutcome !== "success" || b.scanLaneRuns[0]?.challengeDetected)) return blocked("capture_ineligible");
  const fullSignal = [baseline, gpc].every(b => {
    const p = b.gpcSignalObservation;
    return exactDocument(b) && p && p.workerCount === 0 && p.limitationKeys.length === 0 && p.frameCount > 0 &&
      p.frameCount === p.frames.length && p.frames.every(f => f.navigatorValue === p.expectedEnabled);
  });
  const incompleteRetention = [baseline, gpc].some(b => b.gpcImpactCapture?.retentionStatus === "incomplete");
  // Explicitly incomplete full retention can use v2 only when both original
  // production page ledgers exist. Their hashes and signal are still rechecked.
  const pageLedgers = [baseline, gpc].every(b => b.gpcImpactCapture?.comparisonPolicy === "page_http_signal.v2" &&
    b.gpcImpactCapture.requestLedger?.policyVersion === "gpc_compact_requests.v1");
  if (fullSignal && incompleteRetention && !pageLedgers) return blocked("comparison_window_unverified");
  const fullContext = fullSignal && !incompleteRetention;
  if (baseline.normalizedUrl !== gpc.normalizedUrl || baseline.url !== gpc.url ||
    !documentHash(input.targetUrl) || documentHash(input.targetUrl) !== documentHash(baseline.normalizedUrl)) return blocked("paired_document_unverified");
  // Redirected pairs use only the scoped v2 interpretation. Never weaken the
  // original-target check or infer equivalence from the final hostname alone.
  if ([baseline, gpc].some(b => !exactDocument(b) && !hasRetainedCmpApexWwwBinding(b))) return blocked("paired_document_unverified");
  const session = gpc.gpcObservationSession;
  const completion = evaluateGpcObservationSession({ scanId: input.scanId, bundle: gpc, session,
    sourceBound: Boolean(gpc.gpcPrototypeSessionBinding), evidenceRefs: [] });
  const mainDocument = session?.mainDocument;
  const gpcDocument = gpc.gpcImpactCapture?.document;
  if (!completion.sourceVerified || !completion.documentBound || !mainDocument || !gpcDocument ||
    mainDocument.documentToken !== gpcDocument.token || mainDocument.documentUrlSha256 !== gpcDocument.urlSha256 ||
    mainDocument.committedAtMs !== gpcDocument.committedAtMs ||
    !completion.delivery.httpHeaderRetained || !completion.delivery.mainNavigatorReadbackRetained) return blocked("gpc_session_unverified");
  if (completion.semanticProbe.terminalStatus === "unavailable") return blocked("gpc_checkpoint_unavailable");
  if (completion.semanticProbe.terminalStatus === "not_ready") return blocked("gpc_cmp_not_ready");
  if (!completion.semanticProbe.complete || completion.semanticProbe.terminalStatus !== "observed") return blocked("gpc_state_unverified");
  if (!completion.completed || (fullContext && !completion.delivery.fullContextVerified)) return blocked("gpc_session_unverified");
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
  const baselineSemantic = baseline.gpcImpactSemanticObservation;
  if (!baselineSemantic) return blocked("baseline_checkpoint_missing");
  const b = snapshot(baseline, baselineSemantic, false);
  if (!b) {
    // An availability reason is usable only if the baseline checkpoint
    // belongs to the original baseline document and scan.
    const document = baseline.gpcImpactCapture?.document;
    const headers = retainedFinalDocumentRequest(baseline, baseline.gpcSignalObservation ?? null)?.requestHeaders;
    if (document && headers && headers.secGpc === undefined &&
      baselineSemantic.scanId === input.scanId && baselineSemantic.navigatorGpc === false &&
      baselineSemantic.captureBinding?.documentToken === document.token &&
      baselineSemantic.documentUrlSha256 === document.urlSha256 &&
      baselineSemantic.documentStartedAtMs <= document.committedAtMs &&
      baselineSemantic.capturedAtMs >= document.committedAtMs &&
      baselineSemantic.capturedAtMs <= Date.parse(baseline.completedAt) - Date.parse(baseline.startedAt)) {
      if (baselineSemantic.gppStatus === "unavailable") return blocked("baseline_checkpoint_unavailable");
      if (baselineSemantic.gppStatus === "not_ready") return blocked("baseline_cmp_not_ready");
    }
    return blocked("baseline_state_unverified");
  }
  const g = snapshot(gpc, session?.semanticObservation, true);
  if (!g) return blocked("gpc_state_unverified");
  if (b.state.sectionId !== g.state.sectionId || b.state.sectionVersion !== g.state.sectionVersion) return blocked("section_mismatch");

  // Full-scope proof still uses its original policy. Do not downgrade arbitrary
  // full-context proof failures; only the explicit retention case above changes scope.
  const impact = buildGpcImpactAssessment({...input, pageHttpOnly: !fullContext});
  if (impact.status !== "measured" || fullContext && !impact.cmpComparison?.comparable) return blocked("comparison_window_unverified");
  const parsed = gpcCmpStateComparisonSchema.safeParse({ contractVersion: fullContext ? "certscore.gpc-cmp-state-comparison.v1" : "certscore.gpc-cmp-state-comparison.v2",
    ...(!fullContext ? {scope: "main_document"} : {}), scanId: input.scanId,
    sourceHashes: impact.sourceHashes, sectionId: b.state.sectionId, sectionVersion: b.state.sectionVersion,
    baseline: b.facts, gpc: g.facts, scoreEffect: "none", causedByGpc: "not_established", legalInterpretation: "not_assessed" });
  return parsed.success ? {pair:parsed.data} : blocked("gpc_state_unverified");
}
