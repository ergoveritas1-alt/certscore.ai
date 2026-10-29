import type { Locator } from "playwright";

/** A disappearing locator must not auto-wait beyond the resolver's budget.
 * Keep Playwright's own enabled semantics and the separate final hit-target
 * check; absence or deadline exhaustion remains unavailable. */
export async function locatorEnabledWithinDeadline(control: Locator, deadlineAtMs: number): Promise<boolean> {
  const remainingMs = deadlineAtMs - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return false;
  return control.isEnabled({ timeout: Math.max(1, Math.min(100, remainingMs)) }).catch(() => false);
}

export function cmpRecipeRequiresViewportHitTarget(_cmpId: string | undefined): boolean {
  // A CSS-visible control can still be partially off-screen or covered while
  // any CMP animates its first layer. Apply the same last-mile geometry gate
  // to every pointer-resolved recipe instead of maintaining a CMP exception.
  return true;
}

/**
 * Require the resolved control's center point to be inside the viewport and to
 * hit the control (or one of its descendants). Playwright's isVisible() can be
 * true while an animated CMP banner is still positioned off-screen.
 */
export async function locatorHasViewportHitTarget(control: Locator): Promise<boolean> {
  const actionability = await inspectLocatorActionability(control);
  return actionability.boundingBoxInViewport &&
    actionability.centerHitTargetRelation === "control_or_descendant";
}

export type LocatorActionability = {
  controlVisible: boolean;
  controlEnabled: boolean;
  boundingBoxInViewport: boolean;
  centerHitTargetRelation:
    | "control_or_descendant"
    | "other_element"
    | "no_hit_target"
    | "unavailable";
};

/**
 * Retain the exact last-mile conditions needed for a safe pointer dispatch.
 * This is deliberately narrower than Playwright's full actionability model:
 * a continuously animated but visible CMP control can be a valid hit target
 * even though Playwright never observes a long enough stability interval.
 */
export async function inspectLocatorActionability(control: Locator): Promise<LocatorActionability> {
  return (await inspectLocatorReadiness(control, false)).actionability;
}

/** Reuse the resolver's existing geometry read for composed-scope readiness.
 * A transparent hit target is still pending, not a completed resolution. The
 * final source, label, uniqueness and dispatch checks remain independent. */
export async function inspectLocatorConsentReadiness(control: Locator): Promise<{
  actionability: LocatorActionability; scopeInteractive: boolean;
}> {
  return inspectLocatorReadiness(control, true);
}

async function inspectLocatorReadiness(control: Locator, inspectScope: boolean): Promise<{
  actionability: LocatorActionability; scopeInteractive: boolean;
}> {
  const handle = await control.elementHandle({ timeout: 100 }).catch(() => undefined);
  if (!handle) return {actionability: unavailableLocatorActionability(), scopeInteractive: false};
  try {
    const [controlVisible, controlEnabled, geometry] = await Promise.all([
      handle.isVisible().catch(() => false),
      handle.isEnabled().catch(() => false),
      handle.evaluate((element, inspectScope) => {
        let scopeInteractive = true;
        if (inspectScope) {
          let current: Element | null = element;
          for (let depth = 0; current && depth < 64; depth++) {
            const style = getComputedStyle(current);
            if (!current.isConnected || current.matches('[hidden], [inert], [aria-hidden="true" i]') ||
              style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" ||
              style.opacity === "0") { scopeInteractive = false; break; }
            const root = current.getRootNode();
            current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
          }
          if (current !== null) scopeInteractive = false;
        }
        const rectangle = element.getBoundingClientRect();
        const boundingBoxInViewport = rectangle.width > 0 &&
          rectangle.height > 0 &&
          rectangle.right > 0 &&
          rectangle.bottom > 0 &&
          rectangle.left < window.innerWidth &&
          rectangle.top < window.innerHeight;
        if (!boundingBoxInViewport) {
          return {
            scopeInteractive,
            boundingBoxInViewport,
            centerHitTargetRelation: "no_hit_target" as const,
          };
        }
        const centerX = rectangle.left + rectangle.width / 2;
        const centerY = rectangle.top + rectangle.height / 2;
        let hitTarget = document.elementFromPoint(centerX, centerY);
        // elementFromPoint retargets a shadow descendant to its host. Descend
        // through open roots so a genuine hit is not mistaken for an overlay.
        for (let depth = 0; depth < 12 && hitTarget?.shadowRoot; depth++) {
          const nested = hitTarget.shadowRoot.elementFromPoint(centerX, centerY);
          if (!nested || nested === hitTarget) break;
          hitTarget = nested;
        }
        return {
          scopeInteractive,
          boundingBoxInViewport,
          centerHitTargetRelation: hitTarget === null
            ? "no_hit_target" as const
            : hitTarget === element || element.contains(hitTarget)
              ? "control_or_descendant" as const
              : "other_element" as const,
        };
      }, inspectScope).catch(() => ({
        scopeInteractive: false,
        boundingBoxInViewport: false,
        centerHitTargetRelation: "unavailable" as const,
      })),
    ]);
    const {scopeInteractive, ...hitGeometry} = geometry;
    return {actionability: {controlVisible, controlEnabled, ...hitGeometry}, scopeInteractive};
  } finally {
    await handle.dispose().catch(() => undefined);
  }
}

function unavailableLocatorActionability(): LocatorActionability {
  return {
    controlVisible: false,
    controlEnabled: false,
    boundingBoxInViewport: false,
    centerHitTargetRelation: "unavailable",
  };
}

export function locatorActionabilitySupportsVerifiedDispatch(
  actionability: LocatorActionability,
): boolean {
  return actionability.controlVisible &&
    actionability.controlEnabled &&
    actionability.boundingBoxInViewport &&
    actionability.centerHitTargetRelation === "control_or_descendant";
}

export async function waitForLocatorVerifiedGeometry(
  control: Locator,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<LocatorActionability | undefined> {
  const deadlineAtMs = Date.now() + Math.max(0, timeoutMs);
  do {
    if (signal?.aborted) return undefined;
    const actionability = await inspectLocatorActionability(control);
    if (signal?.aborted) return undefined;
    if (locatorActionabilitySupportsVerifiedDispatch(actionability)) return actionability;
    if (Date.now() >= deadlineAtMs) return undefined;
    await new Promise((resolve) => setTimeout(
      resolve,
      Math.min(25, Math.max(0, deadlineAtMs - Date.now())),
    ));
  } while (Date.now() <= deadlineAtMs);
  return undefined;
}

/**
 * Dispatch only after the caller has resolved one canonical control and
 * verified its label. Re-check geometry immediately before the forced pointer
 * click so the fallback never relaxes visibility, enabled, viewport, or
 * center-hit-target requirements.
 */
export async function dispatchLocatorClickWithVerifiedGeometry(
  control: Locator,
  timeoutMs = 2_000,
  assertDispatchAllowed?: () => void,
): Promise<LocatorActionability> {
  const actionability = await inspectLocatorActionability(control);
  if (!locatorActionabilitySupportsVerifiedDispatch(actionability)) {
    throw new Error("Verified-geometry consent control is no longer safely actionable.");
  }
  assertDispatchAllowed?.();
  await control.click({ force: true, timeout: timeoutMs });
  return actionability;
}
