import { deriveAcceptFirstLayerProof, type AcceptFirstLayerGeometrySource, type AcceptGatePassiveDecision } from "@certscore/scan-core/accept-first-layer-gate";
import { buildAcceptGateShadowReceipt, type AcceptGateWorkerRecheck } from "@certscore/scan-core/accept-gate-shadow-receipt";
import { buildRejectGateShadowReceipt, evaluateRejectGate, type RejectGateDecision, type RejectGateWorkerRecheck } from "@certscore/scan-core/reject-gate-shadow-receipt";
import type { CanonicalEvidenceBundle, PostAcceptEvidencePacket, PostRefusalEvidencePacket } from "@certscore/contracts";

export type ConsentGateShadowChannels = { accept: boolean; reject: boolean };
type Passive = { accept?: AcceptGatePassiveDecision; reject?: RejectGateDecision; axOnly?: ConsentGateShadowChannels };
type Packet = PostAcceptEvidencePacket | PostRefusalEvidencePacket;
type ShadowAction = {
  dispatchAtMs?: number;
  completedAtMs?: number;
  deadlineAtMs: number;
  packet?: Packet;
};

export function evaluateConsentGateShadow(input: {
  channels: ConsentGateShadowChannels;
  bundle: CanonicalEvidenceBundle;
  scanId: string;
  targetUrl: string;
  sourceSha256: string;
  parentDispatchSha256: string;
  nowMs: number;
  deadlineAtMs: number;
  geometry?: AcceptFirstLayerGeometrySource;
}): Passive {
  const passive: Passive = {};
  if (input.channels.accept) {
    deriveAcceptFirstLayerProof({
      ...input, requireExactSelector: true, onDecision: decision => { passive.accept = decision; },
    });
  }
  if (input.channels.reject) passive.reject = evaluateRejectGate(input);
  const document = input.bundle.domSnapshots.at(-1);
  const axOnly = (action: "accept" | "reject") => {
    const result = passive[action];
    if (!document || result?.outcome !== "blocked" || result.reason !== "control_binding_unverified") return false;
    const controls = input.bundle.consentUiObservations.filter(observation =>
      observation.layerInspected === "first_layer" && observation.documentUrl === document.url &&
      !!document.documentIdentity?.token && observation.documentIdentity?.token === document.documentIdentity.token
    ).flatMap(observation => observation.controls.filter(control => control.visible && control.actionType === `${action}_all`));
    return controls.length > 0 && controls.every(control => Boolean(control.domBinding));
  };
  passive.axOnly = {accept:axOnly("accept"),reject:axOnly("reject")};
  return passive;
}

function summarizeAction(action: "accept" | "reject", scanId: string, receipt: ReturnType<typeof buildAcceptGateShadowReceipt> |
  ReturnType<typeof buildRejectGateShadowReceipt>, baseline: ShadowAction, axOnlyBinding?: boolean, gateDecline?: string) {
  const packet = baseline.packet?.parentScanId === scanId ? baseline.packet : undefined;
  const observed = packet?.interactionDiagnostics?.click.outcome;
  // A confirmation after a click error never substitutes for a completed input.
  const click = !packet || !observed ? "unverified" : observed === "completed" ? "completed" :
    observed === "not_attempted" ? "not_attempted" : "incomplete";
  const control = packet?.actionControlProof;
  const boundControl = click === "completed" && control?.action === action &&
    !!control.frameIdentitySha256 && !!control.authorizedTargetSha256;
  const { proofIssuedAtMs, proofExpiresAtMs } = receipt.timing;
  const { dispatchAtMs, completedAtMs, deadlineAtMs } = baseline;
  const shiftedStart = proofIssuedAtMs === undefined || dispatchAtMs === undefined
    ? undefined : Math.max(proofIssuedAtMs, dispatchAtMs);
  const projectedSlackMs = shiftedStart === undefined || completedAtMs === undefined ||
    dispatchAtMs === undefined || !Number.isSafeInteger(deadlineAtMs) || completedAtMs < dispatchAtMs
    ? undefined : deadlineAtMs - shiftedStart - (completedAtMs - dispatchAtMs);
  return {
    click, boundControl, ...(axOnlyBinding ? { axOnlyBinding:true } : {}), dispatch: receipt.dispatch, passive: receipt.passive,
    ...(receipt.enforcementActive ? { enforcementActive:true, finalRecheck:receipt.finalRecheck,
      ...(gateDecline ? {gateDecline} : {}) } : {}),
    ...(proofIssuedAtMs !== undefined && dispatchAtMs !== undefined
      ? { proofDeltaFromDispatchMs: proofIssuedAtMs - dispatchAtMs } : {}),
    ...(projectedSlackMs !== undefined && shiftedStart !== undefined && proofExpiresAtMs !== undefined
      ? { estimatedWorkerReturnSlackMs: projectedSlackMs, proofFreshAtEstimatedDispatch: shiftedStart < proofExpiresAtMs } : {}),
  };
}

