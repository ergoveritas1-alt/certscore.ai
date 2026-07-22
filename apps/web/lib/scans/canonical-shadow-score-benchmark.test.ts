import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalShadowScoreBenchmarkArtifact,
  CANONICAL_SHADOW_BENCHMARK_SCHEMA_VERSION
} from "./canonical-shadow-score-benchmark";
import { LUNA_EXPECTED_BAND_LANE_IDS } from "./canonical-shadow-score-benchmark-lanes";

const artifact = buildCanonicalShadowScoreBenchmarkArtifact("2026-07-22T12:00:00.000Z");

function lane(laneId: string) {
  return artifact.cases.filter((entry) => entry.laneId === laneId);
}

test("benchmark artifact represents every objective lane and keeps overall score withheld", () => {
  assert.equal(artifact.schemaVersion, CANONICAL_SHADOW_BENCHMARK_SCHEMA_VERSION);
  assert.deepEqual([...new Set(artifact.cases.map((entry) => entry.laneId))].sort(), [...LUNA_EXPECTED_BAND_LANE_IDS].sort());
  assert.deepEqual(artifact.invariantFailures, []);
  assert.deepEqual(artifact.candidateContradictions, []);
  assert.deepEqual(artifact.expectedBandMismatches, []);
  assert.equal(artifact.overallScoreStatus, "withheld_unmodeled_domains");
  assert.equal(artifact.gdprEprivacyCutoverEligible, false);
});

test("candidate-v3 outcomes match Luna's twelve pending calibration bands", () => {
  assert.equal(lane("low_signal")[0]?.result.postureScore, 100);
  assert.equal(lane("strong_consent_controls")[0]?.result.postureScore, 100);
  assert.equal(lane("pre_consent_tracking_storage")[0]?.result.postureScore, 54);
  assert.equal(lane("policy_gaps")[0]?.result.postureScore, 70);
  assert.equal(lane("policy_gaps")[0]?.result.posture, "Watch");
  assert.equal(lane("session_replay_fingerprinting")[0]?.result.postureScore, 49);
  assert.equal(lane("sensitive_contexts")[0]?.result.postureScore, 49);
  assert.equal(lane("access_limited_no_go")[0]?.result.postureScore, null);
  assert.deepEqual(
    Object.fromEntries(artifact.lunaLaneDecisions.map((entry) => [entry.laneId, entry.expectedPostureBand])),
    {
      access_limited_no_go: "Withheld",
      accessibility: "Clear",
      consumer_protection: "Clear",
      cross_region_equivalence: "Watch",
      low_signal: "Clear",
      policy_gaps: "Watch",
      pre_consent_tracking_storage: "Watch",
      sensitive_contexts: "Action Needed",
      session_replay_fingerprinting: "Action Needed",
      source_equivalence: "Clear",
      strong_consent_controls: "Clear",
      transport_security: "Clear"
    }
  );
  assert.ok(artifact.lunaLaneDecisions.every((entry) => entry.status === "pending_luna"));
});

test("unmodeled domains cannot silently become an overall score", () => {
  for (const laneId of ["accessibility", "transport_security", "consumer_protection"]) {
    const benchmarkCase = lane(laneId)[0];
    assert.ok(benchmarkCase);
    assert.ok(benchmarkCase.excludedDomainFamilies.length > 0);
    assert.equal(benchmarkCase.result.postureScore, 100);
    assert.equal(artifact.overallScoreStatus, "withheld_unmodeled_domains");
  }
});

test("equivalent regions and Lambda/browser-extension projections are identical", () => {
  assert.equal(artifact.invariants.crossRegionEquivalent, true);
  assert.equal(artifact.invariants.sourceEquivalent, true);
  assert.equal(new Set(lane("cross_region_equivalence").map((entry) => entry.result.postureScore)).size, 1);
  assert.equal(new Set(lane("source_equivalence").map((entry) => entry.result.postureScore)).size, 1);
});
