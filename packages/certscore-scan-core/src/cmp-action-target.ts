import type { Frame, Locator, Page } from "playwright";

/** Confirmation may inspect a boxless consent scope only through its unique,
 * visible control. Composed ancestry includes open-shadow hosts. This proves
 * the pre-action surface, never the post-action consent decision.
 */
export async function canonicalConsentSurfacePresent(
  scope: Page | Frame, controls: Locator, bannerSelector: string,
): Promise<boolean> {
  const banners = scope.locator(bannerSelector);
  if (await controls.count().catch(() => 0) !== 1 || await banners.count().catch(() => 0) !== 1) return false;
  if (!await controls.isVisible().catch(() => false) ||
    !await consentScopePermitsInteraction(controls) || !await consentScopePermitsInteraction(banners)) return false;
  const banner = await banners.elementHandle({ timeout: 50 }).catch(() => null);
  if (!banner) return false;
  try {
    return await controls.evaluate((element, container) => {
      if (!container.isConnected) return false;
      let current: Element | null = element;
      for (let depth = 0; current && depth < 64; depth += 1) {
        if (current === container) return true;
        const root = current.getRootNode();
        current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      }
      return false;
    }, banner).catch(() => false);
  } finally {
    await banner.dispose().catch(() => undefined);
  }
}

/** A zero-area wrapper or shadow host can contain a visible actionable control.
 * Verify that the exact scope permits interaction; callers must still prove
 * the control's own visibility, uniqueness, label and viewport hit target.
 */
export async function consentScopePermitsInteraction(scope: Locator): Promise<boolean> {
  return scope.evaluate((element) => {
    if (!element.isConnected) return false;
    let current: Element | null = element;
    for (let depth = 0; current && depth < 64; depth += 1) {
      const style = getComputedStyle(current);
      if (current.matches('[hidden], [inert], [aria-hidden="true" i]') ||
        style.display === "none" || style.visibility === "hidden" ||
        style.visibility === "collapse" || style.opacity === "0") return false;
      const root = current.getRootNode();
      current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    }
    return current === null;
  }).catch(() => false);
}

/** Observation text/headings/tabs must not compete with actionable choices. */
export function hasActionControlStructure(candidate: { tagName: string; role?: string }): boolean {
  const role = candidate.role?.toLowerCase();
  if (role && !["button", "link"].includes(role)) return false;
  return ["button", "input", "a"].includes(candidate.tagName.toLowerCase()) || role === "button" || role === "link";
}

type ActionRecipe = {
  cmpId?: string;
  resolverMethod?: string;
  bannerSelector?: string;
  bannerFrameUrl?: string;
  controlFrameUrl?: string;
  controlExpectedNormalizedLabel?: string;
  accessibleControl?: unknown;
  preActionRequirement?: unknown;
  confirmation: unknown;
};

/** Collapse selector aliases only after browser-owned node equality is verified.
 * Different confirmation/scope contracts and inaccessible nodes remain ambiguous.
 * This helper never chooses between distinct controls or changes action proof.
 */
export async function distinctActionTargets<T extends { recipe: ActionRecipe; control: Locator }>(
  matches: T[],
  deadlineAtMs: number,
  signal?: AbortSignal,
): Promise<T[]> {
  if (matches.length < 2) return matches;
  const distinct: T[] = [];
  for (const match of matches) {
    if (signal?.aborted || Date.now() >= deadlineAtMs) return matches;
    let duplicate = false;
    for (const previous of distinct) {
      // Closed-shadow recipes resolve to the host, not the actual action node.
      if (match.recipe.accessibleControl || previous.recipe.accessibleControl ||
        actionContract(match.recipe) !== actionContract(previous.recipe)) continue;
      const left = await previous.control.elementHandle({ timeout: Math.max(1, Math.min(100, deadlineAtMs - Date.now())) }).catch(() => null);
      const right = await match.control.elementHandle({ timeout: Math.max(1, Math.min(100, deadlineAtMs - Date.now())) }).catch(() => null);
      try {
        if (left && right && await left.evaluate((node, other) =>
          node.isConnected && other.isConnected && node === other, right,
        ).catch(() => false)) {
          duplicate = true;
          break;
        }
      } finally {
        await left?.dispose().catch(() => undefined);
        await right?.dispose().catch(() => undefined);
      }
    }
    if (!duplicate) distinct.push(match);
  }
  return signal?.aborted || Date.now() >= deadlineAtMs ? matches : distinct;
}

function actionContract(recipe: ActionRecipe): string {
  return JSON.stringify({
    cmpId: recipe.cmpId,
    resolverMethod: recipe.resolverMethod,
    bannerSelector: recipe.bannerSelector,
    bannerFrameUrl: recipe.bannerFrameUrl,
    controlFrameUrl: recipe.controlFrameUrl,
    label: recipe.controlExpectedNormalizedLabel,
    preActionRequirement: recipe.preActionRequirement,
    confirmation: recipe.confirmation,
  });
}
