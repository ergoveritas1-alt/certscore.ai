import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { GetObjectCommand, PutObjectCommand, type GetObjectCommandOutput, type PutObjectCommandOutput } from "@aws-sdk/client-s3";
import { ACCEPT_FIRST_LAYER_GATE_MS, scopedConsentActionWindowMs, acceptFirstLayerProofMatches, readAcceptFirstLayerProof, type AcceptFirstLayerProof } from "@certscore/scan-core/accept-first-layer-gate";
import { rejectFirstLayerProofMatches, type RejectFirstLayerProof } from "@certscore/scan-core/reject-gate-shadow-receipt";

export type ActionLane = "accept" | "reject";
type ExactProof = AcceptFirstLayerProof | RejectFirstLayerProof;
export type ActionPreparation = { id: string; waitUntilMs: number };
export const EVIDENCE_WORKER_SCAN_BUDGET_MS = 37_000;
// Keep one full exact-proof window inside the existing scan-work allowance.
export const MAX_ACTION_PREPARATION_MS = EVIDENCE_WORKER_SCAN_BUDGET_MS - ACCEPT_FIRST_LAYER_GATE_MS;
const MAX_RELEASE_BYTES = 8192;
const VERSION = "certscore.action-preparation.v1";
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
type Put = { send(cmd: PutObjectCommand, options: { abortSignal: AbortSignal }): Promise<PutObjectCommandOutput> };
type Get = { send(cmd: GetObjectCommand, options: { abortSignal: AbortSignal }): Promise<GetObjectCommandOutput> };
type Binding = { action: ActionLane; scanId: string; targetUrl: string; parentDispatchSha256: string };

export function newActionPreparation(deadlineMs: number): ActionPreparation {
  return { id: randomUUID(), waitUntilMs: Math.min(Date.now() + MAX_ACTION_PREPARATION_MS, deadlineMs) };
}

export function parseActionPreparation(value: unknown, now = Date.now()): ActionPreparation | undefined {
  if (!value || typeof value !== "object") return;
  const { id, waitUntilMs } = value as ActionPreparation;
  if (Object.keys(value).length === 2 && typeof id === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id) &&
      Number.isSafeInteger(waitUntilMs) && now < waitUntilMs && waitUntilMs <= now + MAX_ACTION_PREPARATION_MS) {
    return { id, waitUntilMs };
  }
}

function boundProof(value: unknown, binding: Binding): ExactProof | undefined {
  const now = Date.now();
  if (binding.action === "reject") {
    return rejectFirstLayerProofMatches(value, binding.scanId, binding.targetUrl, binding.parentDispatchSha256, now)
      ? value : undefined;
  }
  const proof = readAcceptFirstLayerProof(value);
  return proof?.exactSelector && proof.parentDispatchSha256 === binding.parentDispatchSha256 &&
    acceptFirstLayerProofMatches(proof, binding.scanId, binding.targetUrl, now) ? proof : undefined;
}

