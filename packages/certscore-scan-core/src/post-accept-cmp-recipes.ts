import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import type { PostAcceptActionRecipe } from "./post-accept-observer.js";

export const CANONICAL_POST_ACCEPT_RECIPE_SET_ID =
  "canonical-consent-control-accept-v1" as const;

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
    CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
    ...KNOWN_CMP_REGISTRY.flatMap((definition) => {
      if (!definition.acceptControlSelectors?.length) return [];
      const acceptanceCookieValues = definition.acceptanceCookieValues ?? [];
      let confirmation: PostAcceptActionRecipe["confirmation"] | undefined;
      if (acceptanceCookieValues.length > 0) {
        confirmation = {
          kind: "cmp_cookie_values_equal",
          cookies: acceptanceCookieValues,
        };
      } else if (definition.canonicalName === "Usercentrics") {
        confirmation = {
          kind: "tcf_purposes_granted_or_cmp_storage_keys_changed",
          purposeIds: DEFAULT_TCF_ACCEPT_PURPOSE_IDS,
          storageType: "local_storage",
          keys: ["uc_settings", "ucString"],
        };
      } else if (definition.standards?.includes("tcf")) {
        const cookieName = definition.canonicalName === "OneTrust"
          ? "OptanonConsent"
          : definition.canonicalName === "Cookiebot"
            ? "CookieConsent"
            : definition.canonicalName === "Google Funding Choices"
              ? "FCCDCF"
              : definition.canonicalName === "Seznam CMP"
                ? "sznlbr"
                : undefined;
        if (cookieName) {
          confirmation = {
            kind: "tcf_purposes_granted_or_cmp_cookie_changed",
            purposeIds: DEFAULT_TCF_ACCEPT_PURPOSE_IDS,
            cookieName,
          };
        }
      }
      if (!confirmation) return [];
      const recipe = buildPostAcceptCmpActionRecipe({
        cmpCanonicalName: definition.canonicalName,
        bannerSelector: definition.domSelectors?.[0],
        confirmation,
      });
      return recipe ? [recipe] : [];
    }),
  ];
}
