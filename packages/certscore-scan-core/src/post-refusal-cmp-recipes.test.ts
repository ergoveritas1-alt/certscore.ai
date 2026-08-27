import assert from "node:assert/strict";
import test from "node:test";
import { buildPostRefusalCmpActionRecipe } from "./post-refusal-cmp-recipes.js";

test("builds deterministic reject recipes from the canonical CMP registry", () => {
  const oneTrust = buildPostRefusalCmpActionRecipe({
    cmpCanonicalName: "OneTrust",
    confirmation: { kind: "tcf_purposes_denied" },
    bannerSelector: "#onetrust-banner-sdk",
  });
  const cookiebot = buildPostRefusalCmpActionRecipe({
    cmpCanonicalName: "Cookiebot",
    confirmation: {
      kind: "local_storage_equals",
      key: "certscore_fixture_consent",
      expectedValue: "rejected",
    },
  });
  const usercentrics = buildPostRefusalCmpActionRecipe({
    cmpCanonicalName: "Usercentrics",
    confirmation: {
      kind: "local_storage_equals",
      key: "certscore_fixture_consent",
      expectedValue: "rejected",
    },
  });

  assert.equal(oneTrust?.controlSelector, "#onetrust-reject-all-handler");
  assert.equal(oneTrust?.resolverMethod, "tcf_api_cmp_registry_recipe");
  assert.equal(cookiebot?.controlSelector, "#CybotCookiebotDialogBodyButtonDecline");
  assert.equal(usercentrics?.controlSelector, 'button[data-testid="uc-deny-all-button"]');
});

test("unknown CMPs fail closed without a recipe", () => {
  assert.equal(buildPostRefusalCmpActionRecipe({
    cmpCanonicalName: "Unknown CMP",
    confirmation: { kind: "tcf_purposes_denied" },
  }), undefined);
});
