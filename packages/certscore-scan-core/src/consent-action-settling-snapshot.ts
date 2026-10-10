import type { ConsentActionLabelFields } from "./consent-action-label-fields.js";

/** One browser turn binds uniqueness, label and opacity to the same DOM state.
 * Keep this callback self-contained for Playwright serialization. Labels follow
 * readConsentActionLabelFields; final dispatch still rebuilds the full proof. */
export function readConsentActionSettlingSnapshot(elements: Element[]): {
  state: "interactive" | "transparent" | "unavailable";
  labels: ConsentActionLabelFields;
} {
  const element = elements.length === 1 ? elements[0] : undefined;
  if (!element?.isConnected) return {state: "unavailable", labels: {}};
  const labels = {
    ariaLabel: element.getAttribute("aria-label") ?? undefined,
    title: element.getAttribute("title") ?? undefined,
    value: element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type)
      ? element.value : undefined,
    visibleText: (element as HTMLElement).innerText || element.textContent || undefined,
  };
  let transparent = false;
  let current: Element | null = element;
  for (let depth = 0; current && depth < 64; depth += 1) {
    const style = getComputedStyle(current);
    if (current.matches('[hidden], [inert], [aria-hidden="true" i]') ||
      style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
      return {state: "unavailable", labels};
    }
    if (style.opacity === "0") transparent = true;
    const root = current.getRootNode();
    current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return {state: current !== null ? "unavailable" : transparent ? "transparent" : "interactive", labels};
}
