import assert from "node:assert/strict";
import test from "node:test";
import { consentControlAssessmentSchema, deriveConsentControlAssessment, materializeSelfHiddenFrameInspection, privacyChoiceInspectionSchema } from "@certscore/contracts";
import { selfHiddenFrameFixture } from "../../../../packages/certscore-contracts/src/test-fixtures/self-hidden-frame";
import { californiaCoverageFixture, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "./california-review-coverage.fixture";
import { projectCaliforniaPrivacyReview } from "./california-privacy-review-projection";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { deriveCaliforniaRegulatoryScore } from "../../lib/scans/california-regulatory-score";
import { projectCaliforniaChoicePresence } from "../../lib/scans/california-choice-presence";

const unresolvedPolicy = "Canadian Privacy Policy. We retain personal information only as long as necessary. To exercise your privacy rights, contact privacy@example.test.";
function frameInspection() {
  const raw = selfHiddenFrameFixture();
  raw.documentUrl = CA_FIXTURE_URL;
  raw.capturedAt = "2026-10-17T12:00:01.000Z";
  return raw;
}
function assess(f: ReturnType<typeof californiaCoverageFixture>, source = CA_FIXTURE_SOURCE) {
  const child = projectCaliforniaPrivacyReview(f.bundle, source, CA_FIXTURE_URL, f.policyEvidence);
  const parent = deriveConsentControlAssessment({scan: {scanId: f.bundle.scanId, finalUrl: CA_FIXTURE_URL}});
  if (child) parent.californiaPrivacyReview = child;
  const persisted = consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
  const packets = buildUnifiedFindingDisplayPackets({reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(), runtimeArtifacts: {consentControlAssessment: persisted}});
  return {child: persisted.californiaPrivacyReview, packets,
    snapshot: projectCaliforniaChoicePresence(packets, f.bundle.scanId, CA_FIXTURE_URL),
    score: child ? deriveCaliforniaRegulatoryScore({assessment: child, checklistRows: [], unifiedFindings: packets}) : null};
}
for (const policy of ["california-privacy-review.v2", "california-privacy-review.v3", "california-privacy-review.v10"] as const) {
  test(`self-hidden v6 preserves canonical findings and existing scoring under ${policy}`, () => {
    const f = californiaCoverageFixture(unresolvedPolicy);
    f.bundle.policySurfaceInspection!.californiaReviewPolicy = policy;
    f.bundle.collectionSurfaceInventory!.scenario = "fresh_pre_consent";
    const ordinaryComplete = assess(f);
    f.bundle.policySurfaceInspection!.privacyChoiceInspection = materializeSelfHiddenFrameInspection(frameInspection())!;
    const current = assess(f);
    assert.equal(current.child?.policyVersion, policy, "Only the inspection policy changes");
    assert.equal(current.child?.choiceSurface, "not_observed_in_inspected_scope");
    assert.deepEqual(current.child?.inspection, f.bundle.policySurfaceInspection!.privacyChoiceInspection, "Typed exclusion survives persistence");
    assert.ok(current.packets.some(p => p.unifiedFindingId === "california_privacy_choice_not_observed"));
    assert.equal(current.snapshot?.title, "Sale/sharing opt-out link not observed");
    assert.deepEqual(current.score, ordinaryComplete.score, "Existing eligibility and weights are reused without additions");
    assert.deepEqual(current.score?.deductions, []);
    f.bundle.policySurfaceInspection!.privacyChoiceInspection = privacyChoiceInspectionSchema.parse(frameInspection());
    const historical = assess(f);
    assert.equal(historical.child?.choiceSurface, "unknown");
    assert.equal(historical.child?.inspection?.contractVersion, "certscore.privacy-choice-inspection.v5");
    assert.equal(historical.snapshot, null);
    assert.ok(!historical.packets.some(p => p.unifiedFindingId === "california_privacy_choice_not_observed"));
  });
}
test("self-hidden v6 preserves no-sale applicability suppression and score eligibility", () => {
  const f = californiaCoverageFixture(), ordinaryComplete = assess(f);
  f.bundle.policySurfaceInspection!.privacyChoiceInspection = materializeSelfHiddenFrameInspection(frameInspection())!;
  const result = assess(f);
  assert.equal(result.child?.choiceSurface, "not_observed_in_inspected_scope");
  assert.ok(!result.packets.some(p => p.unifiedFindingId === "california_privacy_choice_not_observed"));
  assert.deepEqual(result.score, ordinaryComplete.score);
  assert.equal(result.score?.score, 100);
});
test("self-hidden absence remains unavailable for unverified, wrong-document, late or invalid retained proof", () => {
  for (const mode of ["unverified", "wrong-document", "late", "missing-identity", "truncated-inventory"] as const) {
    const f = californiaCoverageFixture(unresolvedPolicy);
    const inspection = materializeSelfHiddenFrameInspection(frameInspection())!;
    f.bundle.policySurfaceInspection!.privacyChoiceInspection = inspection;
    if (mode === "wrong-document") inspection.documentUrl = "https://other.test/";
    if (mode === "late") inspection.capturedAt = "2026-10-23T00:00:00.000Z";
    if (mode === "missing-identity") delete inspection.diagnostics!.checkpointIdentity;
    if (mode === "truncated-inventory") f.bundle.policySurfaceInspection!.privacyChoiceInspection = privacyChoiceInspectionSchema.parse({...frameInspection(), candidateEnumerationTruncated: true});
    const result = assess(f, mode === "unverified" ? {...CA_FIXTURE_SOURCE, verificationStatus: "unverified"} : CA_FIXTURE_SOURCE);
    assert.notEqual(result.child?.choiceSurface, "not_observed_in_inspected_scope", mode);
    assert.equal(result.snapshot, null, mode);
    assert.ok(!result.packets.some(p => p.unifiedFindingId === "california_privacy_choice_not_observed"), mode);
  }
});