export function buildProductionConsentGateShadow(input: {
  scanId: string;
  channels: ConsentGateShadowChannels;
  passive?: Passive;
  accept: ShadowAction;
  reject: ShadowAction;
  nowMs: number;
  enforced?: ConsentGateShadowChannels;
  gateDeclines?: Partial<Record<"accept" | "reject", string>>;
  acceptPacketBound?: boolean;
  rejectPacketBound?: boolean;
  acceptRecheck?: AcceptGateWorkerRecheck;
  rejectRecheck?: RejectGateWorkerRecheck;
  rejectPacketSha256?: string;
}) {
  const { scanId, channels, passive, accept, reject, nowMs } = input;
  const unavailable = { outcome: "blocked", reason: "source_unavailable", evaluatedAtMs: nowMs } as const;
  const acceptPassive = passive?.accept ?? unavailable;
  const rejectPassive = passive?.reject ?? unavailable;
  const acceptGateShadowReceipt = channels.accept ? buildAcceptGateShadowReceipt({
    scanId, passive: acceptPassive, dispatchAtMs: accept.dispatchAtMs,
    packetVerified: input.acceptPacketBound === true, enforcementActive: input.enforced?.accept === true,
    workerRecheck: input.acceptRecheck,
    ...(accept.dispatchAtMs !== undefined &&
      (acceptPassive.outcome === "qualified" ? acceptPassive.proof.issuedAtMs : acceptPassive.evaluatedAtMs) <= accept.dispatchAtMs
      ? { passiveAtDispatch: acceptPassive } : {}),
  }) : undefined;
  const rejectGateShadowReceipt = channels.reject ? buildRejectGateShadowReceipt({
    scanId, passive: rejectPassive, dispatchAtMs: reject.dispatchAtMs, enforcementActive: input.enforced?.reject === true, worker:input.rejectRecheck,
    ...(input.rejectPacketBound && input.rejectPacketSha256 && reject.packet ? {
      packet:{sha256:input.rejectPacketSha256,proof:reject.packet.actionControlProof},
    } : {}),
    ...(reject.dispatchAtMs !== undefined &&
      (rejectPassive.outcome === "qualified" ? rejectPassive.issuedAtMs : rejectPassive.evaluatedAtMs) <= reject.dispatchAtMs
      ? { passiveAtDispatch: rejectPassive } : {}),
  }) : undefined;
  return {
    ...(acceptGateShadowReceipt ? { acceptGateShadowReceipt } : {}),
    ...(rejectGateShadowReceipt ? { rejectGateShadowReceipt } : {}),
    baseline: {
      ...(acceptGateShadowReceipt ? { accept: summarizeAction("accept", scanId, acceptGateShadowReceipt, accept, passive?.axOnly?.accept, input.gateDeclines?.accept) } : {}),
      ...(rejectGateShadowReceipt ? { reject: summarizeAction("reject", scanId, rejectGateShadowReceipt, reject, passive?.axOnly?.reject, input.gateDeclines?.reject) } : {}),
    },
  };
}

export type ProductionConsentGateShadowFields = Omit<ReturnType<typeof buildProductionConsentGateShadow>, "baseline">;
