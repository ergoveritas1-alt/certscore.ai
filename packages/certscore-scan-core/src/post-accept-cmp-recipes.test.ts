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
  const fides = buildCanonicalPostAcceptActionRecipes().find((recipe) =>
    recipe.cmpId === "Fides"
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
  assert.ok(fides);
  assert.equal(fides.controlSelector, "#fides-banner button.fides-accept-all-button");
  assert.equal(fides.bannerSelector, "#fides-banner");
  assert.deepEqual(fides.confirmation, {
    kind: "tcf_purposes_granted_or_cmp_cookie_changed",
    purposeIds: [1, 3, 4, 7, 9, 10],
    cookieName: "fides_consent",
  });
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

test("Amazon Accept uses its canonical action proxy and retained first-layer transition", () => {
  const amazon = buildCanonicalPostAcceptActionRecipes().find((recipe) =>
    recipe.cmpId === "Amazon Privacy Preferences"
  );

  assert.ok(amazon);
  assert.equal(amazon.resolverMethod, "cmp_registry_recipe");
  assert.equal(amazon.controlSelector, "#cos-banner span.a-button:has(#sp-cc-accept)");
  assert.equal(amazon.bannerSelector, "#cos-banner");
  assert.deepEqual(amazon.confirmation, {
    kind: "canonical_accept_transition",
    bannerSelector: "#cos-banner",
    controlSelector: "#cos-banner span.a-button:has(#sp-cc-accept)",
  });
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

test("high-exposure CMP Accept recipes require stable controls and retained state transitions", () => {
  const recipes = buildCanonicalPostAcceptActionRecipes();
  const expected = [
    ["CookieYes", ".cky-consent-container .cky-btn-accept", "cookieyes-consent"],
    ["TrustArc", ".trustarc-acceptall-btn", "notice_gdpr_prefs"],
    ["Sourcepoint", ".sp_choice_type_ACCEPT_ALL", "_sp_user_consent"],
    ["Didomi", "#didomi-notice-agree-button", "didomi_token"],
    ["Osano", ".osano-cm-accept-all", "osano_consentmanager"],
    ["Consentmanager", "a.cmpboxbtnyes", "__cmpconsent"],
    ["HubSpot Consent Banner", "#hs-eu-confirmation-button", "__hs_cookie_cat_pref"],
    ["Ketch", "#ketch-banner-button-tertiary", "ketch_consent"],
    ["Iubenda", ".iubenda-cs-accept-btn", "_iub_cs"],
    ["Cookie Information", ".coi-banner__accept", "CookieInformationConsent"],
  ] as const;

  for (const [cmpId, selector, cookieName] of expected) {
    const recipe = recipes.find((candidate) => candidate.cmpId === cmpId);
    assert.ok(recipe, `${cmpId} Accept recipe should be registered`);
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
        recipe.confirmation.kind === "tcf_purposes_granted_or_cmp_cookie_changed",
      );
      assert.equal(recipe.confirmation.cookieName, cookieName);
    }
  }
});
