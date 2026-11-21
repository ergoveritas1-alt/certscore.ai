import { createHash } from "node:crypto";
import { classifyConsentControlLabel, consentSessionAccessLimited, isConsentControlInteractionEligible, verifyConsentControlInspection,
  type CanonicalEvidenceBundle, type ConsentActionControlProof } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry.js";
import type { AcceptFirstLayerGeometrySource } from "./accept-first-layer-gate.js";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const digest = /^[a-f0-9]{64}$/;
const proofLifetimeMs = 6000;

function targetDigest(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    url.hash = "";
    return sha(url.href);
  } catch { return undefined; }
}

function directReject(label: string) {
  const result = classifyConsentControlLabel({label, usage:"action", classifierProfile:"multilingual_v1", hasConsentContext:true});
  return result.intent === "reject" && result.confidence >= 0.8 && !result.variant;
}

type RejectGateBlockReason = "source_unavailable" | "source_binding_invalid" | "no_first_layer_reject" |
  "passive_capture_incomplete" | "label_conflict_unresolved" | "control_binding_unverified" | "control_ambiguous" | "proof_expired";
type RejectBinding = {
  parentDispatchSha256: string; sourceSha256: string; geometrySha256: string;
  requestedTargetSha256: string; documentSha256: string; documentTokenSha256: string;
  selectorSha256: string; selectorEvidence: "verified_geometry"; labelSha256: string;
  labelMatch: "exact"; labelSource?: "aria_label";
};
export type RejectGateDecision =
  | {outcome:"blocked"; reason:RejectGateBlockReason; evaluatedAtMs:number}
  | {outcome:"qualified"; binding:RejectBinding; exactSelector:string; issuedAtMs:number; expiresAtMs:number};

export type RejectFirstLayerProof = Extract<RejectGateDecision, {outcome:"qualified"}> & {scanId:string};

function validExactSelector(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 500 && value.trim() === value;
}

export function readRejectFirstLayerProof(value: unknown): RejectFirstLayerProof | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const proof = value as Partial<RejectFirstLayerProof>;
  const {binding, issuedAtMs, expiresAtMs, scanId} = proof;
  if (Object.keys(value).length !== 6 || proof.outcome !== "qualified" ||
      typeof scanId !== "string" || !scanId || scanId.length > 200 ||
      typeof issuedAtMs !== "number" || typeof expiresAtMs !== "number" ||
      !Number.isSafeInteger(issuedAtMs) || !Number.isSafeInteger(expiresAtMs) ||
      issuedAtMs < 0 || expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > proofLifetimeMs ||
      !binding || typeof binding !== "object" || Array.isArray(binding) ||
      !validExactSelector(proof.exactSelector) || sha(proof.exactSelector) !== binding.selectorSha256 ||
      Object.keys(binding).length !== 10 + Number(Object.hasOwn(binding, "labelSource")) ||
      (Object.hasOwn(binding, "labelSource") && binding.labelSource !== "aria_label") ||
      binding.selectorEvidence !== "verified_geometry" || binding.labelMatch !== "exact" ||
      ![binding.parentDispatchSha256, binding.sourceSha256, binding.geometrySha256, binding.requestedTargetSha256,
        binding.documentSha256, binding.documentTokenSha256, binding.selectorSha256, binding.labelSha256]
        .every(field => typeof field === "string" && digest.test(field))) return undefined;
  return proof as RejectFirstLayerProof;
}

export function rejectFirstLayerProofMatches(value: unknown, scanId: string, targetUrl: string,
  parentDispatchSha256: string | undefined, nowMs: number): value is RejectFirstLayerProof {
  const proof = readRejectFirstLayerProof(value);
  return Boolean(proof && proof.scanId === scanId && proof.binding.requestedTargetSha256 === targetDigest(targetUrl) &&
    proof.binding.parentDispatchSha256 === parentDispatchSha256 && nowMs >= proof.issuedAtMs && nowMs < proof.expiresAtMs);
}

export function rejectGateControlMatches(binding: RejectBinding, proof: ConsentActionControlProof) {
  return proof.action === "reject" && proof.actionSemantics === "direct_label" &&
    proof.authorizedTargetSha256 === binding.documentSha256 && proof.frameIdentitySha256 === binding.documentSha256 &&
    sha(proof.selectorHint) === binding.selectorSha256 && sha(proof.accessibleLabel) === binding.labelSha256 &&
    proof.labelSource === (binding.labelSource ?? "visible_text");
}

