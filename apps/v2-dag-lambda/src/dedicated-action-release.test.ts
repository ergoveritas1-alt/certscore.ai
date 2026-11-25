import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { GetObjectCommand, PutObjectCommand, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import type { Browser } from "playwright";
import type { RejectFirstLayerProof } from "@certscore/scan-core/reject-gate-shadow-receipt";
import { MAX_ACTION_PREPARATION_MS, actionReleaseStore, newActionPreparation, parseActionPreparation, proofForReadyAction } from "./dedicated-action-release.js";
import { prepareDedicatedConsentWorker } from "./handler.js";

const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const binding = { action: "reject" as const, targetUrl: "https://fixture.invalid/", scanId: "scan", parentDispatchSha256: sha("parent") };
function proof(now = Date.now()): RejectFirstLayerProof {
  return {
    scanId: binding.scanId, outcome: "qualified", issuedAtMs: now, expiresAtMs: now + 6000, exactSelector: "#reject",
    binding: {
      sourceSha256: sha("source"), geometrySha256: sha("geometry"), parentDispatchSha256: binding.parentDispatchSha256,
      requestedTargetSha256: sha(binding.targetUrl), documentSha256: sha(binding.targetUrl), documentTokenSha256: sha("document"),
      selectorSha256: sha("#reject"), selectorEvidence: "verified_geometry", labelSha256: sha("Reject"), labelMatch: "exact",
    },
  };
}

function fixture() {
  let tag: string | undefined;
  let body: Buffer;
  let checksum: string;
  const attempt = newActionPreparation(Infinity);
  const put = { async send({ input }: PutObjectCommand) {
    if (tag ? input.IfMatch !== tag : input.IfNoneMatch !== "*") throw new Error("precondition_failed");
    body = Buffer.from(input.Body as Buffer);
    tag = '"' + sha(body) + '"';
    checksum = input.Metadata!.sha256!;
    return { ETag: tag, $metadata: {} };
  } };
  const get = { async send({ input }: GetObjectCommand): Promise<GetObjectCommandOutput> {
    assert.equal(input.Range, "bytes=0-8192");
    const snapshot = body;
    return { ETag: tag, Metadata: { sha256: checksum }, $metadata: {}, ContentLength: snapshot.length,
      ContentRange: `bytes 0-${snapshot.length - 1}/${snapshot.length}`,
      Body: { transformToByteArray: async () => snapshot } as GetObjectCommandOutput["Body"] };
  } };
  return { store: actionReleaseStore("bucket", "scan/lanes/reject_observation", attempt, put), get,
    corrupt: () => { checksum = sha("different object"); } };
}

test("preparation permits only a fresh bounded attempt", () => {
  const attempt = newActionPreparation(Infinity);
  const now = Date.now();
  assert.deepEqual(parseActionPreparation(attempt, now), attempt);
  for (const changed of [{ id: "same" }, { waitUntilMs: now }, { waitUntilMs: now + MAX_ACTION_PREPARATION_MS + 1 }, { proof: {} }]) {
    assert.equal(parseActionPreparation({ ...attempt, ...changed }, now), undefined);
  }
});

test("two deliveries of one released action can claim it only once", async () => {
  const { store, get } = fixture();
  const signal = AbortSignal.timeout(2000);
  const pending = await store.initialize(signal);
  const original = proof();
  await store.release(pending, original, signal);
  const deliveries = await Promise.allSettled([store.take(get, binding, signal), store.take(get, binding, signal)]);
  assert.equal(deliveries.filter(row => row.status === "fulfilled").length, 1);
  assert.deepEqual(deliveries.find(row => row.status === "fulfilled")?.value, original);
  await assert.rejects(store.release(pending, original, signal), /precondition_failed/);
});

test("a missing, stale, cross-bound, or corrupt release never authorizes the worker", async () => {
  const signal = AbortSignal.timeout(3000);
  for (const changed of [{ action: "accept" as const }, { scanId: "other" }, { targetUrl: binding.targetUrl + "other" },
    { parentDispatchSha256: sha("other") }]) {
    const { store, get } = fixture();
    await store.release(await store.initialize(signal), proof(), signal);
    await assert.rejects(store.take(get, { ...binding, ...changed }, signal), /invalid_proof/);
    assert.ok(await store.take(get, binding, signal));
  }
  for (const scenario of ["declined", "expired", "corrupt"] as const) {
    const { store, get, corrupt } = fixture();
    const pending = await store.initialize(signal);
    if (scenario === "declined") await store.decline(get, signal);
    else await store.release(pending, proof(Date.now() - (scenario === "expired" ? 7000 : 0)), signal);
    if (scenario === "corrupt") corrupt();
    await assert.rejects(store.take(get, binding, signal), /action_release_(unavailable|invalid_checksum|invalid_proof)/);
  }
});

test("a worker abandons a stalled blank launch and closes it even if it arrives after cancellation", async () => {
  let closed = 0;
  let finish!: (browser: Browser) => void;
  const browserReady = new Promise<Browser>(resolve => { finish = resolve; });
  const controller = new AbortController();
  const worker = prepareDedicatedConsentWorker({ action: "reject", deadlineAtMs: Date.now() + 5000, signal: controller.signal,
    launch: () => browserReady, take: () => new Promise(() => {}) });
  controller.abort(new Error("cancelled"));
  await assert.rejects(worker, /cancelled/);
  finish({ close: async () => { closed++; } } as Browser);
  await delay(0);
  assert.equal(closed, 1);
});

test("a failed reservation allows the original proof path without invoking a second worker", async t => {
  const { dedicatedConsentLanes } = await import("./handler.js");
  const original = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "local";
  t.after(() => {
    if (original === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = original;
  });
  let invokes = 0;
  let writes = 0;
  const lanes = dedicatedConsentLanes({
    payload: { scanId: binding.scanId } as Parameters<typeof dedicatedConsentLanes>[0]["payload"],
    signalFor: () => AbortSignal.timeout(2000),
    lambdaClient: { async send() { invokes++; throw new Error("unexpected invocation"); } },
    s3Client: { async send() { writes++; throw new Error("unavailable"); } },
  });
  lanes.decide("accept");
  lanes.observe("accept");
  lanes.observe("reject");
  lanes.observe("reject");
  const held = lanes.decide("reject");
  assert.ok(held);
  assert.equal(await held.release(proof(), () => Infinity), false);
  await assert.rejects(held.result, /unavailable/);
  assert.equal(writes, 1);
  assert.equal(invokes, 0);
});


test("readiness issues one bound dispatch proof and never revives expired qualifications", async () => {
  const { store, get } = fixture();
  const signal = AbortSignal.timeout(3000);
  await store.initialize(signal);
  const original = proof(Date.now() - 5000);
  const waiting = store.waitForReady(get, original.expiresAtMs, signal);
  await delay(50);
  await store.markReady(get, signal);
  const tag = await waiting;
  const deadline = Date.now() + 2500;
  const released = proofForReadyAction(original, deadline);
  assert.equal(released.expiresAtMs, deadline);
  assert.deepEqual(released.binding, original.binding);
  assert.equal(released.exactSelector, original.exactSelector);
  assert.ok(released.issuedAtMs > original.issuedAtMs);
  assert.throws(() => proofForReadyAction(original, Infinity, original.expiresAtMs), /expired/);
  await store.release(tag, released, signal);
  assert.deepEqual(await store.take(get, binding, signal), released);
  await assert.rejects(store.take(get, binding, signal), /unavailable/);
});
