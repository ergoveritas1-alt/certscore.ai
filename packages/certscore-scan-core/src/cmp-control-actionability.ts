import type { ElementHandle, Frame, Locator, Page } from "playwright";

export type ConsentControlReadOptions = {
  deadlineAtMs?: number;
  signal?: AbortSignal;
  /** The caller's known frame avoids an extra browser read to resolve it. */
  scope?: Page | Frame;
  /** Lets an enclosing proof keep its own slot through the real browser read. */
  trackActualRead?: (pending: Promise<unknown>) => void;
};

// A caller timeout does not cancel the underlying browser command. Keep the
// actual read slot until it settles; later attempts must read fresh evidence.
// Resolver callers supply their stable scope because Locators are recreated.
const pendingReadinessReads = new WeakSet<object>();

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
export async function locatorHasViewportHitTarget(control: Locator, options?: ConsentControlReadOptions): Promise<boolean> {
  const actionability = await inspectLocatorActionability(control, options);
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
export async function inspectLocatorActionability(control: Locator, options?: ConsentControlReadOptions): Promise<LocatorActionability> {
  return (await inspectLocatorReadiness(control, false, options)).actionability;
}

/** Reuse the resolver's existing geometry read for composed-scope readiness.
 * A transparent hit target is still pending, not a completed resolution. The
 * final source, label, uniqueness and dispatch checks remain independent. */
export async function inspectLocatorConsentReadiness(control: Locator, options?: ConsentControlReadOptions): Promise<{
  actionability: LocatorActionability; scopeInteractive: boolean;
}> {
  return inspectLocatorReadiness(control, true, options);
}

async function inspectLocatorReadiness(control: Locator, inspectScope: boolean, options: ConsentControlReadOptions = {}): Promise<{
  actionability: LocatorActionability; scopeInteractive: boolean;
}> {
  const unavailable = () => ({actionability: unavailableLocatorActionability(), scopeInteractive: false});
  const expired = () => options.signal?.aborted || (options.deadlineAtMs !== undefined &&
    (!Number.isFinite(options.deadlineAtMs) || Date.now() >= options.deadlineAtMs));
  const scope = options.scope && "mainFrame" in options.scope
    ? options.scope.mainFrame() : options.scope ?? control;
  if (expired() || pendingReadinessReads.has(scope)) return unavailable();
  pendingReadinessReads.add(scope);
  const read = (async () => {
    let handle: ElementHandle<HTMLElement | SVGElement> | null | undefined;
    try {
      handle = await control.elementHandle({ timeout: options.deadlineAtMs === undefined
        ? 100 : Math.max(1, Math.min(100, options.deadlineAtMs - Date.now())) }).catch(() => undefined);
      if (!handle || expired()) return unavailable();
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
      if (expired()) return unavailable();
      const {scopeInteractive, ...hitGeometry} = geometry;
      return {actionability: {controlVisible, controlEnabled, ...hitGeometry}, scopeInteractive};
    } finally {
      // Keep the scope occupied through actual cleanup, but race the whole
      // operation against the original deadline below. Normal successive reads
      // can reuse the scope; stalled disposal cannot extend the caller's wait.
      try { if (handle) await handle.dispose(); }
      catch { /* Cleanup failure cannot make a control actionable. */ }
      finally { pendingReadinessReads.delete(scope); }
    }
  })().catch(() => unavailable());
  options.trackActualRead?.(read);
  let timer: NodeJS.Timeout | undefined;
  let abort: (() => void) | undefined;
  try {
    const stopped = new Promise<ReturnType<typeof unavailable>>(resolve => {
      abort = () => resolve(unavailable());
      options.signal?.addEventListener("abort", abort, {once: true});
      if (options.deadlineAtMs !== undefined) {
        timer = setTimeout(abort, Math.max(0, options.deadlineAtMs - Date.now()));
      }
      if (expired()) abort();
    });
    const result = await Promise.race([read, stopped]);
    return expired() ? unavailable() : result;
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) options.signal?.removeEventListener("abort", abort);
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
  scope?: Page | Frame,
): Promise<LocatorActionability | undefined> {
  const deadlineAtMs = Date.now() + Math.max(0, timeoutMs);
  do {
    if (signal?.aborted || !Number.isFinite(deadlineAtMs) || Date.now() >= deadlineAtMs) return undefined;
    const actionability = await inspectLocatorActionability(control, {deadlineAtMs, signal, scope});
    if (signal?.aborted || Date.now() >= deadlineAtMs) return undefined;
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
  options: ConsentControlReadOptions = {},
): Promise<LocatorActionability> {
  const deadlineAtMs = Math.min(Date.now() + Math.max(0, timeoutMs), options.deadlineAtMs ?? Infinity);
  const actionability = await inspectLocatorActionability(control, {...options, deadlineAtMs});
  if (!locatorActionabilitySupportsVerifiedDispatch(actionability)) {
    throw new Error("Verified-geometry consent control is no longer safely actionable.");
  }
  assertDispatchAllowed?.();
  const remainingMs = deadlineAtMs - Date.now();
  if (options.signal?.aborted || !Number.isFinite(remainingMs) || remainingMs <= 0) {
    throw new Error("Verified-geometry consent control dispatch budget exhausted.");
  }
  await control.click({ force: true, timeout: Math.max(1, remainingMs) });
  return actionability;
}
