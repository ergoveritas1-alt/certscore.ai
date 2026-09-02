import type { Locator } from "playwright";

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
export async function inspectLocatorActionability(
  control: Locator,
): Promise<LocatorActionability> {
  const handle = await control.elementHandle({ timeout: 100 }).catch(() => undefined);
  if (!handle) return unavailableLocatorActionability();
  try {
    const [controlVisible, controlEnabled, geometry] = await Promise.all([
      handle.isVisible().catch(() => false),
      handle.isEnabled().catch(() => false),
      handle.evaluate((element) => {
        const rectangle = element.getBoundingClientRect();
        const boundingBoxInViewport = rectangle.width > 0 &&
          rectangle.height > 0 &&
          rectangle.right > 0 &&
          rectangle.bottom > 0 &&
          rectangle.left < window.innerWidth &&
          rectangle.top < window.innerHeight;
        if (!boundingBoxInViewport) {
          return {
            boundingBoxInViewport,
            centerHitTargetRelation: "no_hit_target" as const,
          };
        }
        const centerX = rectangle.left + rectangle.width / 2;
        const centerY = rectangle.top + rectangle.height / 2;
        const hitTarget = document.elementFromPoint(centerX, centerY);
        return {
          boundingBoxInViewport,
          centerHitTargetRelation: hitTarget === null
            ? "no_hit_target" as const
            : hitTarget === element || element.contains(hitTarget)
              ? "control_or_descendant" as const
              : "other_element" as const,
        };
      }).catch(() => ({
        boundingBoxInViewport: false,
        centerHitTargetRelation: "unavailable" as const,
      })),
    ]);
    return { controlVisible, controlEnabled, ...geometry };
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
): Promise<LocatorActionability | undefined> {
  const deadlineAtMs = Date.now() + Math.max(0, timeoutMs);
  do {
    const actionability = await inspectLocatorActionability(control);
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
): Promise<LocatorActionability> {
  const actionability = await inspectLocatorActionability(control);
  if (!locatorActionabilitySupportsVerifiedDispatch(actionability)) {
    throw new Error("Verified-geometry consent control is no longer safely actionable.");
  }
  await control.click({ force: true, timeout: timeoutMs });
  return actionability;
}
