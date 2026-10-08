import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { S3Client } from "@aws-sdk/client-s3";
import { buildReportArtifactTransfer, verifyReportArtifactTransfer } from "../../../../packages/shared/src/report-artifact-transfer";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = { exports: {}, loaded: true } as NodeModule;

test("web uses exact transferred bytes without S3, and stale hints retain verified S3 recovery", async () => {
  const { localV2DagReportPerformanceTestHelpers: readers } = await import("./local-v2-dag-report");
  const scanId = "transport-reader-fixture";
  const bundle = Buffer.from(JSON.stringify({ scanId, schemaVersion: "certscore.v2.canonical-evidence-bundle.v1" }));
  const manifest = Buffer.from(JSON.stringify({ scanId, processor: "local-certscore-v2-dag-parallel-v1", targetEnvironment: "production" }));
  const identity = (kind: string, body: Buffer) => ({ uri: `s3://transport-eu-central-1/${scanId}/${kind}`,
    sha256: createHash("sha256").update(body).digest("hex"), sizeBytes: body.byteLength });
  const expected = { scanId, bundle: identity("bundle", bundle), manifest: identity("manifest", manifest) };
  const transfer = buildReportArtifactTransfer({ scanId, bundle, manifest });
  const transferredBytes = verifyReportArtifactTransfer({ ...expected, transfer });
  const reads: string[] = [];
  const originalSend = S3Client.prototype.send;
  S3Client.prototype.send = (async (command: { input: { Key: string } }) => {
    reads.push(command.input.Key);
    return { Body: command.input.Key.includes("bundle") ? bundle : manifest };
  }) as typeof originalSend;
  const input = (kind: "bundle" | "manifest") => ({ uri: expected[kind].uri,
    expectedSha256: expected[kind].sha256, expectedSizeBytes: expected[kind].sizeBytes });
  try {
    assert.deepEqual(await readers.readLocalV2DagBundleFromS3({ ...input("bundle"), transferredBytes }), JSON.parse(bundle.toString()));
    assert.deepEqual(await readers.readLocalV2DagManifestFromS3({ ...input("manifest"), transferredBytes }), JSON.parse(manifest.toString()));
    assert.equal(reads.length, 0, "both first reads must avoid S3");
    assert.deepEqual(await readers.readLocalV2DagBundleFromS3(input("bundle")), JSON.parse(bundle.toString()));
    assert.equal(reads.length, 0, "later evidence reads must reuse the existing verified cache");
    const staleBytes = verifyReportArtifactTransfer({ ...expected, transfer: { ...transfer, scanId: "old-scan" } });
    assert.deepEqual(await readers.readLocalV2DagBundleFromS3({ ...input("bundle"), uri: `${expected.bundle.uri}-recovery`, transferredBytes: staleBytes }), JSON.parse(bundle.toString()));
    assert.deepEqual(await readers.readLocalV2DagManifestFromS3({ ...input("manifest"), uri: `${expected.manifest.uri}-recovery`, transferredBytes: staleBytes }), JSON.parse(manifest.toString()));
    assert.equal(reads.length, 2, "invalid hint must use the original remote path");
    assert.equal(await readers.readLocalV2DagBundleFromS3({ ...input("bundle"), expectedSha256: "0".repeat(64), transferredBytes }), null,
      "a mismatched original cannot be projected through either transport");
  } finally { S3Client.prototype.send = originalSend; }
});

test("internal route bounds unauthenticated payloads and passes hints only after token authorization", async () => {
  const prefix = path.resolve("tmp/transfer-route-");
  await mkdir(path.dirname(prefix), { recursive: true });
  const directory = await mkdtemp(prefix);
  const fixture = path.join(directory, "fixture.cjs");
  const output = path.join(directory, "route.cjs");
  try {
    await writeFile(fixture, `
      const state = {authorized:true,authorizations:0,publications:[]};
      module.exports = {state,
        authorizeScoreMaterializationRequest:async () => {state.authorizations++;return state.authorized ? {organizationId:null}:null},
        completeScoreMaterializationRequest:async()=>{},failScoreMaterializationRequest:async()=>{},recordScoreMaterializationRequestError:async()=>null,
        persistCompletedLegacyGdprEprivacyAssessment:async()=>({reason:'inserted'}),persistAdminScanSummaryForPublishedRecord:async()=>true,
        loadPersistedScanReportProjection:async()=>({scan:{id:'scan'}}),
        publishCanonicalScanReportProjection:async input=>{state.publications.push(input);return {status:'ready'}},
        classifyScoreMaterializationFailure:()=>({retryable:false,diagnostic:'invalid',code:'invalid'})};
    `);
    await build({ entryPoints: [path.resolve("apps/web/app/api/internal/scan-score-materialization/route.ts")], outfile: output,
      bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "route-fixture", setup(builder) {
        builder.onResolve({ filter: /server\/scans\/|server\/admin\// }, () => ({ path: fixture, external: true }));
      } }] });
    const { state } = require(fixture);
    const { POST } = require(output);
    const scanId = "12345678-1234-1234-1234-123456789012";
    const token = "t".repeat(43);
    const artifactTransfer = { schemaVersion: "test", scanId, artifacts: [] };
    const request = (body: unknown) => new Request("https://certscore.ai/api/internal/scan-score-materialization", {
      method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
    });
    assert.equal((await POST(request({ mode: "publish_report", scanId, token, artifactTransfer }))).status, 200);
    assert.deepEqual(state.publications[0].artifactTransfer, artifactTransfer);
    state.authorized = false;
    assert.equal((await POST(request({ mode: "publish_report", scanId, token, artifactTransfer }))).status, 401);
    assert.equal(state.publications.length, 1);
    const priorAuthorizations = state.authorizations;
    assert.equal((await POST(request({ mode: "publish_report", scanId, token, artifactTransfer: "x".repeat(100_000) }))).status, 413);
    assert.equal(state.authorizations, priorAuthorizations, "oversize must stop before DB or decompression");
    state.authorized = true;
    assert.equal((await POST(request({ mode: "finalize", scanId, token, artifactTransfer }))).status, 200);
    assert.equal(state.publications.length, 1, "finalize cannot reproject or consume artifacts");
    assert.equal((await POST(request({ mode: "publish_report", scanId, token }))).status, 200, "older workers remain compatible");
    assert.equal(state.publications[1].artifactTransfer, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