/** Exact first-layer Reject telemetry from existing checksum-bound passive evidence. */
export function evaluateRejectGate(input: {
  bundle: CanonicalEvidenceBundle; scanId: string; targetUrl: string; sourceSha256: string; parentDispatchSha256: string;
  geometry?: AcceptFirstLayerGeometrySource; nowMs: number; deadlineAtMs?: number;
}): RejectGateDecision {
  const {bundle,geometry,nowMs} = input;
  const block = (reason: RejectGateBlockReason): RejectGateDecision => ({outcome:"blocked",reason,evaluatedAtMs:nowMs});
  const target = targetDigest(input.targetUrl);
  const document = bundle.domSnapshots.at(-1);
  const documentSha256 = document && targetDigest(document.url);
  const identity = document?.documentIdentity;
  if (!target || bundle.scanId !== input.scanId || targetDigest(bundle.url) !== target || !documentSha256 ||
      document?.consentStateAtTime !== "pre_consent" || identity?.source !== "cdp_loader_id" || !identity.token ||
      !digest.test(input.sourceSha256) || !digest.test(input.parentDispatchSha256)) return block("source_binding_invalid");
  if (consentSessionAccessLimited(bundle) || !bundle.consentSurfaceInspection?.inspectedPreInteraction) {
    return block("passive_capture_incomplete");
  }
  if (!geometry) return block("source_unavailable");
  if (!geometry.bytes.length || geometry.bytes.length > 2 * 1024 * 1024 ||
      geometry.bytes.length !== geometry.sizeBytes || sha(geometry.bytes) !== geometry.sha256) return block("source_binding_invalid");
  let artifact: ConsentControlGeometryArtifact;
  try { artifact = JSON.parse(geometry.bytes.toString("utf8")); }
  catch { return block("source_binding_invalid"); }
  if (!artifact || artifact.artifactVersion !== "consent_control_geometry.v1" ||
      artifact.sourceScanner !== "consent_control_geometry_diagnostic" || artifact.pageUrl !== document.url ||
      artifact.documentIdentity?.source !== "cdp_loader_id" || artifact.documentIdentity.token !== identity.token ||
      !Array.isArray(artifact.candidates)) return block("source_binding_invalid");
  const inspection = verifyConsentControlInspection(artifact.controlInspection, artifact.candidates);
  if (consentSessionAccessLimited(bundle,artifact) || !inspection || inspection.structuralCoverage !== "complete" ||
      inspection.captureCoverage.inventoryTruncated || !inspection.captureCoverage.mainFrameAvailable ||
      !inspection.captureCoverage.documentAndFramesStable) return block("passive_capture_incomplete");

  const observations = bundle.consentUiObservations.filter(row => row.layerInspected === "first_layer" &&
    row.documentUrl === document.url && row.documentIdentity?.source === "cdp_loader_id" &&
    row.documentIdentity.token === identity.token && row.captureStatus === "observed" &&
    row.captureDiagnostics?.completedChannels.includes("dom_inventory") &&
    row.captureDiagnostics.completedChannels.includes("geometry") && !row.captureDiagnostics.failedChannels.length &&
    !row.captureDiagnostics.timedOutChannels.length && !row.inventoryDiagnostics?.blockingInaccessibleFrameCount);
  if (!observations.length) return block("passive_capture_incomplete");
  const controls = observations.flatMap(row => row.controls.filter(c => c.visible && c.actionType === "reject_all"));
  const firstLayer = artifact.candidates.filter(c => c.layer === "first_layer");
  const candidates = firstLayer.filter(c => c.actionType === "reject_all" && c.decisionStatus === "confirmed_visible");
  if (!controls.length && !candidates.length) return block("no_first_layer_reject");
  if (controls.length > 1 || candidates.length > 1) return block("control_ambiguous");
  if (firstLayer.some(c => c.decisionStatus === "ambiguous" &&
      c.classifierReasonCodes?.includes("visible_accessible_intent_conflict") &&
      [c.label,c.ariaLabel,c.title,c.value].some(label => label && directReject(label)))) return block("label_conflict_unresolved");
  const control = controls[0], candidate = candidates[0];
  if (!control || !candidate || candidate.frameContext?.frameKind !== "main_frame" ||
      candidate.frameContext.frameUrl !== document.url || candidate.exactNativeRejectSelectorVerified !== true ||
      !validExactSelector(candidate.selectorHint) || candidate.enabled !== true || candidate.intersectsViewport !== true || candidate.occlusion?.center !== true ||
      candidate.consentContextConfirmed !== true || candidate.tagName !== "button" || control.tagName !== "button" ||
      !isConsentControlInteractionEligible(candidate) || !isConsentControlInteractionEligible(control) ||
      !inspection.candidates.some(row => row.candidateId === candidate.candidateId && row.role === "decision" &&
        !row.unresolvedIntents.includes("reject")) ||
      control.selectorHint !== candidate.selectorHint || control.label !== (candidate.ariaLabel ?? candidate.label) ||
      !candidate.label || ![candidate.label,candidate.ariaLabel,candidate.title,candidate.value].every(label =>
        label === undefined || (typeof label === "string" && (!label || directReject(label)))) ||
      control.domBinding) {
    return block("control_binding_unverified");
  }
  const expiresAtMs = Math.min(input.deadlineAtMs ?? Infinity, nowMs + proofLifetimeMs);
  if (expiresAtMs <= nowMs) return block("proof_expired");
  return {outcome:"qualified",exactSelector:candidate.selectorHint,issuedAtMs:nowMs,expiresAtMs,binding:{
    parentDispatchSha256:input.parentDispatchSha256,sourceSha256:input.sourceSha256,geometrySha256:geometry.sha256,
    requestedTargetSha256:target,documentSha256,documentTokenSha256:sha(identity.token),selectorSha256:sha(candidate.selectorHint),
    selectorEvidence:"verified_geometry",labelSha256:sha(control.label),labelMatch:"exact",
    ...(candidate.ariaLabel ? {labelSource:"aria_label" as const} : {}),
  }};
}

