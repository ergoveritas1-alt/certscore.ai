import { createHash } from "node:crypto";
import { consentActionControlProofSchema, type ConsentActionControlProof } from "@certscore/contracts";
import { canonicalSha256 } from "@certscore/scan-core/post-refusal-reconciliation";

import { isReviewedWorkerNecessaryOnlyRejectProof, workerDiscoveredFrameMatchesTarget } from "@certscore/scan-core/post-refusal-target-authorization";

type Action = "accept" | "reject";
export type WorkerDiscoveredClick = {
  control: ConsentActionControlProof;
  recheckedAtMs: number;
  dispatchedAtMs: number;
  completedAtMs: number;
  deadlineAtMs: number;
};
type Binding = {
  scanId: string;
  action: Action;
  parentDispatchSha256: string;
  requestedUrl: string;
};
type Packet = {
  parentScanId: string;
  targetUrl: string;
  normalizedUrl: string;
  exactTargetSha256?: string;
  actionControlProof?: ConsentActionControlProof;
  interactionDiagnostics?: {
    click?: { outcome: string };
    navigation?: {
      documentCommitted: boolean;
      finalUrlAuthorized: boolean;
      redirectResolution?: {
        status: string;
        requestedTargetSha256: string;
        finalExactTargetSha256?: string;
      };
    };
  };
};
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const digest = /^[a-f0-9]{64}$/;
export const WORKER_DISCOVERED_CLICK_VERSION = "certscore.worker-discovered-click.v1";
export const WORKER_DISCOVERED_CLICK_MAX_BYTES = 1024;
export const WORKER_DISCOVERED_CLICK_FILE = "WorkerDiscoveredClick.json";

function digestTarget(value: string) {
  const url = new URL(value);
  url.hash = "";
  return sha(url.href);
}

function displayTarget(value: string) {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.href.slice(0, 500);
}

export function assessWorkerDiscoveredClick(binding: Binding, click: WorkerDiscoveredClick, bytes: Buffer):
  | {body: Buffer}
  | {reason: "packet_invalid" | "target_mismatch" | "control_mismatch" | "invalid_timing" | "insufficient_reserve"} {
  let requestedTargetSha256: string;
  try {
    const packet: Packet = JSON.parse(bytes.toString());
    if (!packet || packet.parentScanId !== binding.scanId || !digest.test(binding.parentDispatchSha256) ||
        packet.interactionDiagnostics?.click?.outcome !== "completed") return {reason: "packet_invalid"};
    requestedTargetSha256 = digestTarget(binding.requestedUrl);
    const displayTargetSha256 = digestTarget(packet.targetUrl);
    const exactTargetSha256 = packet.exactTargetSha256 ?? displayTargetSha256;
    const navigation = packet.interactionDiagnostics.navigation;
    const redirect = navigation?.redirectResolution;
    // Report URLs drop query values. Only a committed, authorized redirect can
    // substitute the retained exact destination digest for the display URL.
    const verifiedRedirect = navigation?.documentCommitted === true && navigation.finalUrlAuthorized === true &&
      redirect?.status === "resolved" && redirect.requestedTargetSha256 === requestedTargetSha256 &&
      redirect.finalExactTargetSha256 === exactTargetSha256 && packet.targetUrl === displayTarget(packet.targetUrl);
    if (!digest.test(exactTargetSha256) ||
        (digestTarget(packet.normalizedUrl) !== requestedTargetSha256 &&
          !(verifiedRedirect && packet.normalizedUrl === displayTarget(binding.requestedUrl))) ||
        (exactTargetSha256 !== displayTargetSha256 && !verifiedRedirect)) return {reason: "target_mismatch"};
    if (!consentActionControlProofSchema.safeParse(click.control).success || !packet.actionControlProof ||
        click.control.action !== binding.action ||
        (click.control.actionSemantics !== "direct_label" && !isReviewedWorkerNecessaryOnlyRejectProof(binding.requestedUrl, click.control)) ||
        click.control.authorizedTargetSha256 !== exactTargetSha256 ||
        !workerDiscoveredFrameMatchesTarget(click.control) ||
        canonicalSha256(packet.actionControlProof) !== canonicalSha256(click.control)) return {reason: "control_mismatch"};
  } catch { return {reason: "packet_invalid"}; }
  const {recheckedAtMs, dispatchedAtMs, completedAtMs, deadlineAtMs} = click;
  if (![recheckedAtMs, dispatchedAtMs, completedAtMs, deadlineAtMs].every(time => Number.isSafeInteger(time) && time > 0) ||
      recheckedAtMs > dispatchedAtMs || dispatchedAtMs > completedAtMs) return {reason: "invalid_timing"};
  if (deadlineAtMs - completedAtMs < 200) return {reason: "insufficient_reserve"};
  return {body: Buffer.from(JSON.stringify({
    version:WORKER_DISCOVERED_CLICK_VERSION, scanId:binding.scanId, action:binding.action, parentDispatchSha256:binding.parentDispatchSha256,
    requestedTargetSha256, packetSha256:sha(bytes),
    controlSha256:canonicalSha256(click.control), recheckedAtMs, dispatchedAtMs, completedAtMs, deadlineAtMs,
  }))};
}

