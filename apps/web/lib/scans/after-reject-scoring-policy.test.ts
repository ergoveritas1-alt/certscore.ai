import assert from "node:assert/strict";
import test from "node:test";
import { afterRejectProjection } from "./test-fixtures/after-reject-scoring";
import { assessAfterRejectScoring, retainedAfterRejectScoringAssessment } from "./after-reject-scoring-policy";
import { buildPostRefusalRuntimeProjection } from "./post-refusal-runtime-projection";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyDeductionBreakdown, deriveRegulatoryCoverageScore } from "./regulatory-coverage-score";

function project(projection: ReturnType<typeof afterRejectProjection>) {
  const runtimeArtifacts = buildPostRefusalRuntimeProjection(projection);
  const normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ runtimeArtifacts, normalizedConcerns, scanCompleted: true, coverageLimited: false });
  const checklist = deriveGdprEprivacyCoverageChecklist({ coverageOutcomes, projectedFindings: [], unifiedFindings: [], scanCompleted: true, coverageLimited: false });
  const row = checklist.find(row => row.id === "post_reject_tracking_reduction")!;
  return { runtimeArtifacts, normalizedConcerns, row };
}

test("15/5/0 tiers flow through persisted typed assessment, concerns, policy and checklist", () => {
  for (const [profile, points, tier] of [["advertising", 15, "high_risk"], ["measurement", 5, "measurement"], ["performance", 0, "performance_only"]] as const) {
    const projection = afterRejectProjection(profile), original = structuredClone(projection);
    const assessment = assessAfterRejectScoring(projection)!;
    assert.equal(assessment.deductionPoints, points);
    assert.equal(assessment.tier, tier);
    const { row, runtimeArtifacts, normalizedConcerns } = project(projection);
    assert.equal(retainedAfterRejectScoringAssessment(runtimeArtifacts)?.deductionPoints, points);
    assert.ok(normalizedConcerns.some(concern => concern.evidenceBundle.rawEvidence?.afterRejectScoringAssessment));
    assert.equal(deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [row] }).score, 100 - points);
    assert.equal(deriveGdprEprivacyDeductionBreakdown([row]).reduce((sum, family) => sum + family.deductionPoints, 0), points);
    if (points < 15) assert.equal(row.assessmentStatus, "review_signal");
    assert.equal(projection.postRefusalActivity.length, 1, "zero deduction must not erase the observed request");
    assert.deepEqual(projection, original);
  }
});
test("measurement downgrades require request-bound inspection and complete bounded storage snapshots", () => {
  for (const mutate of [
    (p: ReturnType<typeof afterRejectProjection>) => { p.scoringEvidence!.requests[0]!.measurementEvidence = undefined; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.scoringEvidence!.requests[0]!.measurementEvidence!.requestId = "different"; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.scoringEvidence!.requests[0]!.measurementEvidence!.identifierEvidence = "unknown"; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.scoringEvidence!.requests[0]!.measurementEvidence!.cookieHeader = "unknown"; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.storageCollectionDiagnostics = undefined; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.storageCollectionDiagnostics!.preAction!.cookies.retainedCount = 1; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.scoringEvidence!.preActionCapturedAtMs = 150; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.scoringEvidence!.postActionCapturedAtMs = 190; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.scoringEvidence!.requests[0]!.responseCookieNamesSet = undefined; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.scoringEvidence!.requests[0]!.responseCookieNamesSet = ["unclassified_cookie"]; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.scoringEvidence!.requests[0]!.rootStartedAtMs = 50; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.scoringEvidence!.requests[0]!.method = "OPTIONS"; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.scoringEvidence!.requests[0]!.method = "other"; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.actionControlProof!.frameIdentitySha256 = undefined; },
    (p: ReturnType<typeof afterRejectProjection>) => { p.registeredObservationCompletion = undefined; },
  ]) {
    const projection = afterRejectProjection(); mutate(projection);
    const assessment = assessAfterRejectScoring(projection);
    assert.equal(assessment?.deductionPoints ?? 0, 0);
    assert.equal(assessment?.tier ?? "review", "review");
  }
});

