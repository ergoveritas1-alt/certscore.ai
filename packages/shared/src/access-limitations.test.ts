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

test("classifies Kasada WAF challenge markers even behind Cloudflare", () => {
  const result = classifyBlockedResponse({
    ...blockPageFixtures.kasada403Challenge
  });

  assert.equal(result.classification, "vendor_interstitial_probable");
  assert.equal(result.vendorGuess, "kasada");
  assert.equal(result.challengeSuspected, true);
  assert.equal(result.interstitialMarkerPresent, true);
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

test("maps clean homepage fetches with missing retained body into degraded content capture", () => {
  const outcome = deriveAccessLimitationOutcome({
    accessPostureClass: "tolerant",
    homepageFetchHttpStatus: 200,
    homepageFetchStatus: "ok",
    normalizedBodyMissing: true,
    pagesScanned: 1
  });

  assert.equal(outcome?.kind, "content_capture_degraded");
  assert.equal(outcome?.outcomeTitle, "Content capture degraded");
});

test("maps thin-page degraded captures into content degradation without requiring tolerant posture", () => {
  const outcome = deriveAccessLimitationOutcome({
    accessPostureClass: "degraded_but_useful",
    blockPageClassification: "empty_or_thin_block_page",
    homepageFetchHttpStatus: 200,
    homepageFetchStatus: "ok",
    normalizedBodyMissing: true,
    pagesScanned: 1
  });

  assert.equal(outcome?.kind, "content_capture_degraded");
});

test("ignores stale auth-wall classifications when useful origin evidence was retained", () => {
  const outcome = deriveAccessLimitationOutcome({
    accessPostureClass: "degraded_but_useful",
    blockPageClassification: "login_wall_probable",
    blockedFlag: false,
    captchaFlag: false,
    challengeSuspected: false,
    authWallSuspected: true,
    homepageFetchHttpStatus: 200,
    homepageFetchStatus: "ok",
    pagesScanned: 4
  });

  assert.equal(outcome, null);
});

test("ignores stale auth-wall classifications for degraded useful homepages even when page counting stayed thin", () => {
  const outcome = deriveAccessLimitationOutcome({
    accessPostureClass: "degraded_but_useful",
    blockPageClassification: "login_wall_probable",
    blockedFlag: false,
    captchaFlag: false,
    challengeSuspected: false,
    homepageFetchHttpStatus: 200,
    homepageFetchStatus: "ok",
    pagesScanned: 0
  });

  assert.equal(outcome, null);
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

test("treats successful homepage fetches with missing normalized body as retryable degradation", () => {
  const policy = deriveRetryPolicy({
    accessPostureClass: "tolerant",
    homepageFetchStatus: "ok",
    homepageHttpStatus: 200,
    normalizedBodyMissing: true,
    pagesScanned: 1
  });

  assert.deepEqual(policy, {
    cooldownHours: 2,
    maxPassiveVerificationUrls: 4,
    retryRecommended: true,
    stopHomepageRetry: false
  });
});

test("keeps thin-page degraded captures retryable without relying on tolerant posture", () => {
  const policy = deriveRetryPolicy({
    accessPostureClass: "degraded_but_useful",
    blockPageClassification: "empty_or_thin_block_page",
    homepageFetchStatus: "ok",
    homepageHttpStatus: 200,
    normalizedBodyMissing: true,
    pagesScanned: 1
  });

  assert.deepEqual(policy, {
    cooldownHours: 2,
    maxPassiveVerificationUrls: 4,
    retryRecommended: true,
    stopHomepageRetry: false
  });
});

test("escalates egress risk after repeated distinct-domain 403 blocks", () => {
  const decision = deriveEgressRiskDecision(
    egressRiskFixtures.repeated403ClusterTriggeringHighBlockRiskMode!
  );

  assert.equal(decision.highBlockRiskMode, true);
  assert.equal(decision.concurrency, 1);
  assert.equal(decision.suppressNonEssentialRescans, true);
});

test("keeps low-risk scanner pickup jitter short", () => {
  const decision = deriveEgressRiskDecision({
    blockedHomepage403DistinctDomainsLastHour: 0
  });

  assert.equal(decision.highBlockRiskMode, false);
  assert.deepEqual(decision.launchJitterMs, { min: 0, max: 3_000 });
});