export function buildWorkerDiscoveredClick(binding: Binding, click: WorkerDiscoveredClick, bytes: Buffer) {
  const result = assessWorkerDiscoveredClick(binding, click, bytes);
  return "body" in result ? result.body : undefined;
}

export function verifyWorkerDiscoveredClick(input: {
  body: Buffer; metadataSha256?: string; packetBytes: Buffer; packetSha256: string;
  binding: Binding; workerDispatchedAtMs: number; readAtMs: number;
}) {
  if (![input.workerDispatchedAtMs,input.readAtMs].every(Number.isSafeInteger) ||
      input.workerDispatchedAtMs <= 0 || input.readAtMs < input.workerDispatchedAtMs ||
      !input.body.length || input.body.length > WORKER_DISCOVERED_CLICK_MAX_BYTES || sha(input.body) !== input.metadataSha256 ||
      sha(input.packetBytes) !== input.packetSha256) return;
  try {
    const row = JSON.parse(input.body.toString());
    const packet = JSON.parse(input.packetBytes.toString()) as Packet;
    if (!packet.actionControlProof || row.recheckedAtMs < input.workerDispatchedAtMs || row.completedAtMs > input.readAtMs) return;
    const rebuilt = buildWorkerDiscoveredClick(input.binding, {
      control: packet.actionControlProof, recheckedAtMs:row.recheckedAtMs, dispatchedAtMs:row.dispatchedAtMs,
      completedAtMs:row.completedAtMs, deadlineAtMs:row.deadlineAtMs,
    }, input.packetBytes);
    if (rebuilt?.equals(input.body)) return {
      version: WORKER_DISCOVERED_CLICK_VERSION,
      scanId: input.binding.scanId, action: input.binding.action, parentDispatchSha256: input.binding.parentDispatchSha256,
      requestedTargetSha256: digestTarget(input.binding.requestedUrl), packetSha256: input.packetSha256,
      receiptSha256: sha(input.body), controlSha256: canonicalSha256(packet.actionControlProof),
      recheckedAtMs: row.recheckedAtMs as number, dispatchedAtMs: row.dispatchedAtMs as number,
      completedAtMs: row.completedAtMs as number, deadlineAtMs: row.deadlineAtMs as number,
      workerDispatchedAtMs: input.workerDispatchedAtMs, verifiedAtMs: input.readAtMs,
      reserveMs: (row.deadlineAtMs as number) - (row.completedAtMs as number),
    };
  } catch { return; }
}

export type VerifiedWorkerDiscoveredClick = NonNullable<ReturnType<typeof verifyWorkerDiscoveredClick>>;
