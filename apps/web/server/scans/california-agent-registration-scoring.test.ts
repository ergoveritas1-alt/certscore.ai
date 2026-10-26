import assert from "node:assert/strict";
import test from "node:test";
import { CALIFORNIA_AGENT_REGISTRATION_ID as ID, CALIFORNIA_DISCLOSURE_CHOICE_POLICY, californiaPrivacyReviewSchema,
  consentControlAssessmentSchema, deriveConsentControlAssessment, type CaliforniaPrivacyReview } from "@certscore/contracts";
import { californiaCoverageFixture, CA_FIXTURE_POLICY, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "./california-review-coverage.fixture";
import { projectCaliforniaPrivacyReview } from "./california-privacy-review-projection";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { californiaFindingScoreEffect, deriveCaliforniaRegulatoryScore } from "../../lib/scans/california-regulatory-score";
import { CALIFORNIA_AGENT_REGISTRATION_SCORE_VERSION } from "../../lib/scans/scoring-policy";
import { projectCaliforniaRegulatoryPriorities } from "../../lib/scans/california-regulatory-priorities";
import { selectRegulatoryReview } from "../../lib/scans/regulatory-review-catalog";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
import { deriveConcernPolicy } from "../../lib/scans/concern-policy";
import { californiaPriorityDemotion } from "../../lib/scans/california-priority-selection";

const clause = " California Privacy Rights under the CCPA. Such authorized agent must be registered with the California Secretary of State.";
// Wall-clock budget behavior has dedicated matcher tests and retained replay.
// Keep these scoring fixtures independent of process scheduling under parallel CI.
test.beforeEach(context => {
  assert.ok("mock" in context);
  context.mock.method(performance, "now", () => 0);
});
function fixture(text = CA_FIXTURE_POLICY + clause) {
  const f = californiaCoverageFixture(text);
  f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
  f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy = CALIFORNIA_DISCLOSURE_CHOICE_POLICY;
  f.bundle.policySurfaceObservations.forEach(row => { row.documentLanguage = "en"; });
  return f;
}
function materialize(f = fixture()) {
  const review = projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, CA_FIXTURE_URL, f.policyEvidence);
  assert.ok(review?.contractVersion === "certscore.california-privacy-review.v10");
  return review;
}
function pipeline(review: CaliforniaPrivacyReview) {
  const parent = deriveConsentControlAssessment({scan: {scanId: review.scanId, finalUrl: review.documentUrl}});
  parent.californiaPrivacyReview = review;
  const retained = consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
  const packets = buildUnifiedFindingDisplayPackets({reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(),
    runtimeArtifacts: {consentControlAssessment: retained}});
  const score = deriveCaliforniaRegulatoryScore({assessment: review, checklistRows: [], unifiedFindings: packets});
  return {retained, packets, score};
}

test("source-bound registration passes persisted concern, policy, unified finding and adds three once", () => {
  const review = materialize(), result = pipeline(review);
  assert.ok(result.retained.californiaPrivacyReview?.contractVersion === "certscore.california-privacy-review.v10" &&
    result.retained.californiaPrivacyReview.agentRegistrationAssessment);
  assert.equal(result.score.score, 97);
  assert.equal(result.score.policyVersion, CALIFORNIA_AGENT_REGISTRATION_SCORE_VERSION);
  assert.equal(result.score.deductions.filter(row => row.findingId === ID).length, 1);
  assert.equal(result.score.deductions.find(row => row.findingId === ID)?.points, 3);
  const packet = result.packets.find(row => row.unifiedFindingId === ID)!;
  assert.equal(packet.surfacingDecision.reportable, true);
  assert.ok(packet.scoreEffects?.every(row => row.appliesTo === "california_posture"));
  assert.doesNotMatch(packet.summary, /deduct|points|violation/i);
  assert.deepEqual(deriveCaliforniaRegulatoryScore({assessment: review, checklistRows: [], unifiedFindings: [...result.packets, ...result.packets]}), result.score);
  const rows = projectCaliforniaRegulatoryPriorities(result.packets).map((row, i) => ({...row, rank: i + 1}));
  assert.ok(rows.find(row => row.id === ID)?.evidence?.includes(review.agentRegistrationAssessment!.excerpt));
  assert.ok(!selectRegulatoryReview(rows, "ccpa_cpra").topIssues.some(row => row.id === ID));
  assert.equal(californiaPriorityDemotion(rows.find(row => row.id === ID)!, rows), "agent_registration_detail");
});

