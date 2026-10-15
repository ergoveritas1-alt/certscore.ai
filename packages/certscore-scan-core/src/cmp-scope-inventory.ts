import type { Page } from "playwright";
import type { KnownCmpDefinition } from "@website-signal-risk-scanner/shared";

/** Prefer a registered first-layer container over its identifying button.
 * Axeptio's existing passive recipe binds the widget to its exact Close
 * control. This reads visible choices only; it never authorizes Close/Next. */
export function cmpInventoryScopeSelector(definition: KnownCmpDefinition): string {
  const passive = definition.initialOptionalOffCloseObservation;
  return definition.preferenceScopeSelector ?? definition.preferenceInspection?.entranceSelector ?? (passive
    ? `${passive.categoryContainerSelector}:has(${passive.submitSelector})`
    : definition.domSelectors!.join(","));
}

/** One existing all-vendor DOM read. Configuration lookup is bounded and uses
 * own data properties only: no getters, API calls, network, or additional wait. */
export function readCmpScopeInventory(page: Page, definitions: KnownCmpDefinition[]) {
  const entries = definitions.map(d => ({ selector: d.preferenceScopeSelector ?? d.preferenceInspection?.entranceSelector ?? d.domSelectors!.join(","), path: d.configuredConsentCookiePath, domains: d.domains }));
  return page.locator(entries.map(entry => entry.selector).join(",")).evaluateAll((nodes, entries) => {
    const empty = { overflow: nodes.length > 1000, indices: [] as number[], scopeStates: [] as Array<{ index: number; state: "visible" | "inactive" | "unverified" }>, revealed: false, runtimeIdentified: false, configuredConsentCookies: [] as Array<{ version: "cmp_configured_cookie_identity.v1"; configurationPath: string; name: string }> };
    if (empty.overflow) return empty;
    const matched = entries.flatMap((entry, index) => nodes.some(node => node.ownerDocument === document && node.matches(entry.selector)) ? [index] : []);
    const deadline = performance.now() + 50;
    const states = new Map<Element, "visible" | "inactive" | "unverified">();
    for (const node of nodes) {
      let ancestor: Element | null = node, inactive = false;
      for (let depth = 0; ancestor && depth < 64 && performance.now() < deadline; depth++) {
        const style = getComputedStyle(ancestor);
        if (style.display === "none" || style.opacity === "0" || ancestor.matches('[aria-hidden="true" i], [inert]')) { inactive = true; break; }
        // A descendant may override inherited visibility. That is ambiguous,
        // unlike display:none or opacity:0 on a composed ancestor.
        if (style.visibility !== "visible") break;
        const root = ancestor.getRootNode();
        ancestor = ancestor.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      }
      if ((ancestor && !inactive) || performance.now() >= deadline) { states.set(node, "unverified"); continue; }
      const box = node.getBoundingClientRect();
      states.set(node, inactive ? "inactive" : ancestor || performance.now() >= deadline ? "unverified"
        : box.width > 0 && box.height > 0 ? "visible" : "unverified");
    }
    const scopeStates = matched.map(index => {
      const values = nodes.filter(node => node.ownerDocument === document && node.matches(entries[index]!.selector)).map(node => states.get(node));
      return { index, state: values.includes("visible") ? "visible" as const
        : values.every(value => value === "inactive") ? "inactive" as const : "unverified" as const };
    });
    // An inactive installed SDK must not make one verified visible CMP ambiguous.
    // Zero-sized, unfinished or inaccessible scopes remain ambiguous, not absent.
    const active = scopeStates.filter(scope => scope.state !== "inactive");
    const indices = active.length === 1 && active[0]!.state === "visible" ? [active[0]!.index] : matched;
    // A loaded SDK can precede its UI by seconds. This routing hint only keeps
    // the existing readiness allowance; it never identifies an actionable scope.
    const scripts = [...document.scripts].slice(0, 300).flatMap(script => {
      try { return script.src ? [new URL(script.src).hostname.toLowerCase()] : []; } catch { return []; }
    });
    const runtimeIdentified = entries.some(entry => entry.domains.some(domain =>
      scripts.some(host => host === domain || host.endsWith(`.${domain}`))));
    const path = indices.length === 1 ? entries[indices[0]!]!.path : undefined;
    let value: unknown = window;
    if (path && path.split(".").length <= 4) for (const key of path.split(".")) {
      if (!value || (typeof value !== "object" && typeof value !== "function")) { value = undefined; break; }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      value = descriptor && "value" in descriptor ? descriptor.value : undefined;
    }
    return { ...empty, indices, scopeStates, runtimeIdentified, revealed: (window as unknown as { __certscoreBorlabsPassiveReveal?: boolean }).__certscoreBorlabsPassiveReveal === true,
      configuredConsentCookies: path && typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value)
        ? [{ version: "cmp_configured_cookie_identity.v1" as const, configurationPath: path, name: value }] : [],
    };
  }, entries);
}
