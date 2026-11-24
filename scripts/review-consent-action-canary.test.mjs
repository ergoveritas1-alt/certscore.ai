import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { reviewConsentActionCanary } from "./review-consent-action-canary.mjs";

function fixture() {
  const scanId = "test-canary";
  const region = "us-west-1";
  const targetUrl = "https://fixture.example/";
  const buildGitSha = "a".repeat(40);
  const manifestSha256 = "f".repeat(64);
  const threshold = {minEligible: 1, minCompletionRate: 1, maxDeadlineLossRate: 0};
  const plan = {version:"certscore.consent-action-canary-review.v1", buildGitSha,
    cases:[{scanId, region, targetUrl, eligible:["accept", "reject"]}],
    thresholds:{accept:{...threshold}, reject:{...threshold}}};
  const stages = {version:"certscore.consent-action-stages.v1", scanId, accept:"packet_joined", reject:"packet_joined"};
  const manifest = {contractVersion:"certscore.v2.lambda-dag-artifact-manifest.v1", scanId,
    targetUrl, targetEnvironment:"production", artifactOnly:true, consentActionStages:stages};
  const event = {event:"consent_gate_enforced.v1", scanId, region, buildGitSha, manifestSha256,
    consentActionStages:{...stages}};
  for (const action of ["accept", "reject"]) {
    const passive = {outcome:"qualified"};
    const dispatch = {outcome:"would_allow"};
    const finalRecheck = {outcome:"passed", observedAtMs:1200};
    const sha = "1".repeat(64);
    manifest[action + "GateShadowReceipt"] = {version:`certscore.${action}-gate-shadow-receipt.v1`,
      scanId, enforcementActive:true, passive, dispatch, finalRecheck,
      timing:{dispatchObservedAtMs:1100, proofIssuedAtMs:1000, proofExpiresAtMs:7000},
      binding:{selectorEvidence:"verified_geometry", labelMatch:"exact", selectorSha256:sha,
        requestedTargetSha256:createHash("sha256").update(targetUrl).digest("hex"),
        parentDispatchSha256:sha, sourceSha256:sha, documentTokenSha256:sha, geometrySha256:sha}};
    event[action] = {enforcementActive:true, click:"completed", boundControl:true, passive, dispatch, finalRecheck};
  }
  return {plan, observation:{event, manifest, manifestSha256}};
}

test("a matching receipt cohort evaluates independently eligible Accept and Reject", () => {
  const {plan, observation} = fixture();
  const report = reviewConsentActionCanary(plan, [observation]);
  assert.equal(report.status, "passed");
  assert.equal(report.actions.accept.completed, 1);
  assert.equal(report.actions.reject.completed, 1);
  assert.equal(report.cases.length, 2);
});

test("late packets and valid-looking clicks missing fresh exact proof stop review", () => {
  const {plan, observation} = fixture();
  observation.event.accept.click = "unverified";
  observation.event.consentActionStages.accept = "packet_deadline_exceeded";
  observation.manifest.consentActionStages.accept = "packet_deadline_exceeded";
  observation.event.reject.finalRecheck.observedAtMs = 7000;
  const report = reviewConsentActionCanary(plan, [observation]);
  assert.equal(report.status, "stop");
  assert.equal(report.actions.accept.deadlineLossRate, 1);
  assert.equal(report.actions.reject.missingProof, 1);
  assert.ok(report.failures.some(row => row.reason === "deadline_loss_above_threshold"));
});

test("a completion outside the independently eligible cohort blocks approval", () => {
  const {plan, observation} = fixture();
  plan.cases[0].eligible = ["accept"];
  const report = reviewConsentActionCanary(plan, [observation]);
  assert.equal(report.status, "stop");
  assert.equal(report.actions.reject.eligible, 0);
  assert.ok(report.failures.some(row => row.reason === "completed_outside_eligible_cohort"));
});

test("stage, build, manifest and operator thresholds must match the frozen plan", () => {
  const {plan, observation} = fixture();
  assert.throws(() => reviewConsentActionCanary({...plan, buildGitSha:"f".repeat(40)}, [observation]));
  assert.throws(() => reviewConsentActionCanary(plan, [{...observation, manifestSha256:"a".repeat(64)}]));
  const changed = {...observation.manifest, consentActionStages:{...observation.manifest.consentActionStages, accept:"gate_declined"}};
  assert.throws(() => reviewConsentActionCanary(plan, [{...observation, manifest:changed}]));
  delete plan.thresholds.accept.maxDeadlineLossRate;
  assert.throws(() => reviewConsentActionCanary(plan, [observation]), /operator-reviewed threshold/);
});

test("a matched checkpoint counts the click separately and leaves observation coverage below threshold", () => {
  const {plan, observation} = fixture();
  const {event, manifest} = observation;
  const marker = {version:"certscore.reject-click-checkpoint.v1", scanId:event.scanId,
    gateProofSha256:"a".repeat(64), receiptSha256:"2".repeat(64), recheckedAtMs:1200,
    dispatchedAtMs:1201, completedAtMs:1225, verifiedAtMs:8400};
  manifest.laneTimingSummary = {passiveLaneBarrierCompletedAt:new Date(1000).toISOString()};
  event.rejectClickCheckpoint = marker;
  manifest.rejectClickCheckpoint = {...marker};
  event.consentActionStages.reject = manifest.consentActionStages.reject = "worker_deadline_exceeded";
  event.reject.click = "unverified";
  event.reject.finalRecheck = manifest.rejectGateShadowReceipt.finalRecheck = {outcome:"unavailable"};
  const result = reviewConsentActionCanary(plan, [observation]);
  assert.equal(result.actions.reject.completed, 0);
  assert.equal(result.actions.reject.checkpointOnly, 1);
  assert.equal(result.actions.reject.verifiedClicks, 1);
  assert.equal(result.status, "stop");
  event.rejectClickCheckpoint.verifiedAtMs = manifest.rejectClickCheckpoint.verifiedAtMs = 9000;
  assert.ok(reviewConsentActionCanary(plan, [observation]).failures.some(row => row.reason === "invalid_click_checkpoint"));
});
