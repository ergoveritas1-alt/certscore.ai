import { createHash } from "node:crypto";
import type { ConsentActionControlProof } from "@certscore/contracts";
import type { AcceptFirstLayerProof } from "@certscore/scan-core/accept-first-layer-gate";
import { canonicalSha256 } from "@certscore/scan-core/post-refusal-reconciliation";
import { rejectGateControlMatches, type RejectFirstLayerProof } from "@certscore/scan-core/reject-gate-shadow-receipt";

export const REJECT_CLICK_CHECKPOINT_FILE = "RejectClickCheckpoint.json";
export const REJECT_CLICK_CHECKPOINT_MAX_BYTES = 512;
type Action = "accept" | "reject";
type ClickProof = { action: "accept"; proof: AcceptFirstLayerProof } | { action: "reject"; proof: RejectFirstLayerProof };
const checkpointVersion = <A extends Action>(action: A) => `certscore.${action}-click-checkpoint.v1` as const;
export const CONSENT_CLICK_CHECKPOINT_FILES = { accept: "AcceptClickCheckpoint.json", reject: REJECT_CLICK_CHECKPOINT_FILE } as const;

type ClickCheckpoint = {
  version: ReturnType<typeof checkpointVersion>;
  scanId: string;
  gateProofSha256: string;
  recheckedAtMs: number;
  dispatchedAtMs: number;
  completedAtMs: number;
};

export type VerifiedConsentClickCheckpoint = ClickCheckpoint & { receiptSha256: string; verifiedAtMs: number };

function validTimes(value: ClickCheckpoint, proof: ClickProof["proof"]) {
  const { recheckedAtMs, dispatchedAtMs, completedAtMs } = value;
  return [recheckedAtMs, dispatchedAtMs, completedAtMs].every(Number.isSafeInteger) &&
    recheckedAtMs >= proof.issuedAtMs && recheckedAtMs <= dispatchedAtMs &&
    dispatchedAtMs < proof.expiresAtMs && dispatchedAtMs <= completedAtMs;
}

type ClickTimes = Pick<ClickCheckpoint, "recheckedAtMs" | "dispatchedAtMs" | "completedAtMs">;

export function buildConsentClickCheckpoint(
  binding: ClickProof, control: ConsentActionControlProof, times: ClickTimes,
): Buffer | undefined {
  const { action, proof } = binding;
  const receipt: ClickCheckpoint = {
    version: checkpointVersion(action), scanId: proof.scanId, gateProofSha256: canonicalSha256(proof), ...times,
  };
  if (!validTimes(receipt, proof)) return;
  if (binding.action === "reject") {
    if (!rejectGateControlMatches(binding.proof.binding, control)) return;
  } else {
    const accept = binding.proof;
    const sha = (value: string) => createHash("sha256").update(value).digest("hex");
    if (!accept.exactSelector || !accept.geometrySha256 || control.action !== "accept" ||
        control.actionSemantics !== "direct_label" || control.authorizedTargetSha256 !== accept.documentSha256 ||
        control.frameIdentitySha256 !== accept.documentSha256 || sha(control.selectorHint) !== accept.selectorSha256 ||
        sha(control.accessibleLabel) !== accept.labelSha256 ||
        (accept.labelSource !== undefined && control.labelSource !== accept.labelSource)) return;
  }
  const body = Buffer.from(JSON.stringify(receipt));
  return body.byteLength <= REJECT_CLICK_CHECKPOINT_MAX_BYTES ? body : undefined;
}

export function buildRejectClickCheckpoint(proof: RejectFirstLayerProof, control: ConsentActionControlProof, times: ClickTimes) {
  return buildConsentClickCheckpoint({ action: "reject", proof }, control, times);
}

export function verifyConsentClickCheckpoint(input: {
  body: Buffer;
  metadataSha256?: string;
  binding: ClickProof;
  coordinatorDispatchAtMs: number;
  verifiedAtMs: number;
  deadlineAtMs: number;
}): VerifiedConsentClickCheckpoint | undefined {
  const { body, metadataSha256, binding, coordinatorDispatchAtMs, verifiedAtMs, deadlineAtMs } = input;
  const { action, proof } = binding;
  if (body.byteLength === 0 || body.byteLength > REJECT_CLICK_CHECKPOINT_MAX_BYTES ||
      verifiedAtMs >= deadlineAtMs) return;
  const receiptSha256 = createHash("sha256").update(body).digest("hex");
  if (metadataSha256 !== receiptSha256) return;
  let row: ClickCheckpoint;
  try { row = JSON.parse(body.toString("utf8")); }
  catch { return; }
  if (!row || Object.keys(row).length !== 6 || row.version !== checkpointVersion(action) || row.scanId !== proof.scanId ||
      row.gateProofSha256 !== canonicalSha256(proof) || !validTimes(row, proof) ||
      row.recheckedAtMs < coordinatorDispatchAtMs || row.completedAtMs > verifiedAtMs) return;
  return { ...row, receiptSha256, verifiedAtMs };
}

export function verifyRejectClickCheckpoint(input: Omit<Parameters<typeof verifyConsentClickCheckpoint>[0], "binding"> &
  { proof: RejectFirstLayerProof }) {
  return verifyConsentClickCheckpoint({ ...input, binding: { action: "reject", proof: input.proof } });
}
