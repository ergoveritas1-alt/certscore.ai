import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { startRejectPacketVerification } from "./handler.js";

test("early Reject storage reads start once on the exact notice and require the matching terminal result", async t => {
  const key = "CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET";
  const prior = process.env[key];
  const prefixKey = "CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX";
  const priorPrefix = process.env[prefixKey];
  process.env[key] = "local-fixture-bucket";
  process.env[prefixKey] = "isolated";
  t.after(() => {
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
    if (priorPrefix === undefined) delete process.env[prefixKey];
    else process.env[prefixKey] = priorPrefix;
  });
  const expected = {
    scanId: "scan-a",
    parentDispatchSha256: "a".repeat(64),
    orchestrationMode: "worker",
    workerLane: "reject_observation",
  } as const;
  const body = Buffer.from("{}");
  const objectKey = "isolated/scan-a/lanes/reject_observation/PostRefusalEvidencePacket.json";
  const packet = {
    uri: `s3://local-fixture-bucket/${objectKey}`,
    sha256: createHash("sha256").update(body).digest("hex"),
    sizeBytes: body.byteLength,
  };
  const notice = { scanId: expected.scanId, parentDispatchSha256: expected.parentDispatchSha256, packet };
  let reads = 0;
  const options: Parameters<typeof startRejectPacketVerification>[2] = {
    s3GetClient: { async send(command) {
      reads++;
      assert.equal(command.input.Bucket, "local-fixture-bucket");
      assert.equal(command.input.Key, objectKey);
      return { Body: body, $metadata: {} };
    } },
  };
  assert.equal(startRejectPacketVerification({ ...notice, scanId: "other" }, expected, options), undefined);
  assert.equal(startRejectPacketVerification({ ...notice, parentDispatchSha256: "b".repeat(64) }, expected, options), undefined);
  assert.equal(startRejectPacketVerification({ ...notice, packet: { ...packet, uri: "s3://local-fixture-bucket/other" } }, expected, options), undefined);
  assert.equal(startRejectPacketVerification(notice, expected, { ...options, signal: AbortSignal.abort() }), undefined);
  assert.equal(reads, 0);

  const ready = startRejectPacketVerification(notice, expected, options);
  assert.ok(ready);
  assert.equal(reads, 1);
  void ready.verified.catch(() => undefined);
  const result = {
    status: "completed", workerLane: expected.workerLane, scanId: expected.scanId,
    parentDispatchSha256: expected.parentDispatchSha256,
    artifactPointers: { postRefusalPacketUri: packet.uri },
    artifactMetadata: { postRefusalPacketUri: { sha256: packet.sha256, sizeBytes: packet.sizeBytes } },
  } as const;
  await assert.rejects(ready.join({ ...result, parentDispatchSha256: "b".repeat(64) }), /terminal packet did not match/);
  await assert.rejects(ready.join({ ...result, artifactMetadata: { postRefusalPacketUri: {
    sha256: packet.sha256, sizeBytes: packet.sizeBytes + 1,
  } } }), /terminal packet did not match/);
  await assert.rejects(ready.join(result), /invalid_type/);
  assert.equal(reads, 1);
});
