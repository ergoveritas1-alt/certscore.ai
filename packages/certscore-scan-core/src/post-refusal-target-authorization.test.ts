import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizePostRefusalTarget,
  ERGOVERITAS_POST_REFUSAL_CANARY_AUTHORIZATION_ID,
  getOwnedPostRefusalCanaryRecipeCase,
} from "./post-refusal-target-authorization.js";

test("loopback authorization cannot be reused for public targets", () => {
  assert.equal(authorizePostRefusalTarget("http://127.0.0.1:4178/fixture", {
    authorizationId: "loopback_local_lab",
    kind: "loopback",
  }).authorized, true);
  assert.equal(authorizePostRefusalTarget("https://example.com/fixture", {
    authorizationId: "loopback_local_lab",
    kind: "loopback",
  }).authorized, false);
});

test("owned-canary authorization is exact-host and path scoped", () => {
  const authorization = {
    authorizationId: ERGOVERITAS_POST_REFUSAL_CANARY_AUTHORIZATION_ID,
    kind: "owned_canary" as const,
  };
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-honored.html",
    authorization,
  ).authorized, true);
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-ignored.html",
    authorization,
  ).authorized, true);
  assert.equal(authorizePostRefusalTarget(
    "https://www.ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-honored.html",
    authorization,
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html",
    authorization,
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/post-refusal-runtime.js",
    authorization,
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-honored.html?variant=other",
    authorization,
  ).authorized, false);
  assert.equal(authorizePostRefusalTarget(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-honored.html#other",
    authorization,
  ).authorized, false);
  assert.equal(getOwnedPostRefusalCanaryRecipeCase(
    "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-ignored.html",
  ), "tcf");
});

test("explicit public authorization requires an exact HTTPS host and path prefix", () => {
  const authorization = {
    authorizationId: "calibration-run-123",
    kind: "explicit_allowlist" as const,
    targets: [{ hostname: "cmp-test.example", pathPrefix: "/consent-test/" }],
  };
  assert.equal(authorizePostRefusalTarget("https://cmp-test.example/consent-test/banner", authorization).authorized, true);
  assert.equal(authorizePostRefusalTarget("http://cmp-test.example/consent-test/banner", authorization).authorized, false);
  assert.equal(authorizePostRefusalTarget("https://sub.cmp-test.example/consent-test/banner", authorization).authorized, false);
  assert.equal(authorizePostRefusalTarget("https://cmp-test.example/other", authorization).authorized, false);
});
