import {readWithinActionBoundary} from "./action-operation-boundary.js";
import type { Locator, Page } from "playwright";

/** WP Rocket can expose a CMP button while still queuing/replaying user input.
 * Observe its completion event before any site script can emit it. */
export async function installDeferredConsentReadiness(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.addEventListener("rocket-allScriptsLoaded", () => {
      // The loader restores handlers and replays queued input after this event.
      setTimeout(() => {
        Object.defineProperty(window, "__certscoreDeferredConsentReady", {value: true, configurable: true});
      }, 0);
    }, {once: true});
  });
}

/** Use only the existing action-readiness allowance. Hover is ordinary pointer
 * input; never synthesize a click, replay an action, or call a consent setter. */
export async function waitForDeferredConsentReadiness(input: {
  page: Page; control: Locator; cmpId?: string; deadlineAtMs: number; signal?: AbortSignal;
}): Promise<boolean> {
  if (input.cmpId !== "Borlabs Cookie") return true;
  const pending = () => input.page.evaluate(() => {
    if ((window as unknown as {__certscoreDeferredConsentReady?: boolean}).__certscoreDeferredConsentReady) return false;
    return Boolean(document.querySelector('script[type$="rocketlazyloadscript"], script[data-rocket-src]')) ||
      Array.from(document.scripts).slice(0, 96).some(script => !script.src &&
        script.textContent?.includes("RocketLazyLoadScripts") && script.textContent.includes("rocket-allScriptsLoaded"));
  });
  const pendingValue = await readWithinActionBoundary(pending, undefined, input.deadlineAtMs, input.signal);
  if (pendingValue === undefined) return false;
  if (!pendingValue) return true;
  const remaining = () => Math.max(0, input.deadlineAtMs - Date.now());
  if (input.signal?.aborted || !remaining()) return false;
  await input.control.hover({timeout: Math.max(1, remaining())});
  while (!input.signal?.aborted && remaining() > 0) {
    if (await readWithinActionBoundary(() => input.page.evaluate(() =>
      (window as unknown as {__certscoreDeferredConsentReady?: boolean}).__certscoreDeferredConsentReady === true), false, input.deadlineAtMs, input.signal)) return true;
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(25, remaining())));
  }
  return false;
}

/** Start the site's deferred script loader with ordinary pointer movement while
 * the existing control search runs. This changes no consent or storage state. */
export async function primeDeferredConsentReadiness(page: Page, boundary: {deadlineAtMs:number;signal?:AbortSignal}): Promise<void> {
  const stopped = () => boundary.signal?.aborted || Date.now() >= boundary.deadlineAtMs;
  const deferred = await readWithinActionBoundary(() => page.evaluate(() => Array.from(document.scripts).slice(0,96).some(script =>
    !script.src && script.textContent?.includes("RocketLazyLoadScripts") &&
    script.textContent.includes("rocket-allScriptsLoaded"))), false, boundary.deadlineAtMs, boundary.signal);
  if (deferred && !stopped()) {
    // Rocket deliberately ignores the first mousemove (its saved source calls
    // this firstMousemoveIgnored). A second real movement starts its loader.
    await readWithinActionBoundary(() => page.mouse.move(1, 1), undefined, boundary.deadlineAtMs, boundary.signal);
    if (!stopped()) await readWithinActionBoundary(() => page.mouse.move(2, 2), undefined, boundary.deadlineAtMs, boundary.signal);
  }
}
