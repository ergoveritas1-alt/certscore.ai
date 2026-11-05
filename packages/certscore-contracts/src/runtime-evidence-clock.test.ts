import assert from "node:assert/strict";
import test from "node:test";
import { canonicalEvidenceBundleSchema, resolveRuntimeEvidenceClock } from "./index";
import { gpcRuntimeFixture } from "./test-fixtures/gpc-runtime";

function fixture() {
  const bundle = gpcRuntimeFixture({ enabled: false });
  bundle.completedAt = "2026-09-05T12:00:10.000Z";
  bundle.runtimeEvidenceClock = {
    contractVersion: "certscore.runtime-evidence-clock.v1", laneId: "runtime_evidence", scanId: bundle.scanId,
    targetUrl: bundle.url, region: bundle.region, startedAt: "2026-09-05T11:59:59.000Z",
    completedAt: "2026-09-05T12:00:09.000Z", source: { sha256: "a".repeat(64), sizeBytes: 123 },
  };
  return bundle;
}
test("runtime clock survives canonical serialization and retains its own origin", () => {
  const b = fixture(), roundTrip = canonicalEvidenceBundleSchema.parse(JSON.parse(JSON.stringify(b)));
  assert.deepEqual(roundTrip.runtimeEvidenceClock, b.runtimeEvidenceClock);
  assert.deepEqual(resolveRuntimeEvidenceClock(roundTrip), { startMs: Date.parse(b.runtimeEvidenceClock!.startedAt),
    endMs: Date.parse(b.runtimeEvidenceClock!.completedAt), durationMs: 10000 });
});
test("legacy bundles retain their global clock without fabricating lane provenance", () => {
  const b = fixture(); delete b.runtimeEvidenceClock;
  assert.equal(resolveRuntimeEvidenceClock(b)?.startMs, Date.parse(b.startedAt));
  assert.equal(canonicalEvidenceBundleSchema.parse(b).runtimeEvidenceClock, undefined);
});
test("malformed or mismatched runtime clocks fail closed in schema and direct consumers", () => {
  const edits = [
    (b: ReturnType<typeof fixture>) => { b.runtimeEvidenceClock!.scanId = "other"; },
    (b: ReturnType<typeof fixture>) => { b.runtimeEvidenceClock!.targetUrl = "https://other.test/"; },
    (b: ReturnType<typeof fixture>) => { b.runtimeEvidenceClock!.region = "other"; },
    (b: ReturnType<typeof fixture>) => { b.runtimeEvidenceClock!.completedAt = "2026-09-05T12:00:11.000Z"; },
    (b: ReturnType<typeof fixture>) => { b.runtimeEvidenceClock!.startedAt = "2026-09-05T12:00:09.001Z"; },
    (b: ReturnType<typeof fixture>) => { b.runtimeEvidenceClock!.source.sha256 = "invalid"; },
    (b: ReturnType<typeof fixture>) => { b.scanLaneRuns = []; },
    (b: ReturnType<typeof fixture>) => { b.scanLaneRuns.push(b.scanLaneRuns[0]!); },
  ];
  for (const edit of edits) {
    const b = fixture(); edit(b);
    assert.equal(resolveRuntimeEvidenceClock(b), null);
    assert.equal(canonicalEvidenceBundleSchema.safeParse(b).success, false);
  }
});