// Both participants derive the key from their own scan and lane. Conditional
// writes prevent a stale release or a redelivered invocation from claiming it twice.
export function actionReleaseStore(bucket: string, lanePrefix: string, attempt: ActionPreparation, put: Put) {
  const key = lanePrefix + "/preparation/" + attempt.id + ".json";
  async function write(state: "pending" | "ready" | "released" | "declined" | "claimed", tag: string | undefined,
    signal: AbortSignal, proof?: ExactProof) {
    signal.throwIfAborted();
    const body = Buffer.from(JSON.stringify({ version: VERSION, id: attempt.id, state, proof }));
    const response = await put.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: body, ContentType: "application/json", Metadata: { sha256: digest(body) },
      ...(tag ? { IfMatch: tag } : { IfNoneMatch: "*" }),
    }), { abortSignal: signal });
    if (!response.ETag) throw new Error("action_release_missing_etag");
    return response.ETag;
  }
  async function read(get: Get, signal: AbortSignal) {
    signal.throwIfAborted();
    const obj = await get.send(new GetObjectCommand({
      Bucket: bucket, Key: key, Range: "bytes=0-" + MAX_RELEASE_BYTES,
    }), { abortSignal: signal });
    if (!obj.Body || !obj.ETag || !obj.ContentLength || obj.ContentLength > MAX_RELEASE_BYTES ||
        obj.ContentRange !== `bytes 0-${obj.ContentLength - 1}/${obj.ContentLength}`) {
      throw new Error("action_release_invalid_object");
    }
    const bytes = await obj.Body.transformToByteArray();
    if (bytes.length !== obj.ContentLength || obj.Metadata?.sha256 !== digest(bytes)) {
      throw new Error("action_release_invalid_checksum");
    }
    const row = JSON.parse(Buffer.from(bytes).toString("utf8"));
    if (row?.version !== VERSION || row.id !== attempt.id) throw new Error("action_release_binding_mismatch");
    return { row, tag: obj.ETag };
  }
  const poll = (deadline: number, signal: AbortSignal) =>
    delay(Math.min(200, Math.max(1, deadline - Date.now())), undefined, { signal });
  return {
    initialize: (signal: AbortSignal) => write("pending", undefined, signal),
    release: (tag: string, proof: ExactProof, signal: AbortSignal) => write("released", tag, signal, proof),
    async markReady(get: Get, signal: AbortSignal) {
      const { row, tag } = await read(get, signal);
      if (row.state !== "pending") throw new Error("action_release_unavailable");
      await write("ready", tag, signal);
    },
    async decline(get: Get, signal: AbortSignal) {
      // The worker may win pending -> ready while the coordinator declines.
      for (let attempt = 0; attempt < 2; attempt++) {
        const { row, tag } = await read(get, signal);
        if (row.state !== "pending" && row.state !== "ready") return;
        try {
          await write("declined", tag, signal);
          return;
        } catch (error) {
          if (!(error instanceof Error) || error.name !== "PreconditionFailed" || attempt !== 0) throw error;
        }
      }
    },
    async waitForReady(get: Get, deadlineAtMs: number, signal: AbortSignal) {
      const deadline = Math.min(attempt.waitUntilMs, deadlineAtMs);
      while (Date.now() < deadline) {
        const { row, tag } = await read(get, signal);
        if (row.state === "ready" && Date.now() < deadline) return tag;
        if (row.state !== "pending") break;
        await poll(deadline, signal);
      }
      throw new Error("action_release_browser_not_ready_before_deadline");
    },
    async take(get: Get, binding: Binding, signal: AbortSignal): Promise<ExactProof> {
      while (Date.now() < attempt.waitUntilMs) {
        const { row, tag } = await read(get, signal);
        if (row.state === "ready" || row.state === "pending") {
          await poll(attempt.waitUntilMs, signal);
          continue;
        }
        if (row.state !== "released") throw new Error("action_release_unavailable");
        const proof = boundProof(row.proof, binding);
        if (!proof) throw new Error("action_release_invalid_proof");
        await write("claimed", tag, signal);
        signal.throwIfAborted();
        if (Date.now() >= Math.min(proof.expiresAtMs, attempt.waitUntilMs)) throw new Error("action_release_expired");
        return proof;
      }
      throw new Error("action_release_timeout");
    },
  };
}

/** Issue the dispatch proof once blank preparation is acknowledged. The
 * original qualification must still be fresh, with every binding unchanged. */
export function proofForReadyAction<P extends ExactProof>(proof: P, deadlineAtMs: number, now = Date.now()): P {
  if (now < proof.issuedAtMs || now >= Math.min(proof.expiresAtMs, deadlineAtMs)) {
    throw new Error("action_release_expired");
  }
  const extended = "binding" in proof ? scopedConsentActionWindowMs("reject", proof.exactSelector, proof.binding)
    : scopedConsentActionWindowMs("accept", proof.exactSelector, proof);
  return { ...proof, issuedAtMs: now, expiresAtMs: Math.min(deadlineAtMs, now + (extended ?? ACCEPT_FIRST_LAYER_GATE_MS)) };
}
