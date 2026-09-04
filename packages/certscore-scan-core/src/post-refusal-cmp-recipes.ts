import {
  KNOWN_CMP_REGISTRY,
  type KnownCmpActionConfirmation,
} from "@website-signal-risk-scanner/shared";
import { cmpActionRecipeEnabled } from "./cmp-action-recipe-policy.js";
import type { PostRefusalActionRecipe } from "./post-refusal-observer.js";

export const CANONICAL_POST_REFUSAL_RECIPE_SET_ID =
  "canonical-consent-control-reject-v22";

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

function mapRejectConfirmation(
  confirmation: KnownCmpActionConfirmation,
): PostRefusalActionRecipe["confirmation"] {
  switch (confirmation.kind) {
    case "canonical_first_layer_ui_transition":
      return {
        kind: "canonical_reject_transition",
        bannerSelector: confirmation.bannerSelector,
        controlSelector: confirmation.controlSelector,
      };
    case "tcf_purposes_or_cmp_cookie_changed":
      return {
        kind: "tcf_purposes_denied_or_cmp_cookie_changed",
        ...(confirmation.purposeIds ? { purposeIds: confirmation.purposeIds } : {}),
        cookieName: confirmation.cookieName,
      };
    case "tcf_purposes_or_cmp_storage_keys_changed":
      return {
        kind: "tcf_purposes_denied_or_cmp_storage_keys_changed",
        ...(confirmation.purposeIds ? { purposeIds: confirmation.purposeIds } : {}),
        storageType: confirmation.storageType,
        keys: confirmation.keys,
      };
    default:
      return confirmation;
  }
}

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
    ...(definition.urlPatterns?.length
      ? { runtimeUrlPatternSources: definition.urlPatterns.map((pattern) => pattern.source) }
      : {}),
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
  return [
    ...(cmpActionRecipeEnabled({
      canonicalName: "certscore_owned_analytics_consent",
      action: "reject",
    })
      ? [CERTSCORE_OWNED_ANALYTICS_REJECT_RECIPE]
      : []),
    ...KNOWN_CMP_REGISTRY.flatMap((definition) => {
      if (!cmpActionRecipeEnabled({
        canonicalName: definition.canonicalName,
        action: "reject",
      })) return [];
      const recipes: PostRefusalActionRecipe[] = [];
      if (definition.rejectControlSelectors?.length) {
        const refusalCookieValues = definition.refusalCookieValues ?? [];
        const confirmation = definition.rejectConfirmation
          ? mapRejectConfirmation(definition.rejectConfirmation)
          : refusalCookieValues.length > 0
            ? {
                kind: "cmp_cookie_values_equal",
                cookies: refusalCookieValues,
              } satisfies PostRefusalActionRecipe["confirmation"]
            : undefined;
        if (confirmation) {
          const recipe = buildPostRefusalCmpActionRecipe({
            cmpCanonicalName: definition.canonicalName,
            bannerSelector: definition.domSelectors?.[0],
            confirmation,
          });
          if (recipe) recipes.push(recipe);
        }
      }
      for (const [index, target] of (definition.rejectControlTargets ?? []).entries()) {
        const refusalCookieValues = definition.refusalCookieValues ?? [];
        const confirmation = definition.rejectConfirmation
          ? mapRejectConfirmation(definition.rejectConfirmation)
          : refusalCookieValues.length > 0
            ? {
                kind: "cmp_cookie_values_equal",
                cookies: refusalCookieValues,
              } satisfies PostRefusalActionRecipe["confirmation"]
            : undefined;
        if (!confirmation) continue;
        recipes.push({
          artifactVersion: "certscore.post_refusal_action_recipe.v1",
          recipeId: `canonical-cmp:${definition.canonicalName}:reject:accessible-v${index + 1}`,
          cmpId: definition.canonicalName,
          resolverMethod: definition.standards?.includes("tcf")
            ? "tcf_api_cmp_registry_recipe"
            : "cmp_registry_recipe",
          controlSelector: target.scopeSelector,
          accessibleControl: {
            kind: target.resolution,
            scopeSelector: target.scopeSelector,
            intent: "reject",
          },
          ...(target.runtimeUrlPatterns?.length
            ? { runtimeUrlPatternSources: target.runtimeUrlPatterns.map((pattern) => pattern.source) }
            : {}),
          bannerSelector: definition.domSelectors?.[0] ?? target.scopeSelector,
          confirmation,
        });
      }
      for (const target of definition.necessaryOnlyControlTargets ?? []) {
        recipes.push({
          artifactVersion: "certscore.post_refusal_action_recipe.v1",
          recipeId: `canonical-cmp:${definition.canonicalName}:necessary-only-save:v1`,
          cmpId: definition.canonicalName,
          resolverMethod: "cmp_registry_recipe",
          controlSelector: target.controlSelector,
          bannerSelector: target.bannerSelector,
          controlExpectedNormalizedLabel: target.expectedNormalizedLabel,
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
    }),
  ];
}
