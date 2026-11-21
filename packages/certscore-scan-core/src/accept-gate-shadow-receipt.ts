import { createHash } from "node:crypto";
import type { AcceptFirstLayerProof, AcceptGateBlockReason, AcceptGatePassiveDecision } from "./accept-first-layer-gate.js";

export type AcceptGateWorkerRecheck = {
  outcome: "passed" | "failed";
  observedAtMs: number;
  proofSha256: string;
};

export function acceptGateProofDigest(proof: AcceptFirstLayerProof) {
  return createHash("sha256").update(JSON.stringify(Object.entries(proof).sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
}

export function readAcceptGateWorkerRecheck(value: unknown): AcceptGateWorkerRecheck | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 3) return undefined;
  const { outcome, observedAtMs, proofSha256 } = value as Partial<AcceptGateWorkerRecheck>;
  if ((outcome !== "passed" && outcome !== "failed") || typeof observedAtMs !== "number" ||
    !Number.isSafeInteger(observedAtMs) || observedAtMs < 0 ||
    typeof proofSha256 !== "string" || !/^[a-f0-9]{64}$/.test(proofSha256)) return undefined;
  return { outcome, observedAtMs, proofSha256 };
}

type DispatchEvaluation =
  | { outcome: "would_allow" | "not_attempted" }
  | { outcome: "would_block"; blockReason: AcceptGateBlockReason | "proof_not_verified_at_dispatch" };

function dispatchEvaluation(
  passiveAtDispatch: AcceptGatePassiveDecision | undefined,
  dispatchAtMs?: number,
): DispatchEvaluation {
  if (dispatchAtMs === undefined) return { outcome: "not_attempted" };
  if (!passiveAtDispatch) return { outcome: "would_block", blockReason: "proof_not_verified_at_dispatch" };
  if (passiveAtDispatch.outcome === "blocked") return { outcome: "would_block", blockReason: passiveAtDispatch.reason };
  if (dispatchAtMs < passiveAtDispatch.proof.issuedAtMs) {
    return { outcome: "would_block", blockReason: "proof_not_verified_at_dispatch" };
  }
  if (dispatchAtMs >= passiveAtDispatch.proof.expiresAtMs) return { outcome: "would_block", blockReason: "proof_expired" };
  return { outcome: "would_allow" };
}

function finalRecheck(
  enforcementActive: boolean,
  packetVerified: boolean,
  proof: AcceptFirstLayerProof | undefined,
  worker?: AcceptGateWorkerRecheck,
) {
  if (!enforcementActive) return { outcome: "not_run", reason: "shadow_only" } as const;
  if (!proof) return { outcome: "not_run", reason: "passive_gate_blocked" } as const;
  if (!packetVerified) return { outcome: "unavailable", reason: "worker_evidence_unverified" } as const;
  if (!worker) return { outcome: "not_run", reason: "exact_recheck_not_reached" } as const;
  if (worker.proofSha256 !== acceptGateProofDigest(proof) || worker.observedAtMs < proof.issuedAtMs ||
    (worker.outcome === "passed" && worker.observedAtMs >= proof.expiresAtMs)) {
    return { outcome: "unavailable", reason: "worker_proof_binding_invalid" } as const;
  }
  return worker.outcome === "failed"
    ? { outcome: "failed", blockReason: "exact_recheck_unverified", observedAtMs: worker.observedAtMs } as const
    : { outcome: "passed", observedAtMs: worker.observedAtMs } as const;
}

/** The receipt describes what the coordinator actually observed and when. It grants no action authority. */
export function buildAcceptGateShadowReceipt(input: {
  scanId: string;
  passive: AcceptGatePassiveDecision;
  passiveAtDispatch?: AcceptGatePassiveDecision;
  enforcementActive: boolean;
  dispatchAtMs?: number;
  packetVerified: boolean;
  workerRecheck?: AcceptGateWorkerRecheck;
}) {
  const { passive, dispatchAtMs } = input;
  const proof = passive.outcome === "qualified" ? passive.proof : undefined;
  const evaluatedAtMs = passive.outcome === "qualified" ? passive.proof.issuedAtMs : passive.evaluatedAtMs;
  return {
    version: "certscore.accept-gate-shadow-receipt.v1" as const,
    scanId: input.scanId,
    mode: "shadow" as const,
    enforcementActive: input.enforcementActive,
    passive: passive.outcome === "blocked"
      ? { outcome: passive.outcome, blockReason: passive.reason }
      : { outcome: passive.outcome },
    ...(passive.outcome === "qualified" ? { binding: {
      parentDispatchSha256: passive.proof.parentDispatchSha256,
      sourceSha256: passive.proof.sourceSha256,
      geometrySha256: passive.proof.geometrySha256,
      requestedTargetSha256: passive.proof.requestedTargetSha256,
      documentSha256: passive.proof.documentSha256,
      documentTokenSha256: passive.documentTokenSha256,
      selectorSha256: passive.proof.selectorSha256 ?? passive.passiveSelectorSha256,
      selectorEvidence: passive.proof.selectorSha256 ? "verified_geometry" :
        passive.passiveSelectorSha256 ? "passive_hint" : "unavailable",
      labelSha256: passive.proof.labelSha256,
      labelMatch: passive.proof.selectorSha256 ? "exact" : "normalized",
      labelSource: passive.proof.labelSource,
      scopedLabelConflict: passive.proof.scopedLabelConflict,
    } } : {}),
    timing: {
      passiveEvaluatedAtMs: evaluatedAtMs,
      ...(proof ? { proofIssuedAtMs: proof.issuedAtMs, proofExpiresAtMs: proof.expiresAtMs } : {}),
      ...(dispatchAtMs !== undefined ? { dispatchObservedAtMs: dispatchAtMs } : {}),
    },
    dispatch: dispatchEvaluation(input.passiveAtDispatch, dispatchAtMs),
    finalRecheck: finalRecheck(input.enforcementActive, input.packetVerified, proof, input.workerRecheck),
  };
}

export type AcceptGateShadowReceipt = ReturnType<typeof buildAcceptGateShadowReceipt>;