export type RejectGateWorkerRecheck = {outcome:"passed" | "failed"; observedAtMs:number; packetSha256:string};
export function readRejectGateWorkerRecheck(value: unknown): RejectGateWorkerRecheck | undefined {
  if (!value || typeof value !== "object" || Object.keys(value).length !== 3) return undefined;
  const {outcome,observedAtMs,packetSha256} = value as Partial<RejectGateWorkerRecheck>;
  if ((outcome === "passed" || outcome === "failed") && typeof observedAtMs === "number" &&
      Number.isSafeInteger(observedAtMs) && observedAtMs >= 0 && typeof packetSha256 === "string" && digest.test(packetSha256)) {
    return {outcome,observedAtMs,packetSha256};
  }
}

function dispatchDecision(passive: RejectGateDecision | undefined, at: number | undefined) {
  if (at === undefined) return {outcome:"not_attempted"} as const;
  if (!passive || at < (passive.outcome === "qualified" ? passive.issuedAtMs : passive.evaluatedAtMs)) {
    return {outcome:"would_block",blockReason:"proof_not_verified_at_dispatch"} as const;
  }
  if (passive.outcome === "blocked") return {outcome:"would_block",blockReason:passive.reason} as const;
  return at >= passive.expiresAtMs ? {outcome:"would_block",blockReason:"proof_expired"} as const : {outcome:"would_allow"} as const;
}

function finalOutcome(input: {
  enforcementActive: boolean; passive: RejectGateDecision; dispatchAtMs?: number;
  passiveAtDispatch?: RejectGateDecision;
  packet?: {sha256:string; proof?: ConsentActionControlProof}; worker?: RejectGateWorkerRecheck;
}) {
  if (!input.enforcementActive) return {outcome:"not_run",reason:"shadow_only"} as const;
  if (input.dispatchAtMs === undefined) return {outcome:"not_run",reason:"exact_recheck_not_reached"} as const;
  if (!input.packet) return {outcome:"unavailable",reason:"worker_evidence_unverified"} as const;
  if (!input.worker) return {outcome:"not_run",reason:"exact_recheck_not_reached"} as const;
  const {passive,worker} = input;
  const proof = input.packet.proof;
  if (passive.outcome !== "qualified" || input.passiveAtDispatch !== passive || !proof || worker.packetSha256 !== input.packet.sha256 ||
      worker.observedAtMs < input.dispatchAtMs || input.dispatchAtMs < passive.issuedAtMs ||
      input.dispatchAtMs >= passive.expiresAtMs || (worker.outcome === "passed" && worker.observedAtMs >= passive.expiresAtMs) ||
      !rejectGateControlMatches(passive.binding, proof)) {
    return {outcome:"unavailable",reason:"worker_proof_binding_invalid"} as const;
  }
  return worker.outcome === "failed" ? {outcome:"failed",observedAtMs:worker.observedAtMs,blockReason:"exact_recheck_unverified"} as const
    : {outcome:"passed",observedAtMs:worker.observedAtMs} as const;
}

/** This receipt has no effect on the existing Reject workflow or dispatch authorization. */
export function buildRejectGateShadowReceipt(input: Parameters<typeof finalOutcome>[0] & {
  scanId: string;
}) {
  const {passive} = input;
  return {version:"certscore.reject-gate-shadow-receipt.v1" as const,mode:"shadow" as const,
    scanId:input.scanId,enforcementActive:input.enforcementActive,
    passive:passive.outcome === "qualified" ? {outcome:"qualified" as const} : {outcome:"blocked" as const,blockReason:passive.reason},
    ...(passive.outcome === "qualified" ? {binding:passive.binding} : {}),
    timing:{passiveEvaluatedAtMs:passive.outcome === "qualified" ? passive.issuedAtMs : passive.evaluatedAtMs,
      ...(passive.outcome === "qualified" ? {proofIssuedAtMs:passive.issuedAtMs,proofExpiresAtMs:passive.expiresAtMs} : {}),
      ...(input.dispatchAtMs === undefined ? {} : {dispatchObservedAtMs:input.dispatchAtMs}),
    },
    dispatch:dispatchDecision(input.passiveAtDispatch,input.dispatchAtMs),
    finalRecheck:finalOutcome(input),
  };
}
export type RejectGateShadowReceipt = ReturnType<typeof buildRejectGateShadowReceipt>;
