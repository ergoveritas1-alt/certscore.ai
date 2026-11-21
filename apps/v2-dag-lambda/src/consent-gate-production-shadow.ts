import { deriveAcceptFirstLayerProof, type AcceptFirstLayerGeometrySource, type AcceptGatePassiveDecision } from "@certscore/scan-core/accept-first-layer-gate";
import { buildAcceptGateShadowReceipt } from "@certscore/scan-core/accept-gate-shadow-receipt";
import { buildRejectGateShadowReceipt, evaluateRejectGate, type RejectGateDecision } from "@certscore/scan-core/reject-gate-shadow-receipt";
import type { CanonicalEvidenceBundle, PostAcceptEvidencePacket, PostRefusalEvidencePacket } from "@certscore/contracts";

export type ConsentGateShadowChannels = { accept: boolean; reject: boolean };
type Passive = { accept?: AcceptGatePassiveDecision; reject?: RejectGateDecision };
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
  return passive;
}

function summarizeAction(action: "accept" | "reject", scanId: string, receipt: ReturnType<typeof buildAcceptGateShadowReceipt> |
  ReturnType<typeof buildRejectGateShadowReceipt>, baseline: ShadowAction) {
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
    click, boundControl, dispatch: receipt.dispatch, passive: receipt.passive,
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
}) {
  const { scanId, channels, passive, accept, reject, nowMs } = input;
  const unavailable = { outcome: "blocked", reason: "source_unavailable", evaluatedAtMs: nowMs } as const;
  const acceptPassive = passive?.accept ?? unavailable;
  const rejectPassive = passive?.reject ?? unavailable;
  const acceptGateShadowReceipt = channels.accept ? buildAcceptGateShadowReceipt({
    scanId, passive: acceptPassive, dispatchAtMs: accept.dispatchAtMs, packetVerified: false, enforcementActive: false,
    ...(accept.dispatchAtMs !== undefined &&
      (acceptPassive.outcome === "qualified" ? acceptPassive.proof.issuedAtMs : acceptPassive.evaluatedAtMs) <= accept.dispatchAtMs
      ? { passiveAtDispatch: acceptPassive } : {}),
  }) : undefined;
  const rejectGateShadowReceipt = channels.reject ? buildRejectGateShadowReceipt({
    scanId, passive: rejectPassive, dispatchAtMs: reject.dispatchAtMs, enforcementActive: false,
    ...(reject.dispatchAtMs !== undefined &&
      (rejectPassive.outcome === "qualified" ? rejectPassive.issuedAtMs : rejectPassive.evaluatedAtMs) <= reject.dispatchAtMs
      ? { passiveAtDispatch: rejectPassive } : {}),
  }) : undefined;
  return {
    ...(acceptGateShadowReceipt ? { acceptGateShadowReceipt } : {}),
    ...(rejectGateShadowReceipt ? { rejectGateShadowReceipt } : {}),
    baseline: {
      ...(acceptGateShadowReceipt ? { accept: summarizeAction("accept", scanId, acceptGateShadowReceipt, accept) } : {}),
      ...(rejectGateShadowReceipt ? { reject: summarizeAction("reject", scanId, rejectGateShadowReceipt, reject) } : {}),
    },
  };
}

export type ProductionConsentGateShadowFields = Omit<ReturnType<typeof buildProductionConsentGateShadow>, "baseline">;
