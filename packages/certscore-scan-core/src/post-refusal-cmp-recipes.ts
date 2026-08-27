import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import type { PostRefusalActionRecipe } from "./post-refusal-observer.js";

export function buildPostRefusalCmpActionRecipe(input: {
  cmpCanonicalName: string;
  confirmation: PostRefusalActionRecipe["confirmation"];
  bannerSelector?: string;
}): PostRefusalActionRecipe | undefined {
  const definition = KNOWN_CMP_REGISTRY.find((entry) =>
    entry.canonicalName === input.cmpCanonicalName
  );
  const controlSelector = definition?.rejectControlSelectors?.[0];
  if (!definition || !controlSelector) return undefined;
  const tcfBacked = definition.standards?.includes("tcf") &&
    input.confirmation.kind === "tcf_purposes_denied";
  return {
    artifactVersion: "certscore.post_refusal_action_recipe.v1",
    recipeId: `canonical-cmp:${definition.canonicalName}:reject:v1`,
    cmpId: definition.canonicalName,
    resolverMethod: tcfBacked
      ? "tcf_api_cmp_registry_recipe"
      : "cmp_registry_recipe",
    controlSelector,
    ...(input.bannerSelector ? { bannerSelector: input.bannerSelector } : {}),
    confirmation: input.confirmation,
  };
}
