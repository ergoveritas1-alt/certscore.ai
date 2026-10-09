import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import type { Locator } from "playwright";

/** Shared bounded registry capacity; both action observers fail on overflow. */
export const CONSENT_ACTION_RECIPE_CANDIDATE_MAX = 25;

/** Resolve CSS scope against the live composed ancestry, including wildcard
 * selectors and shadow hosts. Only registered selectors participate. */
export async function liveConsentActionCmp(control: Locator,
  recipes: ReadonlyArray<{ cmpId?: string; bannerSelector?: string; resolverMethod?: string }>, deadlineAtMs: number): Promise<string | undefined> {
  const remainingMs = deadlineAtMs - Date.now();
  if (remainingMs <= 0) return undefined;
  const scopes = [
    ...recipes.flatMap(recipe => recipe.cmpId && recipe.bannerSelector &&
      ["cmp_registry_recipe", "tcf_api_cmp_registry_recipe", "owned_site_recipe"].includes(recipe.resolverMethod ?? "")
      ? [{ name: recipe.cmpId, selector: recipe.bannerSelector, recipe: true }] : []),
    ...KNOWN_CMP_REGISTRY.flatMap(definition => (definition.domSelectors ?? []).map(selector =>
      ({ name: definition.canonicalName, selector, recipe: false }))),
  ];
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      control.evaluate((element, scopes) => {
        if (!element.isConnected) return undefined;
        const matched = new Set<string>(), recipeMatched = new Set<string>();
        let current: Element | null = element;
        for (let depth = 0; current && depth < 64; depth++) {
          for (const scope of scopes) {
            try { if (current.matches(scope.selector)) { matched.add(scope.name); if (scope.recipe) recipeMatched.add(scope.name); } }
            catch { /* Invalid/unavailable registered selector gives no match. */ }
          }
          const root = current.getRootNode();
          current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
        }
        const names = recipeMatched.size ? recipeMatched : matched;
        return names.size === 1 ? [...names][0] : undefined;
      }, scopes).catch(() => undefined),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), Math.min(250, remainingMs)); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Routing hints never authorize a control. Keep both live geometry and runtime
 * CMP candidates when they disagree; the resolver still proves uniqueness. */
export function prioritizeConsentActionRecipes<T extends { cmpId?: string }>(
  recipes: T[], runtimeRecipes: T[], geometryCmpName?: string,
): T[] {
  const geometryRecipes = geometryCmpName
    ? recipes.filter(recipe => recipe.cmpId?.toLowerCase() === geometryCmpName.toLowerCase()) : [];
  if (geometryRecipes.length) return [...geometryRecipes, ...runtimeRecipes.filter(recipe => !geometryRecipes.includes(recipe))];
  return runtimeRecipes.length ? runtimeRecipes : recipes;
}

/** Geometry and binding share the outer search budget. An expired geometry
 * slice is not evidence that a live control is disabled. */
export function consentActionBindingDeadline(sliceDeadlineMs: number, outerDeadlineMs?: number, now = Date.now()) {
  return Math.min(outerDeadlineMs ?? sliceDeadlineMs, now + 750);
}
