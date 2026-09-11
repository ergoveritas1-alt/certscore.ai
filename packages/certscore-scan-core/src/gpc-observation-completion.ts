import { createHash } from "node:crypto";
import { canonicalEvidenceBundleSchema, retainedGpcObservationSessionSchema, type CanonicalEvidenceBundle, type GpcObservationSession } from "@certscore/contracts";
import type { GpcPrototypeArtifact } from "./gpc-opt-out-assessment.js";
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
function verified(source: GpcPrototypeArtifact) {
  if (source.bytes.byteLength > 20_000_000 || source.bytes.byteLength !== source.pointer.sizeBytes || hash(source.bytes) !== source.pointer.sha256) throw Error("Unverifiable GPC retained source");
  return JSON.parse(Buffer.from(source.bytes).toString("utf8"));
}
/** Evaluates completion of the declared bounded observation, not GPC compliance.
 * Historical packets lacking direct coverage proof cannot enter this gate. */
export function assessGpcObservationCompletion(input: { scanId: string; bundle?: GpcPrototypeArtifact; session?: GpcPrototypeArtifact }) {
  const bundle = (() => { try { return input.bundle ? canonicalEvidenceBundleSchema.parse(verified(input.bundle)) : null; } catch { return null; } })();
  const retained = (() => { try { return input.session ? retainedGpcObservationSessionSchema.parse(verified(input.session)) : null; } catch { return null; } })();
  return evaluateGpcObservationSession({ scanId: input.scanId, bundle, session: retained?.session,
    sourceBound: Boolean(retained && retained.gpcArtifactSha256 === input.bundle?.pointer.sha256),
    evidenceRefs: input.bundle && input.session ? [input.bundle.pointer, input.session.pointer] : [] });
}
/** Caller must verify the original retained worker bytes before evaluating an inline session. */
export function evaluateGpcObservationSession(input: { scanId: string; bundle: CanonicalEvidenceBundle | null;
  session?: GpcObservationSession; sourceBound: boolean; evidenceRefs: GpcPrototypeArtifact["pointer"][] }) {
  const limits: string[] = [];
  const bundle = input.bundle;
  const p = input.session;
  const binding = bundle?.gpcPrototypeSessionBinding ?? (bundle?.gpcSignalObservation?.prototypeCaptureBinding ? {
    ...bundle.gpcSignalObservation.prototypeCaptureBinding, sessionSha256: bundle.gpcSignalObservation.prototypeSessionSha256,
    documentUrlSha256: bundle.gpcSignalObservation.documentUrlSha256,
  } : null);
  const sourceVerified = Boolean(bundle && p && bundle.scanId === input.scanId && p.scanId === input.scanId && input.sourceBound &&
    p.captureEndedAtMs <= Date.parse(bundle.completedAt) - Date.parse(bundle.startedAt) &&
    binding?.sessionSha256 === hash(JSON.stringify(p)) && binding.captureId === p.captureId &&
    binding.documentToken === p.mainDocument?.documentToken && binding.documentUrlSha256 === p.mainDocument?.documentUrlSha256);
  if (!sourceVerified) limits.push("source_unverified");
  const semantic = sourceVerified ? p!.semanticObservation : null;
  const state = semantic?.usca ?? semantic?.usnat;
  const main = sourceVerified ? p!.mainDocument : null;
  const bound = Boolean(main && semantic && semantic.captureBinding?.captureId === p!.captureId && semantic.captureBinding.documentToken === main.documentToken &&
    semantic.documentUrlSha256 === main.documentUrlSha256 && semantic.capturedAtMs >= main.committedAtMs && semantic.capturedAtMs <= p!.captureEndedAtMs &&
    (!state || semantic.stateSha256 === hash(JSON.stringify(state))) &&
    (semantic.stateTransitions ?? []).every(row => !row.state || row.stateSha256 === hash(JSON.stringify(row.state))));
  if (!bound) limits.push("document_or_semantic_binding_unverified");
  const header = bound && main?.secGpc === "1";
  const navigator = bound && semantic?.navigatorGpc === true;
  if (!header) limits.push("main_document_header_unverified");
  if (!navigator) limits.push("main_navigator_unverified");
  const semanticComplete = Boolean(bound && semantic && ["observed", "unsupported", "unavailable"].includes(semantic.gppStatus) &&
    semantic.limitationKeys.every(key => key === "acknowledgment_capture_truncated"));
  if (!semanticComplete) limits.push("semantic_probe_incomplete");
  const requestComplete = Boolean(sourceVerified && p!.terminal === "completed" && p!.limitationKeys.length === 0 && p!.requestsDropped === 0 && p!.listener.dropped === 0 &&
    p!.captureEndedAtMs - Math.max(p!.captureStartedAtMs, main?.committedAtMs ?? p!.captureEndedAtMs) >= 250 &&
    p!.requests.every(r => r.secGpc === "1" || (p!.contractVersion === "certscore.gpc-observation-session.v2" && r.preTransmissionBlock !== undefined)));
  if (!requestComplete) limits.push("bounded_request_capture_incomplete");
  const terminalStateKnown = Boolean(state && state.saleNotice === 1 && state.sharingNotice === 1 && [1, 2].includes(state.saleOptOut) && [1, 2].includes(state.sharingOptOut));
  const fullProof = bundle?.gpcSignalObservation;
  const fullContextVerified = Boolean(sourceVerified && fullProof && fullProof.prototypeCaptureBinding?.captureId === p!.captureId &&
    fullProof.prototypeCaptureBinding.documentToken === main?.documentToken && fullProof.workerCount === 0 && fullProof.limitationKeys.length === 0 &&
    fullProof.frames.length === fullProof.frameCount && fullProof.frames.length > 0 && fullProof.frames.every(f => f.navigatorValue === true));
  return {
    contractVersion: p?.contractVersion === "certscore.gpc-observation-session.v2" ? "certscore.gpc-observation-completion.v2" as const : "certscore.gpc-observation-completion.v1" as const,
    mode: "internal_only" as const, productionProjectable: false as const, scoreEffect: "none" as const,
    observationScope: "main_document_and_retained_http_requests" as const,
    scanId: input.scanId, completed: limits.length === 0, sourceVerified, documentBound: bound,
    delivery: { httpHeaderRetained: header, mainNavigatorReadbackRetained: navigator, fullContextVerified },
    semanticProbe: { terminalStatus: semantic?.gppStatus ?? "incomplete", started: Boolean(semantic), ended: Boolean(semantic), complete: semanticComplete },
    requestCapture: { started: sourceVerified, ended: sourceVerified && p!.terminal === "completed", noDrops: sourceVerified && p!.requestsDropped === 0, complete: requestComplete,
      count: sourceVerified ? p!.requestsObserved : 0, blockedBeforeTransmissionCount: sourceVerified ? p!.requests.filter(r => r.preTransmissionBlock).length : 0, fromMs: sourceVerified ? p!.captureStartedAtMs : null, documentCommittedAtMs: main?.committedAtMs ?? null, throughMs: sourceVerified ? p!.captureEndedAtMs : null },
    currentSaleSharingState: state ?? null, terminalStateKnown, causedByGpc: "not_established" as const,
    acknowledgmentObserved: Boolean(semantic?.acknowledgment.length),
    acknowledgmentCaptureComplete: semantic?.acknowledgmentCaptureComplete === true,
    limitations: limits,
    evidenceRefs: sourceVerified ? input.evidenceRefs : [],
  };
}
