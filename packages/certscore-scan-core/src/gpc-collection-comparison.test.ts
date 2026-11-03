import assert from "node:assert/strict";
import test from "node:test";
import { gpcActivityComparisonSchema, gpcCollectionComparisonSchema, readBoundGpcCollectionComparison } from "@certscore/contracts";
import { buildGpcActivityComparison } from "./gpc-activity-comparison";
import { buildGpcProductionObservation } from "./gpc-production-observation";
import { collectionPairFixture, collectionFixtureSource } from "./test-fixtures/gpc-collection-pair.cases";

const input = (p = collectionPairFixture()) => {
  const gpc = collectionFixtureSource(p.gpc);
  return { scanId: p.gpc.scanId, baseline: collectionFixtureSource(p.baseline), gpc,
    observation: buildGpcProductionObservation({ scanId: p.gpc.scanId, source: gpc }) };
};
test("successful paired advertising requests retain identifier roles without readable GPP", () => {
  const i = input(), parent = buildGpcActivityComparison(i); assert.ok(parent?.collectionComparison);
  const c = parent.collectionComparison;
  assert.equal(c.durationMs, 5000); assert.equal(c.baseline.rows.length, 1); assert.equal(c.gpc.rows.length, 1);
  assert.equal(c.baseline.rows[0]!.identifierActivity, "identity_sync");
  assert.equal(c.gpc.rows[0]!.identifierActivity, "identity_sync");
  assert.equal(c.baseline.identifierCoverage, "url_only"); assert.equal(c.gpc.identifierCoverage, "canonical_qualification"); assert.equal(c.causedByGpc, "not_established");
  assert.equal(c.baseline.rows[0]!.observedAfterDocumentCommitMs, 499);
  assert.doesNotMatch(JSON.stringify(c), /xcid|crwdcntrl|fixture-loader|independent-baseline|requestUrl|cookie|headers/);
  const observation = buildGpcProductionObservation({ scanId: i.scanId, source: i.gpc });
  const response = { contractVersion: "certscore.gpc-response-assessment.v3", comparison: { baselineArtifact: i.baseline.pointer, gpcArtifact: i.gpc.pointer }, observation };
  assert.deepEqual(readBoundGpcCollectionComparison(c, response), c);
  for (const mutate of [
    (v: typeof c) => { v.gpc.rows[0]!.entityId = "ent_000000000000"; },
    (v: typeof c) => { v.gpc.rows[0]!.label = "Tampered"; },
    (v: typeof c) => { v.gpc.rows[0]!.observedAfterDocumentCommitMs++; },
    (v: typeof c) => { v.gpc.rows[0]!.identifierActivity = "not_established"; },
    (v: typeof c) => { v.gpc.rows[0]!.identifierBasis = "meta_pixel_identifier"; },
    (v: typeof c) => { v.gpc.identifierCoverage = "url_only"; },
    (v: typeof c) => { v.sourceHashes.baseline = "0".repeat(64); },
  ]) { const v = structuredClone(c); mutate(v); assert.equal(readBoundGpcCollectionComparison(v, response), undefined); }
});

test("absent success, generic resources, scripts, unresolved endpoint and ambiguous responses stay neutral", () => {
  for (const mutate of [
    (p: ReturnType<typeof collectionPairFixture>) => { p.baseline.networkResponseEvents = []; },
    (p: ReturnType<typeof collectionPairFixture>) => { p.baseline.networkResponseEvents[0]!.status = 500; },
    (p: ReturnType<typeof collectionPairFixture>) => { p.baseline.networkResponseEvents.push({ ...p.baseline.networkResponseEvents[0]!, eventId: "duplicate" }); },
    (p: ReturnType<typeof collectionPairFixture>) => { p.baseline.networkEvents[1]!.collectionEndpointObserved = false; },
    (p: ReturnType<typeof collectionPairFixture>) => { p.baseline.normalizedVendorObservations[0]!.matchSources = []; },
  ]) {
    const p = collectionPairFixture(); mutate(p);
    const parent = buildGpcActivityComparison(input(p));
    if (parent?.collectionComparison) assert.equal(parent.collectionComparison.baseline.rows.length, 0);
  }
  for (const url of ["https://example.test/script.js", "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&cid=123.456"]) {
    assert.equal(buildGpcActivityComparison(input(collectionPairFixture(url)))?.collectionComparison, undefined);
  }
});

test("invalid original source pair and scan cannot produce collection evidence", () => {
  const i = input();
  assert.equal(buildGpcActivityComparison({ ...i, scanId: "wrong" }), undefined);
  assert.equal(buildGpcActivityComparison({ ...i, gpc: { ...i.gpc, pointer: { ...i.gpc.pointer, sha256: "0".repeat(64) } } }), undefined);
  assert.equal(buildGpcActivityComparison({ ...i, gpc: { ...i.gpc, pointer: { ...i.gpc.pointer, sizeBytes: 1 } } }), undefined);
  const parent = buildGpcActivityComparison(i)!;
  assert.equal(gpcActivityComparisonSchema.safeParse({ ...parent, collectionComparison: { ...parent.collectionComparison!, durationMs: 3000 } }).success, false);
  const c = parent.collectionComparison!;
  for (const override of [{ scoreEffect: "deduct" }, { causedByGpc: "established" }, { legalInterpretation: "honored" }, { rawCookie: "PRIVATE" }])
    assert.equal(gpcCollectionComparisonSchema.safeParse({ ...c, ...override }).success, false);
});

test("request-local privacy context remains descriptive and cannot cancel other observed requests", () => {
  const i = input(collectionPairFixture("https://bcp.crwdcntrl.net/6/map?xcid=fixture&us_privacy=1YYN"));
  const c = buildGpcActivityComparison(i)?.collectionComparison; assert.ok(c);
  assert.equal(c.baseline.rows[0]!.processing, "privacy_context_observed");
  assert.equal(c.gpc.rows[0]!.processing, "privacy_context_observed");
  assert.equal(c.scoreEffect, "none"); assert.equal(c.legalInterpretation, "not_assessed");
});

test("zero early-window collection preserves positive later full-session evidence", () => {
  const pair = collectionPairFixture(undefined, undefined, 5500), i = input(pair);
  const parent = buildGpcActivityComparison(i)!; assert.ok(parent.collectionComparison);
  assert.equal(parent.durationMs, 5000);
  assert.equal(parent.collectionComparison.baseline.rows.length, 1);
  assert.equal(parent.collectionComparison.gpc.rows.length, 0);
  const observation = buildGpcProductionObservation({ scanId: i.scanId, source: i.gpc });
  assert.equal(observation.requests.advertisingCollectionCount, 1);
  assert.equal(observation.requests.advertisingCollectionRecipients?.rows[0]?.observedAtMs, 5500);
});

test("optional samples cannot erase a measured compact-ledger comparison", async () => {
  const { retainGpcComparisonLedger } = await import("./gpc-comparison-ledger");
  const pair = collectionPairFixture();
  for (const b of [pair.baseline, pair.gpc]) {
    b.gpcImpactCapture = retainGpcComparisonLedger(b);
    for (const row of b.gpcImpactCapture!.requestLedger!.rows) row.advertising = [];
  }
  const i = input(pair), withSamples = buildGpcActivityComparison(i), withoutSamples = buildGpcActivityComparison({ ...i, observation: undefined });
  assert.ok(withSamples); assert.equal(withSamples.activity.advertisingMarketing.gpcRequests, 0);
  assert.equal(withSamples.collectionComparison, undefined);
  assert.deepEqual(withSamples, withoutSamples);
});