test("compact concern retains bounded detail but requires the full validated transient parent at policy promotion", () => {
  const review = materialize(), result = pipeline(review);
  const concerns = buildNormalizedConcerns({reviewFindingCandidates: [], validationFindings: [], runtimeArtifacts: {consentControlAssessment: result.retained}});
  const concern = concerns.find(row => row.suggestedUnifiedFindingId === ID)!;
  assert.ok(concern);
  const raw = concern.evidenceBundle.rawEvidence!;
  assert.ok(!JSON.stringify(raw).includes("consentControlAssessment"));
  assert.ok(!JSON.stringify(raw).includes("collectionNoticeAssessment"));
  assert.ok(Buffer.byteLength(JSON.stringify(raw)) < 4096);
  const packet = result.packets.find(row => row.unifiedFindingId === ID)!;
  assert.equal(packet.details?.family, "california_agent_registration");
  assert.ok(Buffer.byteLength(JSON.stringify(packet.details)) < 3200);
  const input = {concern, rawEvidence: raw, evidenceStrengthFlags: concern.evidenceStrengthFlags};
  assert.equal(deriveConcernPolicy(input).promotionEligibility, "blocked");
  assert.equal(deriveConcernPolicy({...input, consentControlAssessment: result.retained}).promotionEligibility, "eligible");
  const bad = structuredClone(raw) as any;
  bad.agentRegistrationProjection.assessment.sourceBundleSha256 = "e".repeat(64);
  assert.equal(deriveConcernPolicy({...input, rawEvidence: bad, consentControlAssessment: result.retained}).promotionEligibility, "blocked");
});

test("existing three/twelve-point rights disclosure and ten-point rights destination absorb registration", () => {
  for (const [text, expected] of [
    [CA_FIXTURE_POLICY.replace("We will not discriminate against you for exercising your privacy rights. ", "") + clause, 3],
    [CA_FIXTURE_POLICY.replace("You have the right to delete your personal information. ", "") + clause, 12],
  ] as const) {
    const review = materialize(fixture(text));
    const result = pipeline(review);
    assert.equal(result.score.deductions.find(row => row.findingId === "california_rights_disclosure_not_observed")?.points, expected);
    assert.ok(!result.score.deductions.some(row => row.findingId === ID));
    assert.ok(result.packets.some(row => row.unifiedFindingId === ID && row.surfacingDecision.reportable));
    const old = structuredClone(review); delete old.agentRegistrationAssessment;
    assert.equal(result.score.score, pipeline(old).score.score);
  }
  const review = materialize();
  review.failedNoticeLinks = [{kind: "california_notice", label: "California Privacy Rights", evidenceRef: "policy-surface:failed", destinationUrl: "https://example.test/failed", httpStatus: 404}];
  const result = pipeline(review);
  assert.equal(result.score.deductions.find(row => row.findingId === "california_rights_information_destination_error")?.points, 10);
  assert.ok(!result.score.deductions.some(row => row.findingId === ID));
  assert.equal(result.score.score, 90);
});

test("historical reviews without the child and other restriction families remain unchanged", () => {
  const old = materialize(); delete old.agentRegistrationAssessment;
  const result = pipeline(old);
  assert.equal(result.score.score, 100);
  assert.ok(!result.packets.some(row => row.unifiedFindingId === ID));
  assert.deepEqual(californiaFindingScoreEffect(ID, "ref", old.contractVersion, old), []);
  for (const addition of [" To exercise your CCPA rights, including deletion, you may only make two CCPA requests in a 12-month period.",
    " To stop selling personal information, we verify a verifiable consumer request."]) {
    const review = materialize(fixture(CA_FIXTURE_POLICY + addition));
    assert.equal(review.agentRegistrationAssessment, undefined);
    assert.equal(pipeline(review).score.score, 100);
  }
  const f = fixture(); f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v9";
  assert.ok(!JSON.stringify(projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, CA_FIXTURE_URL, f.policyEvidence)).includes("agentRegistrationAssessment"));
});

