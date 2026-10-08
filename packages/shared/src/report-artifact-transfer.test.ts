import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import test from "node:test";
import {
  buildReportArtifactTransfer, createReportArtifactTransferCache, reportArtifactIdentityKey,
  REPORT_ARTIFACT_TRANSFER_MAX_RAW_BYTES, REPORT_ARTIFACT_TRANSFER_MAX_REQUEST_BYTES,
  verifyReportArtifactTransfer,
} from "./report-artifact-transfer";

function fixture(scanId = "retained-scan") {
  // Retain noncanonical whitespace: serializing parsed JSON is not the original evidence.
  const bundle = Buffer.from(`{ "scanId": "${scanId}", "schemaVersion": "certscore.v2.canonical-evidence-bundle.v1" }\n`);
  const manifest = Buffer.from(JSON.stringify({ scanId, targetEnvironment: "production", processor: "local-certscore-v2-dag-parallel-v1" }));
  const identity = (kind: string, body: Buffer) => ({ uri: `s3://artifacts/${scanId}/${kind}`,
    sha256: createHash("sha256").update(body).digest("hex"), sizeBytes: body.byteLength });
  return { bodies: { bundle, manifest }, expected: { scanId, bundle: identity("bundle", bundle), manifest: identity("manifest", manifest) },
    transfer: buildReportArtifactTransfer({ scanId, bundle, manifest })! };
}

test("transfer preserves original bytes and checks persisted identities rather than transport claims", () => {
  const { expected, bodies, transfer } = fixture();
  const verified = verifyReportArtifactTransfer({ ...expected, transfer });
  assert.equal(verified.size, 2);
  assert.deepEqual(verified.get(reportArtifactIdentityKey(expected.bundle)), bodies.bundle);
  assert.deepEqual(verified.get(reportArtifactIdentityKey(expected.manifest)), bodies.manifest);
  assert.ok(Buffer.byteLength(JSON.stringify({ mode: "publish_report", scanId: expected.scanId, token: "t".repeat(80), artifactTransfer: transfer })) < REPORT_ARTIFACT_TRANSFER_MAX_REQUEST_BYTES);
  assert.equal(verifyReportArtifactTransfer({ ...expected, transfer, bundle: { ...expected.bundle, sha256: "0".repeat(64) } }).size, 0);
  assert.equal(verifyReportArtifactTransfer({ ...expected, transfer, manifest: { ...expected.manifest, sizeBytes: expected.manifest.sizeBytes + 1 } }).size, 0);
  assert.equal(verifyReportArtifactTransfer({ ...expected, transfer, scanId: "other-scan" }).size, 0);
  assert.equal(verifyReportArtifactTransfer({ ...expected, transfer, bundle: null }).size, 0);
});

test("malformed, incomplete, duplicate, corrupt and stale envelopes are discarded as a whole", () => {
  const { expected, transfer } = fixture();
  for (const invalid of [undefined, null, [], {}, { ...transfer, schemaVersion: "future" },
    { ...transfer, artifacts: [] },
    { ...transfer, artifacts: [transfer.artifacts[0], transfer.artifacts[0]] },
    { ...transfer, artifacts: [transfer.artifacts.find(row => row.kind === "bundle"), { kind: "manifest", gzipBase64: "!!!!" }] },
    { ...transfer, artifacts: [transfer.artifacts.find(row => row.kind === "bundle"), { kind: "manifest", gzipBase64: Buffer.from("not gzip").toString("base64") }] },
    { ...transfer, artifacts: [transfer.artifacts.find(row => row.kind === "bundle"), { kind: "manifest", gzipBase64: "a".repeat(100_000) }] },
  ]) assert.equal(verifyReportArtifactTransfer({ ...expected, transfer: invalid }).size, 0);
});

test("checksum-matching wrong scan, manifest environment and unsupported bundle schema remain unusable", () => {
  const { expected, bodies } = fixture();
  for (const [kind, body] of [
    ["bundle", Buffer.from(JSON.stringify({ scanId: "other", schemaVersion: "certscore.v2.canonical-evidence-bundle.v1" }))],
    ["bundle", Buffer.from(JSON.stringify({ scanId: expected.scanId, schemaVersion: "unsupported" }))],
    ["manifest", Buffer.from(JSON.stringify({ scanId: expected.scanId, targetEnvironment: "local", processor: "local-certscore-v2-dag-parallel-v1" }))],
    ["manifest", Buffer.from(JSON.stringify({ scanId: expected.scanId, targetEnvironment: "production", processor: "other" }))],
  ] as const) {
    const transfer = buildReportArtifactTransfer({ scanId: expected.scanId, ...bodies, [kind]: body });
    assert.equal(verifyReportArtifactTransfer({ ...expected, transfer,
      [kind]: { ...expected[kind], sha256: createHash("sha256").update(body).digest("hex"), sizeBytes: body.byteLength },
    }).size, 0);
  }
});

test("compression bombs and aggregate budgets are bounded before materialization", () => {
  const { expected, transfer } = fixture();
  const bomb = gzipSync(Buffer.alloc(REPORT_ARTIFACT_TRANSFER_MAX_RAW_BYTES + 1));
  assert.equal(verifyReportArtifactTransfer({ ...expected, transfer: { ...transfer,
    artifacts: [{ kind: "bundle", gzipBase64: bomb.toString("base64") }, transfer.artifacts.find(row => row.kind === "manifest")] },
  }).size, 0, "decompression must stop at persisted expected size");
  assert.deepEqual(buildReportArtifactTransfer({ scanId: "scan", bundle: Buffer.alloc(REPORT_ARTIFACT_TRANSFER_MAX_RAW_BYTES), manifest: Buffer.alloc(1) })?.artifacts.map(row => row.kind), ["manifest"]);
  assert.deepEqual(buildReportArtifactTransfer({ scanId: "scan", bundle: randomBytes(64 * 1024), manifest: Buffer.alloc(1) })?.artifacts.map(row => row.kind), ["manifest"]);
});

test("transfer cache expires, evicts, and yields bytes only once without requiring durable state", () => {
  let now = 0;
  const cache = createReportArtifactTransferCache(() => now);
  const transfer = fixture().transfer;
  cache.retain(transfer);
  assert.deepEqual(cache.take(transfer.scanId), transfer);
  assert.equal(cache.take(transfer.scanId), undefined, "retry cannot retransmit");
  cache.retain(transfer);
  now = 300_000;
  assert.equal(cache.take(transfer.scanId), undefined);
  for (let i = 0; i < 33; i++) cache.retain(fixture(`scan-${i}`).transfer);
  assert.equal(cache.take("scan-0"), undefined);
  assert.ok(cache.take("scan-32"));
  assert.equal(createReportArtifactTransferCache().take("scan-32"), undefined, "restart simply uses S3");
});


test("a bounded manifest alone is reusable while oversized bundles keep the original download", () => {
  const { expected, bodies } = fixture();
  const transfer = buildReportArtifactTransfer({ scanId: expected.scanId, manifest: bodies.manifest, bundle: randomBytes(256 * 1024) })!;
  assert.deepEqual(transfer.artifacts.map(row => row.kind), ["manifest"]);
  const verified = verifyReportArtifactTransfer({ ...expected, transfer });
  assert.equal(verified.size, 1);
  assert.deepEqual(verified.get(reportArtifactIdentityKey(expected.manifest)), bodies.manifest);
  assert.equal(verified.get(reportArtifactIdentityKey(expected.bundle)), undefined);
});
