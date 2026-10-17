import assert from "node:assert/strict";
import test from "node:test";
import type { GpcResponseAssessment } from "@certscore/contracts";
import type { UnifiedFindingDisplayPacket } from "../../../lib/scans/unified-findings";
import { describeCanonicalGpcResponse } from "../../../lib/scans/gpc-response-projection";
import type { GpcResponseReportProjection } from "./shadow-report-data";
import { buildGpcResponseReportProjection, gpcCardActivity, gpcCardResponse, gpcSummaryLabel } from "./gpc-report-projection";

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

test("historically surfaced GPC results are hidden without changing retained evidence", () => {
  const finding=gpcFinding({deductionPoints:15}), before=structuredClone(finding);
  assert.equal(buildGpcResponseReportProjection([finding]),null);
  assert.deepEqual(finding,before);
});

test("separates verified GPC delivery from an incomplete baseline comparison", () => {
  const finding = gpcFinding() as unknown as {
    details: { assessment: Record<string, unknown> };
  } & UnifiedFindingDisplayPacket;
  const assessment = {
    ...(finding.details.assessment as object),
    contractVersion: "certscore.gpc-response-assessment.v2",
    status: "indeterminate",
    findingTitle: "GPC response",
    comparison: {
      ...((finding.details.assessment as { comparison: object }).comparison),
      comparable: false,
      coverage: { status: "limited", comparedThroughMs: 1331 },
      delivery: { status: "verified", baseline: null, gpc: null },
      responseBasis: "insufficient_evidence",
      limitationKeys: ["baseline_settle_not_completed"],
    },
  } as unknown as GpcResponseAssessment;

  const presentation = describeCanonicalGpcResponse(assessment);

  assert.equal(presentation.headline, "Signal verified · Comparison incomplete");
  assert.match(presentation.coverageSummary, /baseline lane did not reach the required 250 ms quiet period/i);
  assert.doesNotMatch(presentation.coverageSummary, /baseline_settle_not_completed/);
  assessment.comparison.limitationKeys = ["baseline_settle_not_completed", "gpc_settle_not_completed"];
  assert.match(describeCanonicalGpcResponse(assessment).coverageSummary, /Neither passive lane reached the required 250 ms quiet period/);
});

test("v3 card states the observed signal and activity without implying an established response", () => {
  const projection = {
    assessment: {
      contractVersion: "certscore.gpc-response-assessment.v3",
      status: "indeterminate",
      observation: {
        status: "complete",
        requests: { complete: true, classifiedCount: 71, collectionCount: 6 },
      },
    },
    comparisonHeadline: "Comparison incomplete",
    headline: "Observation complete",
  } as GpcResponseReportProjection;

  assert.equal(gpcSummaryLabel(projection), "GPC signal observed");
  assert.equal(gpcCardActivity(projection), "With GPC enabled, we observed 71 classified tracking requests, including 6 collection requests.");
  assert.equal(gpcCardResponse(projection), gpcCardActivity(projection));

  const limited = structuredClone(projection);
  if (limited.assessment.contractVersion !== "certscore.gpc-response-assessment.v3") assert.fail("v3 fixture required");
  limited.assessment.observation.status = "limited";
  limited.headline = "Observation limited";
  assert.match(gpcCardActivity(limited)!, /71 classified tracking requests.*Capture was limited/);
  assert.equal(gpcSummaryLabel(limited), "Observation limited");
});

test("responsive GPC card describes a retained partial reduction", async () => {
  const { gpcActivityComparisonFixture } = await import("../../../../../packages/certscore-contracts/src/test-fixtures/gpc-activity-comparison");
  const projection = {
    assessment: { status: "responsive" },
    activityComparison: gpcActivityComparisonFixture(),
  } as GpcResponseReportProjection;
  assert.equal(gpcCardResponse(projection), "The paired scan observed a partial reduction in classified tracking activity with GPC.");
  projection.activityComparison!.activity.advertisingMarketing.baselineRequests = 1;
  projection.activityComparison!.activity.advertisingMarketing.gpcRequests = 0;
  projection.activityComparison!.activity.analyticsReplay.baselineRequests = 5;
  projection.activityComparison!.activity.analyticsReplay.gpcRequests = 5;
  assert.equal(gpcCardResponse(projection), "Advertising/marketing request fell from 1 to 0 with GPC; 5 analytics/replay requests remained.");
  projection.activityComparison!.activity.analyticsReplay.gpcRequests = 0;
  assert.equal(gpcCardResponse(projection), "The paired scan observed reduced classified tracking activity with GPC.");
});

test("fails closed for non-surfaced packets and malformed score effects", () => {
  assert.equal(buildGpcResponseReportProjection([gpcFinding({ presentationStatus: "suppress" })]), null);
  assert.equal(
    buildGpcResponseReportProjection([gpcFinding({ deductionPoints: 5 })]),
    null,
  );
});

test("a short-window measurement stays hidden while its original evidence is preserved", async () => {
  const { gpcActivityComparisonFixture } = await import("../../../../../packages/certscore-contracts/src/test-fixtures/gpc-activity-comparison");
  const finding = gpcFinding({ deductionPoints: 15 });
  assert.ok(finding.details?.family === "privacy_signal" && finding.details.kind === "gpc_response");
  const before = structuredClone(finding);
  const zero = { baselineRequests: 0, gpcRequests: 0, baselineServices: 0, gpcServices: 0 };
  finding.details.activityComparison = gpcActivityComparisonFixture({ durationMs: 250, activity: { advertisingMarketing: zero, analyticsReplay: zero } });
  const result = buildGpcResponseReportProjection([finding]);
  assert.equal(result, null);
  assert.equal(buildGpcResponseReportProjection([before]), null);
  assert.deepEqual(finding.scoreEffects, before.scoreEffects);
});

test("a complete empty pair reports no qualifying activity rather than a failed or unverified response",async()=>{
  const {gpcRuntimeFixture}=await import("../../../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime");
  const {buildGpcResponseAssessment}=await import("../../../../../packages/certscore-scan-core/src/gpc-response-assessment");
  const pointer={uri:"s3://fixture/base.json",sha256:"a".repeat(64),sizeBytes:100};
  const assessment=buildGpcResponseAssessment({baseline:gpcRuntimeFixture({enabled:false}),gpc:gpcRuntimeFixture({enabled:true}),
    baselineArtifact:pointer,gpcArtifact:{...pointer,uri:"s3://fixture/gpc.json"}});
  const presentation=describeCanonicalGpcResponse(assessment);
  assert.equal(assessment.comparison.comparable,true);
  assert.equal(presentation.comparisonHeadline,"No qualifying tracking activity observed");
  assert.doesNotMatch(presentation.coverageSummary,/honor|compliant|ignored|incomplete/i);
  const limited=structuredClone(assessment);limited.comparison.comparable=false;limited.status="indeterminate";
  assert.notEqual(describeCanonicalGpcResponse(limited).comparisonHeadline,presentation.comparisonHeadline);
});
