import {
  KNOWN_CMP_REGISTRY,
  type KnownCmpActionConfirmation,
} from "@website-signal-risk-scanner/shared";
import { cmpActionRecipeEnabled } from "./cmp-action-recipe-policy.js";
import type { PostAcceptActionRecipe } from "./post-accept-observer.js";

export const CANONICAL_POST_ACCEPT_RECIPE_SET_ID =
  "canonical-consent-control-accept-v5" as const;

const DEFAULT_TCF_ACCEPT_PURPOSE_IDS = [1, 3, 4, 7, 9, 10];

export const CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE: PostAcceptActionRecipe = {
  artifactVersion: "certscore.post_accept_action_recipe.v1",
  recipeId: "certscore-owned-analytics-consent-accept-v1",
  cmpId: "certscore_owned_analytics_consent",
  resolverMethod: "owned_site_recipe",
  controlSelector: '[data-certscore-consent-action="accept"]',
  bannerSelector: 'section[aria-label="Cookie and analytics preferences"]',
  confirmation: {
    kind: "local_storage_equals",
    key: "certscore:analytics-consent:v1",
    expectedValue: "granted",
  },
};

function mapAcceptConfirmation(
  confirmation: KnownCmpActionConfirmation,
): PostAcceptActionRecipe["confirmation"] {
  switch (confirmation.kind) {
    case "canonical_first_layer_ui_transition":
      return {
        kind: "canonical_accept_transition",
        bannerSelector: confirmation.bannerSelector,
        controlSelector: confirmation.controlSelector,
      };
    case "tcf_purposes_or_cmp_cookie_changed":
      return {
        kind: "tcf_purposes_granted_or_cmp_cookie_changed",
        purposeIds: confirmation.purposeIds ?? DEFAULT_TCF_ACCEPT_PURPOSE_IDS,
        cookieName: confirmation.cookieName,
      };
    case "tcf_purposes_or_cmp_storage_keys_changed":
      return {
        kind: "tcf_purposes_granted_or_cmp_storage_keys_changed",
        purposeIds: confirmation.purposeIds ?? DEFAULT_TCF_ACCEPT_PURPOSE_IDS,
        storageType: confirmation.storageType,
        keys: confirmation.keys,
      };
    default:
      return confirmation;
  }
}

export function buildPostAcceptCmpActionRecipe(input: {
  cmpCanonicalName: string;
  confirmation: PostAcceptActionRecipe["confirmation"];
  bannerSelector?: string;
}): PostAcceptActionRecipe | undefined {
  const definition = KNOWN_CMP_REGISTRY.find((entry) =>
    entry.canonicalName === input.cmpCanonicalName
  );
  const controlSelector = (definition?.acceptControlSelectors ?? []).join(", ");
  if (!definition || !controlSelector) return undefined;
  return {
    artifactVersion: "certscore.post_accept_action_recipe.v1",
    recipeId: `canonical-cmp:${definition.canonicalName}:accept:v1`,
    cmpId: definition.canonicalName,
    resolverMethod: definition.standards?.includes("tcf")
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
 * Returns only canonical CMPs with an explicit Accept selector and a bounded,
 * versioned semantic confirmation recipe. Registry order is preserved and the
 * observer still requires exactly one actionable control before dispatch.
 */
export function buildCanonicalPostAcceptActionRecipes(): PostAcceptActionRecipe[] {
  return [
    ...(cmpActionRecipeEnabled({
      canonicalName: "certscore_owned_analytics_consent",
      action: "accept",
    })
      ? [CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE]
      : []),
    ...KNOWN_CMP_REGISTRY.flatMap((definition) => {
      if (
        !definition.acceptControlSelectors?.length &&
        !definition.acceptControlTargets?.length
      ) return [];
      if (!cmpActionRecipeEnabled({
        canonicalName: definition.canonicalName,
        action: "accept",
      })) return [];
      const confirmation = definition.acceptConfirmation
        ? mapAcceptConfirmation(definition.acceptConfirmation)
        : definition.acceptanceCookieValues?.length
          ? {
              kind: "cmp_cookie_values_equal",
              cookies: definition.acceptanceCookieValues,
            } satisfies PostAcceptActionRecipe["confirmation"]
          : undefined;
      if (!confirmation) return [];
      const recipes: PostAcceptActionRecipe[] = [];
      if (definition.acceptControlSelectors?.length) {
        const recipe = buildPostAcceptCmpActionRecipe({
          cmpCanonicalName: definition.canonicalName,
          bannerSelector: definition.domSelectors?.[0],
          confirmation,
        });
        if (recipe) recipes.push(recipe);
      }
      for (const [index, target] of (definition.acceptControlTargets ?? []).entries()) {
        recipes.push({
          artifactVersion: "certscore.post_accept_action_recipe.v1",
          recipeId: `canonical-cmp:${definition.canonicalName}:accept:accessible-v${index + 1}`,
          cmpId: definition.canonicalName,
          resolverMethod: definition.standards?.includes("tcf")
            ? "tcf_api_cmp_registry_recipe"
            : "cmp_registry_recipe",
          controlSelector: target.scopeSelector,
          accessibleControl: {
            kind: target.resolution,
            scopeSelector: target.scopeSelector,
            intent: "accept",
          },
          ...(target.runtimeUrlPatterns?.length
            ? { runtimeUrlPatternSources: target.runtimeUrlPatterns.map((pattern) => pattern.source) }
            : {}),
          bannerSelector: definition.domSelectors?.[0] ?? target.scopeSelector,
          confirmation,
        });
      }
      return recipes;
    }),
  ];
}
