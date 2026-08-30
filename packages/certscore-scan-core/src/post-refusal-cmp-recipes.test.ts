import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalPostRefusalActionRecipes,
  buildPostRefusalCmpActionRecipe,
} from "./post-refusal-cmp-recipes.js";

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

  assert.equal(
    oneTrust?.controlSelector,
    "#onetrust-reject-all-handler, #onetrust-banner-sdk.ot-close-btn-link button.onetrust-close-btn-handler.banner-close-button",
  );
  assert.equal(oneTrust?.resolverMethod, "tcf_api_cmp_registry_recipe");
  assert.equal(
    cookiebot?.controlSelector,
    "#CybotCookiebotDialogBodyButtonDecline, #CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
  );
  assert.equal(
    usercentrics?.controlSelector,
    'button[data-testid="uc-deny-all-button"], #uc-cmp-footer #deny',
  );
});

test("unknown CMPs fail closed without a recipe", () => {
  assert.equal(buildPostRefusalCmpActionRecipe({
    cmpCanonicalName: "Unknown CMP",
    confirmation: { kind: "tcf_purposes_denied" },
  }), undefined);
});

test("canonical Usercentrics confirmation requires an exact uc_settings transition", () => {
  const usercentrics = buildCanonicalPostRefusalActionRecipes().find((recipe) =>
    recipe.cmpId === "Usercentrics"
  );

  assert.ok(usercentrics);
  assert.equal(usercentrics.recipeId, "canonical-cmp:Usercentrics:reject:v4");
  assert.deepEqual(usercentrics.confirmation, {
    kind: "tcf_purposes_denied_or_cmp_storage_keys_changed",
    storageType: "local_storage",
    keys: ["uc_settings", "ucString"],
  });
});

test("canonical tarteaucitron recipe requires the exact necessary-only state before Save", () => {
  const tarteaucitron = buildCanonicalPostRefusalActionRecipes().find((recipe) =>
    recipe.cmpId === "DSGVO All in One / tarteaucitron"
  );

  assert.ok(tarteaucitron);
  assert.equal(
    tarteaucitron.recipeId,
    "canonical-cmp:DSGVO All in One / tarteaucitron:necessary-only-save:v1",
  );
  assert.equal(tarteaucitron.controlSelector, "#tarteaucitronCloseAlert");
  assert.equal(tarteaucitron.controlExpectedNormalizedLabel, "auswahl speichern");
  assert.deepEqual(tarteaucitron.preActionRequirement, {
    kind: "necessary_only_preferences_selected",
    requiredCheckedSelector: "#dsgvoaio-checkbox-essentials:checked",
    disallowedCheckedSelector:
      "#tarteaucitronRoot input:checked:not(#dsgvoaio-checkbox-essentials)",
  });
  assert.deepEqual(tarteaucitron.confirmation, {
    kind: "canonical_reject_transition",
    controlSelector: "#tarteaucitronCloseAlert",
    bannerSelector: "#tarteaucitronAlertBig",
  });
});

test("canonical OpenAI confirmation requires the complete exact refusal cookie bundle", () => {
  const openAi = buildCanonicalPostRefusalActionRecipes().find((recipe) =>
    recipe.cmpId === "OpenAI first-party consent controls"
  );

  assert.ok(openAi);
  assert.equal(openAi.resolverMethod, "cmp_registry_recipe");
  assert.equal(openAi.confirmation.kind, "cmp_cookie_values_equal");
  assert.equal(
    openAi.confirmation.kind === "cmp_cookie_values_equal"
      ? openAi.confirmation.cookies.length
      : 0,
    5,
  );
});
