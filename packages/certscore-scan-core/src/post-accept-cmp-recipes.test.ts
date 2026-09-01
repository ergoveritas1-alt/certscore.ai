import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalPostAcceptActionRecipes,
  buildPostAcceptCmpActionRecipe,
  CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
} from "./post-accept-cmp-recipes.js";

test("Accept recipes are registry-backed and deterministic", () => {
  const oneTrust = buildCanonicalPostAcceptActionRecipes().find((recipe) =>
    recipe.cmpId === "OneTrust"
  );
  const usercentrics = buildCanonicalPostAcceptActionRecipes().find((recipe) =>
    recipe.cmpId === "Usercentrics"
  );

  assert.ok(oneTrust);
  assert.equal(oneTrust.controlSelector, "#onetrust-accept-btn-handler");
  assert.deepEqual(oneTrust.confirmation, {
    kind: "tcf_purposes_granted_or_cmp_cookie_changed",
    purposeIds: [1, 3, 4, 7, 9, 10],
    cookieName: "OptanonConsent",
  });
  assert.ok(usercentrics);
  assert.match(usercentrics.controlSelector, /uc-accept-all-button/);
  assert.equal(usercentrics.confirmation.kind, "tcf_purposes_granted_or_cmp_storage_keys_changed");
});

test("unknown CMPs have no Accept recipe and cannot fall back to guessed text", () => {
  assert.equal(buildPostAcceptCmpActionRecipe({
    cmpCanonicalName: "Unknown CMP",
    confirmation: {
      kind: "local_storage_equals",
      key: "consent",
      expectedValue: "granted",
    },
  }), undefined);
});

test("owned calibration recipe uses one exact control and state transition", () => {
  assert.equal(
    CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE.controlSelector,
    '[data-certscore-consent-action="accept"]',
  );
  assert.deepEqual(CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE.confirmation, {
    kind: "local_storage_equals",
    key: "certscore:analytics-consent:v1",
    expectedValue: "granted",
  });
});