test("lower tiers reject lookalike collection hosts and unresolved transient storage writes", () => {
  const measurement = afterRejectProjection("measurement");
  const request = measurement.scoringEvidence!.requests[0]!;
  request.sanitizedUrl = "https://example.test/g/collect";
  request.measurementEvidence!.requestOrigin = "https://example.test";
  assert.equal(assessAfterRejectScoring(measurement)?.tier, "review");
  const performance = afterRejectProjection("performance");
  performance.scoringEvidence!.storageWrites.push({ observedAtMs: 220, msOffsetFromRefusal: 100,
    nonEssential: false, name: "unknown_transient", purpose: "unknown", storageType: "local_storage", storageIdentityHash: "e".repeat(64) });
  assert.equal(assessAfterRejectScoring(performance)?.tier, "review");
});
test("mixed activity uses the strongest supported tier, without double charging", () => {
  const projection = afterRejectProjection("performance");
  const ad = afterRejectProjection("advertising");
  ad.scoringEvidence!.requests[0]!.requestId = "advertising-2";
  ad.postRefusalActivity[0]!.requestId = "advertising-2";
  projection.scoringEvidence!.requests.push(ad.scoringEvidence!.requests[0]!);
  projection.postRefusalActivity.push(ad.postRefusalActivity[0]!);
  const { row } = project(projection);
  assert.equal(assessAfterRejectScoring(projection)?.deductionPoints, 15);
  assert.equal(deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [row, row] }).score, 85);
  const runtime = project(afterRejectProjection()).runtimeArtifacts;
  const stored = (runtime as { afterRejectScoringAssessment: { deductionPoints: number } }).afterRejectScoringAssessment;
  stored.deductionPoints = 15;
  assert.equal(retainedAfterRejectScoringAssessment(runtime), null, "altered stored interpretation must not project");
});
test("verified contradictions and direct optional storage writes retain the high tier", () => {
  const contradiction = afterRejectProjection("performance"); contradiction.contradictionObserved = true;
  assert.equal(assessAfterRejectScoring(contradiction)?.deductionPoints, 15);
  const write = afterRejectProjection("performance");
  write.scoringEvidence!.storageWrites.push({ purpose: "analytics", observedAtMs: 220, msOffsetFromRefusal: 100,
    nonEssential: true, name: "_ga", storageType: "cookie", storageIdentityHash: "e".repeat(64) });
  assert.equal(assessAfterRejectScoring(write)?.deductionPoints, 15);
});


test("strong activity outside the report sample still receives the high tier", () => {
  const p = afterRejectProjection("performance");
  const ad = afterRejectProjection("advertising").scoringEvidence!.requests[0]!;
  p.scoringEvidence!.requests.push({ ...ad, requestId: "outside-display-sample" });
  assert.equal(p.postRefusalActivity.length, 1);
  assert.equal(assessAfterRejectScoring(p)?.deductionPoints, 15);
});


test("known purpose without verified operational essentiality cannot qualify lower tiers", () => {
  const p = afterRejectProjection("performance");
  p.scoringEvidence!.postActionStorage.push({ storageType: "cookie", name: "GCLB", hostname: "statsigapi.net", valueHash: "a".repeat(64),
    purpose: "infrastructure", nonEssential: false, purposeAssessment: { version: "action_storage_purpose.v1", essentiality: "unknown" } });
  p.storageCollectionDiagnostics!.postAction!.cookies = { status: "complete", retainedCount: 1, droppedCount: 0, sampleLimit: 96 };
  assert.equal(assessAfterRejectScoring(p)?.tier, "review");
  p.scoringEvidence!.postActionStorage[0] = { ...p.scoringEvidence!.postActionStorage[0]!, name: "cookieyes-consent", purpose: "consent_management",
    purposeAssessment: { version: "action_storage_purpose.v1", essentiality: "essential" } };
  assert.equal(assessAfterRejectScoring(p)?.tier, "performance_only");
});
