import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import type { PostRefusalActionRecipe } from "./post-refusal-observer.js";

export const CANONICAL_POST_REFUSAL_RECIPE_SET_ID =
  "canonical-cmp-registry-reject-v7";

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
 * TCF confirmation. Registry order is retained so artifacts are deterministic;
 * the observer still requires exactly one actionable selector before clicking.
 */
export function buildCanonicalPostRefusalActionRecipes(): PostRefusalActionRecipe[] {
  return KNOWN_CMP_REGISTRY.flatMap((definition) => {
    if (!definition.rejectControlSelectors?.length || !definition.standards?.includes("tcf")) return [];
    const recipe = buildPostRefusalCmpActionRecipe({
      cmpCanonicalName: definition.canonicalName,
      bannerSelector: definition.domSelectors?.[0],
      confirmation: definition.canonicalName === "OneTrust" ||
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
    return recipe ? [recipe] : [];
  });
}
