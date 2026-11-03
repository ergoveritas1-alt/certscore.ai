import assert from "node:assert/strict";
import test from "node:test";
import { gpcCollectionComparisonSchema as publicSchema, describeGpcCollectionComparison } from "./gpc-collection-comparison";

test("standalone collection contract matches canonical bounds and cannot imply a legal or causal result", async () => {
  const { gpcCollectionComparisonSchema: canonical } = await import("../../certscore-contracts/src/gpc-collection-comparison");
  const { collectionPairFixture, collectionFixtureSource } = await import("../../certscore-scan-core/src/test-fixtures/gpc-collection-pair.cases");
  const { buildGpcActivityComparison } = await import("../../certscore-scan-core/src/gpc-activity-comparison");
  const { buildGpcProductionObservation } = await import("../../certscore-scan-core/src/gpc-production-observation");
  const pair = collectionPairFixture(), baseline = collectionFixtureSource(pair.baseline), gpc = collectionFixtureSource(pair.gpc);
  const observation = buildGpcProductionObservation({ scanId: pair.gpc.scanId, source: gpc });
  const packet = buildGpcActivityComparison({ scanId: pair.gpc.scanId, baseline, gpc, observation })!.collectionComparison!;
  assert.ok(packet);
  for (const schema of [canonical, publicSchema]) {
    assert.deepEqual(schema.parse(packet), packet);
    for (const change of [
      { scoreEffect: "positive" }, { causedByGpc: "established" }, { legalInterpretation: "honored" }, { rawBody: "PRIVATE" },
      { durationMs: 5001 }, { sourceHashes: { baseline: packet.sourceHashes.gpc, gpc: packet.sourceHashes.gpc } },
      { baseline: { ...packet.baseline, identifierCoverage: "canonical_qualification" } },
      { baseline: { ...packet.baseline, rows: [{ ...packet.baseline.rows[0], identifierBasis: "owner_property_sale" }] } },
      { gpc: { ...packet.gpc, rows: [...packet.gpc.rows, ...packet.gpc.rows] } },
      { gpc: { ...packet.gpc, rows: [{ ...packet.gpc.rows[0], observedAfterDocumentCommitMs: packet.durationMs }] } },
      { gpc: { ...packet.gpc, rows: [{ ...packet.gpc.rows[0], evidenceId: "https://private.test/?secret=value" }] } },
    ]) assert.equal(schema.safeParse({ ...packet, ...change }).success, false);
  }
  const text = describeGpcCollectionComparison(packet);
  assert.match(text, /Sample recipients without GPC/); assert.match(text, /zero does not establish absence/);
  assert.doesNotMatch(text, /xcid|PRIVATE|deduct|fixture-loader/);
});
