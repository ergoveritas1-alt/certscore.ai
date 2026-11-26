import { createHash } from "node:crypto";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import type { Locator, Page } from "playwright";
import { readWithinActionBoundary } from "./action-operation-boundary.js";
import type { ConsentControlCandidateEvidence, ConsentControlGeometryArtifact } from "./consent-control-geometry.js";

export type RetainedNativeConsentSelector = { selector: string; labelSha256: string; expiresAtMs: number };

export const CONSENT_ACTIONABILITY_TRIAL_MS = 1_000;
const EXACT_PROOF_RESERVE_MS = 200;

/** Reuse a complete live sweep only when its returned locator still resolves
 * to the unique retained native control and a second trial could run out of time.
 * The caller still binds and rechecks the exact handle before trusted input. */
export async function matchRetainedControlBeforeTrial(
  resolved: Locator, retained: Locator, proofExpiresAtMs: number | undefined, signal: AbortSignal,
): Promise<Locator | undefined> {
  if (proofExpiresAtMs === undefined ||
      proofExpiresAtMs - Date.now() > CONSENT_ACTIONABILITY_TRIAL_MS + EXACT_PROOF_RESERVE_MS) return;
  const sameControl = resolved.and(retained);
  const matches = await readWithinActionBoundary(async () => {
    const [retainedCount, matchingCount] = await Promise.all([retained.count(), sameControl.count()]);
    return retainedCount === 1 && matchingCount === 1;
  }, false, Math.min(proofExpiresAtMs, Date.now() + 100), signal).catch(() => false);
  return matches ? sameControl : undefined;
}

/** Use a live, complete candidate sweep to bind the retained selector before
 * repeating per-candidate reads. The existing deterministic recipe sweep and
 * exact pre-dispatch recheck still verify the bound control independently. */
export async function findRetainedNativeConsentControl(input: {
  page: Page;
  controls: Locator;
  candidate: ConsentControlCandidateEvidence;
  geometry?: ConsentControlGeometryArtifact;
  retained: RetainedNativeConsentSelector;
  deadlineAtMs: number;
  signal?: AbortSignal;
}): Promise<Locator | undefined> {
  const { page, controls, candidate, geometry, retained, signal } = input;
  const coverage = geometry?.controlInspection?.captureCoverage;
  if (geometry?.pageUrl !== page.url() || !coverage?.mainFrameAvailable || !coverage.documentAndFramesStable ||
      coverage.inventoryTruncated || coverage.documentReadyState === "loading" || coverage.capturedFrameCount !== coverage.frameCount ||
      candidate.frameContext.frameKind !== "main_frame" || candidate.tagName !== "button" || candidate.ariaLabel ||
      createHash("sha256").update(candidate.label).digest("hex") !== retained.labelSha256) return undefined;
  const selector = page.locator(retained.selector);
  const exact = controls.and(selector);
  const deadline = Math.min(input.deadlineAtMs, retained.expiresAtMs, Date.now() + 150);
  const matches = await readWithinActionBoundary(async () => {
    const [selected, bound] = await Promise.all([selector.count(), exact.count()]);
    return selected === 1 && bound === 1;
  }, false, deadline, signal).catch(() => false);
  return matches ? exact : undefined;
}

/** Shared bounded registry capacity; both action observers fail on overflow. */
/** One additional registered Drupal metadata entry; the existing search
 * deadline, browser count and single-action limit remain authoritative. */
export const CONSENT_ACTION_RECIPE_CANDIDATE_MAX = 26;

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
