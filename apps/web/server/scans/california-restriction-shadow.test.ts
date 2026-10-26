import assert from "node:assert/strict";
import test from "node:test";
import { californiaPrivacyReviewFindingIds, type CaliforniaRestrictionShadow } from "@certscore/contracts";
import { californiaCoverageFixture, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "./california-review-coverage.fixture";
import { projectCaliforniaPrivacyReview } from "./california-privacy-review-projection";
import { deriveCaliforniaRegulatoryScore } from "../../lib/scans/california-regulatory-score";

const text = "California Privacy Rights under the CCPA. Such authorized agent must be registered with the California Secretary of State.";
function fixture(policyText = text) {
  const f = californiaCoverageFixture(policyText);
  f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
  for (const surface of f.bundle.policySurfaceObservations) surface.documentLanguage = "en";
  return f;
}
function run(f = fixture(), observer?: (result: CaliforniaRestrictionShadow) => void) {
  return projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, CA_FIXTURE_URL, f.policyEvidence, undefined,
    observer ? { onRestrictionShadow: observer } : undefined);
}

test("local observer receives detached shadow facts without modifying canonical output, findings or score", () => {
  const f = fixture(), original = structuredClone(f);
  const baseline = run(f);
  let shadow: CaliforniaRestrictionShadow | undefined;
  const observed = run(f, value => { shadow = value; });
  assert.ok(shadow);
  assert.equal(shadow.candidates[0]?.kind, "agent_registration");
  assert.deepEqual(f, original);
  assert.deepEqual(observed, baseline);
  assert.deepEqual(californiaPrivacyReviewFindingIds(observed), californiaPrivacyReviewFindingIds(baseline));
  assert.deepEqual(deriveCaliforniaRegulatoryScore({ assessment: observed, checklistRows: [], unifiedFindings: [] }),
    deriveCaliforniaRegulatoryScore({ assessment: baseline, checklistRows: [], unifiedFindings: [] }));
  assert.ok(!JSON.stringify(observed).includes("restriction-shadow"));
  assert.deepEqual(run(f, value => { value.candidates.length = 0; throw new Error("local observer failed"); }), baseline);
});

test("existing source, completeness, ownership and language exclusions gate shadow input", () => {
  const changes: Array<[string, (f: ReturnType<typeof fixture>) => void]> = [
    ["missing bytes", f => { f.policyEvidence.texts = []; }],
    ["changed bytes", f => { f.policyEvidence.texts.forEach(row => { row.text += " changed"; }); }],
    ["bundle hash mismatch", f => { f.policyEvidence.projection.sourceBundle.sha256 = "b".repeat(64); }],
    ["unverified bundle", f => { f.policyEvidence.projection.sourceBundle.verificationStatus = "local_unverified"; }],
    ["unverified artifact", f => { f.policyEvidence.projection.documents.forEach(row => { row.artifactVerificationStatus = "unavailable"; }); }],
    ["truncated source", f => { f.policyEvidence.projection.documents.forEach(row => { row.documentTextCoverage.status = "truncated"; }); }],
    ["unrelated policy", f => { f.policyEvidence.projection.documents.forEach(row => { row.targetRelationship = "service_provider"; }); }],
    ["navigation shell", f => { f.policyEvidence.projection.documents.forEach(row => { row.documentRole = "policy_index"; }); }],
    ["translation", f => { f.bundle.policySurfaceObservations.forEach(row => { row.translationApplied = true; }); }],
    ["non-English", f => { f.bundle.policySurfaceObservations.forEach(row => { row.documentLanguage = "de"; }); }],
  ];
  for (const [name, change] of changes) {
    const f = fixture(); change(f);
    let shadow: CaliforniaRestrictionShadow | undefined;
    const baseline = run(f), observed = run(f, value => { shadow = value; });
    assert.deepEqual(observed, baseline, name);
    assert.equal(shadow?.status, "no_verified_sources", name);
    assert.deepEqual(shadow?.candidates, [], name);
  }
});

test("missing supplement preserves existing positive document eligibility without creating an absence claim", () => {
  const f = fixture();
  f.bundle.policySurfaceObservations.push({ ...f.bundle.policySurfaceObservations[0]!, observationId: "missing-ca",
    parentObservationId: "policy", traversalDepth: 1, surfaceType: "california_notice", status: "observed",
    documentFetchState: "not_attempted", normalizedUrl: `${CA_FIXTURE_URL}supplement`, url: `${CA_FIXTURE_URL}supplement`, linkText: "California supplement" });
  let shadow: CaliforniaRestrictionShadow | undefined;
  const observed = run(f, value => { shadow = value; });
  assert.equal(shadow?.candidates[0]?.kind, "agent_registration");
  assert.deepEqual(observed, run(f));
});

test("older materializations and missing source proof are not upgraded", () => {
  const f = fixture(); f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v2";
  assert.deepEqual(run(f, () => {}), run(f));
  let called = false;
  assert.equal(projectCaliforniaPrivacyReview(f.bundle, { ...CA_FIXTURE_SOURCE, verificationStatus: "unverified" }, CA_FIXTURE_URL,
    f.policyEvidence, undefined, { onRestrictionShadow: () => { called = true; } }), null);
  assert.equal(called, false);
});

test("list-bound opt-out hardening reaches only the detached local observer", () => {
  const policyText = text + " Right to opt out of sharing. You have the right to opt-out of the Sharing of your personal information. " +
    "To exercise any of the above rights, please submit a verifiable consumer privacy request by: using our email at privacy@example.test. " +
    "For us to fulfill your request, you must provide sufficient information for us to reasonably verify that you are the consumer from whom we collected the personal information.";
  const f = fixture(policyText), baseline = run(f);
  let shadow: CaliforniaRestrictionShadow | undefined;
  const observed = run(f, value => {shadow = value;});
  assert.ok(shadow);
  assert.equal(shadow.version, "california.request-restriction-shadow.v2");
  assert.ok(shadow.candidates.some(row => row.kind === "opt_out_verification"));
  assert.ok(shadow.candidates.some(row => row.kind === "agent_registration"));
  assert.deepEqual(observed, baseline);
  assert.deepEqual(californiaPrivacyReviewFindingIds(observed), californiaPrivacyReviewFindingIds(baseline));
  assert.ok(!JSON.stringify(observed).includes("opt_out_verification"));
  assert.ok(!JSON.stringify(observed).includes("restriction-shadow"));
});
