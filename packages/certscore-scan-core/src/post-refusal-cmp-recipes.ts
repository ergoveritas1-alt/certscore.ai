import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import type { PostRefusalActionRecipe } from "./post-refusal-observer.js";

export const CANONICAL_POST_REFUSAL_RECIPE_SET_ID =
  "canonical-consent-control-reject-v18";

export const CERTSCORE_OWNED_ANALYTICS_REJECT_RECIPE: PostRefusalActionRecipe = {
  artifactVersion: "certscore.post_refusal_action_recipe.v1",
  recipeId: "certscore-owned-analytics-consent-reject-v2",
  cmpId: "certscore_owned_analytics_consent",
  resolverMethod: "owned_site_recipe",
  controlSelector: '[data-certscore-consent-action="reject"]',
  bannerSelector: 'section[aria-label="Cookie and analytics preferences"]',
  confirmation: {
    kind: "local_storage_equals",
    key: "certscore:analytics-consent:v1",
    expectedValue: "denied",
  },
};

export function buildPostRefusalCmpActionRecipe(input: {
  cmpCanonicalName: string;
  confirmation: PostRefusalActionRecipe["confirmation"];
  bannerSelector?: string;
}): PostRefusalActionRecipe | undefined {
  const definition = KNOWN_CMP_REGISTRY.find((entry) =>
    entry.canonicalName === input.cmpCanonicalName
  );
  const controlSelectors = definition?.rejectControlSelectors ?? [];
  const controlSelector = controlSelectors.join(", ");
  if (!definition || !controlSelector) return undefined;
  const tcfBacked = definition.standards?.includes("tcf") &&
    (
      input.confirmation.kind === "tcf_purposes_denied" ||
      input.confirmation.kind === "tcf_purposes_denied_or_cmp_cookie_changed" ||
      input.confirmation.kind === "tcf_purposes_denied_or_cmp_storage_changed" ||
      input.confirmation.kind === "tcf_purposes_denied_or_cmp_storage_keys_changed"
    );
  const baseRecipeVersion = input.confirmation.kind === "tcf_purposes_denied_or_cmp_storage_keys_changed"
    ? "v4"
    : input.confirmation.kind === "tcf_purposes_denied_or_cmp_cookie_changed" ||
      input.confirmation.kind === "tcf_purposes_denied_or_cmp_storage_changed"
      ? "v2"
      : "v1";
  const recipeVersion = baseRecipeVersion === "v4"
    ? baseRecipeVersion
    : controlSelectors.length > 1
      ? "v3"
      : baseRecipeVersion;
  return {
    artifactVersion: "certscore.post_refusal_action_recipe.v1",
    recipeId: `canonical-cmp:${definition.canonicalName}:reject:${recipeVersion}`,
    cmpId: definition.canonicalName,
    resolverMethod: tcfBacked
      ? "tcf_api_cmp_registry_recipe"
      : "cmp_registry_recipe",
    controlSelector,
    ...(input.bannerSelector ? { bannerSelector: input.bannerSelector } : {}),
    confirmation: input.confirmation,
  };
}

/**
 * Returns only canonical CMPs that expose both a versioned Reject selector and
 * an exact semantic confirmation recipe. Registry order is retained so artifacts
 * are deterministic; the observer still requires exactly one actionable selector
 * before clicking.
 */
export function buildCanonicalPostRefusalActionRecipes(): PostRefusalActionRecipe[] {
  return [CERTSCORE_OWNED_ANALYTICS_REJECT_RECIPE, ...KNOWN_CMP_REGISTRY.flatMap((definition) => {
    const recipes: PostRefusalActionRecipe[] = [];
    if (definition.rejectControlSelectors?.length) {
      const refusalCookieValues = definition.refusalCookieValues ?? [];
      if (definition.standards?.includes("tcf") || refusalCookieValues.length > 0) {
        const recipe = buildPostRefusalCmpActionRecipe({
          cmpCanonicalName: definition.canonicalName,
          bannerSelector: definition.domSelectors?.[0],
          confirmation: refusalCookieValues.length > 0
            ? {
                kind: "cmp_cookie_values_equal",
                cookies: refusalCookieValues,
              }
            : definition.canonicalName === "Google Funding Choices" ||
              definition.canonicalName === "Seznam CMP"
            ? {
                kind: "tcf_purposes_denied_or_cmp_cookie_changed",
                cookieName: definition.canonicalName === "Google Funding Choices"
                  ? "FCCDCF"
                  : "sznlbr",
              }
            : definition.canonicalName === "OneTrust" ||
              definition.canonicalName === "Cookiebot"
            ? {
                kind: "tcf_purposes_denied_or_cmp_cookie_changed",
                cookieName: definition.canonicalName === "OneTrust"
                  ? "OptanonConsent"
                  : "CookieConsent",
              }
            : definition.canonicalName === "Usercentrics"
              ? {
                  kind: "tcf_purposes_denied_or_cmp_storage_keys_changed",
                  storageType: "local_storage",
                  keys: ["uc_settings", "ucString"],
                }
              : { kind: "tcf_purposes_denied" },
        });
        if (recipe) recipes.push(recipe);
      }
    }
    for (const target of definition.necessaryOnlyControlTargets ?? []) {
      recipes.push({
        artifactVersion: "certscore.post_refusal_action_recipe.v1",
        recipeId: `canonical-cmp:${definition.canonicalName}:necessary-only-save:v1`,
        cmpId: definition.canonicalName,
        resolverMethod: "cmp_registry_recipe",
        controlSelector: target.controlSelector,
        controlExpectedNormalizedLabel: target.expectedNormalizedLabel,
        bannerSelector: target.bannerSelector,
        preActionRequirement: {
          kind: "necessary_only_preferences_selected",
          requiredCheckedSelector: target.requiredCheckedSelector,
          disallowedCheckedSelector: target.disallowedCheckedSelector,
        },
        confirmation: {
          kind: "canonical_reject_transition",
          controlSelector: target.controlSelector,
          bannerSelector: target.bannerSelector,
        },
      });
    }
    return recipes;
  })];
}
