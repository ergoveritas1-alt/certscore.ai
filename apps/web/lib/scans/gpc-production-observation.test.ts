import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gpcProductionRuntimeFixture } from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-production";
import { gpcRuntimeFixture } from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime";
import { buildGpcResponseAssessment } from "../../../../packages/certscore-scan-core/src/gpc-response-assessment";
import { buildGpcProductionAssessment } from "../../../../packages/certscore-scan-core/src/gpc-production-observation";
import { gpcResponseAssessmentSchema } from "@certscore/contracts";
import { apiV2GpcResponseSchema } from "../../../../packages/certscore-api-contracts/src/scan-observation-results";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { buildCanonicalGpcResponseProjection } from "./gpc-response-projection";
import { buildGpcResponseReportProjection } from "../../components/scans/report-lab/gpc-report-projection";
import { reviewCcpaScoring } from "../../scripts/lib/ccpa-scoring-review";
import { gpcActivityComparisonFixture } from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-activity-comparison";

test("verified bytes → typed persisted v3 → normalized concern/policy → unified report/API preserves complete observation with indeterminate comparison and no score", () => {
  const gpc = gpcProductionRuntimeFixture();
  gpc.gpcSignalObservation!.workerCount = 1;
  const bytes = Buffer.from(JSON.stringify(gpc));
  const pointer = { uri: "s3://fixture/gpc.json", sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length };
  const comparison = buildGpcResponseAssessment({ baseline: gpcRuntimeFixture({ enabled: false }), baselineArtifact: { ...pointer, uri: "s3://fixture/base.json" }, gpc, gpcArtifact: pointer });
  const assessment = buildGpcProductionAssessment({ scanId: gpc.scanId, source: { bytes, pointer }, comparison });
  assert.equal(assessment.status, "indeterminate");
  assert.equal(assessment.observation.status, "complete");
  assert.equal(assessment.observation.requests.classifiedCount, 1);
  assert.equal(assessment.observation.registration.sale, "unknown");
  const persisted = gpcResponseAssessmentSchema.parse(JSON.parse(JSON.stringify(assessment)));
  const findings = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(),
    runtimeArtifacts: { gpcResponseAssessment: persisted } });
  const projection = buildCanonicalGpcResponseProjection(findings);
  assert.ok(projection);
  assert.equal(projection.headline, "Observation complete");
  assert.equal(projection.comparisonHeadline, "Comparison incomplete");
  assert.equal(projection.californiaDeductionPoints, 0);
  assert.equal(projection.observedFacts[0]?.value, "1 tracking request observed with GPC");
  assert.equal(projection.assessment.status, "indeterminate");
  assert.deepEqual(buildGpcResponseReportProjection(findings)?.observedFacts, projection.observedFacts);
  assert.match(projection.summary, /observation completed/);
  assert.match(projection.summary, /1 classified/);
  assert.doesNotMatch(projection.summary, /honored|compliant|violation/i);
  assert.deepEqual(buildGpcResponseReportProjection(findings)?.assessment, assessment);
  const { baselineArtifact, gpcArtifact, delivery, evidenceRefs, ...c } = assessment.comparison;
  const publicResult = apiV2GpcResponseSchema.parse({ contractVersion: assessment.contractVersion, status: assessment.status,
    findingTitle: assessment.findingTitle, summary: projection.summary, observation: assessment.observation,
    scoreEffect: "none", legalInterpretation: "not_assessed", comparison: { ...c,
      baselineArtifact: { lane: "runtime_evidence", sha256: pointer.sha256, sizeBytes: pointer.sizeBytes },
      gpcArtifact: { lane: "gpc_observation", sha256: pointer.sha256, sizeBytes: pointer.sizeBytes }, delivery: { status: delivery.status } },
    californiaPolicy: { applied: false, deductionPoints: 0 }, evidenceUrl: "https://example.test/evidence" });
  assert.equal(publicResult.observation?.status, "complete");
  const review = reviewCcpaScoring({ artifactType: "certscore_canonical_report_export",
    artifactVersion: "canonical-report-export-v6", generatedAt: "2026-09-25T00:00:00.000Z",
    scan: { id: gpc.scanId, status: "completed", scanFrom: "us_ca" },
    privacyAuditEvidence: null, gpcResponse: publicResult });
  assert.equal(review.checks.gpc_response.status, "limited");
  assert.equal(review.gpcOutcome, "indeterminate");
  assert.equal(review.existingGpcPolicy?.deductionPoints, 0);
  assert.equal(review.score, null);

  const activityComparison = gpcActivityComparisonFixture({ scanId: gpc.scanId,
    sourceHashes: { baseline: pointer.sha256, gpc: pointer.sha256 } });
  const withActivity = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(),
    runtimeArtifacts: { gpcResponseAssessment: persisted, gpcActivityComparison: activityComparison } });
  const projectedActivity = buildCanonicalGpcResponseProjection(withActivity);
  assert.deepEqual(projectedActivity?.activityComparison, activityComparison);
  assert.equal(projectedActivity?.californiaDeductionPoints, 0);
  assert.equal(projectedActivity?.assessment.status, "indeterminate");
  assert.deepEqual(withActivity.map(f => f.scoreEffects), findings.map(f => f.scoreEffects));
  assert.deepEqual(apiV2GpcResponseSchema.parse({ ...publicResult, activityComparison }).activityComparison, activityComparison);
  assert.equal(apiV2GpcResponseSchema.safeParse({ ...publicResult, activityComparison: { ...activityComparison,
    sourceHashes: { baseline: "d".repeat(64), gpc: pointer.sha256 } } }).success, false);
  const wrongPair = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(),
    runtimeArtifacts: { gpcResponseAssessment: persisted, gpcActivityComparison: { ...activityComparison, sourceHashes: { baseline: "d".repeat(64), gpc: pointer.sha256 } } } });
  assert.equal(buildCanonicalGpcResponseProjection(wrongPair)?.activityComparison, undefined);
});

