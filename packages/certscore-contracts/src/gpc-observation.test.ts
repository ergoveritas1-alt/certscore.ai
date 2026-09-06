import assert from "node:assert/strict";
import test from "node:test";
import { canonicalEvidenceBundleSchema } from "./index.js";
import { gpcResponseAssessmentSchema, gpcResponseAssessmentV2Schema, gpcCompleteComparisonDeltaSchema } from "./gpc-observation.js";
import { gpcRuntimeFixture } from "./test-fixtures/gpc-runtime.js";

function fixture() {
  const delta = { baselineCount: 0, gpcCount: 0, countDelta: 0, baselineOnly: [], gpcOnly: [], shared: [],
    baselineOnlyCount: 0, gpcOnlyCount: 0, sharedCount: 0, samplesTruncated: false };
  return gpcResponseAssessmentV2Schema.parse({
    contractVersion: "certscore.gpc-response-assessment.v2", generatedAt: "2026-09-05T12:00:00.000Z",
    status: "no_observable_response", findingTitle: "No observable GPC response", scoreEffect: "none", legalInterpretation: "not_assessed",
    comparison: { comparable: true, protocol: "passive_baseline_with_sec_gpc",
      baselineArtifact: { lane: "runtime_evidence", sha256: "a".repeat(64), sizeBytes: 100, uri: "s3://fixture/baseline.json" },
      gpcArtifact: { lane: "gpc_observation", sha256: "b".repeat(64), sizeBytes: 100, uri: "s3://fixture/gpc.json" },
      enabledProof: { secGpcHeaderValue: "1", requestsWithSecGpc: 1, requestEventIds: ["gpc_observation_document"], navigatorGlobalPrivacyControl: true },
      delivery: { status: "verified", baseline: gpcRuntimeFixture({ enabled: false }).gpcSignalObservation,
        gpc: gpcRuntimeFixture({ enabled: true }).gpcSignalObservation },
      coverage: { status: "complete", comparedThroughMs: 1000 }, responseBasis: "no_qualified_reduction",
      deltas: { cookies: delta, webStorage: delta, trackers: delta, advertisingOrMeasurementActivity: delta,
        advertisingOrMarketingActivity: delta, consentOrCmpBehavior: delta }, evidenceRefs: [], limitationKeys: [] },
  });
}

test("canonical bundle round-trip retains v2 status, proof, counts and provenance", () => {
  const assessment = fixture();
  const bundle = canonicalEvidenceBundleSchema.parse({ ...gpcRuntimeFixture({ enabled: false }), gpcResponseAssessment: assessment });
  assert.deepEqual(canonicalEvidenceBundleSchema.parse(JSON.parse(JSON.stringify(bundle))).gpcResponseAssessment, assessment);
});

for (const mutation of ["missing_pointer", "missing_navigator", "different_document", "different_protocol", "false_response", "incomplete_coverage", "worker_scope"] as const) {
  test(`GPC v2 contract rejects ${mutation}`, () => {
    const a = fixture();
    if (mutation === "missing_pointer") a.comparison.gpcArtifact = null;
    if (mutation === "missing_navigator") a.comparison.enabledProof.navigatorGlobalPrivacyControl = null;
    if (mutation === "different_document") a.comparison.delivery.gpc!.documentUrlSha256 = "d".repeat(64);
    if (mutation === "different_protocol") a.comparison.delivery.gpc!.contextConfigSha256 = "d".repeat(64);
    if (mutation === "worker_scope") a.comparison.delivery.gpc!.workerCount = 1;
    if (mutation === "false_response") { a.status = "responsive"; a.findingTitle = "GPC response"; a.comparison.responseBasis = "qualified_activity_reduction"; }
    if (mutation === "incomplete_coverage") a.comparison.coverage.status = "limited";
    assert.equal(gpcResponseAssessmentSchema.safeParse(a).success, false);
  });
}

test("GPC delta rejects inconsistent counts, overlapping samples and concealed truncation", () => {
  const d = { baselineCount: 1, gpcCount: 1, countDelta: 0, baselineOnlyCount: 0, gpcOnlyCount: 0, sharedCount: 1,
    baselineOnly: [], gpcOnly: [], shared: ["one"], samplesTruncated: false };
  assert.equal(gpcCompleteComparisonDeltaSchema.safeParse(d).success, true);
  assert.equal(gpcCompleteComparisonDeltaSchema.safeParse({ ...d, countDelta: 1 }).success, false);
  assert.equal(gpcCompleteComparisonDeltaSchema.safeParse({ ...d, baselineCount: 2, baselineOnlyCount: 1, baselineOnly: ["one"] }).success, false);
  assert.equal(gpcCompleteComparisonDeltaSchema.safeParse({ ...d, samplesTruncated: true }).success, false);
});

test("legacy v1 remains readable without being upgraded to actual readback proof", () => {
  const a = fixture();
  const { delivery: _delivery, coverage: _coverage, responseBasis: _basis, ...comparison } = a.comparison;
  const { webStorage: _storage, advertisingOrMarketingActivity: _ads, ...deltas } = comparison.deltas;
  const oldDeltas = Object.fromEntries(Object.entries(deltas).map(([key, value]) => {
    const { baselineOnlyCount: _b, gpcOnlyCount: _g, sharedCount: _s, samplesTruncated: _t, ...legacy } = value;
    return [key, legacy];
  }));
  const legacy = { ...a, contractVersion: "certscore.gpc-response-assessment.v1", comparison: { ...comparison, deltas: oldDeltas } };
  assert.deepEqual(gpcResponseAssessmentSchema.parse(legacy), legacy);
});
