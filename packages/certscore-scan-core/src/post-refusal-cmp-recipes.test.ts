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

test("Amazon Reject uses its canonical action proxy and retained first-layer transition", () => {
  const amazon = buildCanonicalPostRefusalActionRecipes().find((recipe) =>
    recipe.cmpId === "Amazon Privacy Preferences"
  );

  assert.ok(amazon);
  assert.equal(amazon.resolverMethod, "cmp_registry_recipe");
  assert.equal(amazon.controlSelector, "#cos-banner span.a-button:has(#sp-cc-rejectall-link)");
  assert.equal(amazon.bannerSelector, "#cos-banner");
  assert.deepEqual(amazon.confirmation, {
    kind: "canonical_reject_transition",
    bannerSelector: "#cos-banner",
    controlSelector: "#cos-banner span.a-button:has(#sp-cc-rejectall-link)",
  });
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

test("canonical Fides Reject uses its first-layer control and retained consent transition", () => {
  const fides = buildCanonicalPostRefusalActionRecipes().find((recipe) =>
    recipe.cmpId === "Fides"
  );

  assert.ok(fides);
  assert.equal(fides.controlSelector, "#fides-banner button.fides-reject-all-button");
  assert.equal(fides.bannerSelector, "#fides-banner");
  assert.equal(fides.recipeId, "canonical-cmp:Fides:reject:v2");
  assert.deepEqual(fides.confirmation, {
    kind: "tcf_purposes_denied_or_cmp_cookie_changed",
    cookieName: "fides_consent",
  });
});

test("canonical tarteaucitron recipe requires the exact necessary-only state before Save", () => {
  const tarteaucitron = buildCanonicalPostRefusalActionRecipes().find((recipe) =>
    recipe.cmpId === "DSGVO All in One / tarteaucitron"
  );

  assert.ok(tarteaucitron);
  assert.equal(
    tarteaucitron.recipeId,
    "canonical-cmp:DSGVO All in One / tarteaucitron:necessary-only-save:v2",
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
    registeredStateKeys: ["dsgvoaio", "dsgvoaio_create", "tarteaucitron"],
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

test("high-exposure CMP Reject recipes require stable controls and retained state transitions", () => {
  const recipes = buildCanonicalPostRefusalActionRecipes();
  const expected = [
    ["CookieYes", ".cky-consent-container .cky-btn-reject", "cookieyes-consent"],
    ["TrustArc", ".trustarc-declineall-btn", "notice_gdpr_prefs"],
    ["Sourcepoint", ".sp_choice_type_REJECT_ALL", "_sp_user_consent"],
    ["Didomi", "#didomi-notice-disagree-button", "didomi_token"],
    ["Osano", ".osano-cm-deny-all", "osano_consentmanager"],
    ["Consentmanager", "a.cmpboxbtnno", "__cmpconsent"],
    ["HubSpot Consent Banner", "#hs-eu-decline-button", "__hs_cookie_cat_pref"],
    ["Ketch", "#ketch-banner-button-secondary", "ketch_consent"],
    ["Cookie Information", ".coi-banner__decline", "CookieInformationConsent"],
  ] as const;

  for (const [cmpId, selector, cookieName] of expected) {
    const recipe = recipes.find((candidate) => candidate.cmpId === cmpId);
    assert.ok(recipe, `${cmpId} Reject recipe should be registered`);
    assert.equal(recipe.controlSelector, selector);
    if (cmpId === "HubSpot Consent Banner") {
      assert.equal(
        recipe.runtimeUrlPatternSources?.some((source) => source.includes("hs-banner")),
        true,
      );
    }
    if (recipe.confirmation.kind === "cmp_cookie_names_changed") {
      assert.ok(recipe.confirmation.cookieNames.includes(cookieName));
    } else {
      assert.ok(
        recipe.confirmation.kind === "cmp_cookie_changed" ||
        recipe.confirmation.kind === "tcf_purposes_denied_or_cmp_cookie_changed",
      );
      assert.equal(recipe.confirmation.cookieName, cookieName);
    }
  }

  const iubenda = recipes.find((candidate) => candidate.cmpId === "Iubenda");
  assert.ok(iubenda);
  assert.equal(iubenda.accessibleControl?.kind, "scoped_accessible_control");
  assert.equal(iubenda.accessibleControl?.scopeSelector, ".iubenda-cs-opt-group-consent");
});