test("quiet-window limits do not downgrade a verified observation, and observation failures never become completion", () => {
  const gpc = gpcProductionRuntimeFixture();
  const baseline = gpcRuntimeFixture({ enabled: false });
  for (const bundle of [baseline, gpc]) {
    const quiet = bundle.modulesRun.find(module => module.moduleName === "preConsentRuntimeScanner")!
      .timingBreakdown!.find(timing => timing.label === "passive evidence quiet wait")!;
    quiet.outcome = "timed_out";
  }
  const bytes = Buffer.from(JSON.stringify(gpc));
  const pointer = { uri: "s3://fixture/gpc.json", sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length };
  const comparison = buildGpcResponseAssessment({ baseline, baselineArtifact: { ...pointer, uri: "s3://fixture/base.json" }, gpc, gpcArtifact: pointer });
  const assessment = buildGpcProductionAssessment({ scanId: gpc.scanId, source: { bytes, pointer }, comparison });
  assert.deepEqual(assessment.comparison.limitationKeys, ["baseline_settle_not_completed", "gpc_settle_not_completed"]);
  assert.equal(assessment.observation.status, "complete");

  for (const status of ["complete", "limited", "unavailable"] as const) {
    const persisted = gpcResponseAssessmentSchema.parse({ ...assessment, observation: { ...assessment.observation, status,
      limitationKeys: status === "complete" ? [] : ["source_unverified"] } });
    const findings = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(),
      runtimeArtifacts: { gpcResponseAssessment: persisted } });
    const projection = buildGpcResponseReportProjection(findings);
    assert.ok(projection);
    assert.equal(projection.headline, `Observation ${status}`);
    assert.equal(projection.comparisonHeadline, "Signal verified · Comparison incomplete");
    assert.equal(projection.assessment.status, "indeterminate");
    assert.equal(projection.californiaDeductionPoints, 0);
    assert.deepEqual(projection.assessment, persisted);
  }
});
