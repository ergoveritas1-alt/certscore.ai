import assert from "node:assert/strict";
import test from "node:test";
import type { UnifiedFindingDisplayPacket } from "../../../lib/scans/unified-findings";
import { buildGpcResponseReportProjection } from "./gpc-report-projection";

function gpcFinding(input: {
  deductionPoints?: number;
  presentationStatus?: "surface" | "audit_only" | "suppress";
} = {}) {
  const assessment = {
    contractVersion: "certscore.gpc-response-assessment.v1",
    generatedAt: "2026-09-02T12:00:00.000Z",
    status: "no_observable_response",
    findingTitle: "No observable GPC response",
    scoreEffect: "none",
    legalInterpretation: "not_assessed",
    comparison: {
      comparable: true,
      protocol: "passive_baseline_with_sec_gpc",
      baselineArtifact: {
        lane: "runtime_evidence",
        sha256: "a".repeat(64),
        sizeBytes: 100,
        uri: "s3://evidence/baseline.json",
      },
      gpcArtifact: {
        lane: "gpc_observation",
        sha256: "b".repeat(64),
        sizeBytes: 110,
        uri: "s3://evidence/gpc.json",
      },
      enabledProof: {
        secGpcHeaderValue: "1",
        requestsWithSecGpc: 2,
        requestEventIds: ["gpc-request-1", "gpc-request-2"],
        navigatorGlobalPrivacyControl: true,
      },
      deltas: {
        cookies: { baselineCount: 1, gpcCount: 1, countDelta: 0, baselineOnly: [], gpcOnly: [], shared: ["session@example.test@/"] },
        trackers: { baselineCount: 1, gpcCount: 1, countDelta: 0, baselineOnly: [], gpcOnly: [], shared: ["Example Ads|tracker|advertising"] },
        advertisingOrMeasurementActivity: { baselineCount: 1, gpcCount: 1, countDelta: 0, baselineOnly: [], gpcOnly: [], shared: ["Example Ads|pixel|advertising"] },
        consentOrCmpBehavior: { baselineCount: 1, gpcCount: 1, countDelta: 0, baselineOnly: [], gpcOnly: [], shared: ["Example CMP|cmp"] },
      },
      evidenceRefs: ["s3://evidence/baseline.json", "s3://evidence/gpc.json"],
      limitationKeys: [],
    },
  } as const;

  return {
    unifiedFindingId: "gpc_response",
    summary: "No observable baseline delta was retained under the equivalent passive GPC condition.",
    details: { family: "privacy_signal", kind: "gpc_response", assessment },
    presentationDecision: { status: input.presentationStatus ?? "surface" },
    scoreEffects: input.deductionPoints === undefined ? [] : [{
      appliesTo: "certscore_overall",
      deductionPoints: input.deductionPoints,
      evidenceRefs: assessment.comparison.evidenceRefs,
      framework: "california",
      observedActivity: ["Example Ads|pixel|advertising"],
      policyKey: "california.gpc_response.qualifying_activity_not_suppressed",
      policyVersion: "california-gpc-response.v1",
      reasonCode: "comparable_gpc_no_qualifying_suppression",
    }],
  } as unknown as UnifiedFindingDisplayPacket;
}

test("projects a surfaced typed GPC finding with proof, deltas, and the exact California effect", () => {
  const projection = buildGpcResponseReportProjection([gpcFinding({ deductionPoints: 15 })]);

  assert.equal(projection?.assessment.findingTitle, "No observable GPC response");
  assert.equal(projection?.assessment.comparison.enabledProof.secGpcHeaderValue, "1");
  assert.equal(projection?.assessment.comparison.deltas.trackers.shared.length, 1);
  assert.equal(projection?.californiaDeductionPoints, 15);
  assert.deepEqual(projection?.evidenceRefs, [
    "s3://evidence/baseline.json",
    "s3://evidence/gpc.json",
  ]);
});

test("fails closed for non-surfaced packets and malformed score effects", () => {
  assert.equal(buildGpcResponseReportProjection([gpcFinding({ presentationStatus: "suppress" })]), null);
  assert.equal(
    buildGpcResponseReportProjection([gpcFinding({ deductionPoints: 5 })])?.californiaDeductionPoints,
    0,
  );
});
