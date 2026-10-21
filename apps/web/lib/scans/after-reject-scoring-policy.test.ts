import assert from "node:assert/strict";
import test from "node:test";
import { afterRejectProjection, afterRejectClickProjection } from "./test-fixtures/after-reject-scoring";
import { assessAfterRejectScoring, retainedAfterRejectScoringAssessment } from "./after-reject-scoring-policy";
import { buildPostRefusalRuntimeProjection } from "./post-refusal-runtime-projection";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyDeductionBreakdown, deriveRegulatoryCoverageScore } from "./regulatory-coverage-score";
import { createHash } from "node:crypto";
import { inspectMeasurementRequest } from "@certscore/vendor-resolver";

function project(projection: ReturnType<typeof afterRejectProjection>) {
  const runtimeArtifacts = buildPostRefusalRuntimeProjection(projection);
  const normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ runtimeArtifacts, normalizedConcerns, scanCompleted: true, coverageLimited: false });
  const checklist = deriveGdprEprivacyCoverageChecklist({ coverageOutcomes, projectedFindings: [], unifiedFindings: [], scanCompleted: true, coverageLimited: false });
  const row = checklist.find(row => row.id === "post_reject_tracking_reduction")!;
  return { runtimeArtifacts, normalizedConcerns, row };
}

test("review-tier customer copy retains the request facts without explaining score eligibility", () => {
  const projection = afterRejectProjection("measurement");
  projection.scoringEvidence!.requests[0]!.measurementEvidence = undefined;
  assert.equal(assessAfterRejectScoring(projection)?.tier, "review");
  const {row, runtimeArtifacts} = project(projection);
  assert.doesNotMatch([row.explanation, row.note, row.limitation].filter(Boolean).join(" "), /deduction|scoring (?:withheld|applied)|purpose-specific after-Reject/i);
  assert.equal(retainedAfterRejectScoringAssessment(runtimeArtifacts)?.deductionPoints, 0);
  assert.equal(projection.postRefusalActivity.length, 1);
});

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
    assert.doesNotMatch([row.explanation, row.note, row.limitation].filter(Boolean).join(" "), /deduction|scoring (?:withheld|applied)|point(?:s)? deducted/i);
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

test("a completed authorized Reject click supports the same 15/5/0 tiers without verifying refusal registration", () => {
  for (const [profile,points] of [["advertising",15],["measurement",5],["performance",0]] as const) {
    const p=afterRejectClickProjection(profile), original=structuredClone(p);
    const assessment=assessAfterRejectScoring(p)!;
    assert.equal(assessment.registration,"unconfirmed");assert.equal(assessment.deductionPoints,points);
    assert.ok(assessment.reasons.includes("verified_reject_click"));
    const {row,runtimeArtifacts}=project(p);
    assert.equal(row.assessmentStatus,"review_signal");
    assert.equal(retainedAfterRejectScoringAssessment(runtimeArtifacts)?.deductionPoints,points);
    assert.equal(deriveGdprEprivacyDeductionBreakdown([row]).reduce((n,family)=>n+family.deductionPoints,0),points);
    assert.equal(deriveRegulatoryCoverageScore({framework:"gdpr_eprivacy",rows:[row]}).score,100-points);
    assert.equal(deriveGdprEprivacyDeductionBreakdown([row],"gdpr-eprivacy-posture.v20").length,0);
    assert.equal(p.decisionEvidence?.basis,"unverified");assert.deepEqual(p,original);
    assert.doesNotMatch([row.explanation,row.note,row.limitation].filter(Boolean).join(" "),/deduction|scoring (?:withheld|applied)|point(?:s)? deducted/i);
  }
});

test("Reject click alone, drifted requests and incomplete captures stay neutral", () => {
  for (const mutate of [
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.packetSha256=undefined;},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.actionControlProof!.authorizedTargetSha256=undefined;},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.actionControlProof!.frameIdentitySha256=undefined;},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.afterActionCapture!.requestAncestry=[];},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.afterActionCapture!.requestAncestry![0]!.rootStartedAtMs=100;},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.afterActionCapture!.requestsDropped=1;},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.captureCoverage!.requestsDroppedAfterAction=1;},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.afterActionCapture!.stopReason="aborted";},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.afterActionCapture!.activationStatus="uncertain";},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.interactionDiagnostics!.click.outcome="not_attempted";},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.scoringEvidence!.requests=[];},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.afterActionRequests![0]!.sanitizedUrl="https://different.example/";},
    (p:ReturnType<typeof afterRejectClickProjection>)=>{p.scoringEvidence!.requests[0]!.method="OPTIONS";},
  ]) {
    const p=afterRejectClickProjection();mutate(p);
    assert.equal(assessAfterRejectScoring(p)?.deductionPoints??0,0);
  }
  const p=afterRejectClickProjection("measurement");
  p.scoringEvidence!.requests[0]!.measurementEvidence=undefined;p.afterActionRequests![0]!.measurementEvidence=undefined;
  const assessment=assessAfterRejectScoring(p)!;
  assert.equal(assessment.deductionPoints,0);
  assert.ok(assessment.reasons.includes("verified_reject_click"));
  assert.ok(!assessment.reasons.includes("registration_unconfirmed"));
});