test("cross-scan/source/document/range child proof and forged or missing unified packets fail closed", () => {
  const review = materialize();
  for (const mutate of [
    (r: typeof review) => { r.agentRegistrationAssessment!.scanId = "another"; },
    (r: typeof review) => { r.agentRegistrationAssessment!.sourceBundleSha256 = "e".repeat(64); },
    (r: typeof review) => { r.agentRegistrationAssessment!.textSha256 = "e".repeat(64); },
    (r: typeof review) => { r.agentRegistrationAssessment!.sourceDocumentUrl = "https://other.test/privacy"; },
    (r: typeof review) => { r.agentRegistrationAssessment!.evidenceRef = "other"; },
    (r: typeof review) => { r.agentRegistrationAssessment!.end++; },
    (r: typeof review) => { r.reviewCoverage.sourceDocuments.forEach(d => {d.complete = false;}); },
  ]) {
    const bad = structuredClone(review); mutate(bad);
    assert.equal(californiaPrivacyReviewSchema.safeParse(bad).success, false);
    assert.deepEqual(californiaFindingScoreEffect(ID, "ref", bad.contractVersion, bad), []);
  }
  const {packets} = pipeline(review);
  for (const mutate of [
    (p: typeof packets) => {p.splice(p.findIndex(row => row.unifiedFindingId === ID), 1);},
    (p: typeof packets) => {p.find(row => row.unifiedFindingId === ID)!.scoreEffects = [];},
    (p: typeof packets) => {const f = p.find(row => row.unifiedFindingId === ID)!; if (f.details?.family === "california_agent_registration") f.details.projection.assessment.sourceBundleSha256 = "e".repeat(64);},
  ]) {
    const bad = structuredClone(packets); mutate(bad);
    assert.equal(deriveCaliforniaRegulatoryScore({assessment: review, checklistRows: [], unifiedFindings: bad}).score, null);
  }
});

test("unchanged complete-source and jurisdiction gates suppress the persisted registration child", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.policyEvidence.texts = []; },
    (f: ReturnType<typeof fixture>) => { f.policyEvidence.texts.forEach(row => {row.text += "changed";}); },
    (f: ReturnType<typeof fixture>) => { f.policyEvidence.projection.documents.forEach(row => {row.documentTextCoverage.status = "truncated";}); },
    (f: ReturnType<typeof fixture>) => { f.policyEvidence.projection.documents.forEach(row => {row.targetRelationship = "service_provider";}); },
    (f: ReturnType<typeof fixture>) => { f.bundle.policySurfaceObservations.forEach(row => {row.documentLanguage = "de";}); },
    (f: ReturnType<typeof fixture>) => { f.bundle.policySurfaceObservations.forEach(row => {row.translationApplied = true;}); },
  ]) { const f = fixture(); mutate(f); assert.equal(materialize(f).agentRegistrationAssessment, undefined); }
  const distant = CA_FIXTURE_POLICY + " ".repeat(5000) + "Such authorized agent must be registered with the California Secretary of State.";
  assert.equal(materialize(fixture(distant)).agentRegistrationAssessment, undefined);
});

test("optional analysis failure preserves the otherwise valid California review and its prior score", () => {
  const f = fixture(), baseline = materialize(f);
  delete baseline.agentRegistrationAssessment;
  const descriptor = Object.getOwnPropertyDescriptor(performance, "now");
  try {
    Object.defineProperty(performance, "now", {configurable: true, value: () => {throw new Error("analysis timer unavailable");}});
    const actual = materialize(f);
    assert.deepEqual(actual, baseline);
    assert.deepEqual(pipeline(actual).score, pipeline(baseline).score);
  } finally {
    if (descriptor) Object.defineProperty(performance, "now", descriptor);
    else Reflect.deleteProperty(performance, "now");
  }
});
