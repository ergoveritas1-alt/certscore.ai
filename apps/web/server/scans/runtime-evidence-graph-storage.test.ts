import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { apiRuntimeEvidenceGraphProjectionSchema } from "@certscore/api-contracts";
import { runtimeGraphUiFixture } from "../../components/scans/runtime-evidence-graph-ui-fixture";
import type { ScanDetailResponse } from "./get-scan-by-id";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, unknown>)[serverOnlyPath] = { exports: {}, loaded: true };
const { externalizeRuntimeGraphForPersistence, hydrateRuntimeGraphForRead } = require("./runtime-evidence-graph-storage") as typeof import("./runtime-evidence-graph-storage");

const scanId = "00000000-0000-4000-8000-000000000123";
function fixture() {
  const projection = { ...runtimeGraphUiFixture(), scanId };
  return { scan: { id: scanId, status: "completed" }, runtimeArtifacts: { existing: "retained", runtimeEvidenceGraphProjection: projection }, signals: [], validationFindings: [], snapshot: { certscore_overall: 32 } } as unknown as ScanDetailResponse;
}
async function stored() {
  let body: Buffer = Buffer.alloc(0);
  const record = fixture();
  const compact = await externalizeRuntimeGraphForPersistence(record, { write: async (_reference, bytes) => { body = bytes; } });
  return { record, compact, body };
}

test("publication retains one immutable bounded graph and only a small reference in the report", async () => {
  const { record, compact, body } = await stored();
  const projection = apiRuntimeEvidenceGraphProjectionSchema.parse(compact.runtimeArtifacts?.runtimeEvidenceGraphProjection);
  assert.equal(projection.graphs.length, 0);
  assert.equal(projection.details?.nodeCount, 100);
  assert.equal(projection.details?.edgeCount, 8);
  assert.equal(projection.details?.sha256, createHash("sha256").update(body).digest("hex"));
  assert.ok(JSON.stringify(compact).length < 3000);
  assert.ok(body.byteLength < 768 * 1024);
  assert.ok(!JSON.stringify(compact).includes('"nodes"'));
  assert.ok(!JSON.stringify(compact).includes("s3://"));
  assert.deepEqual(compact.snapshot, record.snapshot);
  const hydrated = await hydrateRuntimeGraphForRead(compact, { read: async () => body, environment: { CERTSCORE_RUNTIME_GRAPH_PRESENTATION: "on" } });
  assert.deepEqual(hydrated.runtimeArtifacts?.runtimeEvidenceGraphProjection, record.runtimeArtifacts?.runtimeEvidenceGraphProjection);
  assert.equal(apiRuntimeEvidenceGraphProjectionSchema.parse(compact.runtimeArtifacts?.runtimeEvidenceGraphProjection).graphs.length, 0, "read must not mutate cached report");
  const repeated = await externalizeRuntimeGraphForPersistence(compact, { write: async () => { assert.fail("repeat publication must reuse reference"); } });
  assert.equal(repeated, compact);
});

test("graph upload failure, malformed extension and wrong scan do not block legacy publication", async () => {
  for (const change of ["upload", "invalid", "cross_scan", "oversize", "invalid_id"] as const) {
    const record = fixture();
    if (change === "invalid") (record.runtimeArtifacts!.runtimeEvidenceGraphProjection as any).secret = "MUST_NOT_PERSIST";
    if (change === "cross_scan") (record.runtimeArtifacts!.runtimeEvidenceGraphProjection as any).scanId = "other";
    if (change === "oversize") (record.runtimeArtifacts!.runtimeEvidenceGraphProjection as any).unbounded = "x".repeat(800000);
    if (change === "invalid_id") record.scan.id = "legacy-id";
    const result = await externalizeRuntimeGraphForPersistence(record, { write: async () => { throw new Error("fixture_storage_unavailable"); } });
    assert.ok(!JSON.stringify(result).includes('"nodes"'));
    assert.ok(!JSON.stringify(result).includes("MUST_NOT_PERSIST"));
    assert.equal(result.runtimeArtifacts?.runtimeEvidenceGraphReference, undefined);
    assert.equal(result.runtimeArtifacts?.existing, "retained");
    assert.deepEqual(result.snapshot, record.snapshot);
    assert.deepEqual(result.signals, record.signals);
  }
});

test("hydrate rejects corruption, wrong size, source drift, cross-scan and summary drift", async () => {
  for (const change of ["body", "size", "source", "scan", "count", "missing", "failure"] as const) {
    const { compact, body } = await stored();
    const artifacts = compact.runtimeArtifacts!;
    if (change === "size") (artifacts.runtimeEvidenceGraphReference as any).sizeBytes++;
    if (change === "source") (artifacts.runtimeEvidenceGraphReference as any).sourceBundleSha256 = "c".repeat(64);
    if (change === "scan") (artifacts.runtimeEvidenceGraphReference as any).scanId = "00000000-0000-4000-8000-000000000999";
    if (change === "count") (artifacts.runtimeEvidenceGraphProjection as any).details.nodeCount++;
    if (change === "missing") delete artifacts.runtimeEvidenceGraphReference;
    const result = await hydrateRuntimeGraphForRead(compact, { read: async () => { if (change === "failure") throw new Error("fixture"); return change === "body" ? Buffer.from("{}") : body; }, environment: { CERTSCORE_RUNTIME_GRAPH_PRESENTATION: "on" } });
    const projection = apiRuntimeEvidenceGraphProjectionSchema.parse(result.runtimeArtifacts?.runtimeEvidenceGraphProjection);
    assert.equal(projection.status, "unavailable", change);
    assert.equal(projection.graphs.length, 0, change);
    assert.equal(projection.details, undefined, change);
    assert.equal(projection.findingOrScoreEffect, false);
  }
});

test("presentation off and legacy reports do not read artifacts or mutate retained data", async () => {
  const { compact } = await stored(); const original = JSON.stringify(compact);
  for (const setting of [undefined, "", "invalid", "off"]) {
    const result = await hydrateRuntimeGraphForRead(compact, { read: async () => { assert.fail("kill switch must precede read"); }, environment: { CERTSCORE_RUNTIME_GRAPH_PRESENTATION: setting } });
    assert.equal(result.runtimeArtifacts?.runtimeEvidenceGraphProjection, undefined);
    assert.equal(result.runtimeArtifacts?.runtimeEvidenceGraphReference, undefined);
  }
  assert.equal(JSON.stringify(compact), original);
  const legacy = fixture(); delete legacy.runtimeArtifacts!.runtimeEvidenceGraphProjection;
  assert.equal(await hydrateRuntimeGraphForRead(legacy, { read: async () => { assert.fail("no graph must not fetch"); }, environment: { CERTSCORE_RUNTIME_GRAPH_PRESENTATION: "on" } }), legacy);
});
