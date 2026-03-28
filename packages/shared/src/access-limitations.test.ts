import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyBlockedResponse,
  deriveAccessLimitationOutcome,
  deriveEgressRiskDecision,
  deriveRetryPolicy
} from "./access-limitations";
import { blockPageFixtures, egressRiskFixtures } from "./access-limitations.fixtures";

test("classifies a cloudflare-like challenge page", () => {
  const result = classifyBlockedResponse({
    ...blockPageFixtures.cloudflareChallenge
  });

  assert.equal(result.classification, "vendor_interstitial_probable");
  assert.equal(result.vendorGuess, "cloudflare");
  assert.equal(result.challengeSuspected, true);
});

test("classifies an auth wall", () => {
  const result = classifyBlockedResponse({
    ...blockPageFixtures.loginAuthWall
  });

  assert.equal(result.classification, "login_wall_probable");
  assert.equal(result.authWallSuspected, true);
});

test("maps challenge-suspected 403 into access-limited outcome", () => {
  const outcome = deriveAccessLimitationOutcome({
    challengeSuspected: true,
    homepageFetchHttpStatus: 403,
    homepageFetchStatus: "forbidden",
    pagesScanned: 0
  });

  assert.equal(outcome?.kind, "reachability_blocked_challenge_suspected");
  assert.equal(outcome?.outcomeTitle, "Access limited by site protections");
});

test("maps transport errors separately from blocked runs", () => {
  const outcome = deriveAccessLimitationOutcome({
    homepageFetchStatus: "error",
    pagesScanned: 0
  });

  assert.equal(outcome?.kind, "transport_failure");
  assert.equal(outcome?.outcomeTitle, "Transport failure");
});

test("assigns 24 hour cooldown to challenge-suspected 403", () => {
  const policy = deriveRetryPolicy({
    homepageHttpStatus: 403,
    challengeSuspected: true
  });

  assert.deepEqual(policy, {
    cooldownHours: 24,
    maxPassiveVerificationUrls: 4,
    retryRecommended: false,
    stopHomepageRetry: true
  });
});

test("keeps transport failures retryable with short cooldown", () => {
  const policy = deriveRetryPolicy({
    transportFailure: true
  });

  assert.equal(policy.retryRecommended, true);
  assert.equal(policy.cooldownHours, 2);
});

test("escalates egress risk after repeated distinct-domain 403 blocks", () => {
  const decision = deriveEgressRiskDecision(
    egressRiskFixtures.repeated403ClusterTriggeringHighBlockRiskMode!
  );

  assert.equal(decision.highBlockRiskMode, true);
  assert.equal(decision.concurrency, 1);
  assert.equal(decision.suppressNonEssentialRescans, true);
});