test("historical v1 assessment and v20 score retain the old unconfirmed-registration result", () => {
  const p=afterRejectClickProjection();
  const legacy=assessAfterRejectScoring(p,"after_reject_measurement_tiers.v1")!;
  assert.equal(legacy.deductionPoints,0);assert.deepEqual(legacy.reasons,["registration_unconfirmed"]);
  const runtime={postRefusalEvidenceProjection:p,afterRejectScoringAssessment:legacy};
  assert.deepEqual(retainedAfterRejectScoringAssessment(runtime),legacy);
  const current=project(p).row;
  assert.equal(deriveGdprEprivacyDeductionBreakdown([current])[0]?.deductionPoints,15);
  assert.equal(deriveGdprEprivacyDeductionBreakdown([current],"gdpr-eprivacy-posture.v20").length,0);
});

test("unconfirmed-click scoring uses the full retained requests and charges the family once", () => {
  const p = afterRejectClickProjection("performance");
  const template = p.afterActionRequests![0]!;
  const requests: NonNullable<typeof p.afterActionRequests> = Array.from({ length: 9 }, (_, i) => ({ ...template, requestId: `performance-${i}`,
    measurementEvidence: template.measurementEvidence ? { ...template.measurementEvidence, requestId: `performance-${i}` } : undefined }));
  const ad = afterRejectClickProjection("advertising").afterActionRequests![0]!;
  requests.push({ ...ad, requestId: "advertising-outside-assessment-sample" });
  p.afterActionRequests = requests;
  p.scoringEvidence!.requests = requests.map(row => ({ ...row, inFlightAtRefusalRegistration: false }));
  p.afterActionCapture!.requestIds = requests.map(row => row.requestId);
  p.afterActionCapture!.requestAncestry = requests.map(row => ({ requestId: row.requestId, rootStartedAtMs: row.rootStartedAtMs! }));
  const { row, runtimeArtifacts } = project(p);
  assert.ok("rejectClickTrackingAssessment" in runtimeArtifacts);
  assert.equal(runtimeArtifacts.rejectClickTrackingAssessment?.requests.length, 8);
  assert.deepEqual(assessAfterRejectScoring(p)?.requestIds, ["advertising-outside-assessment-sample"]);
  assert.equal(deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [row, row] }).score, 85);
});

test("request-bound cookie identifier capture reaches the canonical Reject score without registration promotion", () => {
  const p = afterRejectClickProjection("measurement");
  const request = p.scoringEvidence!.requests[0]!;
  const proof = { policyVersion:"measurement_cookie_identifier.v1", parameter:"cid", source:"pre_action_cookie_snapshot",
    targetSha256:p.actionControlProof!.authorizedTargetSha256!,cookieName:"_ga",hostname:"example.test",
    identityHash:"a".repeat(64),valueHash:"b".repeat(64),identifierSha256:createHash("sha256").update("123.456").digest("hex"),
    capturedAtMs:p.scoringEvidence!.preActionCapturedAtMs! } as const;
  const inspection = inspectMeasurementRequest({url:`${request.sanitizedUrl}&cid=123.456`,method:"POST",body:null,headers:{},
    requestId:request.requestId,timestampMs:request.startedAtMs,storedIdentifiers:[proof],hashIdentifier:value=>createHash("sha256").update(value).digest("hex")})!;
  request.measurementEvidence = inspection;
  p.afterActionRequests![0]!.measurementEvidence = inspection;
  p.scoringEvidence!.preActionStorage.push({storageType:"cookie",name:"_ga",hostname:proof.hostname,
    identityBasis:"cookie_name_domain_path_partition",identityHash:proof.identityHash,valueHash:proof.valueHash,
    nonEssential:true,purpose:"analytics",capturedAtEpochSeconds:1000,expiresAtEpochSeconds:2000});
  const {row,runtimeArtifacts}=project(p);
  assert.equal(retainedAfterRejectScoringAssessment(runtimeArtifacts)?.deductionPoints,15);
  assert.equal(deriveRegulatoryCoverageScore({framework:"gdpr_eprivacy",rows:[row]}).score,85);
  assert.equal(p.registrationStatus,"unconfirmed");assert.equal(p.decisionEvidence?.decision,"unknown");
  p.scoringEvidence!.preActionStorage[0]!.valueHash="c".repeat(64);
  assert.equal(assessAfterRejectScoring(p)?.deductionPoints,0,"a broken cookie binding cannot create a deduction");
});
